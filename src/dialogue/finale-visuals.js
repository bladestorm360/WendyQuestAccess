'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

// Only named finale assets are eligible. A story switch arms an observation;
// the actual attached picture/animation, never the switch alone, confirms it.
function picture(root, host, scene, id, name) {
    const data = root.$gameScreen?._pictures?.[id];
    if (!data || data._name !== name || !(data._opacity > 20)) return null;
    let count = 0;
    for (const key of ['_pictureContainer_upper', '_pictureContainer_mid', '_pictureContainer_lower']) {
        const parent = scene._spriteset?.[key], children = parent?.children;
        if (!Array.isArray(children)) continue;
        if ((count += children.length) > 128) return null;
        for (const sprite of children) {
            const pos = sprite.worldTransform;
            if (sprite._pictureId === id && sprite._pictureName === name && renderedSprite(sprite, parent) &&
                pos?.tx >= 0 && pos.tx <= host.graphics.width && pos.ty >= 0 && pos.ty <= host.graphics.height)
                return { data, sprite };
        }
    }
    return null;
}

function machine(root, scene) {
    const data = root.$gameMap?._events?.[18]?.animationData;
    return data?.animationPath === 'img/objects/BIGMECHWORLD.json' &&
        data.frameAnimator?._sprite === data.sprite && renderedSprite(data.sprite, scene._spriteset?._tilemap) ? data : null;
}

const STONES = {
    'stone-frygor': [21, 'Fries'], 'stone-frostyna': [22, 'Frosty'],
    'stone-sir-chicken': [20, 'Nugget'], 'stone-baconator': [23, 'Bacon']
};

function captureFinale(root, scene, id) {
    if (!['companions-take-stones', 'prologue-march'].includes(id)) return null;
    const sprites = scene._spriteset?._characterSprites;
    if (!Array.isArray(sprites) || sprites.length > 512) return [];
    return (id === 'prologue-march' ? [7, 8, 9] : [5, 6, 7, 8]).map(id => {
        const actor = root.$gameMap._events[id];
        return { actor, sprite: sprites.find(sprite => sprite._character === actor), x: actor?._realX, y: actor?._realY };
    });
}

