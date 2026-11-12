'use strict';

const ROUTE_ACTIONS = { previousDestination: 'Previous destination', nextDestination: 'Next destination',
    currentDestination: 'Read selected destination', directions: 'Directions', previousCategory: 'Previous category',
    nextCategory: 'Next category' };
const AUDIO_KEYS = { beaconToggle: 'Shift+B', wallToggle: 'Shift+H', beaconStop: 'Shift+V' };
const ACTIONS = Object.freeze({ ...ROUTE_ACTIONS, beaconToggle: 'Toggle navigation beacon',
    wallToggle: 'Toggle wall sounds', beaconStop: 'Stop current navigation' });
const LAYOUT_NAMES = Object.freeze({ letters: 'Letters', brackets: 'Brackets and backslash' });
const DEFAULTS = Object.freeze({
    letters: Object.freeze({ previousDestination: 'J', nextDestination: 'L', currentDestination: 'K', directions: 'P',
        previousCategory: 'Shift+J', nextCategory: 'Shift+L' }),
    brackets: Object.freeze({ previousDestination: '[', nextDestination: ']', currentDestination: 'P', directions: '\\',
        previousCategory: 'Shift+[', nextCategory: 'Shift+]' })
});
const GESTURE = /^(?:Shift\+)?(?:[A-Z]|\[|\]|\\)$/;
const SHIFTED = Object.freeze({ '{': '[', '}': ']', '|': '\\' });
const NATIVE_CODES = Object.freeze({ '[': 219, ']': 221, '\\': 220 });

function navigationGesture(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented || event.isComposing ||
        typeof event.key !== 'string' || event.key.length !== 1) return '';
    const base = (event.shiftKey && SHIFTED[event.key]) || event.key.toUpperCase();
    const result = event.shiftKey ? `Shift+${base}` : base;
    return GESTURE.test(result) ? result : '';
}

function nativeNavigationConflict(root, gesture, eventCode) {
    if (!gesture) return false;
    const base = gesture[gesture.length - 1];
    return !!root.Input?.keyMapper?.[eventCode || NATIVE_CODES[base] || base.charCodeAt(0)];
}

function normalizeNavigation(saved, reserved = []) {
    const bindings = {};
    for (const layout of Object.keys(DEFAULTS)) {
        let proposed = { ...DEFAULTS[layout] };
        for (const action of Object.keys(ROUTE_ACTIONS)) {
            const key = saved?.bindings?.[layout]?.[action];
            if (key === null || (typeof key === 'string' && GESTURE.test(key))) proposed[action] = key;
        }
        const assigned = Object.values(proposed).filter(Boolean);
        if (new Set(assigned).size !== assigned.length) proposed = { ...DEFAULTS[layout] };
        const used = new Set([...reserved, ...Object.values(proposed).filter(Boolean)]);
        const put = (action, key) => {
            proposed[action] = key && !used.has(key) ? key : null;
            if (proposed[action]) used.add(key);
        };
        for (const action of Object.keys(AUDIO_KEYS)) {
            const key = saved?.bindings?.[layout]?.[action];
            if (key === null || (typeof key === 'string' && GESTURE.test(key))) put(action, key);
        }
        for (const [action, fallback] of Object.entries(AUDIO_KEYS)) {
            if (proposed[action] === undefined) put(action, fallback);
        }
        bindings[layout] = proposed;
    }
    return { layout: saved?.layout === 'brackets' ? 'brackets' : 'letters', bindings, autowalk: saved?.autowalk === true,
        speakAutowalkPath: saved?.speakAutowalkPath === true };
}

function navigationAction(settings, gesture) {
    if (!gesture) return '';
    const bindings = settings.bindings[settings.layout];
    return Object.keys(ACTIONS).find(action => bindings[action] === gesture) || '';
}

function gestureName(gesture) {
    if (!gesture) return 'Unassigned';
    return gesture.replace('[', 'Left bracket').replace(']', 'Right bracket').replace('\\', 'Backslash');
}

module.exports = { ACTIONS, DEFAULTS, LAYOUT_NAMES, navigationGesture, nativeNavigationConflict, normalizeNavigation,
    navigationAction, gestureName };
