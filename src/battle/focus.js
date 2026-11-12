'use strict';

const { reviewLines, moveReview } = require('../menus/review');

const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);
const MAX_OPTIONS = 16;

function drawnText(option, sprite, maximum) {
    // Sprite_Text publishes its string before repainting the bitmap. A
    // dirty or hidden label cannot stand in for the actual presentation.
    if (sprite?.parent !== option || !sprite.worldVisible || !(sprite.worldAlpha > 0) ||
        sprite.renderable === false || sprite._dirty !== false || !sprite.bitmap?.isReady?.()) return '';
    const value = sprite._currentString;
    return typeof value === 'string' && value.length <= maximum ? value : '';
}

function createBattleFocus(root, host, notifications, preferences) {
    let current = null;
    let pending = null;
    let renderOwner = null;
    let spokenGroup = null;

    function ready(scene) {
        const battle = root.BattleManager;
        return !!(scene?._wqaBattleStarted && scene._started && scene._active && scene._fadeDuration === 0 &&
            scene._fadeOpacity === 0 && scene === host.manager._scene && host.graphics.app?.stage === scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !scene._wqaSettingsActive && !host.screenFading() && host.hasFocus() &&
            battle?._phase === 'input' && battle._inputting === true && battle._wqaDialogueBusy === false &&
            !root.$gameTroop?._interpreter?._list && !scene._wqaBattleInterpreter?._list &&
            !root.$gameMessage?.isBusy?.() && !scene._itemWindow?.active && !scene._skillWindow?.active);
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
        show(page, { kind: 'menuFocus', name, screen, enabled: page.enabled,
            position: choices.indexOf(option) + 1, total: choices.length, indexed: settings.indexing });
        if (lines.length && settings.autodetail) notifications.focus(page.epoch, { ...details(page), append: true });
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
        announce(page, record) { if (page === current && live(page)) show(page, record); }
    };
}

module.exports = { createBattleFocus };
