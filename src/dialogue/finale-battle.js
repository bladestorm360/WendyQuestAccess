'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

// Battle dialogue intentionally owns the interpreter during the finale.
// Ordinary action readers reject this phase, so qualify only the authored
// troop/list here rather than weakening their general admission rule.
function finaleBattleReady(root, host, scene) {
    const troop = root.$gameTroop;
    return !!(troop?._troopId === 96 && scene?._wqaBattleStarted && scene._started && scene._active &&
        scene._fadeDuration === 0 && scene._fadeOpacity === 0 && scene === host.manager._scene &&
        host.graphics.app?.stage === scene && !host.manager._nextScene && !host.manager._exiting &&
        !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize && !scene._wqaSettingsActive &&
        !host.screenFading() && host.hasFocus());
}

function bossFlash(root, scene, interpreter) {
    if (interpreter !== root.$gameTroop?._interpreter ||
        interpreter?._list !== root.$dataTroops?.[96]?.pages?.[5]?.list) return null;
    const id = interpreter._index === 7 ? 'double-mech-explosion' :
        interpreter._index === 15 ? 'double-mech-explosion-again' : '';
    const sprites = scene._spriteset?._enemySprites;
    if (!id || !Array.isArray(sprites) || sprites.length > 16) return null;
    const actor = sprites.find(sprite => sprite._enemy?._enemyId === 38);
    const art = actor?._mainSprite || actor;
    return actor && { id, visible: () => actor.parent === scene._spriteset?._battleField &&
        actor.worldVisible && actor.worldAlpha > 0 && art.worldVisible && art.worldAlpha > 0 &&
        art.bitmap?.isReady?.() && root.$gameScreen?._flashColor?.[3] > 0 };
}

function combinedStones(root, scene, actor, combined, stones) {
    const interpreter = root.$gameTroop?._interpreter;
    if (interpreter?._list !== root.$dataTroops?.[96]?.pages?.[4]?.list ||
        root.BattleManager?._action?.item?.()?.id !== 123 ||
        actor !== scene._spriteset?._actorSprites?.[0] || actor?._actor?._actorId !== 1 ||
        !Array.isArray(stones) || stones.length !== 4) return null;
    const names = ['Fries', 'Frosty', 'Nugget', 'Bacon'];
    return { id: 'stones-unite', visible: () => renderedSprite(combined, scene) &&
        combined.animator?._animationData?.fileName === 'ParticleEffects/CornerStone_Combined' &&
        stones.every((sprite, index) => renderedSprite(sprite, combined) &&
            sprite.animator?._animationData?.fileName === 'ParticleEffects/CornerStone_' + names[index] &&
            sprite.scale?.x > 0 && sprite.scale?.y > 0) };
}

// The native state cleanup destroys this gold triangular lattice. Capture
// its already drawn overlay at that exact call, then confirm its removal only
// after rendering. The Corner Stone orbit producer remains independent.
function shieldGone(root, scene, art) {
    const script=root.$gameTroop?._interpreter,sprites=scene._spriteset?._enemySprites;
    if(script?._list!==root.$dataTroops?.[96]?.pages?.[4]?.list ||
        !Array.isArray(sprites) || sprites.length>16)return null;
    const actor=sprites.find(value=>value._enemy?._enemyId===38 && value._mainSprite===art);
    const overlay=art?.__SuperShieldOverlay;
    if(!actor || !renderedSprite(overlay,art) ||
        !String(overlay.bitmap?._url||'').endsWith('img/ParticleEffects/ShieldOverlay.png'))return null;
    return {id:'mech-shield-vanishes',token:overlay,visible:()=>
        actor.parent===scene._spriteset?._battleField && renderedSprite(art,actor) &&
        (overlay.destroyed || overlay._destroyed || overlay.parent!==art)};
}

module.exports = { finaleBattleReady, bossFlash, combinedStones, shieldGone };
