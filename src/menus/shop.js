'use strict';

const { reviewLines } = require('./review');

function shopRow(window) {
    const row = window._wqaShopRows?.get(window._index);
    return row && row.contents === window.contents && row.list === window._data &&
        row.item === window._data?.[window._index] ? row : null;
}

function shopQuantity(window) {
    const row = window._wqaShopQuantity;
    return row && row.contents === window.contents && row.item === window._item &&
        row.count === window._number && Number.isSafeInteger(row.count) && row.count > 0 ? row : null;
}

function paint(window, key) {
    const result = window[key];
    return result?.contents === window.contents ? result : null;
}

function shopPaint(scene, visible) {
    const gold = scene._goldWindow;
    const help = scene._helpWindow;
    const status = scene._statusWindow;
    const statusVisible = visible(scene, status);
    return {
        gold: visible(scene, gold) ? paint(gold, '_wqaShopGold') : null,
        help: visible(scene, help) ? paint(help, '_wqaShopHelp') : null,
        possession: statusVisible ? paint(status, '_wqaShopPossession') : null,
        equip: statusVisible ? paint(status, '_wqaShopEquip') : null,
        change: statusVisible ? paint(status, '_wqaShopChange') : null
    };
}

function sameShopPaint(scene, previous, visible) {
    const gold = scene._goldWindow;
    const help = scene._helpWindow;
    const status = scene._statusWindow;
    const statusVisible = visible(scene, status);
    return previous.gold === (visible(scene, gold) ? paint(gold, '_wqaShopGold') : null) &&
        previous.help === (visible(scene, help) ? paint(help, '_wqaShopHelp') : null) &&
        previous.possession === (statusVisible ? paint(status, '_wqaShopPossession') : null) &&
        previous.equip === (statusVisible ? paint(status, '_wqaShopEquip') : null) &&
        previous.change === (statusVisible ? paint(status, '_wqaShopChange') : null);
}

function shopDetails(root, row, { gold, help, possession, equip, change }, quantity) {
    const lines = [];
    const item = row.item;
    if (quantity && Number.isSafeInteger(row.price) && row.price >= 0) {
        const currency = typeof row.currency === 'string' && row.currency.length <= 24 ? row.currency.trim() : '';
        lines.push('Quantity ' + row.count + ', total ' + row.price + (currency ? ' ' + currency : ''));
    }
    if (help?.text && help.text === item.description) lines.push(...help.text.split(/\r?\n/));
    if (possession?.item === item && Number.isSafeInteger(possession.count)) lines.push('Owned ' + possession.count);
    if (gold && Number.isSafeInteger(gold.value)) {
        const currency = typeof gold.currency === 'string' && gold.currency.length <= 24 ? gold.currency.trim() : '';
        lines.push('Balance ' + gold.value + (currency ? ' ' + currency : ''));
    }
    if (equip?.item === item && typeof equip.name === 'string' && equip.name) {
        lines.push(equip.name + (equip.enabled ? '' : ', cannot equip'));
        if (equip.oldItem?.name) lines.push('Equipped ' + equip.oldItem.name);
        if (equip.enabled && change?.item === item && Number.isSafeInteger(change.change)) {
            const name = root.TextManager.param(change.paramId);
            if (typeof name === 'string' && name) lines.push(name + ' ' +
                (change.change > 0 ? '+' : '') + change.change);
        }
    }
    return reviewLines(lines);
}

module.exports = { shopRow, shopQuantity, shopPaint, sameShopPaint, shopDetails };
