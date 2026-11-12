'use strict';

const CONTACT_GAP = 7;
const REPEAT_GAP = 18;
const SAMPLE_LIFETIME = 12;
const CARDINAL = Object.freeze({
    2: { x: 0, y: 1, left: 6, right: 4 }, 4: { x: -1, y: 0, left: 2, right: 8 },
    6: { x: 1, y: 0, left: 8, right: 2 }, 8: { x: 0, y: -1, left: 4, right: 6 }
});

function bearing(facing, direction) {
    const view = CARDINAL[facing];
    const wall = CARDINAL[direction];
    return view && wall && [view.x * wall.y - view.y * wall.x, 0, view.x * wall.x + view.y * wall.y];
}

function sideWall(map, player, motion, side) {
    const x = player._x;
    const y = player._y;
    const previousX = map.roundXWithDirection(x, 10 - motion);
    const previousY = map.roundYWithDirection(y, 10 - motion);
    const blocked = (a, b) => !map.isValid(map.roundXWithDirection(a, side), map.roundYWithDirection(b, side)) ||
        !player.isMapPassable(a, b, side);
    return blocked(x, y) && blocked(previousX, previousY);
}

function createWallAudio(root, fieldReady, audio, preferences) {
    const CUE = audio.cues;
    let owner = null;
    const frame = () => root.Graphics.frameCount;
    function ready(scene) {
        const { enabled, wall, wallVolume } = preferences();
        return enabled && wall && wallVolume > 0 && scene._wqaWallBlockFrame !== frame() && fieldReady(scene, true);
    }

    function clear(current) {
        if (current.scene._wqaWallAudio) audio.retire(current.scene);
        current.scene._wqaWallAudio = false;
        current.scene._wqaWallUntil = 0;
    }

    function leave(scene) {
        if (!owner || (scene && owner.scene !== scene)) return;
        clear(owner);
        owner = null;
    }

    function own(scene) {
        if (owner?.scene === scene) return owner;
        leave();
        owner = { scene, lastFrame: -Infinity, direction: 0, cue: null, chooseRight: false, tried: false };
        return owner;
    }

    function watch(scene) {
        scene._wqaWallAudio = true;
        scene._wqaPresentation = true;
    }

    function arm(scene) {
        if (!ready(scene)) return;
        const { hrtf } = preferences();
        if (audio.isPrepared(hrtf)) return;
        const current = own(scene);
        if (current.tried) return;
        current.tried = true;
        watch(scene);
        if (!audio.prepare(scene, hrtf, () => owner === current && ready(scene), () => clear(current))) clear(current);
    }

    function move(scene, motion, succeeded) {
        if (!CARDINAL[motion] || !ready(scene)) return;
        const { hrtf, wallVolume } = preferences();
        if (!audio.isPrepared(hrtf)) return arm(scene);
        const current = own(scene);
        const player = root.$gamePlayer;
        const x = player._x;
        const y = player._y;
        const facing = player._direction;
        if (scene._wqaWallUntil && (current.x !== x || current.y !== y || current.facing !== facing)) clear(current);
        const time = frame();
        if (time - current.lastFrame < CONTACT_GAP) return;
        let direction = motion;
        let cue = CUE.wallBump;
        if (succeeded) {
            const map = root.$gameMap;
            // Stock passage reads at most two tiles per edge and searches its
            // active tile-event list. The exact build's largest authored list
            // fits this bound. Actor contact uses the native failed step instead.
            if (!Array.isArray(map._tileEvents) || map._tileEvents.length > 32) return;
            const { left, right } = CARDINAL[motion];
            const onLeft = sideWall(map, player, motion, left);
            const onRight = sideWall(map, player, motion, right);
            if (!onLeft && !onRight) return;
            direction = onRight && (!onLeft || current.chooseRight) ? right : left;
            if (onLeft && onRight) current.chooseRight = !current.chooseRight;
            cue = CUE.wallBrush;
        }
        if (cue === current.cue && direction === current.direction && time - current.lastFrame < REPEAT_GAP) return;
        const source = bearing(facing, direction);
        if (!source) return;
        const until = time + SAMPLE_LIFETIME;
        const valid = () => owner === current && ready(scene) && frame() < until &&
            player === root.$gamePlayer && player._x === x && player._y === y && player._direction === facing;
        if (!audio.play(scene, hrtf, cue, wallVolume / 100, source, valid)) return;
        Object.assign(current, { x, y, facing, lastFrame: time, cue, direction });
        watch(scene);
        scene._wqaWallUntil = until;
    }

    return {
        arm, move, leave,
        interrupt(scene) {
            scene._wqaWallBlockFrame = frame();
            leave(scene);
        },
        expire(scene) {
            if (owner?.scene === scene) clear(owner);
        }
    };
}

module.exports = { createWallAudio };
