'use strict';

const LIMIT_TITLE_LABEL = 256;

function presented(host, scene, window) {
    return !scene._wqaSettingsActive && !host.graphics._wqaResize && host.manager._scene === scene && !host.manager._nextScene &&
        !host.manager._exiting && scene._started === true && scene._active === true &&
        scene._fadeDuration === 0 && host.graphics.app && host.graphics.app.stage === scene &&
        window && window.visible === true && window.active === true && window.openness === 255 &&
        scene.spr_ui_start && scene.spr_ui_start.alpha > 0 &&
        scene.spr_black_rect && scene.spr_black_rect.alpha <= 0;
}

function readFocused(window) {
    const index = window._index;
    const list = window._list;
    if (!Array.isArray(list) || !Number.isInteger(index) || index < 0 || index >= list.length) return null;
    const command = list[index];
    if (!command || typeof command.name !== 'string' || !command.name ||
        command.name.length > LIMIT_TITLE_LABEL) return null;
    return { index, name: command.name, enabled: command.enabled === true };
}

// Called after the game's own intro completion and the subsequent PIXI render.
// Bind only this presentation instance. The game can dispose of the window and
// later create another title without retaining an old method on its prototype.
function createTitleObserver(host, notifications) {
    let observedScene = null;
    let observedWindow = null;
    let generation = 0;
    let closing = false;
    let loadFailed = false;

    function close() {
        if (!generation) return;
        const retiring = generation;
        generation = 0;
        notifications.close(retiring);
    }

    function openIfPresented() {
        if (generation || !observedScene || closing || !host.hasFocus() ||
            !presented(host, observedScene, observedWindow)) return;
        const focused = readFocused(observedWindow);
        if (focused) {
            focused.loadFailed = loadFailed;
            generation = notifications.open(focused);
            if (generation) loadFailed = false;
        }
    }

    function leave() {
        close();
        observedScene = null;
        observedWindow = null;
    }

    function bind(window) {
        const select = window.select;
        const callHandler = window.callHandler;
        if (typeof select !== 'function' || typeof callHandler !== 'function' ||
            typeof window.isHandled !== 'function' || !Array.isArray(window._list)) return false;

        window.select = function (index) {
            const previous = this._index;
            const result = select.apply(this, arguments);
            if (generation && !closing && this === observedWindow && previous !== this._index &&
                presented(host, observedScene, this)) {
                const focused = readFocused(this);
                if (focused) notifications.focus(generation, focused);
            }
            return result;
        };

        window.callHandler = function (symbol) {
            if (this === observedWindow && (symbol === 'continue' || symbol === 'exit') &&
                this.isHandled(symbol)) {
                // The native handler can reserve a transition immediately.
                closing = true;
                leave();
            }
            return callHandler.apply(this, arguments);
        };
        return true;
    }

    if (host.window) {
        host.window.addEventListener('blur', close);
        host.window.addEventListener('focus', openIfPresented);
        host.window.addEventListener('pagehide', leave);
    }

    function observe(scene) {
        const window = scene && scene._commandWindow;
        if (!window || !presented(host, scene, window)) return false;
        if (observedScene !== scene || observedWindow !== window) {
            if (!bind(window)) return false;
            leave();
            observedScene = scene;
            observedWindow = window;
            closing = false;
            loadFailed = scene._wqaRetryFailed === true;
        }
        openIfPresented();
        return true;
    }
    return {
        observe,
        suspend: close,
        leave(scene) { if (observedScene === scene) leave(); }
    };
}

module.exports = { createTitleObserver, presented };
