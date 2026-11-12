'use strict';

const CONTROLLER_DEFAULTS = Object.freeze({ enabled: true, mode: 8, settings: 9, repeat: 0,
    previous: 12, next: 13, confirm: 0, back: 1, recovery: Object.freeze([10, 11]) });
const MODE_ACTIONS = ['mode', 'settings', 'repeat'];
const MENU_ACTIONS = ['previous', 'next', 'confirm', 'back'];
const ACTION_NAMES = Object.freeze({ mode: 'Toggle mod mode', settings: 'Open mod settings', repeat: 'Repeat dialogue',
    previous: 'Previous settings item', next: 'Next settings item', confirm: 'Activate settings item',
    back: 'Back in settings', recovery: 'Toggle controller support' });
const BUTTONS = ['South button', 'East button', 'West button', 'North button', 'Left bumper', 'Right bumper',
    'Left trigger', 'Right trigger', 'Left center button', 'Right center button', 'Left stick click', 'Right stick click',
    'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
const FAMILY_LABELS = Object.freeze({
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'],
    playstation: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share or Create', 'Options', 'L3', 'R3'],
    switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus', 'Left stick click', 'Right stick click']
});

function buttonBit(button) { return Number.isInteger(button) && button >= 0 && button < BUTTONS.length ? 1 << button : 0; }

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
            !value.includes(bindings.mode) && value.every(button => !nativeButton(button));
    }
    if (!buttonBit(value) || (action === 'mode' && (nativeButton(value) || bindings.recovery.includes(value)))) return false;
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
    if (Array.isArray(saved?.recovery) && bindingAllowed('recovery', saved.recovery, result, () => false)) {
        result.recovery = saved.recovery.slice();
    } else if (result.recovery.includes(result.mode)) {
        for (const action of MODE_ACTIONS) result[action] = CONTROLLER_DEFAULTS[action];
    }
    return result;
}

module.exports = { CONTROLLER_DEFAULTS, MODE_ACTIONS, MENU_ACTIONS, ACTION_NAMES, buttonBit, controllerFamily,
    buttonName, recoveryMask, bindingAllowed, normalizeController };
