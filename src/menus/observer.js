'use strict';

const { reviewLines, moveReview } = require('./review');

const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);
const PARAMS = [0, 1, 2, 3];

function visible(scene, window) {
    return !!window && window.parent === scene._windowLayer && window.worldVisible && window.worldAlpha > 0 &&
        window.openness === 255 && window.contentsOpacity > 0 && window.contents?.isReady?.();
}

function focusWindow(scene, screen) {
    if (screen === 1) return scene._commandWindow;
    if (scene._actorWindow?.active) return null;
    return scene._itemWindow?.isFocused ? scene._itemWindow : scene._categoryWindow;
}

function selectedItem(window) {
    const index = window._index;
    return Number.isInteger(index) && index >= 0 ? (window._list || window._data)?.[index] : null;
}

function label(value) {
    return typeof value === 'string' && value.trim() && value.length <= 96 ? value : '';
}

function presentedRow(window) {
    const rect = window.itemRect?.(window._index);
    return rect && rect.width > 0 && rect.height > 0 && rect.x + rect.width > 0 && rect.y + rect.height > 0 &&
        rect.x < window.innerWidth && rect.y < window.innerHeight;
}

function comparison(root, scene, item, status) {
    if (!visible(scene, status) || status._wqaMenuCompareItem !== item || !status._tempActor ||
        status._wqaMenuCompareActor !== status._tempActor || !status._actor) return [];
    const lines = [];
    for (const id of PARAMS) {
        const name = label(root.TextManager.param(id));
        const from = status._actor.param(id);
        const to = status._tempActor.param(id);
        if (name && Number.isSafeInteger(from) && Number.isSafeInteger(to)) lines.push(`${name} ${from} to ${to}`);
    }
    return lines;
}

function createMenuObserver(root, host, notifications, preferences) {
    let current = null;
    let waiting = null;

    function ready(scene) {
        return scene && scene === host.manager._scene && host.graphics.app?.stage === scene &&
            scene._started && scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 &&
            !scene._wqaSettingsActive && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize && host.hasFocus();
    }

    function retire(scene) {
        if (waiting?.scene === scene) waiting = null;
        if (current?.scene !== scene) return;
        notifications.close(current.epoch);
        current = null;
        scene._wqaControllerReady = scene._wqaMenuActive = false;
    }

    function suspend(scene) {
        if (waiting?.scene === scene) waiting = null;
        if (current?.scene !== scene || current.suspended) return;
        notifications.close(current.epoch);
        current.suspended = true;
        scene._wqaControllerReady = scene._wqaMenuActive = false;
    }

    function live(page) {
        if (!page || page.suspended || !ready(page.scene)) return false;
        const window = focusWindow(page.scene, page.screen);
        return window === page.window && window.active && visible(page.scene, window) && window._index === page.index &&
            selectedItem(window) === page.item && window._wqaMenuRowPaint === page.rowPaint &&
            (!page.inventory || (page.scene._helpWindow?._wqaMenuHelpPaint === page.helpPaint &&
                page.scene._equipStatusWindow?._tempActor === page.compareTarget &&
                page.scene._equipStatusWindow?._actor === page.compareOwner &&
                page.scene._equipStatusWindow?._wqaMenuCompareActor === page.comparePaint &&
                !!visible(page.scene, page.scene._helpWindow) === page.helpVisible &&
                !!visible(page.scene, page.scene._equipStatusWindow) === page.compareVisible));
    }

    function details(page) {
        return { kind: 'menuDetails', lines: page.lines };
    }

    function show(page, record) {
        notifications.close(page.epoch);
        page.epoch = notifications.open(record, () => current === page && live(page));
    }

    function publish(scene, screen) {
        if (!ready(scene)) return retire(scene);
        const window = focusWindow(scene, screen);
        const item = window && selectedItem(window);
        if (!window?.active || !visible(scene, window) || !item || !label(item.name) || !presentedRow(window)) return;
        const inventory = screen === 2 && window === scene._itemWindow;
        const help = scene._helpWindow;
        const status = scene._equipStatusWindow;
        const equipment = inventory && window.itemIsEquipment(item);
        const visibleHelp = inventory && visible(scene, help) && help._selectedItem === item && help._wqaMenuHelpPaint;
        const lines = reviewLines([
            ...(visibleHelp && typeof help._text === 'string' ? help._text.split(/\r?\n/) : []),
            ...(equipment ? comparison(root, scene, item, status) : [])
        ]);
        const list = window._list || window._data;
        const choices = window._list ? list.filter(row => label(row?.name)) : null;
        const page = { kind: 'menu', scene, screen, window, index: window._index, item, inventory, lines,
            position: 0, epoch: 0, rowPaint: window._wqaMenuRowPaint, helpPaint: help?._wqaMenuHelpPaint,
            comparePaint: status?._wqaMenuCompareActor, helpVisible: !!visible(scene, help),
            compareTarget: status?._tempActor, compareOwner: status?._actor, compareVisible: !!visible(scene, status),
            hasReview: lines.length > 0 };
        const previous = current;
        const same = previous?.scene === scene && previous.window === window && previous.item === item && previous.index === page.index;
        if (same) page.position = Math.min(previous.position, Math.max(0, lines.length - 1));
        if (previous) retire(previous.scene);
        current = page;
        scene._wqaControllerReady = scene._wqaMenuActive = scene._wqaPresentation = true;
        const options = preferences();
        show(page, { kind: 'menuFocus', name: item.name,
            screen: previous?.scene === scene && !previous.suspended ? '' : screen === 1 ? 'Menu' : 'Inventory',
            enabled: inventory ? equipment || window.isEnabled(item) : item.enabled !== false,
            equipped: equipment && window._equippedSprite?.isReady?.() && window.itemIsEquipped(item),
            quantity: inventory && !equipment && window.needsNumber() ? root.$gameParty.numItems(item) : undefined,
            position: choices ? choices.indexOf(item) + 1 : page.index + 1,
            total: choices ? choices.length : list.length, indexed: options.indexing });
        if (page.lines.length && options.autodetail) notifications.focus(page.epoch, { ...details(page), append: true });
    }

    function observe(scene, screen) {
        if (scene._wqaSettingsActive || (screen === 2 && scene._actorWindow?.active)) return suspend(scene);
        if (!ready(scene)) return retire(scene);
        if (current?.scene === scene && live(current)) return;
        if (waiting?.scene === scene) return;
        const window = focusWindow(scene, screen);
        if (!window?.active || !selectedItem(window)) return retire(scene);
        // Close stale output immediately. Keep the old cursor until the next
        // painted selection settles so a refresh of the same row can clamp it.
        if (current?.scene === scene) notifications.close(current.epoch);
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        scene._wqaPresentation = true;
        const task = waiting = { scene };
        renderer.once('postrender', () => {
            if (waiting !== task) return;
            waiting = null;
            try { publish(scene, screen); } catch { retire(scene); }
        });
    }

    return {
        observe, retire, suspend,
        controlOwner(scene) { return current?.scene === scene && live(current) ? current : null; },
        command(page, action) {
            if (!page || page !== current || !live(page)) return false;
            if (action === 'details') show(page, page.lines.length ? details(page) : { kind: 'menuReview', name: 'No details here.' });
            else if (REVIEW.has(action) && page.lines.length) {
                show(page, { ...moveReview(page, action), indexed: preferences().indexing });
            } else return false;
            return true;
        },
        announce(page, record) { if (page === current && live(page)) show(page, record); }
    };
}

module.exports = { createMenuObserver };
