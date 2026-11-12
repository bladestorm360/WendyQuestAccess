'use strict';

const REVIEW_KEYS = Object.freeze({ reviewPrevious: 'Shift+ArrowUp', reviewNext: 'Shift+ArrowDown',
    reviewFirst: 'Shift+ArrowLeft', reviewLast: 'Shift+ArrowRight' });
const DEFAULT_KEYS = Object.freeze({ settings: 'F8', repeat: 'R', puzzleGuide: 'Shift+G', puzzleStop: 'Ctrl+G',
    details: 'I', ...REVIEW_KEYS });
const LETTER = /^[A-Z]$/;
const REVIEW_GESTURE = /^Shift\+(?:Arrow(?:Up|Down|Left|Right)|[A-Z])$/;
const PUZZLE_KEYS = Object.freeze({ puzzleGuide: /^Shift\+[A-Z]$/, puzzleStop: /^Ctrl\+[A-Z]$/ });

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
    const normalized = { settings: settingsKey, repeat: settingsKey === repeatKey ? null : repeatKey };
    for (const [action, pattern] of Object.entries(PUZZLE_KEYS)) {
        const key = value?.[action];
        normalized[action] = typeof key === 'string' && pattern.test(key) ? key : DEFAULT_KEYS[action];
    }
    const details = typeof value?.details === 'string' && LETTER.test(value.details) ? value.details : DEFAULT_KEYS.details;
    normalized.details = settingsKey === details ? null : details;
    const actions = Object.keys(REVIEW_KEYS);
    const review = actions.map(action => value?.[action]);
    const valid = review.every(gesture => typeof gesture === 'string' && REVIEW_GESTURE.test(gesture)) &&
        new Set(review).size === actions.length;
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        normalized[action] = valid ? review[i] : REVIEW_KEYS[action];
    }
    return normalized;
}

function reviewGesture(event) {
    if (event.ctrlKey || event.altKey || !event.shiftKey || event.metaKey || event.defaultPrevented ||
        event.isComposing || typeof event.key !== 'string') return '';
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const gesture = 'Shift+' + key;
    return REVIEW_GESTURE.test(gesture) ? gesture : '';
}

function puzzleGesture(event) {
    if (event.altKey || event.metaKey || event.defaultPrevented || event.isComposing ||
        !!event.ctrlKey === !!event.shiftKey || typeof event.key !== 'string') return '';
    const key = event.key.toUpperCase();
    if (!LETTER.test(key)) return '';
    return (event.ctrlKey ? 'Ctrl+' : 'Shift+') + key;
}

function nativeConflict(root, key, eventCode) {
    return (key === 'F8' && root.Utils.isOptionValid?.('test')) ||
        !!root.Input?.keyMapper?.[eventCode || (key === 'F8' ? 119 : key.charCodeAt(key.length - 1))];
}

module.exports = { DEFAULT_KEYS, PUZZLE_KEYS, REVIEW_KEYS, keyName, normalizeKeys, nativeConflict, puzzleGesture, reviewGesture };
