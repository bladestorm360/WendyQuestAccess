'use strict';

const jailVisuals = require('./jail-visuals');

const { landedTyler } = require('./tyler-visuals');

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

function captureFinale(root, scene, id, recovery = false) {
    if(id==='shrine-lights') {
        const mask=scene._spriteset?._lightmask;
        return mask?.parent===scene._spriteset && mask.worldVisible===true &&
            Array.isArray(mask._sprites) && (mask._sprites.length>0 || recovery && root.$gameSwitches.value(576)) && mask._sprites.length<=16 ? {mask} : null;
    }
    if(id==='shrine-reunion') {
        const tone=root.$gameScreen?._tone;
        // Exact recovery is after the native white-tint/wait/switch/clear-tint
        // sequence. The newly rendered companion sprites must still confirm it.
        return Array.isArray(tone) && tone.length===4 &&
            (tone.slice(0,3).every(value=>value>=200) || recovery && root.$gameSwitches.value(573)) ? {white:true} : null;
    }

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
    if(id==='stones-white-light') {
        const light=picture(root,host,scene,28,'white'),script=root.$gameMap._interpreter;
        if(root.$gameMap._mapId!==107 || script?._eventId!==3 || script._index<110 || script._index>116 ||
            script._list!==root.$dataMap?.events?.[3]?.pages?.[3]?.list || !light ||
            light.data._opacity<200 || light.sprite.worldAlpha<200/255)return false;
        const pose=light.sprite.worldTransform,frame=light.sprite._frame,anchor=light.sprite.anchor;
        if(!frame || !anchor || pose.b!==0 || pose.c!==0 || !(pose.a>0) || !(pose.d>0))return false;
        const x=pose.tx-frame.width*pose.a*anchor.x,y=pose.ty-frame.height*pose.d*anchor.y;
        // This is the later Corner Stone reaction's actual full-screen white
        // picture28, distinct from Chomps's earlier sacrifice picture29.
        return x<=0 && y<=0 && x+frame.width*pose.a>=host.graphics.width && y+frame.height*pose.d>=host.graphics.height;
    }
    if(id==='assembly-door-opens') {
        const door=picture(root,host,scene,1,'pictures/FINALBOSSDOOR'),map=root.$gameMap;
        // This world-space panel moves176→96 over180 native frames. Match
        // both the actual tween and its painted, camera-adjusted sprite pose;
        // sound or a later already-open picture cannot prove the movement.
        const script=map._interpreter;
        return map._mapId===105 && script?._eventId===12 && script._index>=117 && script._index<=128 &&
            script._list===root.$dataMap?.events?.[12]?.pages?.[1]?.list &&
            !!door && door.data._duration>0 && door.data._y<176 &&
            typeof map.adjustY==='function' && door.sprite.y===Math.round(32*map.adjustY(door.data._y/32)) &&
            door.sprite.y<Math.round(32*map.adjustY(176/32));
    }
    if(['grunt-ambush','party-jailed','jail-breach','chomps-door-open','office-lights-out','office-lights-on','elder-tater-freed'].includes(id))return jailVisuals.visible(root,host,scene,state);
    if(id==='jail-impact')return renderedSprite(state.sprite,scene._spriteset._tilemap) &&
        (scene._spriteset.x!==state.screenX || scene._spriteset.y!==state.screenY);
    if(['sir-chicken-advances','chomps-walks-away'].includes(id))return renderedSprite(state.sprite,scene._spriteset._tilemap) &&
        (state.actor._realX!==state.x || state.actor._realY!==state.y);
    if(id==='shrine-lights') {
        const mask=state.finale?.mask;
        return !!mask && scene._spriteset?._lightmask===mask && mask.parent===scene._spriteset &&
            mask.worldVisible===true && Array.isArray(mask._sprites) && mask._sprites.length===0 &&
            scene._spriteset._tilemap?.worldVisible===true && root.$gameSwitches.value(576);
    }
    if(id==='shrine-reunion') {
        const tone=root.$gameScreen?._tone,sprites=scene._spriteset?._characterSprites;
        if(!state.finale?.white || !Array.isArray(tone) || !tone.slice(0,3).every(value=>value<200) ||
            !Array.isArray(sprites) || sprites.length>512 || !root.$gameSwitches.value(573))return false;
        return [1,22].every(id=>{
            const actor=root.$gameMap._events?.[id],sprite=sprites.find(sprite=>sprite._character===actor),pose=sprite?.worldTransform;
            return actor?._pageIndex===0 && !actor._erased && !actor._transparent &&
                actor._characterName===root.$dataMap.events[id].pages[0].image.characterName &&
                sprite?._characterName===actor._characterName && renderedSprite(sprite,scene._spriteset._tilemap) &&
                pose?.tx>=0 && pose.tx<=host.graphics.width && pose.ty>=0 && pose.ty<=host.graphics.height;
        });
    }

    if (id === 'ice-machine-arrives') {
        const pos = state.sprite?.worldTransform;
        return state.actor._characterName === '~ICM' && state.actor._characterIndex === 5 &&
            state.sprite._characterName === '~ICM' && !state.actor._transparent &&
            renderedSprite(state.sprite, scene._spriteset._tilemap) &&
            pos?.tx >= 0 && pos.tx <= host.graphics.width && pos.ty >= 0 && pos.ty <= host.graphics.height &&
            (state.actor._jumpCount > 0 || state.actor._realX === 21 && state.actor._realY === 6 &&
                (scene._spriteset.x !== state.screenX || scene._spriteset.y !== state.screenY));
    }
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
        // A completed native arrival can still be visible during its first
        // greeting. Exact producer/route/destination ownership proves it;
        // departure and unrelated dialogue require a real current jump.
        const balloons=scene._spriteset?._balloonSprites;
        const tylerMusic=Array.isArray(balloons) && balloons.length<=32 && balloons.some(balloon=>
            balloon.targetObject===state.actor && balloon._balloonId===3 &&
            renderedSprite(balloon,scene._spriteset._effectsContainer));
        const landed = id === 'tyler-arrives' && landedTyler(root,{...state,tylerMusic});
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
    return false;
}

module.exports = { finaleVisible, captureFinale };
