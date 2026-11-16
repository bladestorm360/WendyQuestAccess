'use strict';

const { DIRECTIONS, indexOf, offset, step, clipRectangle } = require('../geometry.cjs');
const { routeGoals, inside, solveWorldRoute } = require('../routes.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('./motion-world.cjs');
const { TIMING_CUE, STAMP_WIDTH, writeMotionStamp } = require('./patrol-motion.cjs');

const START_WINDOW = 60;
const MIN_START_WINDOW = TIMING_CUE.minSpan;
const MAX_STEPS = 3;
const PATROL_LANDING_HOLD = 90;

function patrolCoverage(world, patrols, cancelled) {
    const unsafe = new Uint8Array(world.cells.length);
    const seen = new Uint8Array(unsafe.length);
    const queue = new Uint16Array(unsafe.length);
    // Ignore other actors as stopping points. A guard can attempt contact
    // across an impassable edge, but that edge stops further movement.
    for (const actor of patrols) {
        if (actor.forced || actor.jump || actor.through) return null;
        if (!actor.hazard && !actor.normal) continue;
        const { commands, repeat, skippable } = actor.route;
        const origin = indexOf(world, actor.x, actor.y);
        if (origin < 0 || commands.some(([code]) => code > 4 && (code < 15 || code > 19))) return null;
        unsafe[origin] = 1;
        if (!actor.autonomous) continue;
        if (!repeat) return null;
        if (!skippable) {
            // A blocked non-skippable command retries in the same phase.
            // Trace one cycle from the current reserved tile.
            let cell = origin;
            for (let n = 0; n < commands.length; n++) {
                const [code] = commands[(actor.index + n) % commands.length];
                if (code === 0 || code > 4) continue;
                cell = offset(world, cell, code - 1);
                if (cell < 0) return null;
                unsafe[cell] = 1;
            }
            if (cell !== origin) return null;
            continue;
        }
        // Skipped moves can cause drift. Traverse every tile this route
        // can reach using the terrain edges and its authored directions.
        const headings = [...new Set(commands.filter(([code]) => code >= 1 && code <= 4).map(([code]) => code - 1))];
        seen.fill(0);
        seen[origin] = 1;
        queue[0] = origin;
        let end = 1;
        for (let head = 0; head < end; head++) {
            if ((head & 63) === 0 && cancelled()) return null;
            const cell = queue[head];
            for (const heading of headings) {
                const next = offset(world, cell, heading);
                if (next < 0) continue;
                unsafe[next] = 1;
                if (!seen[next] && (world.cells[cell] & (1 << heading)) &&
                    (world.cells[next] & (1 << (3 - heading)))) {
                    seen[next] = 1;
                    queue[end++] = next;
                }
            }
        }
    }
    return unsafe;
}

function safeRoute(world, request, unsafe, origin, cancelled) {
    if (!unsafe || unsafe[origin]) return null;
    const blocked = world.blocked.map((value, cell) => value || unsafe[cell]);
    return solveWorldRoute({ ...world, blocked }, request, cancelled);
}

function distancesToApproach(world, goals, origin, area, cancelled) {
    const distances = new Int16Array(goals.length).fill(-1);
    const queue = new Uint16Array(goals.length);
    let end = 0;
    for (let cell = 0; cell < goals.length; cell++) {
        if (goals[cell] && cell !== origin && (!area || inside(world, cell, area))) {
            distances[cell] = 0;
            queue[end++] = cell;
        }
    }
    for (let head = 0; head < end; head++) {
        if ((head & 63) === 0 && cancelled()) return null;
        const cell = queue[head];
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const prior = offset(world, cell, 3 - heading);
            // A detour must still reach the approach if the current tile
            // remains closed behind the player. Reject dead-end retreats.
            if (prior < 0 || prior === origin || distances[prior] >= 0 ||
                (area && !inside(world, prior, area)) || step(world, prior, heading) !== cell) continue;
            distances[prior] = distances[cell] + 1;
            queue[end++] = prior;
        }
    }
    return distances;
}

