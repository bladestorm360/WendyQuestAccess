'use strict';

const { travelMode } = require('./vehicle-navigation');
const { patrolDestination } = require('./puzzles/cave');

const FEET = [[-0.25, -1, 0.15], [0.25, -1, 0.15]];
const STEP_FRESH_MS = 100;

function createFootsteps(root, fieldReady, audio, preferences, now = () => performance.now()) {
    let owner = null;
    let guards = null;

    function guardReady(scene) {
        const { enabled, caveTiming, caveVolume, hrtf } = preferences();
        return enabled && caveTiming && caveVolume > 0 && fieldReady(scene, true) && audio.isPrepared(hrtf);
    }

    function leaveGuards(scene) {
        if (!guards || scene && guards.scene !== scene) return;
        audio.retire(guards.scene, 'guardStep');
        guards = null;
    }

    function guardLanded(scene, guard) {
        const map = root.$gameMap;
        if (map?._events[guard._eventId] !== guard || !patrolDestination(map._mapId, guard, guard.page()) ||
            !guardReady(scene)) return;
        const player = root.$gamePlayer;
        const x = guard._x - player._realX;
        const y = player._realY - guard._y;
        const distance = Math.hypot(x, y);
        if (distance > 9) return;
        if (guards?.scene !== scene || guards.map !== map || guards.player !== player) {
            leaveGuards();
            guards = { scene, map, player, samples: [], posted: false };
        }
        // Submit the two nearest foot contacts this render. Each uses a
        // reserved ambient voice and can overlap Wendy's step or a ping.
        const current = guards;
        const samples = current.samples;
        const sample = { x, y, distance };
        if (!samples[0] || distance < samples[0].distance) samples.unshift(sample);
        else if (!samples[1] || distance < samples[1].distance) samples[1] = sample;
        if (samples.length > 2) samples.length = 2;
        if (current.posted) return;
        const renderer = root.Graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leaveGuards(scene);
        current.posted = true;
        scene._wqaPresentation = true;
        renderer.once('postrender', () => {
            current.posted = false;
            const contacts = current.samples.splice(0, 2);
            const readyAtRender = () => guards === current && root.$gameMap === map &&
                root.$gamePlayer === player && guardReady(scene);
            if (!readyAtRender()) return;
            const { hrtf, caveVolume } = preferences();
            const expires = root.Graphics.frameCount + 6;
            for (const [index, { x, y, distance }] of contacts.entries()) {
                const gain = caveVolume / 100 * (0.8 - 0.06 * distance);
                audio.play(scene, hrtf, audio.cues.footstep, gain, distance ? [x, -0.25, y] : [0, -0.25, 1],
                    () => root.Graphics.frameCount < expires && readyAtRender(), null, 'guardStep', 0.64, 0,
                    audio.soundscapeVoices - 2 + index);
            }
        });
    }

    function ready(scene) {
        const config = preferences();
        return config.enabled && config.footsteps && config.footstepVolume > 0 &&
            travelMode(root.$gameMap, root.$gamePlayer) === 'walk' &&
            fieldReady(scene, true);
    }

    function leave(scene) {
        leaveGuards(scene);
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
        arm, leave, guardLanded, leaveGuards,
        landed(scene, player) {
            if (player !== root.$gamePlayer || !ready(scene)) return;
            const { hrtf, footstepVolume } = preferences();
            if (!audio.isPrepared(hrtf)) return arm(scene);
            if (owner?.scene !== scene) owner = { scene, side: 0, tried: false };
            const current = owner;
            const map = root.$gameMap;
            scene._wqaPresentation = true;
            const expires = now() + STEP_FRESH_MS;
            if (audio.play(scene, hrtf, audio.cues.footstep, footstepVolume / 100, FEET[current.side],
                () => now() < expires && owner === current && root.$gameMap === map &&
                    root.$gamePlayer === player && ready(scene),
                null, 'footstep')) current.side ^= 1;
        }
    };
}

module.exports = { createFootsteps };
