'use strict';

const { CARDINAL } = require('./spatial-direction');
const { travelMode } = require('./vehicle-navigation');

// Screen directions stay fixed as Wendy turns. The final 500 ms are the audio fade.
const WALL_CUES = [
    { direction: 8, cue: 'wallNorth', bearing: [0, 0, 1] },
    { direction: 6, cue: 'wallEast', bearing: [1, 0, 0] },
    { direction: 2, cue: 'wallSouth', bearing: [0, 0, -1] },
    { direction: 4, cue: 'wallWest', bearing: [-1, 0, 0] }
];
const IDLE_MS = 3500;
const CHECK_FRAMES = 6;

function createWallAudio(root, fieldReady, audio, preferences, now = Date.now) {
    let owner = null;

    function ready(scene) {
        const { enabled, wall, wallVolume } = preferences();
        return enabled && wall && wallVolume > 0 && travelMode(root.$gameMap, root.$gamePlayer) === 'walk' &&
            scene._wqaWallBlockFrame !== root.Graphics.frameCount && fieldReady(scene, true);
    }

    function silence(state) {
        if (state.blocked) audio.retire(state.scene, 'wall');
        state.blocked = 0;
    }

    function leave(scene) {
        if (!owner || (scene && owner.scene !== scene)) return;
        const state = owner;
        owner = null;
        state.scene._wqaWallAudio = false;
        state.scene._wqaWallUntil = 0;
        audio.retire(state.scene, 'wall');
    }

    function own(scene) {
        if (owner?.scene === scene && owner.player === root.$gamePlayer && owner.map === root.$gameMap) return owner;
        leave();
        owner = { scene, player: root.$gamePlayer, map: root.$gameMap, tried: false, blocked: 0, until: 0 };
        scene._wqaWallAudio = scene._wqaPresentation = true;
        return owner;
    }

    function arm(scene) {
        if (!ready(scene)) return;
        const { hrtf } = preferences();
        if (audio.isPrepared(hrtf)) return;
        const state = own(scene);
        if (state.tried) return;
        state.tried = audio.prepare(scene, hrtf, () => owner === state && ready(scene), () => {
            if (owner === state && state.until > now()) scene._wqaWallUntil = root.Graphics.frameCount + 1;
        }, 'wall');
    }

    function sample(state) {
        const { scene, player, map } = state;
        if (!Array.isArray(map._tileEvents) || map._tileEvents.length > 32 ||
            !Array.isArray(map._events) || map._events.length > 513) return silence(state);
        const { hrtf, wallVolume } = preferences();
        if (!audio.isPrepared(hrtf)) return arm(scene);
        let blocked = 0;
        for (const { direction } of WALL_CUES) {
            if (!player.canPass(player._x, player._y, direction)) blocked |= 1 << direction;
        }
        if (!blocked) return silence(state);
        // Retire only obstacles we lost. Surviving loops keep their phase and
        // share one renewed deadline even when all four edges are blocked.
        const previous = state.blocked;
        const retained = previous & blocked;
        const continuing = retained && audio.extendWall(scene, state.until) ? retained : 0;
        state.blocked = blocked;
        for (const { direction, cue, bearing } of WALL_CUES) {
            const bit = 1 << direction;
            const sound = audio.cues[cue];
            if (!(blocked & bit)) {
                if (previous & bit) audio.retire(scene, 'wall', sound);
            } else if (!(continuing & bit)) {
                const valid = () => owner === state && ready(scene) && now() < state.until &&
                    state.player === root.$gamePlayer && state.map === root.$gameMap && !!(state.blocked & bit);
                if (!audio.play(scene, hrtf, sound, wallVolume / 100, bearing,
                    valid, status => { if (status < 0 && owner === state) leave(scene); }, 'wall', 1, state.until)) {
                    state.blocked &= ~bit;
                }
            }
        }
    }

    function move(scene, direction, succeeded) {
        if (!CARDINAL[direction] || !ready(scene)) return;
        const state = own(scene);
        const time = now();
        if (succeeded || !state.until) state.until = time + IDLE_MS;
        if (time >= state.until) return;
        const frame = root.Graphics.frameCount;
        if (!scene._wqaWallUntil) scene._wqaWallUntil = frame + CHECK_FRAMES;
        // Repeated attempts against the same edge do not extend the lease.
        if (!succeeded && state.x === state.player._x && state.y === state.player._y &&
            state.attempt === direction) return;
        state.x = state.player._x;
        state.y = state.player._y;
        state.attempt = direction;
        sample(state);
    }

    return {
        arm, move, leave,
        interrupt(scene) {
            scene._wqaWallBlockFrame = root.Graphics.frameCount;
            leave(scene);
        },
        expire(scene) {
            const state = owner;
            if (state?.scene !== scene) return;
            if (state.map !== root.$gameMap || state.player !== root.$gamePlayer || !ready(scene)) return leave(scene);
            if (now() >= state.until) {
                // Keep the expired lease until the next real step. Held
                // movement against a wall must not restart the sound.
                silence(state);
                scene._wqaWallUntil = 0;
                return;
            }
            scene._wqaWallUntil = root.Graphics.frameCount + CHECK_FRAMES;
            sample(state);
        }
    };
}

module.exports = { createWallAudio };
