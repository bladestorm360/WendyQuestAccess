'use strict';

const { battleScenePresented } = require('./presentation');
const { damageCaption } = require('./damage-popup');
const { readConditions } = require('./outcomes');

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

    function ready(scene, window) {
        const battle = root.BattleManager;
        return battleScenePresented(root, host, scene) && battle._phase !== 'ActionCommand' &&
            battle._wqaBattleSpritesBusy === false && !root.$gameTemp?._animationQueue?.length &&
            !scene._spriteset?._animationSprites?.length && !scene._itemWindow?.active &&
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

    function retire(scene) {
        if (!scene) return;
        release(take(scene._actionLogWindow));
        releaseDamage(takeDamage(scene));
        if (pending?.scene === scene) {
            release(pending.rows);
            releaseDamage(pending.damage);
            pending = null;
        }
        if (current?.scene === scene) {
            notifications.close(current.epoch);
            current = null;
        }
        scene._wqaBattleLogActive = false;
    }

    function speak(scene, window, lines, append) {
        const record = { kind: 'battleLog', lines };
        if (append && appendToFocus(scene, record)) {
            if (current?.scene === scene) {
                notifications.close(current.epoch);
                current = null;
            }
            return;
        }
        if (append && current?.scene === scene && current.window === window) {
            notifications.focus(current.epoch, { ...record, append: true });
            return;
        }
        if (current) notifications.close(current.epoch);
        const page = current = { scene, window, epoch: 0 };
        scene._wqaBattleLogActive = scene._wqaPresentation = true;
        page.epoch = notifications.open(record, () => current === page && ready(scene, window));
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
            if (text) lines.push(text);
        }
        for (const sprite of damage) {
            const caption = damageCaption(scene, host.graphics, sprite);
            if (!caption) continue;
            sprite._wqaDamageCaption = null;
            lines.push(caption);
        }
        if (scene._wqaEnemyCollapses?.length) lines.push(...scene._wqaEnemyCollapses.splice(0));
        lines.push(...readConditions(root, host.graphics, scene));
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

    return {
        observe(scene, window) {
            const rows = take(window);
            const damage = takeDamage(scene);
            if (!rows.length && !damage.length && !scene._wqaRadialReport && !scene._wqaEnemyCollapses?.length &&
                !scene._wqaBattleConditions?.length) return;
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
                scene._wqaEnemyCollapses = null;
                scene._wqaBattleConditions = null;
                scene._wqaSeenConditions = null;
            }
            if (history?.scene === scene) history = null;
        }
    };
}

module.exports = { createBattleLog };