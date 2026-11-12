'use strict';

const { MENU_ACTIONS, FIELD_ACTIONS, BINDABLE_MASK, buttonBit, controllerFamily, buttonName, recoveryMask } = require('./controller-bindings');
const QUEUE_LIMIT = 4;

function modeAnnouncement(family, context, bindings) {
    if (context.kind === 'field') {
        const current = bindings.currentDestination === null ? '' : `${buttonName(family, bindings.currentDestination)} reads the destination. `;
        return `Mod mode. ${buttonName(family, bindings.settings)} opens settings. ${current}${buttonName(family, bindings.mode)} cancels.`;
    }
    const next = context.kind === 'front' ? 'opens settings' : 'repeats dialogue';
    const input = context.kind === 'front' ? bindings.settings : bindings.repeat;
    const hint = input === null ? '' : `${buttonName(family, input)} ${next}. `;
    return `Mod mode. ${hint}${buttonName(family, bindings.mode)} cancels.`;
}

function rightStick(x, y, previous) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    // Retain an intentional axis until it returns toward center. A diagonal
    // selects the stronger axis, so it cannot change category and item together.
    if ((previous === 20 && x < -0.4) || (previous === 21 && x > 0.4) ||
        (previous === 22 && y < -0.4) || (previous === 23 && y > 0.4)) return previous;
    if (Math.max(Math.abs(x), Math.abs(y)) < 0.55) return 0;
    return Math.abs(x) >= Math.abs(y) ? (x < 0 ? 20 : 21) : (y < 0 ? 22 : 23);
}

function createController(host) {
    const devices = new Array(16);
    const pending = [];
    let mode = null;
    let scheduled = false;

    function run() {
        scheduled = false;
        for (const command of pending.splice(0, QUEUE_LIMIT)) {
            if (devices[command.index] !== command.device || host.context() !== command.context) continue;
            if (command.action === 'capture' && command.context.capture !== command.capture) continue;
            try { host.dispatch(command.context, command.action, command.device.family, command.buttons); }
            catch { /* Native input has already completed its poll. */ }
        }
    }

    function queue(index, device, action, buttons) {
        if (pending.length >= QUEUE_LIMIT) return;
        pending.push({ index, device, context: device.context, action, buttons, capture: device.context.capture });
        if (!scheduled) {
            scheduled = true;
            host.schedule(run);
        }
    }

    function sample(index, mapping, id, pressed, axisX, axisY) {
        if (mapping !== 'standard' || !Number.isInteger(index) || index < 0 || index >= devices.length) return 0;
        const context = host.context();
        let device = devices[index];
        if (mode && mode.context !== context) mode = null;
        if (!context) {
            if (device) devices[index] = undefined;
            return 0;
        }
        const physical = pressed;
        pressed &= 0xffff;
        const stick = rightStick(axisX, axisY, device?.context === context ? device.stick : 0);
        if (stick) pressed |= buttonBit(stick);
        if (!device || device.context !== context) {
            devices[index] = { context, pressed, stick, family: controllerFamily(id) };
            return 0;
        }
        const previous = device.pressed;
        device.pressed = pressed;
        device.stick = stick;
        const bindings = host.bindings();
        if (mode === device && (!bindings.enabled || host.nativeButton(bindings.mode))) mode = null;
        const capture = context.kind === 'settings' && context.group === 'controller' && context.capture;
        if (capture && bindings.enabled) {
            if (device.capture !== capture) {
                device.capture = capture;
                device.armed = previous === 0;
                device.gesture = 0;
            }
            if (device.armed) {
                device.gesture |= pressed & BINDABLE_MASK;
                if (!pressed && device.gesture) {
                    queue(index, device, 'capture', device.gesture);
                    device.gesture = 0;
                }
            } else if (!pressed) device.armed = true;
            return 0;
        }
        if (previous === pressed) return mode === device ? physical : 0;
        const rising = pressed & ~previous;
        const chord = recoveryMask(bindings.recovery);
        if ((pressed & chord) === chord && (previous & chord) !== chord &&
            bindings.recovery.every(button => !host.nativeButton(button))) {
            mode = null;
            queue(index, device, 'recovery');
            return chord;
        }
        if (context.kind === 'settings') {
            if (!bindings.enabled) return 0;
            for (const action of MENU_ACTIONS) {
                if (rising & buttonBit(bindings[action])) {
                    queue(index, device, action);
                    break;
                }
            }
            return 0; // The modal owns and masks native input separately.
        }
        if (!bindings.enabled || (mode && mode !== device) || (context.kind === 'dialogue' && bindings.repeat === null)) return 0;
        const modeBit = buttonBit(bindings.mode);
        if (rising & modeBit && !host.nativeButton(bindings.mode)) {
            const entering = mode !== device;
            mode = entering ? device : null;
            queue(index, device, entering ? 'modeEntered' : 'modeLeft');
            return physical;
        }
        if (mode !== device) {
            if (context.kind === 'field') for (const action of FIELD_ACTIONS) {
                const button = bindings[action];
                const bit = buttonBit(button);
                if ((rising & bit) && !host.nativeButton(button)) {
                    queue(index, device, action);
                    return bit & 0xffff;
                }
            }
            return 0;
        }
        // A second command requires releasing the mode button first. Keep
        // all native controls neutral while the deliberate mode is active.
        if (!(pressed & modeBit) && !(previous & modeBit)) {
            const actions = context.kind === 'field' ? ['settings', 'currentDestination'] :
                context.kind === 'front' ? ['settings'] : ['repeat'];
            for (const action of actions) if (rising & buttonBit(bindings[action])) {
                mode = null;
                queue(index, device, action);
                break;
            }
        }
        return physical;
    }

    return {
        sample,
        disconnect(index) {
            if (mode && mode === devices[index]) mode = null;
            if (Number.isInteger(index) && index >= 0 && index < devices.length) devices[index] = undefined;
        },
        reset() {
            devices.fill(undefined);
            pending.length = 0;
            mode = null;
        }
    };
}

module.exports = { createController, modeAnnouncement };
