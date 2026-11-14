'use strict';

const { battleScenePresented } = require('./presentation');
const { renderedSprite } = require('../runtime/rendered-sprite');

const PAINT_WINDOW = 48;

function createSkillEffects(root, host, notifications) {
    let current = null;

    function leave(scene) {
        if (!current || scene && current.scene !== scene) return;
        const effect = current;
        current = null;
        if (effect.epoch) notifications.close(effect.epoch);
        else effect.renderer.off?.('postrender', effect.inspect);
    }

    function clapback(actor, sprite) {
        const scene = host.manager._scene;
        const renderer = host.graphics.app?.renderer;
        const field = scene?._spriteset?._battleField;
        if (!battleScenePresented(root, host, scene) || actor !== scene._spriteset?._actorSprites?.[0] ||
            actor?._actor?._actorId !== 1 || actor.parent !== field || sprite?.parent !== actor ||
            typeof renderer?.once !== 'function') return;
        if (current?.sprite === sprite) return;
        leave();
        const hint = current = { scene, sprite, renderer, epoch: 0, frames: 0 };
        const stillCurrent = () => current === hint && battleScenePresented(root, host, scene) &&
            scene._spriteset?._battleField === field && actor.parent === field;
        hint.inspect = () => {
            if (!stillCurrent() || sprite.parent !== actor || ++hint.frames > PAINT_WINDOW) return leave(scene);
            const position = sprite.worldTransform;
            if (sprite.animator?._animationData?.fileName === 'ParticleEffects/Clapback' &&
                sprite.bitmap?.isReady?.() && renderedSprite(sprite, actor) &&
                position?.tx >= 0 && position.tx < host.graphics.width &&
                position.ty >= 0 && position.ty < host.graphics.height) {
                hint.epoch = notifications.open({ kind: 'battleLog', lines: ['Wendy prepares to counterattack.'] }, stillCurrent);
            } else renderer.once('postrender', hint.inspect);
        };
        renderer.once('postrender', hint.inspect);
        scene._wqaPresentation = true;
    }

    return { clapback, leave };
}

module.exports = { createSkillEffects };
