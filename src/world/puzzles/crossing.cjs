'use strict';

const { DIRECTIONS, indexOf, offset, step, clipRectangle } = require('../geometry.cjs');
const { routeGoals, inside } = require('../routes.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('./motion-world.cjs');
const { TIMING_CUE, STAMP_WIDTH, writeMotionStamp } = require('./patrol-motion.cjs');

const START_WINDOW = 60;
const MIN_START_WINDOW = TIMING_CUE.minSpan;
const MAX_STEPS = 3;

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

function crossingCandidates(world, origin, distances) {
    const triggers = world.events.filter(event => !event.normal && !event.erased && event.action &&
        (event.trigger === 1 || event.trigger === 2)).map(event => clipRectangle(world,
        event.rectangle || [event.x, event.y, event.x, event.y]));
    const candidates = [];
    for (let heading = 0; heading < DIRECTIONS.length; heading++) {
        let cell = origin;
        let remaining = Infinity;
        for (let count = 1; count <= MAX_STEPS; count++) {
            cell = step(world, cell, heading);
            if (cell < 0 || distances[cell] < 0 || distances[cell] >= remaining) break;
            remaining = distances[cell];
            const terminal = triggers.some(area => inside(world, cell, area));
            candidates.push({ heading, count, terminal, score: remaining + count });
            if (terminal || remaining === 0) break;
        }
    }
    return candidates.sort((a, b) => a.score - b.score || a.heading - b.heading || b.count - a.count);
}

function simulatePrefix(state, candidate, speed, dashMask, cancelled) {
    const { heading, count, terminal } = candidate;
    let moved = 0;
    let hold = 256 / 2 ** speed;
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

function openingFor(world, motion, player, candidates, cancelled) {
    // Live audio describes a single step. Each allowed walk/dash profile
    // must also leave enough time to settle on the next tile.
    const choices = candidates.filter(candidate => candidate.count === 1);
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    const consecutive = new Uint8Array(choices.length);
    const stride = motion.patrols.length * STAMP_WIDTH;
    const ringLength = TIMING_CUE.maxSpan + 1;
    const history = new Float64Array(stride * ringLength);
    for (let delay = 0; delay <= TIMING_CUE.wait + MIN_START_WINDOW; delay++) {
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
            return { direction: DIRECTIONS[candidate.heading], terminal: candidate.terminal,
                alternate: candidate.heading !== candidates[0].heading, from, through, stamps };
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
    const goals = routeGoals(world.player, request, cancelled);
    if (cancelled()) return { status: 'cancelled' };
    if (!goals) return { status: 'unavailable' };
    if (goals[origin]) return { status: 'ready', distance: 0, legs: [],
        arrival: { x: request.x, y: request.y, facing: goals[origin] === 1 ? null : goals[origin] } };
    const distances = distancesToApproach(world.player, goals, origin, area, cancelled);
    if (!distances) return { status: 'cancelled' };
    const candidates = crossingCandidates(world.player, origin, distances);
    if (!candidates.length) return { status: 'unreachable' };
    const player = { x: request.x, y: request.y, rx: request.x, ry: request.y, jump: 0, speed: motion.speed };
    if (request.timingCue === true) {
        const opening = openingFor(world, motion, player, candidates, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (opening) return { status: 'timedCue', opening };
    }
    for (const candidate of candidates) {
        const startWindow = checkedStartWindow(world, motion, player, candidate, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (startWindow >= MIN_START_WINDOW) return { status: 'timed', direction: DIRECTIONS[candidate.heading],
            tiles: candidate.count, startWindow, terminal: candidate.terminal,
            alternate: candidate.heading !== candidates[0].heading };
    }
    return { status: 'timedWait' };
}

module.exports = { previewCrossing };
