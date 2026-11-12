'use strict';

const { DIRECTIONS, indexOf, offset, clipRectangle } = require('../geometry.cjs');
const { solveWorldRoute } = require('../routes.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('./motion-world.cjs');

// Check starts over one second of native updates. The receiver will reject
// a result if computing it consumes too much of that interval.
const START_WINDOW = 60;
const MIN_START_WINDOW = 45;
const MAX_STEPS = 3;

function limitAtTrigger(world, start, heading, count) {
    const triggers = world.events.filter(event => !event.normal && !event.erased && event.action &&
        (event.trigger === 1 || event.trigger === 2)).map(event => clipRectangle(world,
        event.rectangle || [event.x, event.y, event.x, event.y]));
    let cell = start;
    for (let n = 1; n <= count; n++) {
        cell = offset(world, cell, heading);
        const x = cell % world.width;
        const y = Math.floor(cell / world.width);
        if (triggers.some(([left, top, right, bottom]) => x >= left && x <= right && y >= top && y <= bottom)) {
            return { steps: n, terminal: true };
        }
    }
    return { steps: count, terminal: false };
}

function simulatePrefix(state, heading, count, terminal, hold, cancelled) {
    let remaining = count;
    // Player speed >= 3 makes a tile take at most 32 updates.
    const limit = MAX_STEPS * 32 + hold + 1;
    for (let tick = 0; tick < limit; tick++) {
        if (cancelled()) return false;
        const { player } = state;
        const standing = player.x === player.rx && player.y === player.ry;
        if (standing && remaining === 0 && (terminal || hold-- === 0)) return true;
        if (advancePatrols(state) !== 'settled') return false;
        const next = standing && remaining > 0 ? heading : null;
        if (next !== null) remaining--;
        if (advancePlayer(state, next) !== 'settled') return false;
    }
    return false;
}

function checkedStartWindow(world, motion, player, heading, count, terminal, cancelled) {
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    const hold = 256 / 2 ** player.speed;
    for (let delay = 0; delay <= START_WINDOW; delay++) {
        if (cancelled()) return -1;
        const run = startMotion(world, waiting.patrols, waiting.player, waiting.view);
        if (!simulatePrefix(run, heading, count, terminal, hold, cancelled)) return delay - 1;
        if (advancePatrols(waiting) !== 'settled') return delay;
    }
    return START_WINDOW;
}

function previewCrossing(geometry, live, request, cancelled = () => false) {
    const { motion } = request;
    if (!Array.isArray(motion?.patrols) || !Number.isInteger(motion.speed) || motion.speed < 3 || motion.speed > 6)
        return { status: 'unavailable' };
    const world = motionWorld(geometry, live, motion.patrols, cancelled);
    if (!world) return { status: cancelled() ? 'cancelled' : 'unavailable' };
    const planned = solveWorldRoute(world.player, request, cancelled);
    if (planned.status !== 'ready' || planned.distance === 0) return planned;
    const player = { x: request.x, y: request.y, rx: request.x, ry: request.y, jump: 0, speed: motion.speed };
    const first = planned.legs[0];
    const heading = DIRECTIONS.indexOf(first.direction);
    const start = indexOf(world.player, player.x, player.y);
    const { steps, terminal } = limitAtTrigger(world.player, start, heading, Math.min(first.tiles, MAX_STEPS));
    for (let count = steps; count > 0; count--) {
        const end = terminal && count === steps;
        const startWindow = checkedStartWindow(world, motion, player, heading, count, end, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (startWindow >= MIN_START_WINDOW) {
            return { status: 'timed', direction: first.direction, tiles: count, startWindow, terminal: end };
        }
    }
    return { status: 'timedWait' };
}

module.exports = { previewCrossing };
