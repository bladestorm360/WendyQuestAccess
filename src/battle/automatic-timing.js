"use strict";

const { battlePresented, visibleSprite } = require('./presentation');

// Called only by the native radial input check, after this update's meter
// geometry and before the game's own acceptance/scoring branch. No queued
// key, global Input state, clock prediction or result mutation is needed.
function createAutomaticTiming(root, host, preferences) {
    return (scene, action, progress, start, end, limit, frozen, iceStart, iceEnd, paused) => {
        if (preferences().automaticTiming !== true || !battlePresented(root, host, scene) ||
            scene._wqaPreloads?.size || scene._wqaPreloadOverflow ||
            root.BattleManager._phase !== 'ActionCommand' || root.BattleManager._currentActionCommand !== action ||
            action?._spriteBase?.parent !== scene || !visibleSprite(action._spriteBase, action._backing) ||
            !Number.isFinite(progress) || !Number.isFinite(limit) || !(progress < limit && progress < 1) || paused > 0) return false;
        // Frozen's earlier ice band requires a native press to shatter it.
        // The native half-second pause and later perfect press stay intact.
        if (frozen) return Number.isFinite(iceStart) && Number.isFinite(iceEnd) &&
            iceStart < iceEnd && progress > iceStart && progress <= iceEnd;
        return Number.isFinite(start) && Number.isFinite(end) && start < end && progress >= start && progress <= end;
    };
}

module.exports = { createAutomaticTiming };
