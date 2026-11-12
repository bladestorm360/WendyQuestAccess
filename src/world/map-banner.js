'use strict';

// The installed MapScene publishes a draw revision after its bitmap work.
// Keep this observation attached to that presentation until its native end.
function createMapBannerObserver(host, notifications) {
    let current = null;

    function leave(scene) {
        if (current?.scene !== scene) return;
        const epoch = current.epoch;
        current = null;
        scene._wqaMapAnnouncement = 0;
        scene._wqaPresentation = false;
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
        if (!window || typeof renderer?.once !== 'function' || current?.scene === scene) return;
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
                        context.epoch = notifications.open({ kind: 'mapBanner', name }, () => ready(context));
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
    return { observe, leave };
}

module.exports = { createMapBannerObserver };
