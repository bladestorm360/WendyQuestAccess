'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

function createInteractionPrompt(root, host, ready, notifications, appendToField) {
    let current = null;

    function leave(scene) {
        if (current?.scene !== scene) return;
        if (current.cancel) current.cancel();
        scene._wqaInteractionActive = false;
        current = null;
    }

    function presented(scene, icon) {
        return ready(scene) && root.$gamePlayer._interactIcon === icon && root.$gamePlayer._iconState === 1 &&
            icon.parent === scene && icon.visible && icon.worldVisible && icon.worldAlpha > 0 &&
            icon.scale.x > 0 && icon.scale.y > 0 && renderedSprite(icon.children[0], icon) &&
            icon.x >= -32 && icon.x <= host.graphics.width + 32 && icon.y >= -32 && icon.y <= host.graphics.height + 32;
    }

    function update(scene, icon) {
        if (current?.scene === scene && (current.icon !== icon || !ready(scene))) leave(scene);
        if (!icon || current?.icon === icon || scene._wqaInteractionSeen === icon || !ready(scene)) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        const context = { scene, icon, cancel: null };
        current = context;
        scene._wqaInteractionActive = icon;
        scene._wqaPresentation = true;
        renderer.once('postrender', () => {
            if (current !== context) return;
            if (!presented(scene, icon)) return leave(scene);
            // Identity is the native pop presentation. Turning away and back
            // can show a new icon with the same spoken instruction.
            scene._wqaInteractionSeen = icon;
            const record = { kind: 'interactionPrompt' };
            context.cancel = appendToField(scene, record);
            if (!context.cancel) {
                const token = notifications.open(record, () => presented(scene, icon));
                context.cancel = () => notifications.close(token);
            }
        });
    }

    return { update, leave };
}

module.exports = { createInteractionPrompt };
