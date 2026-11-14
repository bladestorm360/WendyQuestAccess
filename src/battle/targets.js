'use strict';

const { battlePresented, drawnText, enemyName, statusAppearance, visibleSprite } = require('./presentation');
const { enemyState } = require('./enemy-state');
const { enemyArt } = require('../dialogue/character-art');
const { reviewLines, moveReview } = require('../menus/review');

const MAX_SPRITES = 8; // Installed troop data tops out at five.
const MAX_TARGETS = 16; // Native repeats can include a battler more than once.
const MAX_PRESENTATION_ATTEMPTS = 8;
const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);

function sameTargets(left, right) {
    return left === right || (left.length === right.length && left.every((member, index) => member === right[index]));
}

function gaugePercent(sprite) {
    const gauge = sprite._gaugeSprite;
    if (!visibleSprite(sprite, gauge) || gauge._statusType !== 'hp' || gauge._battler !== sprite._enemy ||
        gauge.bitmap.width !== 64) return null;
    // Sprite_EnemyGauge paints the same smoothed rate over 62 inner pixels.
    // Describe the displayed fill without announcing the battler's raw HP.
    const fill = Math.floor(62 * gauge.gaugeRate());
    return Number.isFinite(fill) && fill >= 0 && fill <= 62 ? Math.round(fill * 100 / 62) : null;
}

