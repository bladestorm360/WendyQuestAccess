'use strict';

function battleScenePresented(root, host, scene) {
    return !!(scene?._wqaBattleStarted && scene._started && scene._active && scene._fadeDuration === 0 &&
        scene._fadeOpacity === 0 && scene === host.manager._scene && host.graphics.app?.stage === scene &&
        !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
        !host.graphics._wqaResize && !scene._wqaSettingsActive && !host.screenFading() && host.hasFocus() &&
        !root.$gameTroop?._interpreter?._list && !scene._wqaBattleInterpreter?._list && !root.$gameMessage?.isBusy?.());
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

module.exports = { battleScenePresented, battlePresented, visibleSprite, drawnText, enemyName };