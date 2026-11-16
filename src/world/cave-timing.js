'use strict';

const { timedCave, captureMotion, TIMING_CUE, STAMP_WIDTH, matchesMotionStamp } = require('./puzzles/cave');
const { CARDINAL, bearing } = require('./spatial-direction');

const CUE_LIFETIME = 8;

function createCaveTiming(root, fieldReady, audio, preferences, report) {
    let owner = null;
    let preparation = null;
    const frame = () => root.Graphics.frameCount;

    function ready(scene) {
        const { enabled, caveTiming, caveVolume } = preferences();
        return enabled && caveTiming && caveVolume > 0 && timedCave(root.$gameMap?._mapId) && fieldReady(scene);
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
        if (!live(state)) return;
        state.waiting = false;
        const admitted = captured && opening?.direction === state.repeat.direction &&
            opening.tiles === state.repeat.tiles && admit(captured, opening);
        if (admitted) Object.assign(state, captured, admitted);
        else state.opening = null;
        schedule(state, Math.max(frame(), state.nextPing || 0, admitted?.due ?? frame() + TIMING_CUE.interval));
    }

    function live(state) {
        const { scene, map, player, event } = state;
        return owner === state && ready(scene) && map === root.$gameMap && player === root.$gamePlayer &&
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

    function play(state) {
        if (owner !== state) return;
        const now = frame();
        if (!live(state)) return stop(state.scene);
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
        const facing = state.player._direction;
        const source = bearing(facing, state.opening.direction);
        const { hrtf, caveVolume } = preferences();
        const until = Math.min(now + CUE_LIFETIME, state.motion.frame + state.opening.through - 22);
        state.facing = facing;
        if (!source || !audio.play(state.scene, hrtf, audio.cues.caveGo, caveVolume / 100, source,
            () => live(state) && frame() < until && state.player._direction === facing, status => {
                if (status < 0 && stop(state.scene)) report('Timing audio is unavailable. Request directions again.');
            }, 'cave')) return stop(state.scene);
        if (owner !== state) return;
        if (state.repeat) {
            state.nextPing = now + TIMING_CUE.interval;
            schedule(state, state.nextPing);
        } else state.scene._wqaCaveCueUntil = until;
    }

    return {
        warm, capture, start, refreshResult, stop,
        cancelPlan(scene) { if (owner?.scene === scene) stop(scene); },
        active: scene => owner?.scene === scene || preparation?.scene === scene,
        pose(scene) { if (owner?.scene === scene && owner.facing !== undefined) stop(scene); },
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
