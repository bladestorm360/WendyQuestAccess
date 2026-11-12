'use strict';

const CONTROLLER_DEFAULTS = Object.freeze({ enabled: true, mode: 8, settings: 9, repeat: 0,
    previous: 12, next: 13, confirm: 0, back: 1, recovery: Object.freeze([10, 11]),
    previousDestination: 20, nextDestination: 21, previousCategory: 22, nextCategory: 23, directions: 6,
    currentDestination: 0, puzzleGuide: 4, puzzleStop: 5, beaconToggle: 6, wallToggle: 21, beaconStop: 20 });
const MODE_ACTIONS = ['mode', 'settings', 'repeat'];
const MENU_ACTIONS = ['previous', 'next', 'confirm', 'back'];
const FIELD_ACTIONS = ['previousDestination', 'nextDestination', 'previousCategory', 'nextCategory', 'directions'];
const FIELD_MODE_ACTIONS = ['currentDestination', 'puzzleGuide', 'puzzleStop', 'beaconToggle', 'wallToggle', 'beaconStop'];
const RECOVERY_CONFLICTS = [...MODE_ACTIONS, ...FIELD_MODE_ACTIONS, ...FIELD_ACTIONS];
const ACTION_NAMES = Object.freeze({ mode: 'Toggle mod mode', settings: 'Open mod settings', repeat: 'Repeat dialogue',
    previous: 'Previous settings item', next: 'Next settings item', confirm: 'Activate settings item',
    back: 'Back in settings', recovery: 'Toggle controller support', previousDestination: 'Previous destination',
    nextDestination: 'Next destination', previousCategory: 'Previous category', nextCategory: 'Next category',
    directions: 'Directions', currentDestination: 'Read selected destination in mod mode',
    puzzleGuide: 'Start or review puzzle guidance in mod mode', puzzleStop: 'Stop puzzle guidance in mod mode',
    beaconToggle: 'Toggle navigation beacon in mod mode', wallToggle: 'Toggle wall sounds in mod mode',
    beaconStop: 'Stop current navigation in mod mode' });
const BUTTONS = ['South button', 'East button', 'West button', 'North button', 'Left bumper', 'Right bumper',
    'Left trigger', 'Right trigger', 'Left center button', 'Right center button', 'Left stick click', 'Right stick click',
    'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', null, null, null, null,
    'Right stick left', 'Right stick right', 'Right stick up', 'Right stick down'];
const FAMILY_LABELS = Object.freeze({
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'],
    playstation: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share or Create', 'Options', 'L3', 'R3'],
    switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus', 'Left stick click', 'Right stick click']
});

function buttonBit(button) { return Number.isInteger(button) && BUTTONS[button] ? 1 << button : 0; }
const BINDABLE_MASK = BUTTONS.reduce((mask, name, index) => name ? mask | 1 << index : mask, 0);

function canUnassign(action) {
    return action === 'repeat' || FIELD_MODE_ACTIONS.includes(action) || FIELD_ACTIONS.includes(action);
}

function controllerFamily(id) {
    if (typeof id !== 'string' || id.length > 128) return '';
    if (/054c|playstation|dualsense|dualshock/i.test(id)) return 'playstation';
    if (/057e|nintendo|switch pro/i.test(id)) return 'switch';
    return /045e|xbox|xinput/i.test(id) ? 'xbox' : '';
}

function buttonName(family, button) {
    if (Array.isArray(button)) return button.map(item => buttonName(family, item)).join(' plus ');
    return FAMILY_LABELS[family]?.[button] || BUTTONS[button] || 'Unassigned';
}

function recoveryMask(recovery) { return buttonBit(recovery[0]) | buttonBit(recovery[1]); }