function crossingStops(world) {
    const stops = new Uint8Array(world.cells.length);
    for (const event of world.events) {
        if (event.normal || event.erased || !event.action || (event.trigger !== 1 && event.trigger !== 2)) continue;
        const [left, top, right, bottom] = clipRectangle(world,
            event.rectangle || [event.x, event.y, event.x, event.y]);
        for (let row = top; row <= bottom; row++)
            stops.fill(1, row * world.width + left, row * world.width + right + 1);
    }
    return stops;
}

function safeCrossingCandidates(world, goals, origin, unsafe, stops, area, cancelled) {
    if (!unsafe || unsafe[origin]) return [];
    const distances = new Int16Array(goals.length).fill(-1);
    const queue = new Uint16Array(goals.length);
    let end = 0;
    let best = Infinity;
    const options = [];
    for (let cell = 0; cell < goals.length; cell++) {
        if (goals[cell] && !unsafe[cell] && (!area || inside(world, cell, area))) {
            distances[cell] = 0;
            queue[end++] = cell;
        }
    }
    for (let head = 0; head < end; head++) {
        if ((head & 63) === 0 && cancelled()) return [];
        const cell = queue[head];
        const score = distances[cell] + 1;
        if (score > best) break;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            let next = cell;
            for (let count = 1; count <= MAX_STEPS; count++) {
                const prior = offset(world, next, 3 - heading);
                if (prior < 0 || (area && !inside(world, prior, area)) || step(world, prior, heading) !== next) break;
                if (prior === origin) {
                    options.push({ heading, count, cell, terminal: stops[cell] === 1, score });
                    best = score;
                    break;
                }
                // Only stable landings are graph nodes. Each edge can
                // cross a patrol lane in one straight, timed movement.
                if (stops[prior]) break;
                if (!unsafe[prior] && distances[prior] < 0) {
                    distances[prior] = score;
                    queue[end++] = prior;
                }
                next = prior;
            }
        }
    }
    return options.sort((a, b) => a.count - b.count || a.heading - b.heading);
}

function crossingCandidates(world, origin, distances, stops) {
    const candidates = [];
    for (let heading = 0; heading < DIRECTIONS.length; heading++) {
        let cell = origin;
        let remaining = Infinity;
        for (let count = 1; count <= MAX_STEPS; count++) {
            cell = step(world, cell, heading);
            if (cell < 0 || distances[cell] < 0 || distances[cell] >= remaining) break;
            remaining = distances[cell];
            const terminal = stops[cell] === 1;
            candidates.push({ heading, count, cell, terminal, score: remaining + count });
            if (terminal || remaining === 0) break;
        }
    }
    return candidates.sort((a, b) => a.score - b.score || a.heading - b.heading || b.count - a.count);
}

function simulatePrefix(state, candidate, speed, dashMask, cancelled) {
    const { heading, count, terminal } = candidate;
    let moved = 0;
    let hold = Math.max(256 / 2 ** speed, candidate.hold || 0);
    // The slowest accepted native speed takes at most 32 updates per tile.
    const limit = count * 32 + hold + 1;
    for (let tick = 0; tick < limit; tick++) {
        if (cancelled()) return false;
        const { player } = state;
        const standing = player.x === player.rx && player.y === player.ry;
        if (standing && moved === count && (terminal || hold-- === 0)) return true;
        if (advancePatrols(state) !== 'settled') return false;
        const next = standing && moved < count ? heading : null;
        if (next !== null) player.speed = speed + ((dashMask >> moved++) & 1);
        if (advancePlayer(state, next) !== 'settled') return false;
    }
    return false;
}

function safeStart(world, waiting, motion, candidate, cancelled) {
    const profiles = motion.dash === true ? 1 << candidate.count : 1;
    for (let mask = 0; mask < profiles; mask++) {
        const run = startMotion(world, waiting.patrols, waiting.player, waiting.view);
        if (!simulatePrefix(run, candidate, motion.speed, mask, cancelled)) return false;
    }
    return true;
}

