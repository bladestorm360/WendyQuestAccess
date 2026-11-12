'use strict';

const { reviewLines, moveReview } = require('./review');
const { battlePresented, drawnText } = require('../battle/presentation');
const { shopRow, shopQuantity, shopDetails, sameShopPaint, shopPaint } = require('./shop');

const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);
const PARAMS = [0, 1, 2, 3];

function visible(scene, window) {
    return !!window && window.parent === scene._windowLayer && window.worldVisible && window.worldAlpha > 0 &&
        window.openness === 255 && window.contentsOpacity > 0 && window.contents?.isReady?.();
}

function focusWindow(scene, screen) {
    if (screen === 1) return scene._commandWindow;
    if (screen === 3) return scene._itemWindow;
    if (screen === 4) return scene._buyWindow;
    if (screen === 5) return scene._numberWindow;
    if (scene._actorWindow?.active) return null;
    return scene._itemWindow?.isFocused ? scene._itemWindow : scene._categoryWindow;
}

function selectedItem(window) {
    const index = window._index;
    return Number.isInteger(index) && index >= 0 ? (window._list || window._data)?.[index] : null;
}

function battleBagRow(window) {
    const rows = window?._wqaBattleBagRows;
    const row = rows?.get(window._index);
    return row && row.contents === window.contents && row.list === window._data &&
        row.item === (selectedItem(window) || null) ? row : null;
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

    function ready(scene, screen) {
        if (screen === 3) return battlePresented(root, host, scene, true) &&
            root.BattleManager._phase === 'input' && scene._itemWindow?._openAmount === 1;
        return scene && scene === host.manager._scene && host.graphics.app?.stage === scene &&
            scene._started && scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 &&
            !scene._wqaSettingsActive && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize && host.hasFocus();
    }

    function retireBag(scene) {
        if (!scene?._wqaBattleBagActive) return;
        scene._wqaBattleBagActive = false;
        if (scene._itemWindow) scene._itemWindow._wqaBattleBagPresented = null;
    }

    function retire(scene) {
        retireBag(scene);
        if (waiting?.scene === scene) waiting = null;
        if (current?.scene !== scene) return;
        notifications.close(current.epoch);
        current = null;
        scene._wqaControllerReady = scene._wqaMenuActive = false;
    }

    function suspend(scene) {
        retireBag(scene);
        if (waiting?.scene === scene) waiting = null;
        if (current?.scene !== scene || current.suspended) return;
        notifications.close(current.epoch);
        current.suspended = true;
        scene._wqaControllerReady = scene._wqaMenuActive = false;
    }

    function live(page) {
        if (!page || page.suspended || !ready(page.scene, page.screen)) return false;
        const window = focusWindow(page.scene, page.screen);
        if (page.screen >= 4) {
            if (window !== page.window || !window.active || !visible(page.scene, window) ||
                !sameShopPaint(page.scene, page.shopPaint, visible)) return false;
            return page.screen === 5 ? shopQuantity(window) === page.shopRow :
                window._index === page.index && shopRow(window) === page.shopRow && presentedRow(window);
        }
        if (page.screen === 3) return window === page.window && window.active && visible(page.scene, window) &&
            window._index === page.index && battleBagRow(window) === page.bagRow && presentedRow(window);
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

    function announceSave(scene, page) {
        const save = scene._wqaMenuSave;
        const text = save?.status === -1 ? 'Could not save the game.' :
            save?.text || (save?.status === 1 && save.bannerDone ? 'Save completed.' : '');
        if (!text) return;
        scene._wqaMenuSave = null;
        scene._wqaLastManualSave = text;
        if (page.item.symbol === 'save') {
            page.lines = reviewLines(text.split('\n'));
            page.hasReview = page.lines.length > 0;
        }
        notifications.focus(page.epoch, { kind: 'dialoguePage', text, append: true });
    }

    function observeSave(scene) {
        const save = scene._wqaMenuSave;
        if (save?.status !== 1 || save.text || save.pending) return;
        const banner = save.banner;
        const value = banner?._currentString;
        if (banner?.parent !== scene || banner._dirty || typeof value !== 'string' || !value.length || value.length > 384)
            return;
        // The banner is revealed one glyph at a time. Only schedule
        // postrender once the last glyph can appear on the current frame.
        const last = banner.children[banner.children.length - 1];
        if (!last || !(last.alpha > 0) || !last.scale.x || !last.scale.y) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        renderer.once('postrender', () => {
            save.pending = false;
            if (scene._wqaMenuSave !== save || !ready(scene, 1)) return;
            try {
                save.text = drawnText(scene, banner, 384);
                if (current?.scene === scene && live(current)) announceSave(scene, current);
            } catch { retire(scene); }
        });
        save.pending = true;
    }

    function present(page, focus) {
        const { scene, screen, window, lines } = page;
        const previous = current;
        const same = previous?.scene === scene && previous.window === window &&
            previous.item === page.item && previous.index === page.index;
        if (same) page.position = Math.min(previous.position, Math.max(0, lines.length - 1));
        if (previous) retire(previous.scene);
        current = page;
        page.vitals = screen <= 2 && !!scene._wqaMenuStatus && scene._wqaMenuStatus === scene._statusWindow;
        if (screen === 3) {
            scene._wqaBattleBagActive = true;
            window._wqaBattleBagPresented = page.bagRow;
        }
        scene._wqaControllerReady = scene._wqaMenuActive = scene._wqaPresentation = true;
        const options = preferences();
        const heading = ['Menu', 'Inventory', 'Battle Bag', 'Shop', 'Purchase quantity'][screen - 1];
        show(page, { kind: 'menuFocus', ...focus, indexed: options.indexing,
            screen: previous?.scene === scene && !previous.suspended &&
                (screen <= 2 || previous.screen === screen) ? '' : heading });
        const automatic = screen === 5 && page.quantityDetail ? lines.slice(1) : lines;
        if (automatic.length && options.autodetail)
            notifications.focus(page.epoch, { kind: 'menuDetails', lines: automatic, append: true });
        if (screen === 1) announceSave(scene, page);
        if (screen === 4 && scene._wqaShopPurchase) {
            const purchase = scene._wqaShopPurchase;
            scene._wqaShopPurchase = null;
            const name = label(purchase.name);
            if (name && Number.isSafeInteger(purchase.count) && purchase.count > 0) {
                notifications.focus(page.epoch, { kind: 'menuReview', append: true,
                    name: 'Purchased ' + purchase.count + ', ' + name + '.' });
            }
        }
    }

    function publishBag(scene, window) {
        const row = battleBagRow(window);
        if (!row) return;
        const text = label(row.description);
        const lines = text ? reviewLines(text.split(/\r?\n/)) : [];
        const page = { kind: 'menu', scene, screen: 3, window, index: window._index, item: row.item, bagRow: row, lines,
            position: 0, epoch: 0, hasReview: lines.length > 0 };
        present(page, { name: text || (row.item ? 'Item' : 'Empty'), enabled: row.enabled, quantity: row.quantity,
            position: window._index + 1, total: window.maxItems() });
    }

    function publishShop(scene, window, screen) {
        const quantity = screen === 5;
        const row = quantity ? shopQuantity(window) : shopRow(window);
        const name = label(row?.item?.name);
        if (!name) return;
        const paint = shopPaint(scene, visible);
        const quantityDetail = quantity && Number.isSafeInteger(row.price) && row.price >= 0;
        const lines = shopDetails(root, row, paint, quantityDetail);
        const page = { kind: 'menu', scene, screen, window, index: window._index, item: row.item, shopRow: row,
            shopPaint: paint, lines, quantityDetail, position: 0, epoch: 0, hasReview: lines.length > 0 };
        if (quantity) present(page, { name: name + ', quantity ' + row.count, price: row.price,
            currency: row.currency, totalPrice: true });
        else present(page, { name, price: row.price, currency: paint.gold?.currency, enabled: row.enabled,
            position: window._index + 1, total: window.maxItems() });
    }

    function publish(scene, screen) {
        if (!ready(scene, screen)) return retire(scene);
        const window = focusWindow(scene, screen);
        if (!window?.active || !visible(scene, window) || (screen !== 5 && !presentedRow(window))) return;
        if (screen === 3) return publishBag(scene, window);
        if (screen >= 4) return publishShop(scene, window, screen);
        const item = selectedItem(window);
        if (!item || !label(item.name)) return;
        const inventory = screen === 2 && window === scene._itemWindow;
        const help = scene._helpWindow;
        const status = scene._equipStatusWindow;
        const equipment = inventory && window.itemIsEquipment(item);
        const visibleHelp = inventory && visible(scene, help) && help._selectedItem === item && help._wqaMenuHelpPaint;
        const lines = reviewLines([
            ...(visibleHelp && typeof help._text === 'string' ? help._text.split(/\r?\n/) : []),
            ...(equipment ? comparison(root, scene, item, status) : []),
            ...(screen === 1 && item.symbol === 'save' && scene._wqaLastManualSave ?
                scene._wqaLastManualSave.split('\n') : [])
        ]);
        const list = window._list || window._data;
        const choices = window._list ? list.filter(row => label(row?.name)) : null;
        const page = { kind: 'menu', scene, screen, window, index: window._index, item, inventory, lines,
            position: 0, epoch: 0, rowPaint: window._wqaMenuRowPaint, helpPaint: help?._wqaMenuHelpPaint,
            comparePaint: status?._wqaMenuCompareActor, helpVisible: !!visible(scene, help),
            compareTarget: status?._tempActor, compareOwner: status?._actor, compareVisible: !!visible(scene, status),
            hasReview: lines.length > 0 };
        present(page, { name: item.name,
            enabled: inventory ? equipment || window.isEnabled(item) : item.enabled !== false,
            equipped: equipment && window._equippedSprite?.isReady?.() && window.itemIsEquipped(item),
            quantity: inventory && !equipment && window.needsNumber() ? root.$gameParty.numItems(item) : undefined,
            position: choices ? choices.indexOf(item) + 1 : page.index + 1,
            total: choices ? choices.length : list.length });
    }

    function observe(scene, screen) {
        if (scene._wqaSettingsActive || (screen === 2 && scene._actorWindow?.active)) return suspend(scene);
        if (!ready(scene, screen)) return retire(scene);
        if (screen === 1) observeSave(scene);
        if (current?.scene === scene && live(current)) {
            if (screen === 1) announceSave(scene, current);
            return;
        }
        if (waiting?.scene === scene) return;
        const window = focusWindow(scene, screen);
        if (!window?.active) return retire(scene);
        const row = screen === 5 ? shopQuantity(window) : screen === 4 ? shopRow(window) :
            screen === 3 ? battleBagRow(window) : selectedItem(window);
        if (!row) return retire(scene);
        // Close stale output immediately. Keep the old cursor until the next
        // painted selection settles so a refresh of the same row can clamp it.
        if (current?.scene === scene) notifications.close(current.epoch);
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        scene._wqaPresentation = true;
        if (screen === 3) scene._wqaBattleBagActive = true;
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