function finaleVisible(root, host, scene, state) {
    const { id } = state;
    if (id === 'elder-tater-shout') return renderedSprite(state.sprite, scene._spriteset._tilemap) &&
        (scene._spriteset.x !== state.screenX || scene._spriteset.y !== state.screenY);
    if (id === 'wendy-arrival-ripple') {
        const params = root.$gameMap.getFilterController?.('ref')?.currentParams;
        return params?.[1] > 0 && params[2] > 0 &&
            [1, 2].every(slot => (root.$gameScreen._pictures?.[slot]?._opacity || 0) < 200) &&
            state.actor._characterName === 'WendyWorld' && state.actor._characterIndex === 3 &&
            !state.actor._transparent && renderedSprite(state.sprite, scene._spriteset._tilemap);
    }
    if (id === 'prologue-islands' || id === 'prologue-ruins') return scene._spriteset._tilemap.worldVisible === true &&
        (root.$gameMap._displayY !== state.mapY || root.$gameMap._displayX !== state.mapX);
    if (id === 'prologue-emblem') return !!picture(root, host, scene, 4, 'pictures/MECHBORGLOGO');
    if (id === 'prologue-march') return state.finale?.length === 3 && state.finale.every(item =>
        item.actor && renderedSprite(item.sprite, scene._spriteset._tilemap) &&
        (item.actor._realX !== item.x || item.actor._realY !== item.y));
    if (id === 'wendy-wakes' || id === 'wendy-looks-around') return !state.actor._transparent &&
        renderedSprite(state.sprite, scene._spriteset._tilemap) &&
        (id === 'wendy-wakes' ? root.$gameSwitches.value(22) : state.actor._direction !== state.direction);
    if (id === 'tyler-arrives' || id === 'tyler-departs') {
        const pos = state.sprite.worldTransform;
        const script = root.$gameMap?._interpreter;
        const list = root.$dataMap?.events?.[15]?.pages?.[2]?.list;
        const spawn = root.$dataMap?.events?.[7];
        // The exact first-shop route may finish before native readiness. Its
        // following30-frame wait still displays the freshly landed arrival.
        // Prove that native route's identity, actual destination and painted
        // Tyler; ordinary standing/dialogue or a remote actor cannot qualify.
        const balloons = scene._spriteset?._balloonSprites;
        const recentMusic = state.sourceKey === '181/15/2/0' && Array.isArray(balloons) && balloons.length <= 32 &&
            balloons.some(balloon => balloon.targetObject === state.actor && balloon._balloonId === 3 &&
                renderedSprite(balloon, scene._spriteset._effectsContainer));
        const landed = state.sourceKey === '181/15/2/0' && root.$gameMap._mapId === 181 &&
            state.actor === root.$gameMap._events[7] && script?._eventId === 15 && script._list === list &&
            (script._index === 8 && script._waitCount > 0 || script._index >= 8 && script._index <= 14 && recentMusic) &&
            list?.[0]?.code === 205 &&
            list[0].parameters[0] === 7 && list[0].parameters[1]?.list?.[3]?.code === 14 &&
            list[0].parameters[1].list[3].parameters.join(',') === '-4,0' &&
            state.actor._x === spawn.x - 4 && state.actor._y === spawn.y;
        return !state.actor._transparent && (state.actor._jumpCount > 0 || landed) &&
            renderedSprite(state.sprite, scene._spriteset._tilemap) &&
            pos?.tx >= 0 && pos.tx <= host.graphics.width && pos.ty >= 0 && pos.ty <= host.graphics.height;
    }
    if (STONES[id]) {
        const [slot, type] = STONES[id], image = picture(root, host, scene, slot, 'img/UI/CORNER STONE - ' + type + '.json');
        return !!(image?.data._animated && image.sprite._frameAnimator &&
            renderedSprite(state.sprite, scene._spriteset._tilemap) &&
            image.sprite.worldTransform.ty < state.sprite.worldTransform.ty);
    }
    const object = machine(root, scene);
    if (id === 'big-mech-reveal') {
        const curtain = picture(root, host, scene, 8, 'pictures/Curtain');
        return !!(object && curtain && curtain.data._duration > 0 && curtain.data._y < 16);
    }
    if (id === 'double-mech-transform') {
        const frame = object?.sprite?._frame;
        return !!(object && object.currentAnimation === 'transform' &&
            (frame?.y > 176 || frame?.y === 176 && frame.x >= 320));
    }
    if (id === 'double-mech-crumble') return object?.currentAnimation === 'destruction';
    if (id === 'companions-take-stones') return state.finale?.length === 4 && state.finale.every(item =>
        item.actor && !item.actor._transparent && item.actor._characterName &&
        renderedSprite(item.sprite, scene._spriteset._tilemap) &&
        (item.actor._realX !== item.x || item.actor._realY !== item.y));
    if (id === 'chomps-arms') return state.actor._characterName === 'CHOMPS' && state.actor._characterIndex === 4 &&
        state.sprite._characterName === 'CHOMPS' && state.actor._direction === 2 && state.actor._pattern === 0 &&
        renderedSprite(state.sprite, scene._spriteset._tilemap);
    if (id === 'chomps-flash') return !!picture(root, host, scene, 29, 'white');
    if (id === 'wendy-departure-light') return !!picture(root, host, scene, 22, 'ParticleEffects/GOD-RAYS-FOR-WENDY-ASCENSION');
    if (id === 'wendy-ascends') {
        const image = picture(root, host, scene, 23, 'objects/Wendy');
        return !!(image && image.data._duration > 0 && image.data._y < -16);
    }
    if (id === 'epilogue-glitch') return !!(root.$gameMap.getFilterController?.('rgb') &&
        picture(root, host, scene, 3, 'Credits/017 HOT SLUDGE SUNDAE f18484'));
    return false;
}

module.exports = { finaleVisible, captureFinale };
