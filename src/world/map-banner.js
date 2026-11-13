'use strict';

const LOCAL_NAMES = Object.freeze({ 116: "Elder Tater's house" });

function mapPlace(root) {
    const id = root.$gameMap?._mapId;
    const name = root.$dataMap?.displayName;
    return typeof name === 'string' && name.length <= 240 && name.trim() || LOCAL_NAMES[id] || '';
}

// The installed MapScene publishes a draw revision after its bitmap work.
// Keep this observation attached to that presentation until its native end.
function createMapBannerObserver(root, host, notifications, fieldReady) {
    let current = null;
    let lastMap = null;
    let lastId = null;

    function markPlace() {
        lastMap = root.$gameMap;
        lastId = lastMap?._mapId;
    }

    function entrance(scene) {
        if (scene._wqaEntryNamed || !fieldReady(scene, true) ||
            (root.$gameMap === lastMap && root.$gameMap?._mapId === lastId && !scene._transfer)) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        renderer.once('postrender', () => {
            if (scene._wqaEntryNamed || !fieldReady(scene, true)) return;
            const name = mapPlace(root);
            if (!name) return;
            if (current) leave(current.scene);
            markPlace();
            scene._wqaEntranceFallback = scene._wqaEntryNamed = true;
            const context = current = { scene, epoch: 0, fallback: true };
            scene._wqaMapAnnouncement = -1;
            scene._wqaPresentation = true;
            context.epoch = notifications.open({ kind: 'mapBanner', name, entering: true },
                () => current === context && fieldReady(scene, true));
            if (!context.epoch) leave(scene);
        });
    }

    function leave(scene) {
        if (current?.scene !== scene) return;
        const epoch = current.epoch;
        current = null;
        scene._wqaMapAnnouncement = 0;
        if (epoch) notifications.close(epoch);
    }

    function ready(context) {
        const { scene, window, revision } = context;
        return current === context && host.hasFocus() && scene === host.manager._scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.graphics._wqaResize &&
            host.graphics.app?.stage === scene && scene._active && scene._mapNameWindow === window &&
            window._wqaBannerDrawnRevision === revision && window.parent && window.parent === scene._windowLayer &&
            window.worldVisible && window.worldAlpha > 0 && window.contentsOpacity > 0;
    }

    function observe(scene, revision) {
        const window = scene._mapNameWindow;
        const renderer = host.graphics.app?.renderer;
        if (!window || typeof renderer?.once !== 'function') return;
        if (scene._wqaEntranceFallback) {
            window._wqaBannerRead = revision;
            return;
        }
        if (current?.scene === scene) return;
        if (current) leave(current.scene);
        const context = { scene, window, revision, epoch: 0 };
        current = context;
        scene._wqaMapAnnouncement = revision;
        scene._wqaPresentation = true;
        try {
            renderer.once('postrender', () => {
                if (current !== context) return;
                try {
                    if (!ready(context)) return leave(scene);
                    const name = window._wqaBannerText;
                    window._wqaBannerRead = revision;
                    if (typeof name === 'string' && name.length > 0 && name.length <= 256) {
                        markPlace();
                        scene._wqaEntryNamed = true;
                        context.epoch = notifications.open({ kind: 'mapBanner', name, entering: true }, () => ready(context));
                    }
                    if (!context.epoch) leave(scene);
                } catch { leave(scene); }
            });
        } catch { leave(scene); }
    }

    if (host.window) {
        for (const event of ['blur', 'pagehide']) {
            host.window.addEventListener(event, () => { if (current) leave(current.scene); });
        }
    }
    return { observe, entrance, leave,
        append(scene, record) {
            if (current?.scene !== scene || !current.epoch ||
                !(current.fallback ? fieldReady(scene, true) : ready(current))) return false;
            return notifications.focus(current.epoch, { ...record, append: true });
        }
    };
}

module.exports = { createMapBannerObserver, mapPlace };