function checkedStartWindow(world, motion, player, candidate, cancelled) {
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    for (let delay = 0; delay <= START_WINDOW; delay++) {
        if (!safeStart(world, waiting, motion, candidate, cancelled)) return delay - 1;
        if (advancePatrols(waiting) !== 'settled') return delay;
    }
    return START_WINDOW;
}

function openingFor(world, motion, player, choices, cancelled) {
    // Validate every walk/dash combination across the complete straight
    // crossing and its settling time. Do not strand Wendy mid-patrol lane.
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    const consecutive = new Uint8Array(choices.length);
    const stride = motion.patrols.length * STAMP_WIDTH;
    const ringLength = TIMING_CUE.maxSpan + 1;
    const history = new Float64Array(stride * ringLength);
    const wait = motion.cueSample ? TIMING_CUE.interval : TIMING_CUE.wait;
    for (let delay = 0; delay <= wait + MIN_START_WINDOW; delay++) {
        if (cancelled()) return null;
        writeMotionStamp(history, (delay % ringLength) * stride, waiting.patrols);
        for (let i = 0; i < choices.length; i++) {
            const candidate = choices[i];
            if (!safeStart(world, waiting, motion, candidate, cancelled)) {
                consecutive[i] = 0;
                continue;
            }
            if (++consecutive[i] <= MIN_START_WINDOW) continue;
            const from = delay - MIN_START_WINDOW;
            let through = delay;
            while (through - from < TIMING_CUE.maxSpan) {
                if (advancePatrols(waiting) !== 'settled' || !safeStart(world, waiting, motion, candidate, cancelled)) break;
                through++;
                writeMotionStamp(history, (through % ringLength) * stride, waiting.patrols);
            }
            const samples = through - from - TIMING_CUE.lead + 1;
            const stamps = new Float64Array(stride * samples);
            for (let frame = 0; frame < samples; frame++) {
                const begin = ((from + frame) % ringLength) * stride;
                stamps.set(history.subarray(begin, begin + stride), frame * stride);
            }
            return { direction: DIRECTIONS[candidate.heading], tiles: candidate.count, hold: candidate.hold, terminal: candidate.terminal,
                alternate: candidate.heading !== choices[0].heading, from, through, stamps };
        }
        if (advancePatrols(waiting) !== 'settled') break;
    }
    return null;
}

