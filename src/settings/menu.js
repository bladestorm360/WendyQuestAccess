'use strict';

const { DEFAULT_KEYS, keyName, nativeConflict, normalizeKeys } = require('./keyboard');
const { openSettings } = require('./storage');
const { ACTIONS, DEFAULTS: NAVIGATION_DEFAULTS, LAYOUT_NAMES, navigationGesture, nativeNavigationConflict,
    normalizeNavigation, navigationAction, gestureName } = require('./navigation-keys');
const { FIELD_ACTIONS, ACTION_NAMES, buttonBit, buttonName, bindingAllowed,
    normalizeController, canUnassign } = require('./controller-bindings');

const LABELS = Object.freeze({ settings: 'Open mod settings', repeat: 'Repeat dialogue' });
const POINTER_EVENTS = ['mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];

function createSettingsMenu(root, host) {
    let session = null;
    let keys = normalizeKeys(DEFAULT_KEYS);
    let pad = normalizeController();
    let navigation = normalizeNavigation();
    let storage = null;
    let loading = true;
    let saving = false;
    let resumeOnFocus = null;
    const down = new Set();
    const held = new Set();
    const touching = new Set();
    const heldTouches = new Set();
    let mouseDown = false;
    let heldMouse = false;

    openSettings(root.indexedDB).then(async database => {
        const [keyboard, controller, savedNavigation] = await Promise.all([
            database.read(), database.read('controller'), database.read('navigation')]);
        keys = normalizeKeys(keyboard);
        pad = normalizeController(controller);
        navigation = normalizeNavigation(savedNavigation);
        host.controllerChanged();
        storage = database;
    }).catch(() => {}).finally(() => {
        loading = false;
        if (session?.group) showGroup(session, session.selected);
    });

    function button(owner, label, activate) {
        const node = root.document.createElement('button');
        node.type = 'button';
        node.textContent = label;
        node.addEventListener('click', () => { if (session === owner) activate(); });
        owner.contents.append(node);
        return node;
    }

    function showRoot(owner, selection = 'keyboard') {
        owner.group = false;
        owner.capture = null;
        owner.heading.textContent = 'WendyQuest accessibility settings';
        owner.status.textContent = '';
        owner.contents.textContent = '';
        const keyboard = button(owner, 'Keyboard bindings', () => showKeyboard(owner));
        const controller = button(owner, 'Controller bindings', () => showController(owner));
        const field = button(owner, 'Navigation keyboard', () => showNavigation(owner));
        button(owner, 'Close settings', () => close(owner.scene, true));
        (selection === 'controller' ? controller : selection === 'navigation' ? field : keyboard).focus();
    }

    function status(owner, message) {
        if (session === owner) owner.status.textContent = message;
    }

    function change(owner, next, selection, key = 'keyboard', failure) {
        if (loading || saving) return false;
        const isController = key === 'controller';
        const isNavigation = key === 'navigation';
        const previous = isController ? pad : isNavigation ? navigation : keys;
        const origin = owner?.group;
        function apply(value) {
            if (isController) {
                pad = value;
                host.controllerChanged();
            } else if (isNavigation) navigation = value;
            else keys = value;
        }
        function refresh(message) {
            if (owner && session === owner) {
                showGroup(owner, selection);
                status(owner, message);
            }
        }
        apply(next);
        if (!storage) {
            refresh('Changed for this session. Settings storage is unavailable.');
            return true;
        }
        const subject = isController ? 'Controller settings' : isNavigation ? 'Navigation keyboard' : 'Keyboard bindings';
        saving = true;
        refresh(`Saving ${subject.toLowerCase()}`);
        storage.save(next, key).then(() => {
            saving = false;
            if (owner && owner.group === origin) status(owner, `${subject} saved`);
        }, () => {
            saving = false;
            apply(previous);
            if (session?.group === key) showGroup(session, session.selected);
            if (owner && owner.group === origin) {
                status(owner, `Could not save ${subject.toLowerCase()}. Previous settings restored.`);
            }
            if (failure) failure();
        });
        return true;
    }

    function showGroup(owner, selection) {
        if (owner.group === 'controller') showController(owner, selection);
        else if (owner.group === 'keyboard') showKeyboard(owner, selection);
        else if (owner.group === 'navigation') showNavigation(owner, selection);
    }

    function showNavigation(owner, selection = 'layout') {
        owner.group = 'navigation';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Navigation keyboard';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const { layout, bindings } = navigation;
        let focused = button(owner, `Navigation keymap, ${LAYOUT_NAMES[layout]}`, () => change(owner,
            { ...navigation, layout: layout === 'letters' ? 'brackets' : 'letters' }, 'layout', 'navigation'));
        for (const [action, name] of Object.entries(ACTIONS)) {
            const gesture = bindings[layout][action];
            const occupied = nativeNavigationConflict(root, gesture) ? ', used by the game' : '';
            const item = button(owner, `${name}, ${gestureName(gesture)}${occupied}`, () => {
                if (loading || saving) return;
                owner.capture = owner.selected = action;
                status(owner, 'Press a letter, bracket or backslash, with or without Shift. Delete unassigns. Escape cancels.');
            });
            if (selection === action) focused = item;
        }
        button(owner, 'Reset this navigation keymap', () => change(owner,
            { ...navigation, bindings: { ...bindings, [layout]: { ...NAVIGATION_DEFAULTS[layout] } } }, selection, 'navigation'));
        button(owner, 'Back', () => showRoot(owner, 'navigation'));
        focused.focus();
    }

    function captureNavigation(owner, gesture, eventCode, unassign) {
        if (!gesture && !unassign) return;
        const { layout, bindings } = navigation;
        const action = owner.capture;
        const duplicate = navigationAction(navigation, gesture);
        if (!unassign && (nativeNavigationConflict(root, gesture, eventCode) || gesture === keys.settings ||
            (duplicate && duplicate !== action))) {
            status(owner, `${gestureName(gesture)} is already in use. Choose another key.`);
            return;
        }
        const selected = { ...bindings[layout], [action]: unassign ? null : gesture };
        change(owner, { ...navigation, bindings: { ...bindings, [layout]: selected } }, action, 'navigation');
    }

    function showKeyboard(owner, selection = 'settings') {
        owner.group = 'keyboard';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Keyboard bindings';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        let focused = null;
        for (const action of ['settings', 'repeat']) {
            const item = button(owner, `${LABELS[action]}, ${keys[action] ?? 'unassigned'}`, () => {
                if (loading || saving) return;
                owner.capture = owner.selected = action;
                const available = action === 'settings' ? 'a letter or F8' : 'a letter';
                status(owner, `Press ${available} for ${LABELS[action].toLowerCase()}. Press Escape to cancel.`);
            });
            if (action === selection) focused = item;
        }
        button(owner, 'Unassign repeat dialogue', () => change(owner, { ...keys, repeat: null }, 'repeat'));
        button(owner, 'Reset keyboard defaults', () => change(owner, normalizeKeys(DEFAULT_KEYS), selection));
        button(owner, 'Back', () => showRoot(owner));
        focused.focus();
    }

    function showController(owner, selection = 'enabled') {
        owner.group = 'controller';
        owner.unbinding = false;
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Controller bindings';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const master = button(owner, `Controller support, ${pad.enabled ? 'on' : 'off'}`, () => toggleController(owner));
        let focused = master;
        for (const action of Object.keys(ACTION_NAMES)) {
            const reserved = action === 'recovery' ? pad.recovery.some(host.nativeButton) :
                (action === 'mode' || FIELD_ACTIONS.includes(action)) && host.nativeButton(pad[action]);
            const occupied = reserved ? ', used by the game' : '';
            const item = button(owner, `${ACTION_NAMES[action]}, ${buttonName(owner.family, pad[action])}${occupied}`, () => {
                if (loading || saving) return;
                owner.capture = { action };
                owner.selected = action;
                const gesture = action === 'recovery' ? 'Hold two buttons together, then release' : 'Press and release a button or stick direction';
                const cancel = buttonName(owner.family, [pad.confirm, pad.back]);
                const clear = canUnassign(action) ? ' Delete unassigns.' : '';
                status(owner, `${gesture}. To cancel, press Escape or hold ${cancel} together and release.${clear}`);
            });
            if (action === selection) focused = item;
        }
        button(owner, 'Unassign a controller binding', () => showControllerUnassign(owner));
        button(owner, 'Reset controller defaults', () => change(owner,
            { ...normalizeController(), enabled: pad.enabled }, selection, 'controller'));
        button(owner, 'Back', () => showRoot(owner, 'controller'));
        focused.focus();
    }

    function showControllerUnassign(owner) {
        owner.unbinding = true;
        owner.heading.textContent = 'Unassign a controller binding';
        owner.status.textContent = '';
        owner.contents.textContent = '';
        let first = null;
        for (const [action, name] of Object.entries(ACTION_NAMES)) {
            if (!canUnassign(action) || pad[action] === null) continue;
            const item = button(owner, `Unassign ${name.toLowerCase()}`, () =>
                change(owner, { ...pad, [action]: null }, action, 'controller'));
            if (!first) first = item;
        }
        const cancel = button(owner, 'Back', () => showController(owner));
        (first || cancel).focus();
    }

    function toggleController(owner, failure) {
        const accepted = change(owner, { ...pad, enabled: !pad.enabled }, 'enabled', 'controller', failure);
        return accepted ? (pad.enabled ? 'Controller support on' : 'Controller support off') : '';
    }

    function back(owner) {
        if (owner.capture) showGroup(owner, owner.selected);
        else if (owner.unbinding) showController(owner);
        else if (owner.group) showRoot(owner, owner.group);
        else close(owner.scene, true);
    }

    function captureController(owner, family, mask) {
        const action = owner.capture?.action;
        if (!action) return;
        const buttons = [];
        for (let index = 0; index < 24; index++) {
            if (mask & buttonBit(index)) buttons.push(index);
        }
        if (mask === (buttonBit(pad.confirm) | buttonBit(pad.back))) return back(owner);
        const value = action === 'recovery' ? buttons : buttons.length === 1 ? buttons[0] : null;
        if (!bindingAllowed(action, value, pad, host.nativeButton)) {
            status(owner, 'That controller binding is unavailable. Try another.');
            return;
        }
        owner.family = family;
        change(owner, { ...pad, [action]: value }, action, 'controller');
    }

    function close(scene, resume = false) {
        if (!session || session.scene !== scene) return;
        const retired = session;
        // Take the last native physical sample before handing back control.
        // Boundary-driven retirement bypasses this call and stays synchronous.
        if (resume) {
            try { host.capturePads(); } catch { /* Native input will continue. */ }
        }
        session = null;
        scene._wqaSettingsActive = false;
        try { retired.dialog.remove(); }
        finally { if (resume) host.resume(scene); }
    }

    function open(scene, family = '') {
        if (session) return false;
        const document = root.document;
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return false;
        const owner = { kind: 'settings', scene, family, dialog, heading: document.createElement('h1'),
            contents: document.createElement('div'), status: document.createElement('p') };
        owner.heading.id = 'wqa-settings-heading';
        dialog.setAttribute('aria-labelledby', owner.heading.id);
        owner.status.setAttribute('role', 'status');
        dialog.style.cssText = 'font: 18px system-ui; max-width: 92vw; max-height: 85vh; overflow: auto;';
        dialog.append(owner.heading, owner.contents, owner.status);
        dialog.addEventListener('cancel', event => event.preventDefault());
        for (const type of POINTER_EVENTS) dialog.addEventListener(type, event => event.stopPropagation());
        try {
            document.body.append(dialog);
            session = owner;
            scene._wqaSettingsActive = true;
            heldMouse = mouseDown;
            for (const touch of touching) heldTouches.add(touch);
            for (const pressed of down) held.add(pressed);
            host.capturePads();
            host.suspend(scene);
            dialog.showModal();
            showRoot(owner);
            return true;
        } catch {
            close(scene, true);
            dialog.remove();
            return false;
        }
    }

    function capture(key, event, owner) {
        const action = owner.capture;
        if (!key || (key === 'F8' && action !== 'settings')) return;
        const other = action === 'settings' ? 'repeat' : 'settings';
        if (nativeConflict(root, key, event.keyCode) || key === keys[other] ||
            (action === 'settings' && navigationAction(navigation, key))) {
            status(owner, `${key} is already in use. Choose another key.`);
            return;
        }
        change(owner, { ...keys, [action]: key }, action);
    }

    function keydown(event) {
        const physical = event.code || event.key;
        if (held.has(physical)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const owner = session;
        const ready = owner ? null : host.readyScene();
        if (physical && (owner || ready) && down.size < 64) down.add(physical);
        if (owner) {
            event.stopPropagation();
            const goBack = event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
            if (goBack || owner.capture) {
                const key = keyName(event);
                const gesture = navigationGesture(event);
                const unassign = event.key === 'Delete' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
                event.preventDefault();
                if (!event.repeat && physical && held.size < 64) held.add(physical);
                if (event.repeat) return;
                if (goBack) back(owner);
                else if (owner.group === 'keyboard') capture(key, event, owner);
                else if (owner.group === 'navigation') captureNavigation(owner, gesture, event.keyCode, unassign);
                else if (owner.group === 'controller' && unassign && canUnassign(owner.capture?.action)) {
                    const action = owner.capture.action;
                    change(owner, { ...pad, [action]: null }, action, 'controller');
                }
            } else if (physical && held.size < 64 && !event.repeat) {
                held.add(physical);
            }
            return;
        }
        if (event.repeat || event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
        const gesture = navigationGesture(event);
        const action = navigationAction(navigation, gesture);
        if (action && !nativeNavigationConflict(root, gesture, event.keyCode) && host.fieldCommand(action)) return;
        const key = keyName(event);
        if (!key || nativeConflict(root, key, event.keyCode)) return;
        if (key === keys.repeat && host.repeat()) return;
        const recover = key === 'F8' && (nativeConflict(root, keys.settings) ||
            (ready && host.fieldReady(ready) && navigationAction(navigation, keys.settings)));
        if (ready && (key === keys.settings || recover) && open(ready)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    root.addEventListener('keydown', keydown, true);
    // Native keyup may still need to retire a key pressed before the menu.
    root.addEventListener('keyup', event => {
        if (!down.size && !held.size) return;
        const physical = event.code || event.key;
        down.delete(physical);
        held.delete(physical);
    }, true);
    root.addEventListener('mousedown', event => {
        if (event.button !== 0 || (!session && !host.readyScene())) return;
        mouseDown = true;
        if (session) heldMouse = true;
    }, true);
    root.addEventListener('mouseup', event => {
        if (event.button !== 0) return;
        if (heldMouse && (!session || !session.dialog.contains(event.target))) event.stopPropagation();
        mouseDown = heldMouse = false;
    }, true);
    root.addEventListener('touchstart', event => {
        if (!session && !host.readyScene()) return;
        for (let index = 0; index < Math.min(event.changedTouches.length, 16); index++) {
            if (touching.size >= 16) break;
            const touch = event.changedTouches[index];
            touching.add(touch.identifier);
            if (session) heldTouches.add(touch.identifier);
        }
    }, true);
    for (const type of ['touchend', 'touchcancel']) root.addEventListener(type, event => {
        if (!touching.size && !heldTouches.size) return;
        let consumed = false;
        for (let index = 0; index < Math.min(event.changedTouches.length, 16); index++) {
            const touch = event.changedTouches[index];
            touching.delete(touch.identifier);
            consumed = heldTouches.delete(touch.identifier) || consumed;
        }
        if (consumed && (!session || !session.dialog.contains(event.target))) event.stopPropagation();
    }, true);
    for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => {
        down.clear();
        held.clear();
        touching.clear();
        heldTouches.clear();
        mouseDown = heldMouse = false;
        if (session) {
            resumeOnFocus = type === 'blur' ? session.scene : null;
            close(session.scene);
        }
    });
    root.addEventListener('focus', () => {
        const scene = resumeOnFocus;
        resumeOnFocus = null;
        if (scene) host.resume(scene);
    });
    return {
        open,
        controllerOwner: () => session,
        controllerBindings: () => pad,
        toggleController,
        controllerInput(owner, action, family, mask) {
            if (session !== owner) return;
            if (action === 'capture') return captureController(owner, family, mask);
            if (owner.capture) return;
            if (action === 'back') return back(owner);
            owner.family = family;
            const active = root.document.activeElement;
            if (action === 'confirm') {
                if (owner.contents.contains(active)) active.click();
                return;
            }
            const items = owner.contents.children;
            const index = Array.prototype.indexOf.call(items, active);
            const offset = action === 'previous' ? -1 : 1;
            const next = index === -1 ? 0 : (index + offset + items.length) % items.length;
            items[next]?.focus();
        },
        retire(scene) {
            if (resumeOnFocus === scene) resumeOnFocus = null;
            close(scene);
            down.clear();
            touching.clear();
            mouseDown = false;
        }
    };
}

module.exports = { createSettingsMenu };
