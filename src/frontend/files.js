'use strict';

const { optionFocus, observeOptionActions } = require('./options');

// These tags are published by the checked native callbacks after the game
// finishes its own draw or stage work. Each observer binds one live instance.
const SLOTS = 1;
const DETAILS = 2;
const DELETE = 3;
const OPTIONS = 4;
const RETRY = 5;
const controls = [
    ['optionsSprite', 'options'],
    ['monkeysButton', 'moreGames'],
    ['couponSprite', 'coupons']
];

function fileWindow(scene) {
    if (scene._wqaFileKind === RETRY) return scene._commandWindow;
    if (scene._wqaFileKind === DELETE || scene._wqaFileKind === OPTIONS) return scene._optionsWindow;
    return scene._listWindow;
}

function isReady(host, scene, window) {
    if (!scene || !window || scene._wqaSettingsActive || host.graphics._wqaResize ||
        fileWindow(scene) !== window || host.manager._scene !== scene ||
        host.manager._nextScene || host.manager._exiting || host.manager._wqaNativeAutosaves ||
        !scene._started || !scene._active || host.graphics.app?.stage !== scene ||
        !window.visible || !window.active || window.openness !== 255) return false;
    // After the native cards are drawn, admit their first visible render.
    const clear = scene._fadeDuration === 0 && scene._fadeOpacity === 0;
    const cardsAppearing = scene._wqaFileKind === SLOTS && scene._fadeSign === 1 &&
        scene._fadeDuration > 0 && scene._fadeOpacity < 255;
    if (!clear && !cardsAppearing) return false;
    if (scene._wqaFileKind === SLOTS) return window._wqaCards === true;
    if (scene._wqaFileKind === DETAILS) return scene._wqaDetailArt === true &&
        scene._wqaDetailText === true && !scene._destroySave;
    if (scene._wqaFileKind === OPTIONS) return window._wqaOptionsPainted === true;
    if (scene._wqaFileKind === RETRY) return window._index >= 0 && window._index < 3 &&
        !!(window._wqaRetryRows & (1 << window._index));
    return scene._wqaFileKind === DELETE && (scene._deleteCount === 0 || !!scene._wqaDeleteStatus);
}

function shortText(text, max) {
    return typeof text === 'string' && text.length <= max ? text : '';
}

function portraits(host, info, detailed) {
    const names = [];
    if (detailed) {
        const faces = Array.isArray(info.faces) ? info.faces : [];
        // File detail draws the atlas in its fixed order, using the saved
        // face asset name to decide whether a portrait is visible.
        for (const id of [1, 3, 4, 5, 2]) {
            const actor = host.actor(id);
            if (!actor?.faceName) continue;
            for (let index = 0; index < Math.min(faces.length, 5); index++) {
                if (faces[index]?.[0] === actor.faceName) {
                    const name = shortText(actor.name, 48);
                    if (name) names.push(name);
                    break;
                }
            }
        }
    } else {
        // The card atlas mapper treats the saved character index as the
        // party member id, and defaults unknown indices to the lead icon.
        const characters = Array.isArray(info.characters) ? info.characters : [];
        for (let index = 0; index < Math.min(characters.length, 5); index++) {
            const id = characters[index]?.[1];
            const actor = host.actor(Number.isInteger(id) && id >= 1 && id <= 5 ? id : 1);
            const name = shortText(actor?.name, 48);
            if (name) names.push(name);
        }
    }
    return names;
}

function metadata(host, info, detailed = false) {
    const level = Number.isInteger(info.level) && info.level > 0 ? info.level : 0;
    const playtime = shortText(info.playtime, 32);
    // Native drawing replaces the first four icons with one combined icon
    // when the final bitmap cell is selected. Report only that visible form.
    const stones = Array.isArray(info.stones) ? info.stones : [];
    const combined = !!stones[4];
    let count = 0;
    for (let index = 0; index < 4; index++) if (stones[index]) count++;
    const data = { level, playtime, stones: combined ? 0 : count, combined, party: portraits(host, info, detailed) };
    if (detailed) {
        // The build's TrackedStats map is pinned in registration.py. The
        // details draw uses these same two fields after its save read.
        data.critHits = host.variable(43);
        data.critStreak = host.variable(44);
    }
    return data;
}

function readFocus(host, scene, window, summary) {
    const index = window._index;
    if (scene._wqaFileKind === SLOTS) {
        if (index === -1) {
            for (const [field, label] of controls) {
                const sprite = scene[field];
                if (sprite?._selected && sprite.worldVisible && sprite.alpha > 0) {
                    return { kind: 'fileControl', label, key: label };
                }
            }
            return null;
        }
        if (!Number.isInteger(index) || index < 0 || index > 2) return null;
        const info = host.saveInfo(index);
        return { kind: 'saveSlot', slot: index + 1, key: index, empty: !info,
            ...(info ? metadata(host, info) : {}) };
    }
    if (scene._wqaFileKind === DETAILS) {
        const name = shortText(window.options?.[index], 128);
        if (!name) return null;
        const info = summary && scene._info ? metadata(host, scene._info, true) : {};
        return { kind: 'saveAction', name, key: index, slot: scene._saveIndex + 1, summary, ...info };
    }
    if (scene._wqaFileKind === OPTIONS) return optionFocus(scene, window);
    if (scene._wqaFileKind === RETRY) {
        const command = window._list?.[index];
        const name = shortText(command?.name, 128);
        return name ? { kind: 'retryOption', name, key: index, summary,
            tryAgain: command.symbol === 'continue' } : null;
    }
    // Native initialization can leave the cursor past the two command rows.
    // Describe the visible prompt until the player moves to a real row.
    if (summary && scene._deleteCount > 0 && scene._wqaDeleteStatus) {
        return { kind: 'fileLabel', name: shortText(scene._wqaDeleteStatus, 128), key: 'deleteStatus' };
    }
    const command = window._list?.[index];
    const name = shortText(command?.name, 128);
    if (name) return { kind: 'fileLabel', name, key: index };
    return { kind: 'deletePrompt', name: shortText(window._list?.[0]?.name, 128), key: -1 };
}

