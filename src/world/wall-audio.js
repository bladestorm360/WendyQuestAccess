'use strict';

const { CARDINAL, bearing } = require('./spatial-direction');
const { travelMode } = require('./vehicle-navigation');

const IDLE_MS = 3000;
const CHECK_FRAMES = 6;

function createWallAudio(root, fieldReady, audio, preferences, now = Date.now) {
    let owner = null;

    function ready(scene) {
        const { enabled, wall, wallVolume } = preferences();
        return enabled && wall && wallVolume > 0 && travelMode(root.$gameMap, root.$gamePlayer) === 'walk' &&
            scene._wqaWallBlockFrame !== root.Graphics.frameCount && fieldReady(scene, true);
    }

    function silence(state) {
        if (state.direction) audio.retire(state.scene, 'wall');
        state.direction = 0;
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
        owner = { scene, player: root.$gamePlayer, map: root.$gameMap, tried: false, direction: 0, until: 0 };
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

    function sample(state, forced = 0) {
        const { scene, player, map } = state;
        const facing = player._direction;
        const view = CARDINAL[facing];
        if (!view || !Array.isArray(map._tileEvents) || map._tileEvents.length > 32 ||
            !Array.isArray(map._events) || map._events.length > 513) return silence(state);
        const x = player._x;
        const y = player._y;
        const blocked = direction => !player.canPass(x, y, direction);
        const prior = state.direction;
        // Keep the same source along an edge. A failed step can prioritize
        // the obstacle the player is pressing against.
        const direction = forced || (prior && blocked(prior) ? prior :
            [facing, view.left, view.right, 10 - facing].find(blocked));
        if (!direction) return silence(state);
        const { hrtf, wallVolume } = preferences();
        if (!audio.isPrepared(hrtf)) return arm(scene);
        if (direction === prior && facing === state.facing && audio.extendWall(scene, state.until)) return;
        const valid = () => owner === state && ready(scene) && now() < state.until &&
            state.player === root.$gamePlayer && state.map === root.$gameMap &&
            player._direction === facing && state.direction === direction;
        state.direction = direction;
        state.facing = facing;
        if (!audio.play(scene, hrtf, audio.cues.wallTone, wallVolume / 100, bearing(facing, direction),
            valid, status => { if (status < 0 && owner === state) leave(scene); }, 'wall', 1, state.until)) silence(state);
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
            state.attempt === direction && state.facing === state.player._direction) return;
        state.x = state.player._x;
        state.y = state.player._y;
        state.attempt = direction;
        sample(state, succeeded ? 0 : direction);
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
