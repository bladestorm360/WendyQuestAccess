'use strict';

const VOLUME = new Set(['bgmVolume', 'seVolume']);

function bounded(text) {
    return typeof text === 'string' && text.length > 0 && text.length <= 96 ? text : '';
}

function optionFocus(scene, window) {
    const tab = bounded(window.currentTab);
    const index = window._index;
    const list = window._list;
    if (!tab || !Array.isArray(list) || !Number.isInteger(index)) return null;
    if (index === -1) return { kind: 'optionTab', name: tab, key: 'tab:' + tab };
    if (index === list.length) {
        const button = scene.systemButtons?.[window._index2];
        const name = bounded(button?.text);
        return name && button.sprite && button.sprite.visible !== false && button.sprite.worldVisible !== false
            ? { kind: 'fileLabel', name, key: 'system:' + window._index2 } : null;
    }

    const command = list[index];
    const name = bounded(command?.name);
    if (!name) return null;
    const record = { kind: 'optionValue', name, key: 'option:' + tab + ':' + index,
        enabled: command.enabled !== false };
    if (window._wqaOptionRow !== index || window._wqaOptionTab !== tab) return null;
    if (VOLUME.has(command.symbol)) {
        const value = window._wqaVolumeShown;
        // Each visible pip is lit when the accepted setting exceeds its
        // ten-unit threshold. The UI does not print the underlying value.
        if (Number.isFinite(value) && value >= 0 && value <= 100) record.pips = Math.ceil(value / 10);
    } else if (command.symbol !== 'exit') {
        record.status = bounded(window._wqaOptionStatus);
    }
    return record;
}

function observeOptionActions(window, changed, suspend, leave) {
    for (const name of ['cursorLeft', 'cursorRight', 'cursorPageup', 'cursorPagedown']) {
        const original = window[name];
        if (typeof original !== 'function') continue;
        window[name] = function () {
            const result = original.apply(this, arguments);
            // These native handlers also change the tab or system button
            // without changing the primary list index.
            changed();
            return result;
        };
    }

    const setConfigValue = window.setConfigValue;
    if (typeof setConfigValue === 'function') window.setConfigValue = function (symbol) {
        // Native changeValue reaches this setter only for an accepted change.
        if (symbol === 'fullscreen') suspend();
        const result = setConfigValue.apply(this, arguments);
        if (this._list?.[this._index]?.symbol === symbol) changed(true);
        return result;
    };

    const processOk = window.processOk;
    if (typeof processOk === 'function') window.processOk = function () {
        if (this._list?.[this._index]?.symbol === 'exit') leave();
        return processOk.apply(this, arguments);
    };
}

module.exports = { optionFocus, observeOptionActions };
