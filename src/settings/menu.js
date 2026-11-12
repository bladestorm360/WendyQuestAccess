'use strict';

const { DEFAULT_KEYS, keyName, nativeConflict, normalizeKeys } = require('./keyboard');
const { openSettings } = require('./storage');

const LABELS = Object.freeze({ settings: 'Open mod settings', repeat: 'Repeat dialogue' });
const POINTER_EVENTS = ['mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];

function createSettingsMenu(root, host) {
    let session = null;
    let keys = normalizeKeys(DEFAULT_KEYS);
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
        keys = normalizeKeys(await database.read());
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

    function showRoot(owner) {
        owner.group = false;
        owner.capture = null;
        owner.heading.textContent = 'WendyQuest accessibility settings';
        owner.status.textContent = '';
        owner.contents.textContent = '';
        const controls = button(owner, 'Keyboard bindings', () => showGroup(owner));
        button(owner, 'Close settings', () => close(owner.scene, true));
        controls.focus();
    }

    function status(owner, message) {
        if (session === owner) owner.status.textContent = message;
    }

    function change(owner, next, selection) {
        if (loading || saving) return;
        const previous = keys;
        keys = next;
        if (!storage) {
            showGroup(owner, selection);
            status(owner, 'Changed for this session. Settings storage is unavailable.');
            return;
        }
        saving = true;
        showGroup(owner, selection);
        status(owner, 'Saving keyboard bindings');
        storage.save(next).then(() => {
            saving = false;
            if (session?.group) showGroup(session, session.selected);
            status(owner, 'Keyboard bindings saved');
        }, () => {
            saving = false;
            keys = previous;
            if (session?.group) showGroup(session, session.selected);
            status(owner, 'Could not save keyboard bindings. Previous bindings restored.');
        });
    }

    function showGroup(owner, selection = 'settings') {
        owner.group = true;
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

    function open(scene) {
        const document = root.document;
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return false;
        const owner = { scene, dialog, heading: document.createElement('h1'),
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
        if (nativeConflict(root, key, event.keyCode) || key === keys[other]) {
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
            const back = event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
            if (back || owner.capture) {
                const key = keyName(event);
                event.preventDefault();
                if (!event.repeat && physical && held.size < 64) held.add(physical);
                if (event.repeat) return;
                if (back) {
                    if (owner.capture) showGroup(owner, owner.selected);
                    else if (owner.group) showRoot(owner);
                    else close(owner.scene, true);
                } else capture(key, event, owner);
            } else if (physical && held.size < 64 && !event.repeat) {
                held.add(physical);
            }
            return;
        }
        const key = keyName(event);
        if (!key || event.repeat || event.target?.closest?.('input, textarea, select, [contenteditable]') ||
            nativeConflict(root, key, event.keyCode)) return;
        if (key === keys.repeat) {
            host.repeat();
        } else if (key === keys.settings || (key === 'F8' && nativeConflict(root, keys.settings))) {
            if (ready && open(ready)) {
                event.preventDefault();
                event.stopPropagation();
                for (const pressed of down) held.add(pressed);
            }
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
