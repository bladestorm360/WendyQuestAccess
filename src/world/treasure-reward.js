'use strict';

const { drawnText } = require('../battle/presentation');
const { renderedSprite } = require('../runtime/rendered-sprite');

function createTreasureReward(root, host, notifications) {
    let current = null;

    function ready(scene) {
        // The native reward waits inside its event. Field input readiness
        // would reject this screen even after all its artwork is visible.
        return scene?._wqaMapRestored && scene._mapLoaded && scene._started && scene._active &&
            scene === host.manager._scene && host.graphics.app?.stage === scene && !host.manager._nextScene &&
            !host.manager._exiting && !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize &&
            !scene._wqaSettingsActive && !scene._wqaTerrainWork && !scene._wqaPreloads?.size &&
            !scene._wqaPreloadOverflow && scene._fadeDuration === 0 && scene._fadeOpacity === 0 &&
            root.$gameMap?.inactiveTime < 30 && root.$gameScreen?._brightness === 255 && !host.screenFading() &&
            !root.$gamePlayer?._transferring && !root.$gameMessage?.isBusy() && host.hasFocus();
    }

    function attached(state) {
        return state.animation.parent === state.scene._spriteset && state.scene._spriteset?.parent === state.scene &&
            state.animation._body?.parent === state.animation && !state.animation._exit;
    }

    function leave(scene) {
        const state = current;
        if (!state || state.scene !== scene) return;
        current = null;
        scene._wqaTreasureDue = 0;
        if (state.token) notifications.close(state.token);
    }

    function started(scene, animation) {
        if (!ready(scene) || !animation?._numberSprite || !animation._titleSprite || !animation._coinSprite) return;
        leave(scene);
        current = { scene, animation, expires: host.graphics.frameCount + 190, pending: false, token: 0 };
        scene._wqaTreasureDue = host.graphics.frameCount + 1;
        scene._wqaPresentation = true;
    }

    function update(scene) {
        const state = current;
        if (!state || state.scene !== scene) return;
        const { animation } = state;
        const frame = host.graphics.frameCount;
        if (!ready(scene) || !attached(state) || frame >= state.expires) return leave(scene);
        scene._wqaTreasureDue = frame + 4;
        if (state.pending || state.token || animation._numberSprite._dirty !== false ||
            animation._titleSprite._dirty !== false || !animation._coinSprite.texture?.valid ||
            !(animation._coinSprite.scale?.x > 0 && animation._coinSprite.scale?.y > 0)) return;
        const renderer = host.graphics.app.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        state.pending = true;
        renderer.once('postrender', () => {
            if (current !== state) return;
            state.pending = false;
            if (!ready(scene) || !attached(state)) return leave(scene);
            const { _body: body, _coinSprite: coin, _numberSprite: number, _titleSprite: title } = animation;
            if (!renderedSprite(coin, body) || !drawnText(body, title, 24)) return;
            const shown = /^x([1-9]\d{0,2})$/.exec(drawnText(body, number, 4));
            if (!shown) return;
            // This exact native animation always draws the Hero's Idol atlas.
            // Use the localized name of its item and the count the sprite drew.
            const name = root.$dataItems?.[2]?.name;
            if (typeof name !== 'string' || !name || name.length > 64) return leave(scene);
            state.token = notifications.open({ kind: 'treasureReward', name, amount: Number(shown[1]) },
                () => current === state && ready(scene) && attached(state));
        });
    }

    return { started, update, leave };
}

module.exports = { createTreasureReward };