function bindingAllowed(action, value, bindings, nativeButton) {
    if (action === 'recovery') {
        return Array.isArray(value) && value.length === 2 && !!buttonBit(value[0]) && !!buttonBit(value[1]) && value[0] !== value[1] &&
            value.every(button => button < 16 && !nativeButton(button) && RECOVERY_CONFLICTS.every(other => bindings[other] !== button));
    }
    if (!buttonBit(value) || (RECOVERY_CONFLICTS.includes(action) && bindings.recovery.includes(value))) return false;
    if (FIELD_ACTIONS.includes(action)) return value !== bindings.mode && !nativeButton(value) &&
        FIELD_ACTIONS.every(other => other === action || bindings[other] !== value);
    if (action === 'mode' && (nativeButton(value) ||
        FIELD_MODE_ACTIONS.some(other => bindings[other] === value) || FIELD_ACTIONS.some(other => bindings[other] === value))) return false;
    if (FIELD_MODE_ACTIONS.includes(action)) return value !== bindings.mode && value !== bindings.settings &&
        (action !== 'puzzleStop' || value !== bindings.repeat) &&
        FIELD_MODE_ACTIONS.every(other => other === action || bindings[other] !== value);
    if (action === 'settings' && FIELD_MODE_ACTIONS.some(other => bindings[other] === value)) return false;
    if (action === 'repeat' && value === bindings.puzzleStop) return false;
    const group = MODE_ACTIONS.includes(action) ? MODE_ACTIONS : MENU_ACTIONS;
    return group.every(other => other === action || bindings[other] !== value);
}

function normalizeController(saved) {
    const result = { ...CONTROLLER_DEFAULTS, enabled: saved?.enabled !== false };
    // Validate simultaneous persisted reassignments together. A swapped pair
    // remains valid on reload; an ambiguous or incomplete group uses defaults.
    for (const group of [MODE_ACTIONS, MENU_ACTIONS]) {
        const candidate = group.map(action => saved?.[action]);
        if (candidate.every((value, index) => buttonBit(value) || (group[index] === 'repeat' && value === null)) &&
            new Set(candidate).size === group.length) {
            for (let index = 0; index < group.length; index++) result[group[index]] = candidate[index];
        }
    }
    for (const action of [...FIELD_ACTIONS, ...FIELD_MODE_ACTIONS]) result[action] = null;
    if (Array.isArray(saved?.recovery) && bindingAllowed('recovery', saved.recovery, result, () => false)) {
        result.recovery = saved.recovery.slice();
    } else if (MODE_ACTIONS.some(action => result.recovery.includes(result[action]))) {
        for (const action of MODE_ACTIONS) result[action] = CONTROLLER_DEFAULTS[action];
    }
    // Honor every valid existing explicit assignment before adding defaults
    // for newer actions. An occupied new default leaves that action unassigned.
    for (const action of FIELD_MODE_ACTIONS) {
        const preferred = saved?.[action];
        if (bindingAllowed(action, preferred, result, () => false)) result[action] = preferred;
    }
    for (const action of FIELD_MODE_ACTIONS) {
        if (saved?.[action] === null || result[action] !== null) continue;
        const defaults = action === 'currentDestination' ? [0, 2, 3] : [CONTROLLER_DEFAULTS[action]];
        result[action] = defaults.find(value => bindingAllowed(action, value, result, () => false)) ?? null;
    }
    for (const action of FIELD_ACTIONS) {
        const preferred = saved?.[action];
        const alternatives = action === 'directions' ? [CONTROLLER_DEFAULTS[action], 7] : [CONTROLLER_DEFAULTS[action]];
        result[action] = preferred === null ? null : [preferred, ...alternatives].find(value =>
            bindingAllowed(action, value, result, () => false)) ?? null;
    }
    return result;
}

module.exports = { CONTROLLER_DEFAULTS, MODE_ACTIONS, MENU_ACTIONS, FIELD_ACTIONS, FIELD_MODE_ACTIONS, ACTION_NAMES, buttonBit, controllerFamily,
    buttonName, recoveryMask, bindingAllowed, normalizeController, BINDABLE_MASK, canUnassign };
