'use strict';

const { timedCave, captureMotion, TIMING_CUE, STAMP_WIDTH, matchesMotionStamp } = require('./puzzles/cave');
const { CARDINAL, bearing } = require('./spatial-direction');
const { DIRECTIONS } = require('./geometry.cjs');

const CUE_LIFETIME = 8;

function createCaveTiming(root, fieldReady, audio, preferences, report) {
    let owner = null;
    let preparation = null;
    const frame = () => root.Graphics.frameCount;

    function ready(scene, moving = false) {
        const { enabled, caveTiming, caveVolume } = preferences();
        return enabled && caveTiming && caveVolume > 0 && timedCave(root.$gameMap?._mapId) && fieldReady(scene, moving);
    }

    function stop(scene) {
        const current = owner || preparation;
        if (!current || (scene && current.scene !== scene)) return false;
        audio.retire(current.scene, 'cave');
        current.scene._wqaCaveTimingActive = false;
        current.scene._wqaCaveCueDue = 0;
        current.scene._wqaCaveCueUntil = 0;
        owner = preparation = null;
        return true;
    }

    function watch(scene) {
        scene._wqaCaveTimingActive = true;
        scene._wqaPresentation = true;
    }

    function warm(scene) {
        if (!ready(scene) || owner || preparation) return;
        const { hrtf } = preferences();
        if (audio.isPrepared(hrtf)) return;
        const current = preparation = { scene };
        watch(scene);
        if (!audio.prepare(scene, hrtf, () => preparation === current && ready(scene), () => {
            if (preparation === current) stop(scene);
        }, 'cave')) stop(scene);
    }

    function capture(scene, motion, target) {
        if (!ready(scene) || !audio.isPrepared(preferences().hrtf)) return null;
        const map = root.$gameMap;
        const event = target.point ? null : map._events[target.event ?? target.id];
        if (!target.point && (!event || event._erased)) return null;
        // Native object and route references stay in this renderer record.
        // The worker only gets the existing numeric snapshot and command copy.
        return { scene, map, event, page: event?._pageIndex, tx: event?._x, ty: event?._y, motion,
            player: root.$gamePlayer, refs: motion.patrols.map(actor => {
                const native = map._events[actor.id];
                return { id: actor.id, native, route: native._moveRoute, original: native._originalMoveRoute,
                    page: native._pageIndex, forced: actor.forced };
            }) };
    }

    function admit(captured, opening) {
        const { motion } = captured;
        const span = opening?.through - opening?.from;
        const samples = span - TIMING_CUE.lead + 1;
        if (!CARDINAL[opening?.direction] || !Number.isInteger(opening.from) ||
            opening.from < 0 || opening.from > TIMING_CUE.wait || !Number.isInteger(span) ||
            span < TIMING_CUE.minSpan || span > TIMING_CUE.maxSpan ||
            Object.prototype.toString.call(opening.stamps) !== '[object Float64Array]' ||
            opening.stamps.length !== captured.refs.length * STAMP_WIDTH * samples) return false;
        const due = motion.frame + opening.from;
        return frame() < due + samples ? { opening, due, samples } : null;
    }

    function schedule(state, due) {
        state.scene._wqaCaveCueDue = Math.max(1, due);
    }

    function start(captured, x, y, opening, repeat) {
        const { scene } = captured;
        if (!ready(scene) || repeat && (!CARDINAL[repeat.direction] || typeof repeat.refresh !== 'function')) return false;
        const admitted = admit(captured, opening);
        if (!admitted && !repeat) return false;
        stop();
        owner = { ...captured, ...admitted, x, y, repeat, queued: false };
        watch(scene);
        schedule(owner, admitted?.due ?? frame() + TIMING_CUE.interval);
        return true;
    }

    function refreshResult(state, captured, opening) {
        if (state.traversal || !live(state)) return;
        state.waiting = false;
        const admitted = captured && opening?.direction === state.repeat.direction &&
            opening.tiles === state.repeat.tiles && admit(captured, opening);
        if (admitted) Object.assign(state, captured, admitted);
        else state.opening = null;
        schedule(state, Math.max(frame(), state.nextPing || 0, admitted?.due ?? frame() + TIMING_CUE.interval));
    }

    function live(state) {
        const { scene, map, player, event } = state;
        return owner === state && ready(scene, !!state.traversal) && map === root.$gameMap && player === root.$gamePlayer &&
            player._x === state.x && player._y === state.y && (!event || (map._events[event._eventId] === event &&
                !event._erased && event._pageIndex === state.page && event._x === state.tx && event._y === state.ty));
    }

    function verifiedAt(state, now) {
        const { motion, opening, refs } = state;
        const delta = now - state.due;
        if (delta < 0 || delta >= state.samples || motion.frame + opening.through - now < TIMING_CUE.lead) return false;
        const current = captureMotion(root, root.Graphics);
        if (!current || current.speed !== motion.speed || current.dash !== motion.dash || current.barrier !== motion.barrier ||
            current.patrols.length !== refs.length ||
            Object.keys(motion.view).some(key => current.view[key] !== motion.view[key])) return false;
        for (const ref of refs) {
            const native = state.map._events[ref.id];
            const forced = native?._moveRouteForcing === true;
            if (native !== ref.native || native._pageIndex !== ref.page || (!ref.forced && forced) ||
                native._moveRoute !== (ref.forced && !forced ? ref.original : ref.route) ||
                (forced && native._originalMoveRoute !== ref.original)) return false;
        }
        return matchesMotionStamp(opening.stamps, delta * refs.length * STAMP_WIDTH, current.patrols);
    }

    function pulse(state, direction, until) {
        const source = bearing(8, direction);
        const { hrtf, caveVolume } = preferences();
        return source && audio.play(state.scene, hrtf, audio.cues.caveGo, caveVolume / 100, source,
            () => live(state) && frame() < until, status => {
                if (status < 0 && stop(state.scene)) report('Timing audio is unavailable. Request directions again.');
            }, 'cave');
    }

    function advancing(state, now) {
        const { traversal } = state;
        if (now > traversal.by) return stop(state.scene);
        if (!pulse(state, traversal.steps[traversal.index], Math.min(now + CUE_LIFETIME, traversal.by + 1)))
            return stop(state.scene);
        if (owner === state) schedule(state, Math.min(now + TIMING_CUE.interval, traversal.by + 1));
    }

    function play(state) {
        if (owner !== state) return;
        const now = frame();
        if (!live(state)) return stop(state.scene);
        if (state.traversal) return advancing(state, now);
        if (!state.opening || !verifiedAt(state, now)) {
            if (state.repeat) {
                state.opening = null;
                state.waiting = state.repeat.refresh(state);
                if (!state.waiting) schedule(state, now + TIMING_CUE.interval);
                return;
            }
            stop(state.scene);
            return report('Patrol timing changed. Request directions again.');
        }
        const until = Math.min(now + CUE_LIFETIME, state.motion.frame + state.opening.through - 22);
        if (!pulse(state, state.opening.direction, until)) return stop(state.scene);
        if (owner !== state) return;
        state.startUntil = state.motion.frame + state.opening.through;
        if (state.repeat) {
            state.nextPing = now + TIMING_CUE.interval;
            schedule(state, state.nextPing);
        } else state.scene._wqaCaveCueUntil = until;
    }

    function moved(scene, direction) {
        const state = owner;
        if (!state || state.scene !== scene) return;
        // This runs after native canPass and before the tile is reserved.
        // Follow the checked sequence through accepted movement only.
        if (!live(state)) return stop(scene);
        const now = frame();
        const opening = state.opening;
        if (!state.traversal) {
            if (!state.repeat || !opening || !(now <= state.startUntil) ||
                direction !== opening.direction || !Number.isInteger(opening.tiles) ||
                opening.tiles < 2 || opening.tiles > 12) return stop(scene);
            const steps = opening.headings ? opening.headings.map(heading => DIRECTIONS[heading]) :
                Array(opening.tiles).fill(opening.direction);
            if (steps.length !== opening.tiles || steps[0] !== direction ||
                steps.some(step => !CARDINAL[step])) return stop(scene);
            state.traversal = { steps, index: 0, by: state.startUntil };
            state.waiting = false;
        }
        const { traversal, player } = state;
        if (direction !== traversal.steps[traversal.index] || now > traversal.by) return stop(scene);
        const next = traversal.steps[++traversal.index];
        if (next === undefined) return stop(scene);
        const speed = player._moveSpeed + (player._dashing ? 1 : 0);
        if (speed < state.motion.speed || speed > state.motion.speed + (state.motion.dash ? 1 : 0)) return stop(scene);
        const tileFrames = 256 / 2 ** speed;
        const turning = next !== direction;
        state.x += CARDINAL[direction].x;
        state.y += CARDINAL[direction].y;
        traversal.by = now + tileFrames + (opening.headings && turning ? TIMING_CUE.turnGrace : 0);
        if (turning) {
            audio.retire(scene, 'cave');
            schedule(state, now + tileFrames - 1);
        } else if (!scene._wqaCaveCueDue) schedule(state, now + 1);
    }

    return {
        warm, capture, start, refreshResult, stop, moved,
        cancelPlan(scene, stepping = false) {
            if (owner?.scene === scene && !(stepping && owner.traversal)) stop(scene);
        },
        active: scene => owner?.scene === scene || preparation?.scene === scene,
        pose(scene) { if (owner?.scene === scene && !live(owner)) stop(scene); },
        update(scene) {
            const state = owner;
            if (!state || state.scene !== scene || state.queued || state.waiting) return;
            const renderer = root.Graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return stop(scene);
            state.queued = true;
            scene._wqaCaveCueDue = 0;
            renderer.once('postrender', () => {
                state.queued = false;
                try { play(state); } catch { if (owner === state) stop(scene); }
            });
        }
    };
}

module.exports = { createCaveTiming };
