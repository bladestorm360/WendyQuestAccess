'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

const SPLASH_TEXT = Object.freeze({ 1: "Wendy's Studios presents", 2: 'Developed by 81monkeys' });

function splashReady(host, scene, phase) {
    if (!SPLASH_TEXT[phase] || scene !== host.manager._scene || host.manager._nextScene || host.manager._exiting ||
        host.graphics._wqaResize || host.graphics.app?.stage !== scene || !host.hasFocus() || !scene._started ||
        !scene._active || scene._fadeDuration !== 0 || scene._fadeOpacity !== 0 || scene._waitCount <= 0)
        return false;
    const studio = scene._81monkeys;
    if (phase === 1) return !(studio?.alpha > 0) && renderedSprite(scene._backSprite, scene);
    // The final atlas frame is the first with the full developer caption.
    return renderedSprite(studio, scene) && studio._frame?.y === 1550 && studio._frame?.x === 710;
}

function createSplashObserver(host, notifications) {
    let current = null;

    function leave(scene) {
        if (current?.scene !== scene) return;
        notifications.close(current.token);
        current = null;
    }

    function observe(scene, phase) {
        if (scene._wqaSplashSeen === phase || !splashReady(host, scene, phase)) return;
        if (current) leave(current.scene);
        scene._wqaSplashSeen = phase;
        const token = notifications.open({ kind: 'splashCard', name: SPLASH_TEXT[phase] },
            () => splashReady(host, scene, phase));
        if (token) current = { scene, token };
    }

    return { observe, leave };
}

module.exports = { createSplashObserver, splashReady };
