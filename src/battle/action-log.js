'use strict';

const { battleScenePresented } = require('./presentation');
const { damageCaption, enemyLabel } = require('./damage-popup');
const { readCollapses, readConditions, readResistance, readMomentum } = require('./outcomes');

const MAX_PAINTED_ROWS = 8;
const MAX_HISTORY = 6;
const MAX_TEXT = 192;

function readable(text) {
    return typeof text === 'string' && text.length <= MAX_TEXT ? text.trim() : '';
}

function createBattleLog(root, host, notifications, appendToFocus) {
    let current = null;
    let pending = null;
    let rendererOwner = null;
    let history = null;
    const attackStarts = new WeakMap();
    const abilityStarts = new WeakMap();

    function actionReady(scene) {
        return battleScenePresented(root, host, scene, true) && root.BattleManager._phase !== 'ActionCommand' &&
            !scene._itemWindow?.active && !scene._skillWindow?.active;
    }

    function ready(scene, window) {
        return actionReady(scene) && root.BattleManager._wqaBattleSpritesBusy === false &&
            !root.$gameTemp?._animationQueue?.length && !scene._spriteset?._animationSprites?.length &&
            window && scene._actionLogWindow === window && window.parent === scene._windowLayer &&
            window.worldVisible && window.worldAlpha > 0 && window.openness === 255 &&
            window.contentsOpacity > 0 && window.contents?.isReady?.();
    }

    function take(window) {
        const rows = window?._wqaBattleLogRows;
        if (!Array.isArray(rows)) return [];
        window._wqaBattleLogRows = null;
        return rows;
    }

    function release(rows) {
        for (const entry of rows) entry.row._wqaLogQueued = false;
    }

    function takeDamage(scene) {
        const sprites = scene._wqaDamageRows || [];
        scene._wqaDamageRows = null;
        return sprites;
    }

    function releaseDamage(sprites) {
        for (const sprite of sprites) sprite._wqaDamageQueued = false;
    }

    function clearPending(scene) {
        release(take(scene._actionLogWindow));
        releaseDamage(takeDamage(scene));
        if (pending?.scene === scene) {
            release(pending.rows);
            releaseDamage(pending.damage);
            pending = null;
        }
    }

    function retire(scene) {
        if (!scene) return;
        clearPending(scene);
        if (current?.scene === scene) {
            notifications.close(current.epoch);
            current = null;
        }
        scene._wqaBattleLogActive = false;
    }

    function speak(scene, window, lines, append, attacking = false) {
        const record = { kind: 'battleLog', lines };
        if (append && !attacking && !current?.attacking && appendToFocus(scene, record)) {
            if (current?.scene === scene) {
                notifications.close(current.epoch);
                current = null;
            }
            return;
        }
        if (append && current?.scene === scene && current.window === window) {
            current.attacking ||= attacking;
            notifications.focus(current.epoch, { ...record, append: true });
            return;
        }
        if (current) notifications.close(current.epoch);
        const page = current = { scene, window, epoch: 0, attacking };
        scene._wqaBattleLogActive = scene._wqaPresentation = true;
        page.epoch = notifications.open(record, () => current === page &&
            (page.attacking ? actionReady(scene) : ready(scene, window)));
    }

    function publish(job) {
        const { scene, window, rows, damage } = job;
        release(rows);
        releaseDamage(damage);
        if (!ready(scene, window) || !Array.isArray(window.items) || window.items.length > MAX_PAINTED_ROWS) return;
        const lines = [];
        const radial = readable(scene._wqaRadialReport);
        if (radial) {
            scene._wqaRadialReport = null;
            scene._wqaRadialActive = false;
            lines.push(radial);
        }
        for (const { row, text: paint } of rows) {
            if (row._wqaLogSeen || !window.items.includes(row) || !(row.pos > 0)) continue;
            row._wqaLogSeen = true;
            const text = readable(paint);
            const source = row._wqaSource;
            // Only the exact native action row shares heading ownership with
            // its animation entry; identical later actions still speak.
            if (source?.abilityStart) {
                if (source.announced || source.pending) continue;
                // The legacy log can paint before per-target FX starts.
                // Its rendered heading then owns this exact action ticket.
                if (text) source.announced = true;
            }
            if (text) lines.push(typeof source === 'string' && source ? source + ' uses ' + text : text);
        }
        for (const sprite of damage) {
            const caption = damageCaption(scene, host.graphics, sprite);
            if (!caption) continue;
            const ticket = sprite._wqaDamageCaption.lethal;
            sprite._wqaDamageCaption = null;
            lines.push(caption);
            if (ticket) ticket.queued = true;
        }
        lines.push(...readCollapses(scene,host.graphics));
        lines.push(...readConditions(root, host.graphics, scene), ...readResistance(scene, host.graphics));
        // The victory message owns Momentum so it can follow the rewards.
        if (!scene._wqaBattleWon) {
            const momentum = readMomentum(scene, host.graphics);
            if (momentum) lines.push(momentum);
        }
        if (!lines.length) return;
        if (history?.scene !== scene) history = { scene, lines: [] };
        history.lines.push(...lines);
        history.lines.splice(0, Math.max(0, history.lines.length - MAX_HISTORY));
        if (lines.length <= MAX_PAINTED_ROWS) {
            speak(scene, window, lines, true);
        } else {
            // The score, log rows and popups share this render. Preserve
            // their presentation order across bounded worker records.
            for (let index = 0; index < lines.length; index += MAX_PAINTED_ROWS)
                speak(scene, window, lines.slice(index, index + MAX_PAINTED_ROWS), true);
        }
    }

    function abilityTicket(scene, item, format) {
        const action = root.BattleManager._action;
        if (![55, 102, 103, 112, 113, 115].includes(item?.id) || item.message1 !== format || action?.item?.() !== item ||
            !actionReady(scene)) return null;
        let ticket = abilityStarts.get(action);
        if (!ticket) {
            ticket = { abilityStart: true, scene, pending: false, announced: false };
            abilityStarts.set(action, ticket);
        }
        return ticket;
    }

    return {
        abilityTicket,
        startAbility(scene, action, performer) {
            if (root.BattleManager._action !== action || !action?.isSkill?.()) return;
            const item = action.item();
            const ticket = abilityTicket(scene, item, item?.message1);
            const name = ticket && enemyLabel(scene, performer);
            const renderer = host.graphics.app?.renderer;
            if (!ticket || !name || performer?._battler !== action.subject?.() || ticket.pending || ticket.announced ||
                typeof renderer?.once !== 'function') return;
            ticket.pending = true;
            renderer.once('postrender', () => {
                ticket.pending = false;
                if (root.BattleManager._action !== action || !actionReady(scene) || ticket.scene !== scene ||
                    enemyLabel(scene, performer) !== name) return;
                ticket.announced = true;
                speak(scene, scene._actionLogWindow, [item.id === 55 ? item.message1.replace('%1', name) + '.' : item.id === 112 ? name + ' punches.' : item.id === 113 ? name + ' fires its gun.' :
                    name + ' uses ' + (item.id === 115 ? 'Booster Bash' : item.name) + '.'], true, true);
            });
        },
        startAttack(scene, action, name) {
            if (root.BattleManager._action !== action || !name || !actionReady(scene) || attackStarts.has(action)) return;
            const renderer = host.graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return;
            const start = { scene, name: '' };
            attackStarts.set(action, start);
            // Animated sprites deliberately make the normal result gate
            // busy. Only the attack heading uses this first presented frame.
            renderer.once('postrender', () => {
                if (attackStarts.get(action) !== start || root.BattleManager._action !== action || !actionReady(scene)) {
                    attackStarts.delete(action);
                    return;
                }
                start.name = name;
                speak(scene, scene._actionLogWindow, [name + ' attacks.'], true, true);
            });
        },
        attackResult(scene, action, name) {
            const start = attackStarts.get(action);
            return { name, start: start?.scene === scene ? start : null };
        },
        suspend(scene) {
            if (current?.scene === scene && current.attacking && actionReady(scene)) clearPending(scene);
            else retire(scene);
        },
        observe(scene, window) {
            const rows = take(window);
            const damage = takeDamage(scene);
            if (!rows.length && !damage.length && !scene._wqaRadialReport && !scene._wqaDefeatDue &&
                !scene._wqaBattleConditions?.length && !scene._wqaResistedRows?.length &&
                (scene._wqaBattleWon || !scene._wqaMomentumPending)) return;
            const renderer = host.graphics.app?.renderer;
            if (!ready(scene, window) || typeof renderer?.once !== 'function') {
                release(rows);
                releaseDamage(damage);
                retire(scene);
                return;
            }
            if (pending && (pending.scene !== scene || pending.window !== window)) retire(pending.scene);
            if (!pending) pending = { scene, window, rows: [], damage: [] };
            const allowed = MAX_PAINTED_ROWS - pending.rows.length;
            pending.rows.push(...rows.slice(0, allowed));
            release(rows.slice(allowed));
            const allowedDamage = MAX_PAINTED_ROWS - pending.damage.length;
            pending.damage.push(...damage.slice(0, allowedDamage));
            releaseDamage(damage.slice(allowedDamage));
            scene._wqaBattleLogActive = scene._wqaPresentation = true;
            if (rendererOwner === renderer) return;
            rendererOwner = renderer;
            renderer.once('postrender', () => {
                if (rendererOwner !== renderer) return;
                rendererOwner = null;
                const job = pending;
                pending = null;
                if (!job) return;
                try { publish(job); } catch { retire(job.scene); }
            });
        },
        latest(scene) {
            return history?.scene === scene && ready(scene, scene._actionLogWindow) ?
                { kind: 'battleLog', lines: history.lines.slice(-4) } : null;
        },
        repeat(scene) {
            const record = this.latest(scene);
            if (!record) return false;
            speak(scene, scene._actionLogWindow, record.lines, false);
            return true;
        },
        retire,
        leave(scene) {
            retire(scene);
            if (scene) {
                scene._wqaEnemyCollapses = scene._wqaLethalDamage = null;
                scene._wqaDefeatDue = false;
                scene._wqaBattleConditions = null;
                scene._wqaSeenConditions = null;
                scene._wqaResistedRows = scene._wqaMomentumPending = null;
                scene._wqaMomentumValue = scene._wqaMomentumHud = scene._wqaMomentumPips = undefined;
            }
            if (history?.scene === scene) history = null;
        }
    };
}

module.exports = { createBattleLog };