function previewCrossing(geometry, live, request, cancelled = () => false) {
    const { motion } = request;
    if (!Array.isArray(motion?.patrols) || !Number.isInteger(motion.speed) || motion.speed < 3 || motion.speed > 6)
        return { status: 'unavailable' };
    const world = motionWorld(geometry, live, motion.patrols, cancelled, motion.barrier);
    if (!world) return { status: cancelled() ? 'cancelled' : 'unavailable' };
    const origin = indexOf(world.player, request.x, request.y);
    const area = request.area && clipRectangle(world.player, request.area);
    if (origin < 0 || (area && !inside(world.player, origin, area))) return { status: 'unavailable' };
    // Guide targets are ordered by the verified room state. Test a small
    // set against the same static collision, then simulate one crossing.
    const alternatives = Array.isArray(request.guideOptions) && request.guideOptions.length <= 6
        ? request.guideOptions : [request];
    let selected;
    let candidates;
    let safeCrossing;
    const stops = crossingStops(world.player);
    const { patrolGuidance, timingDirection } = request;
    const fixedHeading = DIRECTIONS.indexOf(timingDirection);
    const unsafe = patrolGuidance && fixedHeading < 0 && !motion.barrier &&
        patrolCoverage(world.patrol, motion.patrols, cancelled);
    if (cancelled()) return { status: 'cancelled' };
    for (const option of alternatives) {
        const goals = routeGoals(world.player, option, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (!goals) continue;
        const guide = request.guideOptions ? { guideEvent: option.event } : {};
        if (goals[origin]) return { status: 'ready', distance: 0, legs: [], ...guide,
            arrival: { x: request.x, y: request.y, facing: goals[origin] === 1 ? null : goals[origin] } };
        if (unsafe) {
            const clear = safeRoute(world.player, { ...request, ...option }, unsafe, origin, cancelled);
            if (cancelled()) return { status: 'cancelled' };
            if (clear?.status === 'ready' || clear?.status === 'interrupted') return { ...clear, ...guide };
        }
        const distances = distancesToApproach(world.player, goals, origin, area, cancelled);
        if (!distances) return { status: 'cancelled' };
        candidates = crossingCandidates(world.player, origin, distances, stops);
        if (fixedHeading >= 0) {
            // Revalidate the exact spoken crossing even if it took a
            // longer approach to leave the patrol lane in one movement.
            const count = request.timingTiles || 1;
            if (count < 1 || count > MAX_STEPS || !Number.isInteger(count)) return { status: 'unavailable' };
            let cell = origin;
            for (let n = 0; n < count; n++) {
                cell = step(world.player, cell, fixedHeading);
                if (cell < 0 || (n < count - 1 && stops[cell])) return { status: 'unavailable' };
            }
            candidates = [{ heading: fixedHeading, count, cell, terminal: stops[cell] === 1,
                hold: request.timingHold === PATROL_LANDING_HOLD ? PATROL_LANDING_HOLD : 0 }];
        } else if (unsafe) {
            const linked = safeCrossingCandidates(world.player, goals, origin, unsafe, stops, area, cancelled);
            if (cancelled()) return { status: 'cancelled' };
            safeCrossing = linked[0];
            if (safeCrossing) candidates = linked;
        }
        if (!candidates.length) continue;
        if (patrolGuidance) candidates = candidates.filter(candidate => candidate.heading === candidates[0].heading);
        selected = guide;
        if (unsafe && !unsafe[origin]) {
            const { heading, count } = candidates[0];
            let cell = origin;
            let tiles = 0;
            while (tiles < count) {
                cell = step(world.player, cell, heading);
                if (unsafe[cell]) break;
                tiles++;
            }
            if (tiles) return { status: 'patrolApproach', direction: DIRECTIONS[heading], tiles,
                terminal: tiles === count && candidates[0].terminal, ...guide };
        }
        break;
    }
    if (!selected) return { status: 'unreachable' };
    const player = { x: request.x, y: request.y, rx: request.x, ry: request.y, jump: 0, speed: motion.speed };
    const crossing = patrolGuidance && (fixedHeading >= 0 ? candidates[0] : safeCrossing ||
        (unsafe && candidates.find(candidate => !unsafe[candidate.cell] || candidate.terminal)) ||
        candidates[0]);
    if (crossing && fixedHeading < 0 && unsafe?.[crossing.cell] && !crossing.terminal)
        crossing.hold = PATROL_LANDING_HOLD;
    if (request.timingCue === true) {
        const choices = crossing ? [crossing] : candidates.filter(candidate => candidate.count === 1);
        const opening = openingFor(world, { ...motion, cueSample: fixedHeading >= 0 }, player, choices, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (opening) return { status: 'timedCue', opening, ...selected };
    }
    if (patrolGuidance) return { status: 'timedWait', direction: DIRECTIONS[crossing.heading],
        tiles: crossing.count, hold: crossing.hold, terminal: crossing.terminal, ...selected };
    for (const candidate of candidates) {
        const startWindow = checkedStartWindow(world, motion, player, candidate, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (startWindow >= MIN_START_WINDOW) return { status: 'timed', direction: DIRECTIONS[candidate.heading],
            tiles: candidate.count, startWindow, terminal: candidate.terminal, ...selected,
            alternate: candidate.heading !== candidates[0].heading };
    }
    return { status: 'timedWait', ...selected };
}

module.exports = { previewCrossing };
