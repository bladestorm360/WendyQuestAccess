'use strict';

const DEFAULT_KEYS = Object.freeze({ settings: 'F8', repeat: 'R' });
const LETTER = /^[A-Z]$/;

function keyName(event) {
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.isComposing ||
        event.defaultPrevented || typeof event.key !== 'string') return '';
    const key = event.key.toUpperCase();
    return key === 'F8' || LETTER.test(key) ? key : '';
}

function normalizeKeys(value) {
    const settings = value?.settings;
    const repeat = value?.repeat;
    const settingsKey = settings === 'F8' || (typeof settings === 'string' && LETTER.test(settings))
        ? settings : DEFAULT_KEYS.settings;
    const repeatKey = repeat === null || (typeof repeat === 'string' && LETTER.test(repeat))
        ? repeat : DEFAULT_KEYS.repeat;
    return { settings: settingsKey, repeat: settingsKey === repeatKey ? null : repeatKey };
}

function nativeConflict(root, key, eventCode) {
    return (key === 'F8' && root.Utils.isOptionValid?.('test')) ||
        !!root.Input?.keyMapper?.[eventCode || (key === 'F8' ? 119 : key.charCodeAt(0))];
}

module.exports = { DEFAULT_KEYS, keyName, normalizeKeys, nativeConflict };
