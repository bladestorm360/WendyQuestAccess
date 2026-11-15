'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

function playerBalloon(id) {
    return (scene, _map, player) => {
        const spriteset = scene._spriteset;
        const balloons = spriteset?._balloonSprites;
        return Array.isArray(balloons) && balloons.length <= 32 && balloons.some(balloon =>
            balloon.targetObject === player && balloon._balloonId === id && balloon._duration > 0 &&
            renderedSprite(balloon, spriteset._effectsContainer));
    };
}

function overlay(scene) {
    return scene.rtSprite?.alpha > 0 && renderedSprite(scene.rtSprite, scene);
}

function filterVisible(name, index, minimum) {
    return (scene, map) => overlay(scene) &&
        map.getFilterController?.(name)?.currentParams?.[index] > minimum;
}

const sleeping = playerBalloon(10);
// Native idle seconds bound transient checks. Later effects follow their
// rendered state because Wendy can collect the stones in any order or time.
const idleBeats = [
    ['idle-question', 30, 33, playerBalloon(2)],
    ['idle-hud-slides', 40, 52, scene => scene._statusWindow?.offsetY < 0],
    ['idle-dozes', 80, 83, sleeping],
    ['idle-dozes', 134, 137, sleeping],
    ['idle-map-dark', 135, 150, scene => overlay(scene) && scene.bgSprite?.alpha > 0.12],
    ['idle-wendy-glides', 155, 175, scene => overlay(scene) && !!scene.inactiveDirX],
    ['idle-stones-appear', 175, Infinity, scene => overlay(scene) &&
        !scene.stoneSpin && !scene.solitaire && scene.stoneSprites?.[0]?.alpha > 0.12],
    ['idle-stone-pickup', 177, Infinity, scene => overlay(scene) &&
        !scene.stoneSpin && !scene.solitaire && !!scene.collectedStones?.some((collected, index) => index < 4 && collected)],
    ['idle-stones-spin', 177, Infinity, scene => overlay(scene) && !!scene.stoneSpin],
    ['idle-trails', 177, Infinity, scene => overlay(scene) && scene.trailAlpha > 0.35],
    ['idle-stones-bounce', 177, Infinity, scene => overlay(scene) && !!scene.solitaire],
    ['idle-crt', 290, Infinity, filterVisible('crtFilter', 2, 0.1)],
    ['idle-ripple', 340, Infinity, filterVisible('displaceFilter', 2, 1)],
    ['idle-color-split', 400, Infinity, filterVisible('rgbFilter', 0, 0.25)],
    ['idle-screen-shifts', 177, Infinity, scene => overlay(scene) && scene.solitaire &&
        Math.max(Math.abs(scene.rtZoomX || 0), Math.abs(scene.rtZoomY || 0),
            Math.abs(scene.rtSkewX || 0), Math.abs(scene.rtSkewY || 0)) >= 0.005]
].map(([id, start, end, visible]) => ({ id, start, end, visible }));

module.exports = { idleBeats };