function createFilesObserver(host, notifications) {
    let current = null;
    const boundWindows = new WeakMap();

    function close(context) {
        if (!context.epoch) return;
        notifications.close(context.epoch);
        context.epoch = 0;
        context.key = null;
    }

    function leave(scene) {
        if (!current || current.scene !== scene) return;
        close(current);
        current = null;
    }

    function ready(context) {
        return current === context && host.hasFocus() && isReady(host, context.scene, context.window);
    }

    function publish(context) {
        if (!ready(context)) return;
        const focus = readFocus(host, context.scene, context.window, !context.epoch);
        if (!focus) return;
        // Collapse notifications for the same native focus event. A native
        // setting acceptance remains distinct even if its spoken text matches.
        if (focus.key === context.key && !context.settingChanged) return;
        if (focus.kind === 'optionValue' && focus.key !== context.key) focus.tab = context.window.currentTab;
        context.key = focus.key;
        context.settingChanged = false;
        if (context.failure) {
            focus.loadFailed = true;
            context.failure = false;
        }
        if (context.epoch) notifications.focus(context.epoch, focus);
        else context.epoch = notifications.open(focus, () => ready(context));
    }

    function afterRender(context) {
        if (context.pending || !ready(context)) return;
        context.pending = true;
        try {
            host.graphics.app.renderer.once('postrender', () => {
                context.pending = false;
                try { publish(context); }
                catch { leave(context.scene); }
            });
        } catch {
            context.pending = false;
            leave(context.scene);
        }
    }

    function bind(context) {
        const { scene, window } = context;
        const select = window.select;
        const callHandler = window.callHandler;
        if (typeof select !== 'function' || typeof callHandler !== 'function' ||
            typeof window.isHandled !== 'function') return false;
        window.select = function () {
            const index = this._index;
            const result = select.apply(this, arguments);
            if (index !== this._index || scene._wqaFileKind === OPTIONS) afterRender(context);
            return result;
        };
        window.callHandler = function (symbol) {
            const retry = scene._wqaFileKind === RETRY &&
                (symbol === 'continue' || symbol === 'dave' || symbol === 'title');
            if (current === context && this === window &&
                (symbol === 'ok' || symbol === 'cancel' || symbol === 'delete' || retry) && this.isHandled(symbol)) {
                // Close before the accepted action can touch a file or build
                // another scene. A command with no handler is still native.
                leave(scene);
            }
            return callHandler.apply(this, arguments);
        };
        if (scene._wqaFileKind === SLOTS) {
            for (const name of ['cursorUp', 'cursorDown', 'cursorLeft', 'cursorRight']) {
                const cursor = window[name];
                if (typeof cursor !== 'function') continue;
                window[name] = function () {
                    const result = cursor.apply(this, arguments);
                    // The cursor routine may set index -1 before selecting a
                    // sibling sprite, so observe after the full routine.
                    afterRender(context);
                    return result;
                };
            }
        } else if (scene._wqaFileKind === OPTIONS) {
            observeOptionActions(window, settingChanged => {
                if (settingChanged) context.settingChanged = true;
                afterRender(context);
            }, () => {
                if (current === context) close(context);
            }, () => leave(scene));
        }
        return true;
    }

    if (host.window) {
        host.window.addEventListener('blur', () => { if (current) close(current); });
        host.window.addEventListener('focus', () => { if (current) afterRender(current); });
        host.window.addEventListener('pagehide', () => { if (current) leave(current.scene); });
    }

    return {
        leave,
        announce(scene, record) {
            const context = current;
            if (!context || context.scene !== scene || !ready(context)) return;
            if (context.epoch) notifications.focus(context.epoch, record);
            else context.epoch = notifications.open(record, () => ready(context));
        },
        suspend() { if (current) close(current); },
        observe(scene) {
            const window = scene && fileWindow(scene);
            if (!isReady(host, scene, window)) return false;
            if (current?.scene !== scene || current?.window !== window) {
                if (current) leave(current.scene);
                let context = boundWindows.get(window);
                if (!context) {
                    context = { scene, window, epoch: 0, key: null, pending: false,
                        failure: scene._wqaReadFailed === true };
                    if (!bind(context)) return false;
                    boundWindows.set(window, context);
                } else if (context.scene !== scene) {
                    return false;
                }
                current = context;
            }
            publish(current);
            return true;
        }
    };
}

module.exports = { createFilesObserver, fileWindow, isReady };
