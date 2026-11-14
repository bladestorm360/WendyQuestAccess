'use strict';

const { battlePresented, drawnText, enemyName } = require('./presentation');
const { renderedSprite } = require('../runtime/rendered-sprite');
const { portraitActor } = require('./party-vitals');
const { reviewLines, moveReview } = require('../menus/review');

const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);
const MAX_OPTIONS = 16;
const MAX_ENEMIES = 8;

function formation(scene) {
    const spriteset = scene._spriteset;
    const sprites = spriteset?._enemySprites;
    if (!spriteset?._battleField || !Array.isArray(sprites) || sprites.length > MAX_ENEMIES) return null;
    const groups = new Map();
    for (const sprite of sprites) {
        if (!renderedSprite(sprite, spriteset._battleField) || !sprite._enemy?.isAlive?.() ||
            sprite._enemy.isHidden?.()) continue;
        const name = enemyName(sprite);
        if (name) groups.set(name, (groups.get(name) || 0) + 1);
    }
    return groups.size ? { kind: 'battleLog',
        lines: ['Enemy formation', ...Array.from(groups, ([name, count]) => count + ' ' + name)] } : null;
}

function createBattleFocus(root, host, notifications, preferences, onReady) {
    let current = null;
    let pending = null;
    let renderOwner = null;
    let spokenGroup = null;
    const spokenFormations = new WeakSet();

    function ready(scene) {
        const battle = root.BattleManager;
        return battle?._phase === 'input' && battle._inputting === true && battlePresented(root, host, scene);
    }

    function optionGroup(scene, option) {
        const actor = option._followTarget;
        const items = actor?.battleOptions?.[actor._battleOptionsActive];
        return option.parent === scene._uiLayer && option._hasFocus === true && option._animationPosition >= 1 &&
            option._animationPositionTarget === 1 && option.worldVisible && option.worldAlpha > 0 &&
            Array.isArray(items) && items.length <= MAX_OPTIONS && items.includes(option) ? items : null;
    }

    function retire(scene, option) {
        if (pending?.scene === scene && (!option || pending.option === option)) {
            pending.option._wqaBattleCommandSeen = false;
            pending = null;
        }
        if (current?.scene === scene && (!option || current.option === option)) {
            notifications.close(current.epoch);
            current.option._wqaBattleCommandSeen = false;
            current = null;
            scene._wqaControllerReady = false;
        }
        if (scene && pending?.scene !== scene && current?.scene !== scene) scene._wqaBattleFocusActive = false;
        if (!option && spokenGroup?.scene === scene) spokenGroup = null;
    }

    function enabled(option) { return option._prerequisitesMet === true && !option._isLocked; }

    function live(page) {
        return ready(page.scene) && optionGroup(page.scene, page.option) === page.group &&
            drawnText(page.option, page.option._nameSprite, 96) === page.name && enabled(page.option) === page.enabled;
    }

    function show(page, record) {
        notifications.close(page.epoch);
        page.epoch = notifications.open(record, () => current === page && live(page));
    }

    function details(page) {
        return page.lines.length ? { kind: 'menuDetails', lines: page.lines } :
            { kind: 'menuReview', name: 'No details here.' };
    }

    function publish(scene, option) {
        if (!ready(scene)) return false;
        const group = optionGroup(scene, option);
        const name = drawnText(option, option._nameSprite, 96);
        if (!group || !name) return false;
        const subtext = drawnText(option, option._subTextSprite, 384);
        const cost = drawnText(option, option._costTextSprite, 32);
        const lines = reviewLines([...subtext.split(/\r?\n/, 7), cost && 'Cost ' + cost]);
        if (current) retire(current.scene, current.option);
        const page = current = { kind: 'battle', scene, option, group, name, enabled: enabled(option), lines,
            position: 0, epoch: 0, hasReview: lines.length > 0 };
        option._wqaBattleCommandSeen = true;
        option._wqaBattleCommandEnabled = page.enabled;
        scene._wqaControllerReady = scene._wqaBattleFocusActive = scene._wqaPresentation = true;
        const choices = group.filter(item => item && drawnText(item, item._nameSprite, 96));
        const settings = preferences();
        const screen = spokenGroup?.group === group ? '' : 'Battle commands';
        spokenGroup = { scene, group };
        const actor = screen && portraitActor(scene, option._followTarget)?.name;
        const focus = { kind: 'menuFocus', name, screen, actor, enabled: page.enabled,
            position: choices.indexOf(option) + 1, total: choices.length, indexed: settings.indexing };
        const opening = spokenFormations.has(scene) ? null : formation(scene);
        if (opening) {
            spokenFormations.add(scene);
            show(page, opening);
            notifications.focus(page.epoch, { ...focus, append: true });
        } else show(page, focus);
        if (lines.length && settings.autodetail) notifications.focus(page.epoch, { ...details(page), append: true });
        onReady?.(scene);
        return true;
    }

    return {
        observe(scene, option) {
            const available = enabled(option);
            if ((option._wqaBattleCommandSeen && option._wqaBattleCommandEnabled === available) || !ready(scene)) return;
            const renderer = host.graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return;
            if (pending) retire(pending.scene, pending.option);
            option._wqaBattleCommandSeen = scene._wqaBattleFocusActive = scene._wqaPresentation = true;
            option._wqaBattleCommandEnabled = available;
            pending = { scene, option };
            if (renderOwner === renderer) return;
            renderOwner = renderer;
            renderer.once('postrender', () => {
                if (renderOwner !== renderer) return;
                renderOwner = null;
                const job = pending;
                pending = null;
                if (!job) return;
                try {
                    if (publish(job.scene, job.option)) return;
                } catch { retire(job.scene); }
                job.option._wqaBattleCommandSeen = false;
                if (current?.scene !== job.scene) job.scene._wqaBattleFocusActive = false;
            });
        },
        retire,
        controlOwner(scene) { return current?.scene === scene && live(current) ? current : null; },
        command(page, action) {
            if (!page || page !== current || !live(page)) return false;
            if (action === 'details') show(page, details(page));
            else if (REVIEW.has(action) && page.lines.length)
                show(page, { ...moveReview(page, action), indexed: preferences().indexing });
            else return false;
            return true;
        },
        announce(page, record) { if (page === current && live(page)) show(page, record); },
        appendFeedback(scene, record) {
            if (current?.scene !== scene || !live(current)) return false;
            notifications.focus(current.epoch, { ...record, append: true });
            return true;
        }
    };
}

module.exports = { createBattleFocus };
