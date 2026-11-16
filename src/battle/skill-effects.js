'use strict';

const { battleScenePresented } = require('./presentation');
const { renderedSprite } = require('../runtime/rendered-sprite');

const PAINT_WINDOW = 48;
const BEEF_PAINT_WINDOW = 300;
const BEEF_WORDS = ["Here's.", "The.", "Beef!!!"];

// The three words are painted into successive cells of the 5-column overlay.
function beefWord(frame) {
    if (!frame || frame.width !== 352 || frame.height !== 96) return -1;
    const column = frame.x / 352;
    const row = frame.y / 96;
    if (!Number.isInteger(column) || column < 0 || column > 4 ||
        !Number.isInteger(row) || row < 0 || row > 4) return -1;
    const cell = row * 5 + column;
    if (cell < 7) return 0;
    if (cell < 14) return 1;
    return cell === 14 ? -1 : 2;
}

function createSkillEffects(root, host, notifications) {
    let current = null;

    function leave(scene) {
        if (!current || scene && current.scene !== scene) return;
        const effect = current;
        current = null;
        effect.renderer.off?.('postrender', effect.inspect);
        if (effect.epoch) notifications.close(effect.epoch);
    }

    function onScreen(sprite) {
        const position = sprite.worldTransform;
        return position?.tx >= 0 && position.tx < host.graphics.width &&
            position.ty >= 0 && position.ty < host.graphics.height;
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
            if (sprite.animator?._animationData?.fileName === 'ParticleEffects/Clapback' &&
                sprite.bitmap?.isReady?.() && renderedSprite(sprite, actor) && onScreen(sprite)) {
                hint.epoch = notifications.open({ kind: 'battleLog', lines: ['Wendy prepares to counterattack.'] }, stillCurrent);
            } else renderer.once('postrender', hint.inspect);
        };
        renderer.once('postrender', hint.inspect);
        scene._wqaPresentation = true;
    }

    function beefOverlay(actor, sprite) {
        const scene = host.manager._scene;
        const renderer = host.graphics.app?.renderer;
        const field = scene?._spriteset?._battleField;
        if (!battleScenePresented(root, host, scene) || actor !== scene._spriteset?._actorSprites?.[0] ||
            actor?._actor?._actorId !== 1 || actor.parent !== field || sprite?.parent !== scene ||
            typeof renderer?.once !== 'function' || current?.sprite === sprite) return;
        leave();
        const effect = current = { scene, sprite, renderer, epoch: 0, frames: 0, word: -1 };
        const stillCurrent = () => current === effect && battleScenePresented(root, host, scene) &&
            scene._spriteset?._battleField === field && actor.parent === field;
        effect.inspect = () => {
            try {
                if (!stillCurrent()) return leave(scene);
                if (sprite.parent !== scene || ++effect.frames > BEEF_PAINT_WINDOW) {
                    if (!effect.epoch) leave(scene);
                    return;
                }
                const animator = sprite.animator;
                if (animator?._animationData?.fileName === 'ParticleEffects/WendyWhereIsBeef_Overlay' &&
                    animator._sprite === sprite && animator.bitmap === sprite.bitmap && sprite.bitmap?.isReady?.() &&
                    renderedSprite(sprite, scene) && onScreen(sprite)) {
                    const word = beefWord(sprite._frame);
                    if (word > effect.word) {
                        effect.word = word;
                        const record = { kind: 'battleLog', lines: [BEEF_WORDS[word]] };
                        if (effect.epoch) notifications.focus(effect.epoch, { ...record, append: true });
                        else effect.epoch = notifications.open(record, stillCurrent);
                    }
                }
                if (effect.word < BEEF_WORDS.length - 1) renderer.once('postrender', effect.inspect);
            } catch { leave(scene); }
        };
        renderer.once('postrender', effect.inspect);
        scene._wqaPresentation = true;
    }

    return { clapback, beefOverlay, leave };
}

module.exports = { createSkillEffects };
