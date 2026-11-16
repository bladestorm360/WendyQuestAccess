'use strict';

const { travelMode } = require('./vehicle-navigation');

const FEET = [[-0.25, -1, 0.15], [0.25, -1, 0.15]];

function createFootsteps(root, fieldReady, audio, preferences) {
    let owner = null;

    function ready(scene) {
        const config = preferences();
        return config.enabled && config.footsteps && config.footstepVolume > 0 &&
            travelMode(root.$gameMap, root.$gamePlayer) === 'walk' &&
            fieldReady(scene, true);
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
        landed(scene, player) {
            if (player !== root.$gamePlayer || !ready(scene)) return;
            const { hrtf, footstepVolume } = preferences();
            if (!audio.isPrepared(hrtf)) return arm(scene);
            if (owner?.scene !== scene) owner = { scene, side: 0, tried: false };
            const current = owner;
            const map = root.$gameMap;
            scene._wqaPresentation = true;
            // The next completed step supersedes this audio lane. Keep the
            // current pip admitted as Wendy starts moving toward the next tile.
            if (audio.play(scene, hrtf, audio.cues.footstep, footstepVolume / 100, FEET[current.side],
                () => owner === current && root.$gameMap === map && root.$gamePlayer === player && ready(scene),
                null, 'footstep')) current.side ^= 1;
        }
    };
}

module.exports = { createFootsteps };
