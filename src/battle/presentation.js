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
    // Sprite_Text publishes its string before repainting the bitmap.
    if (!visibleSprite(parent, sprite) || sprite._dirty !== false) return '';
    const value = sprite._currentString;
    return typeof value === 'string' && value.length <= maximum ? value : '';
}

module.exports = { battleScenePresented, battlePresented, visibleSprite, drawnText };