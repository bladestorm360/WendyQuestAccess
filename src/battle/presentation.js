'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');

// This one story action runs while its native troop interpreter waits at339.
// Only action/log observers opt in; menu/target readers keep their usual gate.
function scriptedBattleAction(root, scene) {
    const troop = root.$gameTroop, script = troop?._interpreter, action = root.BattleManager?._action;
    return troop?._troopId === 14 && script?._list === root.$dataTroops?.[14]?.pages?.[0]?.list &&
        script?._index === 12 && script._waitMode === 'action' && action?._forcing === true &&
        root.BattleManager._phase === 'action' && action.isSkill?.() && action.item?.()?.id === 55 &&
        action.subject?.()?._enemyId === 9 &&
        (!scene?._wqaBattleInterpreter?._list || scene._wqaBattleInterpreter === script);
}

function battleScenePresented(root, host, scene, scripted = false) {
    return !!(scene?._wqaBattleStarted && scene._started && scene._active && scene._fadeDuration === 0 &&
        scene._fadeOpacity === 0 && scene === host.manager._scene && host.graphics.app?.stage === scene &&
        !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
        !host.graphics._wqaResize && !scene._wqaSettingsActive && !host.screenFading() && host.hasFocus() &&
        (scripted && scriptedBattleAction(root, scene) ||
            !root.$gameTroop?._interpreter?._list && !scene._wqaBattleInterpreter?._list) && !root.$gameMessage?.isBusy?.());
}

function battlePresented(root, host, scene, itemOverlay = false) {
    return root.BattleManager?._wqaDialogueBusy === false && battleScenePresented(root, host, scene) &&
        (itemOverlay || !scene._itemWindow?.active) && !scene._skillWindow?.active;
}

function visibleSprite(parent, sprite) {
    return !!(parent && sprite?.parent === parent && sprite.worldVisible && sprite.worldAlpha > 0 &&
        sprite.renderable !== false && sprite.bitmap?.isReady?.());
}

function drawnText(parent, sprite, maximum) {
    if (!parent || sprite?.parent !== parent || !sprite.worldVisible || !(sprite.worldAlpha > 0) ||
        sprite.renderable === false || sprite._dirty !== false) return '';
    const value = sprite._currentString;
    if (typeof value !== 'string' || !value.length || value.length > maximum || !Array.isArray(sprite.children)) return '';

    // Sprite_Text paints one bitmap child per character. The container has
    // no bitmap. Animated text can also have glyphs still scaled to zero.
    let index = 0;
    for (let position = 0; position < value.length; position++) {
        if (value[position] === '\n') continue;
        const glyph = sprite.children[index++];
        if (!visibleSprite(sprite, glyph) || !glyph.scale?.x || !glyph.scale?.y) return '';
    }
    return index ? value : '';
}

// This is the same name the native enemy sprite assigns to its nameplate.
function enemyName(sprite) {
    const battler = sprite?._enemy || sprite?._battler;
    const name = battler?.originalName?.();
    return typeof name === 'string' && name.length <= 48 ? name.trim() : '';
}

// Native state cleanup can leave stopped coroutine references behind.
// Check attached, visible overlays and particles from the exact game art.
function statusAppearance(art) {
    if (!art || !art.worldVisible || !(art.worldAlpha > 0)) return [];
    const children = art.children;
    const hasParticle = name => Array.isArray(children) && children.length <= 64 && children.some(sprite =>
        renderedSprite(sprite, art) && sprite.animator?._animationData?.fileName === 'ParticleEffects/' + name);
    const ghosts = art.__GhostClones;
    return [
        renderedSprite(art.__FrozenOverlay, art) && 'Blue ice streaks coat the sprite.',
        renderedSprite(art.__FireOverlay, art) && 'Red and orange flames ripple across the sprite.',
        renderedSprite(art.__RageOverlay, art) && 'Red and orange zigzags surge across the sprite.',
        renderedSprite(art.__FrostyHat, art) && 'A pale, curled Frosty hat sits on the head.',
        renderedSprite(art.__SuperShieldOverlay, art) && 'A golden mesh of triangles covers the sprite.',
        Array.isArray(ghosts) && ghosts.length <= 3 && ghosts.some(sprite => renderedSprite(sprite, art)) &&
            'Faint copies drift out from the sprite.',
        hasParticle('Sog') && 'Blue water drops fall around the sprite.',
        hasParticle('Crispy') && 'Golden sparks flicker around the sprite.'
    ].filter(Boolean);
}

module.exports = { scriptedBattleAction, battleScenePresented, battlePresented, visibleSprite, drawnText, enemyName, statusAppearance };