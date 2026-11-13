'use strict';

const { CARDINAL } = require('./spatial-direction');
const { travelMode } = require('./vehicle-navigation');

const FEET = [[-0.25, -1, 0.15], [0.25, -1, 0.15]];

function createFootsteps(root, fieldReady, audio, preferences) {
    let owner = null;

    function ready(scene) {
        const config = preferences();
        return config.enabled && config.footsteps && config.footstepVolume > 0 &&
            travelMode(root.$gameMap, root.$gamePlayer) === 'walk' &&
            scene._wqaWallBlockFrame !== root.Graphics.frameCount && fieldReady(scene, true);
    }

    function leave(scene) {
        if (!owner || (scene && owner.scene !== scene)) return;
        audio.retire(owner.scene, 'footstep');
        owner = null;
    }

    function arm(scene) {
        if (!ready(scene)) return;
        const { hrtf } = preferences();
        if (audio.isPrepared(hrtf)) return;
        if (owner?.scene !== scene) owner = { scene, side: 0, tried: false };
        if (owner.tried) return;
        const current = owner;
        current.tried = audio.prepare(scene, hrtf, () => owner === current && ready(scene), null, 'footstep');
        scene._wqaPresentation = true;
    }

    return {
        arm, leave,
        move(scene, direction, succeeded) {
            if (!succeeded || !CARDINAL[direction] || !ready(scene)) return;
            const { hrtf, footstepVolume } = preferences();
            if (!audio.isPrepared(hrtf)) return arm(scene);
            if (owner?.scene !== scene) owner = { scene, side: 0, tried: false };
            const current = owner;
            const player = root.$gamePlayer;
            const x = player._x;
            const y = player._y;
            const expires = root.Graphics.frameCount + 6;
            scene._wqaPresentation = true;
            audio.play(scene, hrtf, audio.cues.footstep, footstepVolume / 100, FEET[current.side],
                () => owner === current && ready(scene) && root.$gamePlayer === player &&
                    player._x === x && player._y === y && root.Graphics.frameCount < expires, null, 'footstep');
            current.side ^= 1;
        }
    };
}

module.exports = { createFootsteps };
