'use strict';

const { timedCave, captureMotion, TIMING_CUE, STAMP_WIDTH, matchesMotionStamp } = require('./puzzles/cave');
const { CARDINAL, bearing } = require('./spatial-direction');
const { DIRECTIONS } = require('./geometry.cjs');

const { patrolPhaseMatches, MANUAL_HORIZON, REACTION_FRAMES, MANUAL_PAUSE_FRAMES } = require('./puzzles/patrol-line-playback');

const CUE_LIFETIME = 8;
const MANUAL_LEAD_IN = 120;
const HEADINGS = { 2: 'south', 4: 'west', 6: 'east', 8: 'north' };

function createCaveTiming(root, fieldReady, audio, preferences, report, diagnostics) {
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
        audio.retire(current.scene, 'caveStop');
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

    function capture(scene, motion, target, automatic = false) {
        if (automatic ? !fieldReady(scene) : !ready(scene) || !audio.isPrepared(preferences().hrtf)) return null;
        const map = root.$gameMap;
        const event = target.point ? null : map._events[target.event ?? target.id];
        if (!target.point && (!event || event._erased)) return null;
        // Native object and route references stay in this renderer record.
        // The worker only gets the existing numeric snapshot and command copy.
        return { scene, map, event, automatic, page: event?._pageIndex, tx: event?._x, ty: event?._y, motion,
            player: root.$gamePlayer, refs: motion.patrols.map(actor => {
                const native = map._events[actor.id];
                return { id: actor.id, native, route: native._moveRoute, original: native._originalMoveRoute,
                    page: native._pageIndex, forced: actor.forced };
            }) };
    }

    function admit(captured, opening) {
        const { motion } = captured;
        const distractionEscape = captured.map._mapId === 200 && (opening?.escape || opening?.distraction || opening?.pickup) &&
            opening.turnGrace === (captured.automatic ? 0 : opening.distraction ? TIMING_CUE.turnGrace : TIMING_CUE.earlyTurnGrace);
        const urgent = captured.map._mapId === 200 && opening?.escape && opening.urgent === true &&
            opening.lead === (captured.automatic ? TIMING_CUE.automaticEscapeLead : TIMING_CUE.escapeLead);
        const lead = urgent ? opening.lead : TIMING_CUE.lead;
        const span = opening?.through - opening?.from;
        const minimum = urgent ? captured.automatic ? TIMING_CUE.automaticEscapeSpan : TIMING_CUE.escapeSpan :
            opening?.pace ? TIMING_CUE.paceSpan : TIMING_CUE.minSpan;
        const samples = span - lead + 1;
        if (!CARDINAL[opening?.direction] || !Number.isInteger(opening.from) ||
            opening.from < 0 || opening.from > (opening.pace ? TIMING_CUE.paceWait : TIMING_CUE.wait) || !Number.isInteger(span) ||
            span < minimum || span > TIMING_CUE.maxSpan || opening.urgent && !urgent ||
            (opening.turnGrace !== undefined && !distractionEscape && (opening.turnGrace !== TIMING_CUE.earlyTurnGrace ||
                opening.escape || !Array.isArray(opening.headings))) ||
            Object.prototype.toString.call(opening.stamps) !== '[object Float64Array]' ||
            opening.stamps.length !== captured.refs.length * STAMP_WIDTH * samples) return false;
        const due = motion.frame + opening.from;
        return frame() < due + samples ? { opening, due, samples, lead } : null;
    }

    function schedule(state, due) {
        state.scene._wqaCaveCueDue = Math.max(1, due);
    }

    function start(captured, x, y, opening, repeat, follow) {
        const { scene } = captured;
        if (!ready(scene) || repeat && !CARDINAL[repeat.direction]) return false;
        const admitted = admit(captured, opening);
        if (!admitted && !repeat?.refresh) return false;
        stop();
        owner = { ...captured, ...admitted, x, y, repeat, follow, spokenLeg: -1, queued: false };
        watch(scene);
        schedule(owner, admitted?.due ?? frame() + TIMING_CUE.interval);
        return true;
    }

    function startManual(captured, line, x, y, plan, endText, follow) {
        const { scene, motion } = captured;
        const { legs, starts, stamps, firstPause } = plan;
        const span = MANUAL_HORIZON + 1;
        const due = Math.max(frame(), motion.frame + MANUAL_LEAD_IN);
        if (!ready(scene) || !line || line.frame !== motion.frame || ![0, MANUAL_PAUSE_FRAMES].includes(firstPause) ||
            !Array.isArray(legs) ||
            !legs.length || legs.length > 8 || legs.some(({ direction, tiles }) =>
                !CARDINAL[direction] || !Number.isInteger(tiles) || tiles < 1 || tiles > 12) ||
            Object.prototype.toString.call(starts) !== '[object Uint16Array]' || starts.length !== span * legs.length ||
            Object.prototype.toString.call(stamps) !== '[object Float64Array]' ||
            stamps.length !== span * line.refs.length * STAMP_WIDTH || !starts[due - motion.frame]) return false;
        stop();
        owner = { ...captured, x, y, follow, spokenLeg: -1, queued: false,
            manual: { line, legs, starts, stamps, span, endText, firstPause, index: 0, taken: 0, due, until: -1 } };
        watch(scene);
        schedule(owner, due);
        return true;
    }

    function startApproach(captured, x, y, legs, follow) {
        if (!captured || !fieldReady(captured.scene) || !Array.isArray(legs) || !legs.length || legs.length > 9) return false;
        const steps = [];
        for (const { direction, tiles } of legs) {
            if (!CARDINAL[direction] || !Number.isInteger(tiles) || tiles < 1 || steps.length + tiles > 128) return false;
            for (let at = 0; at < tiles; at++) steps.push(direction);
        }
        stop();
        owner = { ...captured, x, y, follow, spokenLeg: -1, queued: false, approach: { steps, index: 0 } };
        watch(captured.scene);
        return true;
    }

    function wait(captured, x, y, follow) {
        if (!startApproach(captured, x, y, [{ direction: 2, tiles: 1 }], follow)) return false;
        owner.approach = { steps: [], index: 0 };
        owner.released = true;
        schedule(owner, frame() + 18);
        return true;
    }

    function leg(state) {
        if (state.manual) {
            const { index, taken, legs } = state.manual;
            const current = legs[index];
            return current ? { key: index, direction: current.direction, tiles: current.tiles - taken } : null;
        }
        const course = state.approach || state.traversal;
        const source = state.opening || state.repeat;
        const steps = course?.steps || source?.headings?.map(heading => DIRECTIONS[heading]) ||
            (source && Array(source.tiles).fill(source.direction));
        const index = course?.index || 0;
        if (!steps || index >= steps.length) return null;
        const direction = steps[index];
        let first = index, end = index + 1;
        while (first && steps[first - 1] === direction) first--;
        while (end < steps.length && steps[end] === direction) end++;
        return { key: first, direction, tiles: end - index };
    }

    function describe(state, force = false) {
        const current = leg(state);
        if (!current || !HEADINGS[current.direction] || current.tiles < 1 || !force && current.key === state.spokenLeg) return '';
        state.spokenLeg = current.key;
        return current.tiles + ' ' + HEADINGS[current.direction] + '.';
    }

    function announce(state) {
        if (!state.follow) return;
        const text = describe(state);
        if (text) report(text, true);
    }

    function playApproach(state, now) {
        if (state.approach.index < state.approach.steps.length) return announce(state);
        if (!state.released) { stopCue(state, now, state.approach.index - 1); state.released = true; }
        if (state.player._x !== state.player._realX || state.player._y !== state.player._realY)
            return schedule(state, now + 1);
        finish(state);
    }

    function refreshResult(state, captured, opening) {
        if (state.traversal || !live(state)) return;
        state.waiting = false;
        const admitted = captured && opening?.direction === state.repeat.direction &&
            opening.tiles === state.repeat.tiles && opening.pace === state.repeat.pace && admit(captured, opening);
        if (admitted) Object.assign(state, captured, admitted);
        else state.opening = null;
        schedule(state, Math.max(frame(), state.nextPing || 0, admitted?.due ?? frame() + TIMING_CUE.interval));
    }

    function live(state) {
        const { scene, map, player, event } = state;
        return owner === state && (state.approach ? fieldReady(scene, true) : ready(scene, !!(state.traversal || state.manual))) && map === root.$gameMap && player === root.$gamePlayer &&
            player._x === state.x && player._y === state.y && (!event || (map._events[event._eventId] === event &&
                !event._erased && event._pageIndex === state.page && event._x === state.tx && event._y === state.ty));
    }

    function verifiedAt(state, now) {
        const { motion, opening, refs } = state;
        const delta = now - state.due;
        if (delta < 0 || delta >= state.samples || motion.frame + opening.through - now < state.lead) return false;
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
                if (status < 0 && owner === state) stop(state.scene);
            }, 'cave');
    }

    function manualStopped(state, reason = 'window') {
        diagnostics?.(state.scene, 'caveTimingLost', state.manual.index, reason);
        stop(state.scene);
    }

    function manualPose(state, now) {
        const { player, map, manual } = state;
        const { line, stamps } = manual;
        return line.tilemap === root.$dataMap && player.realMoveSpeed() === line.speed &&
            patrolPhaseMatches(line, map, stamps, now - line.frame);
    }

    function stopCue(state, now, leg) {
        const { scene } = state;
        if (!ready(scene, true)) return;
        const { hrtf, caveVolume } = preferences();
        // The native move has reserved the last tile. Play while Wendy
        // approaches it so movement can be released before the next step.
        audio.retire(scene, 'cave');
        // Keep the original impact sample, with extra gain and a lower
        // pitch to make the stop distinct from background bumps and steps.
        const queued = audio.play(scene, hrtf, audio.cues.wallBump, Math.min(1, caveVolume * 0.016), [0, 0, 1],
            () => live(state) && frame() < now + CUE_LIFETIME,
            status => diagnostics?.(scene, 'caveStopCue', leg, status), 'caveStop', 0.8);
        if (!queued) diagnostics?.(scene, 'caveStopCue', leg, 'notQueued');
    }

    function playManual(state, now) {
        const { manual } = state;
        if (manual.release) {
            manual.release = false;
            stopCue(state, now, manual.index - 1);
            announce(state);
            return schedule(state, manual.due);
        }
        if (manual.taken) {
            if (now > manual.due) return manualStopped(state, 'lateStep');
            if (!pulse(state, manual.legs[manual.index].direction, Math.min(now + CUE_LIFETIME, manual.due + 1)))
                return manualStopped(state, 'audio');
            return schedule(state, manual.due + 1);
        }
        if (manual.index === manual.legs.length) return finish(state, manual.endText);
        const time = Math.max(now, manual.due) - manual.line.frame;
        const cue = time < manual.span ? manual.starts[manual.index * manual.span + time] : 0;
        if (!cue) {
            // One emitted ping can still be actionable even if there is
            // no later place to emit another full reaction window.
            if (now <= manual.until) return schedule(state, manual.until + 1);
            return manualStopped(state);
        }
        const next = cue + manual.line.frame;
        if (next > now) return schedule(state, next);
        if (!manualPose(state, now)) return manualStopped(state, 'patrolChanged');
        if (!pulse(state, manual.legs[manual.index].direction, now + CUE_LIFETIME)) return manualStopped(state, 'audio');
        announce(state);
        manual.cued = now;
        manual.until = now + REACTION_FRAMES;
        schedule(state, now + TIMING_CUE.interval);
    }

    function finish(state, text) {
        if (state.follow && (state.player._x !== state.player._realX || state.player._y !== state.player._realY))
            return schedule(state, frame() + 1);
        stop(state.scene);
        if (text) report(text, true);
        else state.follow?.complete?.();
    }

    function manualMoved(state, direction, now) {
        const { manual } = state;
        const leg = manual.legs[manual.index];
        const inTime = manual.taken ? now === manual.due : now > manual.cued && now <= manual.until;
        if (!leg || direction !== leg.direction) return manualStopped(state, 'direction');
        if (!inTime) return manualStopped(state, 'stepOutsideWindow');
        if (!manualPose(state, now)) return manualStopped(state, 'patrolChanged');
        state.x += CARDINAL[direction].x;
        state.y += CARDINAL[direction].y;
        manual.due = now + 256 / 2 ** manual.line.speed;
        if (++manual.taken < leg.tiles) return schedule(state, now);
        manual.taken = 0;
        manual.until = -1;
        manual.index++;
        if (manual.index === 1 && manual.index < manual.legs.length) manual.due += manual.firstPause;
        audio.retire(state.scene, 'cave');
        manual.release = true;
        schedule(state, now);
    }

    function advancing(state, now) {
        const { traversal } = state;
        if (now > traversal.by) {
            diagnostics?.(state.scene, 'caveTimingLost', traversal.index, 'crossingDeadline');
            // Let the native patrol and capture sequence continue silently.
            return stop(state.scene);
        }
        if (now === traversal.by) return schedule(state, traversal.by + 1);
        announce(state);
        if (!pulse(state, traversal.steps[traversal.index], Math.min(now + CUE_LIFETIME, traversal.by + 1)))
            return stop(state.scene);
        if (owner === state) schedule(state, Math.min(now + TIMING_CUE.interval, traversal.by + 1));
    }

    function play(state) {
        if (owner !== state) return;
        const now = frame();
        if (!live(state)) return stop(state.scene);
        if (state.approach) return playApproach(state, now);
        if (state.pocketDue) {
            if (now >= state.pocketDue) {
                diagnostics?.(state.scene, 'cavePocketReached', 0, 'settled');
                return finish(state, state.repeat?.endText);
            }
            stopCue(state, now, state.traversal.index - 1);
            return schedule(state, state.pocketDue);
        }
        if (state.manual) return playManual(state, now);
        if (state.traversal) return advancing(state, now);
        if (!state.opening || !verifiedAt(state, now)) {
            // A ping's certified reaction window can outlast the stamp
            // used to play it. Do not erase that opening during refresh.
            if (state.repeat?.stopAtPocket && state.opening &&
                now >= state.due + state.samples && now <= state.startUntil)
                return schedule(state, state.startUntil + 1);
            if (state.repeat?.refresh) {
                state.opening = null;
                state.startUntil = -1;
                state.waiting = state.repeat.refresh(state);
                if (!state.waiting) schedule(state, now + TIMING_CUE.interval);
                return;
            }
            return stop(state.scene);
        }
        const until = Math.min(now + CUE_LIFETIME, state.motion.frame + state.opening.through - 22);
        if (!pulse(state, state.opening.direction, until)) return stop(state.scene);
        if (owner !== state) return;
        announce(state);
        state.cued = now;
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
        if (state.manual) return manualMoved(state, direction, now);
        if (state.approach) {
            const path = state.approach;
            if (path.steps[path.index] !== direction) return stop(scene);
            state.x += CARDINAL[direction].x;
            state.y += CARDINAL[direction].y;
            path.index++;
            return schedule(state, now);
        }
        const opening = state.opening;
        if (!state.traversal) {
            if (!opening || !(now > state.cued && now <= state.startUntil) ||
                direction !== opening.direction || !Number.isInteger(opening.tiles) ||
                opening.tiles < 1 || opening.tiles > (opening.distraction && state.map._mapId === 200 ? 32 : 12)) return stop(scene);
            const steps = opening.headings ? opening.headings.map(heading => DIRECTIONS[heading]) :
                Array(opening.tiles).fill(opening.direction);
            if (steps.length !== opening.tiles || steps[0] !== direction ||
                steps.some(step => !CARDINAL[step])) return stop(scene);
            state.traversal = { steps, index: 0, by: state.startUntil };
            state.waiting = false;
            scene._wqaCaveCueUntil = 0;
            diagnostics?.(scene, 'caveCrossing', 0, 'started');
        }
        const { traversal, player } = state;
        if (direction !== traversal.steps[traversal.index] || now > traversal.by) return stop(scene);
        const next = traversal.steps[++traversal.index];
        if (next === undefined && opening.terminal) return stop(scene);
        const speed = player.realMoveSpeed();
        if (speed !== state.motion.speed) return stop(scene);
        const tileFrames = 256 / 2 ** speed;
        const turning = next !== direction;
        state.x += CARDINAL[direction].x;
        state.y += CARDINAL[direction].y;
        if (next === undefined) {
            state.pocketDue = now + tileFrames - 1;
            return schedule(state, now);
        }
        const grace = opening.escape ? turning ? opening.turnGrace ?? TIMING_CUE.escapeTurnGrace : TIMING_CUE.escapeStepGrace :
            opening.headings && turning ? opening.turnGrace ?? TIMING_CUE.turnGrace : 0;
        traversal.by = now + tileFrames + grace;
        if (turning) audio.retire(scene, 'cave');
        // Every accepted step refreshes the upcoming heading. On a turn
        // the game finishes this tile before accepting the new direction.
        schedule(state, now);
    }

    return {
        warm, capture, start, startManual, startApproach, wait, refreshResult, stop, moved,
        current: state => owner === state,
        describe(scene) { return owner?.scene === scene ? describe(owner, true) : ''; },
        repeatDirections(scene) {
            const state = owner;
            if (state?.scene !== scene || !live(state)) return false;
            if (state.follow) {
                const text = describe(state, true);
                if (text) report(text, true);
                return true;
            }
            // Rechecking in the patrol lane must not replace the verified
            // sequence or talk over the next ping in a timed (possibly same-direction) wait.
            if (state.manual && (state.manual.index || state.manual.taken)) return true;
            if (!state.repeat?.stopAtPocket || !state.traversal) return false;
            const { steps, index } = state.traversal;
            const legs = [];
            for (let at = index; at < steps.length; at++) {
                const direction = steps[at];
                const last = legs[legs.length - 1];
                if (last?.direction === direction) last.tiles++;
                else legs.push({ direction, tiles: 1 });
            }
            if (!legs.length) return true;
            report('Keep moving. ' + legs.map(leg => leg.tiles + ' ' + HEADINGS[leg.direction]).join(', then ') + '.', true);
            return true;
        },
        automaticGate(captured, opening) {
            const state = captured && admit(captured, opening);
            if (!state) return null;
            Object.assign(state, captured);
            let checked = -1;
            return () => {
                const now = frame();
                // The forecast starts after the guard update for this
                // stamp. Its first player step is on the following update.
                if (checked + 1 === now && checked >= 0) return 1;
                if (now < state.due || now === checked) return 0;
                if (!verifiedAt(state, now)) return -1;
                checked = now;
                return 0;
            };
        },
        cancelPlan(scene, stepping = false) {
            if (owner?.scene === scene && !(stepping && (owner.traversal || owner.manual || owner.approach || owner.follow))) stop(scene);
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