function createBattleTargets(root, host, notifications, preferences) {
    let current = null;
    let pending = null;
    let rendererOwner = null;
    let attempts = null;

    function candidate(scene) {
        if (!battlePresented(root, host, scene)) return null;
        const battle = root.BattleManager;
        const phase = battle._phase;
        const action = phase === 'ActionCommand' ? battle._currentActionCommand : null;
        const targets = battle._targets;
        if (phase === 'input' ? battle._inputting !== true || scene._wqaBattleFocusActive :
            !action?._cancelable || !action._coroutineContainer) return null;
        if (!Array.isArray(targets) || !targets.length || targets.length > MAX_TARGETS) return null;
        return { scene, phase, action, targets };
    }

    function live(page) {
        const battle = root.BattleManager;
        if (!battlePresented(root, host, page.scene) || battle._phase !== page.phase ||
            battle._targets !== page.targets) return false;
        if (page.action ? battle._currentActionCommand !== page.action || !page.action._cancelable ||
            !page.action._coroutineContainer : battle._inputting !== true || page.scene._wqaBattleFocusActive) return false;
        return page.rows.every(row => row.sprite._enemy === row.enemy && row.enemy.isAlive() &&
            row.sprite._isSelected && visibleSprite(row.sprite._selectorIconPivot, row.sprite._selectorIcon));
    }

    function clearStamp(scene) {
        scene._wqaBattleTargetKey = scene._wqaBattleTargetMode = scene._wqaBattleTargetDriver = null;
    }

    function retire(scene) {
        if (!scene) return;
        if (pending?.scene === scene) pending = null;
        if (attempts?.scene === scene) attempts = null;
        if (current?.scene === scene) {
            notifications.close(current.epoch);
            current = null;
        }
        scene._wqaBattleTargetActive = scene._wqaBattleTargetControl = false;
        clearStamp(scene);
    }

    function show(page, record) {
        notifications.close(page.epoch);
        page.epoch = notifications.open(record, () => current === page && live(page));
    }

    function statusLine(row, health = gaugePercent(row.sprite)) {
        const state = enemyState(root, row.sprite);
        if (health === null && !state) return '';
        const label = health === null ? row.name : row.name + ', HP ' + health + '%';
        return state ? label + ', ' + state : label;
    }

    function setDetails(page) {
        page.lines = reviewLines(page.rows.map(row => statusLine(row)));
        page.position = Math.min(page.position, Math.max(0, page.lines.length - 1));
        page.hasReview = page.lines.length > 0;
    }

    function describe(row) {
        const { sprite, enemy } = row;
        const art = sprite._battlerName === enemy.battlerName?.() &&
            sprite.worldVisible && sprite.worldAlpha > 0 && sprite.texture?.valid && enemyArt(sprite._battlerName);
        return reviewLines([statusLine(row) || row.name, ...(art || []), ...statusAppearance(sprite)]);
    }

    function publish(job) {
        const next = candidate(job.scene);
        if (next?.targets !== job.targets || next.phase !== job.phase || next.action !== job.action) return false;
        const sprites = job.scene._spriteset?._enemySprites;
        if (!Array.isArray(sprites) || sprites.length > MAX_SPRITES) return false;
        // Match the native horizontal cursor order. Drawn names for duplicate
        // enemies remain identical, while their visible positions distinguish them.
        const choices = sprites.filter(sprite => sprite?.worldVisible && sprite.worldAlpha > 0 &&
            sprite._enemy?.isAlive?.() && Number.isFinite(sprite.x)).sort((left, right) => left.x - right.x);
        const members = new Set(job.targets);
        const labels = choices.map(sprite => drawnText(sprite, sprite._nameSprite, 48) || enemyName(sprite));
        const rows = [];
        for (let position = 0; position < choices.length; position++) {
            const sprite = choices[position];
            if (!members.has(sprite._enemy) || !sprite._isSelected ||
                !visibleSprite(sprite._selectorIconPivot, sprite._selectorIcon)) continue;
            const drawn = labels[position];
            const duplicate = drawn && labels.indexOf(drawn) !== labels.lastIndexOf(drawn);
            const name = drawn ? drawn + (duplicate ? ', enemy ' + (position + 1) : '') : 'Enemy ' + (position + 1);
            rows.push({ sprite, enemy: sprite._enemy, name, position: position + 1 });
        }
        if (!rows.length || rows.length !== members.size) return false;
        if (current?.scene === job.scene && current.phase === job.phase && current.action === job.action &&
            sameTargets(current.targets, job.targets)) {
            current.targets = job.targets;
            return true;
        }
        if (current) notifications.close(current.epoch);
        const page = current = { ...job, kind: 'battleTarget', rows, position: 0, lines: [], epoch: 0, hasReview: false };
        job.scene._wqaBattleTargetControl = true;
        const settings = preferences();
        const one = rows.length === 1;
        const labelsWithHealth = rows.map(row => {
            const health = gaugePercent(row.sprite);
            return health === null ? row.name : row.name + ': ' + health + '%';
        });
        show(page, { kind: 'menuFocus', name: (one ? 'Target, ' : 'Targets, ') + labelsWithHealth.join(', '),
            indexed: one && settings.indexing, position: rows[0].position, total: choices.length });
        if (settings.autodetail) {
            // HP is already in the focus label. Autodetail can add visible
            // conditions, while appearance is explicitly requested with I.
            const lines = reviewLines(rows.map(row => statusLine(row, null)));
            if (lines.length) notifications.focus(page.epoch, { kind: 'menuDetails', lines, append: true });
        }
        setDetails(page);
        return true;
    }

    return {
        observe(scene) {
            const job = candidate(scene);
            if (!job) { retire(scene); return; }
            const renderer = host.graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return;
            if (current?.scene === scene && (current.phase !== job.phase || current.action !== job.action ||
                !sameTargets(current.targets, job.targets))) {
                notifications.close(current.epoch);
                current = null;
                scene._wqaBattleTargetControl = false;
            }
            if (attempts?.scene !== scene || attempts.targets !== job.targets || attempts.phase !== job.phase ||
                attempts.action !== job.action) attempts = { ...job, count: 0 };
            pending = job;
            scene._wqaBattleTargetActive = scene._wqaPresentation = true;
            if (rendererOwner === renderer) return;
            rendererOwner = renderer;
            renderer.once('postrender', () => {
                if (rendererOwner !== renderer) return;
                rendererOwner = null;
                const render = pending;
                pending = null;
                if (!render) return;
                try {
                    const rendered = publish(render);
                    if (rendered || ++attempts.count >= MAX_PRESENTATION_ATTEMPTS) {
                        render.scene._wqaBattleTargetKey = render.targets;
                        render.scene._wqaBattleTargetMode = render.phase;
                        render.scene._wqaBattleTargetDriver = render.action;
                        if (!rendered && current?.scene === render.scene) {
                            notifications.close(current.epoch);
                            current = null;
                            render.scene._wqaBattleTargetControl = false;
                        }
                    }
                } catch { retire(render.scene); }
            });
        },
        retire,
        controlOwner(scene) { return current?.scene === scene && live(current) ? current : null; },
        command(page, action) {
            if (!page || page !== current || !live(page)) return false;
            if (action === 'details') {
                for (const [index, row] of page.rows.entries()) {
                    const record = { kind: 'menuDetails', lines: describe(row) };
                    if (index === 0) show(page, record);
                    else notifications.focus(page.epoch, { ...record, append: true });
                }
            }
            else if (REVIEW.has(action)) {
                setDetails(page);
                if (!page.hasReview) return false;
                show(page, { ...moveReview(page, action), indexed: preferences().indexing });
            } else return false;
            return true;
        },
        announce(page, record) { if (page === current && live(page)) show(page, record); }
    };
}

module.exports = { createBattleTargets };