'use strict';

const { DIRECTIONS, indexOf, offset, step } = require('../geometry.cjs');
const { routeGoals } = require('../routes.cjs');
const { startMotion, advancePatrols } = require('./motion-world.cjs');
const { STAMP_WIDTH, writeMotionStamp } = require('./patrol-motion.cjs');

const { GUARDS, lineActors, HORIZON, MAX_MOVES, MANUAL_HORIZON } = require('./patrol-line-state.cjs');
const { routePockets, nextStrokes } = require('./patrol-line-manual.cjs');

const LAST_ROW = 20;
const SETUP_FRAMES = 48;

function floorApproaches(grid, event, safeLimit) {
    const entrance = grid.events.find(item => item.id === event && !item.erased && item.action && item.trigger === 1);
    if (!entrance || entrance.normal) return null;
    const tile = indexOf(grid, entrance.x, entrance.y);
    const goals = new Uint8Array(grid.cells.length);
    for (let heading = 0; heading < DIRECTIONS.length; heading++) {
        const before = offset(grid, tile, 3 - heading);
        if (before >= 0 && before < safeLimit && step(grid, before, heading) === tile)
            goals[before] = DIRECTIONS[heading];
    }
    return goals;
}

function lineCrossing(world, request, origin, unsafe, stops, coverage, cancelled) {
    const { player: grid } = world;
    const { motion } = request;
    const size = (LAST_ROW + 1) * grid.width;
    if (size > 800 || size > grid.cells.length || origin >= size || !unsafe ||
        unsafe[origin] || stops[origin] || motion.speed !== 4) return null;
    const guards = lineActors(motion.patrols);
    if (!guards) return null;
    const outside = coverage(world.patrol, motion.patrols.filter(actor => !GUARDS.includes(actor.id)), cancelled);
    const line = coverage(world.patrol, guards, cancelled);
    // Keep the two sets physically separate. A different patrol can
    // invalidate the time grid by entering or delaying the forced line.
    if (!line || line.subarray(size).some(Boolean) || !outside || outside.subarray(0, size).some(Boolean)) return null;
    const exit = request.event === 26;
    const goals = exit ? floorApproaches(grid, request.event, size) : routeGoals(grid, request, cancelled);
    if (!goals || !goals.subarray(0, size).some((value, cell) => value && !unsafe[cell] && !stops[cell])) return null;

    const manual = request.lineNavigation === 'manual';
    const pocket = manual && routePockets(grid, size, origin, unsafe, stops, goals, cancelled);
    if (manual && !pocket) return null;
    if (pocket?.legs) {
        const facing = goals[pocket.goal];
        return { status: 'patrolLineApproach', legs: pocket.legs, more: pocket.goal < 0,
            facing: !exit && facing, activate: exit && facing };
    }

    const links = new Int16Array(size * 4).fill(-1);
    for (let cell = 0; cell < size; cell++) {
        if (stops[cell]) continue;
        for (let heading = 0; heading < 4; heading++) {
            const next = step(grid, cell, heading);
            if (next >= 0 && next < size && !stops[next]) links[cell * 4 + heading] = next;
        }
    }

    // Reserve a tile for its entire native interpolation. Guard updates
    // precede moveByInput, so each sample includes attempted contact as
    // well as the logical positions at that update's start and end.
    const horizon = manual ? MANUAL_HORIZON : HORIZON;
    const safety = new Uint16Array(size * (horizon + 1));
    const stamps = manual ? new Float64Array((horizon + 1) * guards.length * STAMP_WIDTH) : null;
    const time = startMotion(world, guards, { x: -1, y: -1 }, motion.view);
    const contact = new Uint8Array(size);
    for (let frame = 1; frame <= horizon; frame++) {
        if (cancelled()) return null;
        contact.fill(0);
        for (const guard of time.patrols) contact[indexOf(grid, guard.x, guard.y)] = 1;
        if (advancePatrols(time, cell => { if (cell < size) contact[cell] = 1; return false; }) !== 'settled')
            return null;
        for (const guard of time.patrols) contact[indexOf(grid, guard.x, guard.y)] = 1;
        const row = frame * size;
        for (let cell = 0; cell < size; cell++)
            if (contact[cell]) safety[row + cell] = frame;
        if (stamps) writeMotionStamp(stamps, frame * guards.length * STAMP_WIDTH, time.patrols);
    }
    for (let frame = horizon - 1; frame >= 1; frame--) {
        if ((frame & 31) === 0 && cancelled()) return null;
        const row = frame * size;
        for (let cell = 0; cell < size; cell++)
            if (!safety[row + cell]) safety[row + cell] = safety[row + size + cell];
    }

    // A time state has only five successors. Waiting for the guard in
    // front is sometimes necessary even though the static route is clear.
    // Walk pace works for the whole course, including the moving line.
    const stride = 256 / 2 ** motion.speed;
    if (manual) {
        const { to, strokes } = pocket.link;
        const starts = nextStrokes(safety, size, pocket.link, stride, cancelled);
        if (!starts) return null;
        const legs = strokes.map(({ heading, cells }) => ({ direction: DIRECTIONS[heading], tiles: cells.length - 1 }));
        return { status: 'patrolLineManual', starts, stamps, legs, more: !goals[to],
            facing: !exit && goals[to], activate: exit && goals[to] };
    }
    const visited = new Int8Array(safety.length);
    const stepsTaken = new Uint8Array(safety.length).fill(255);
    visited[SETUP_FRAMES * size + origin] = -1;
    stepsTaken[SETUP_FRAMES * size + origin] = 0;
    for (let frame = SETUP_FRAMES; frame < HORIZON - stride; frame++) {
        if (cancelled()) return null;
        const row = frame * size;
        for (let cell = 0; cell < size; cell++) {
            if (!visited[row + cell]) continue;
            const danger = safety[row + cell];
            if (danger === frame) continue;
            if (goals[cell] && !unsafe[cell])
                return packCourse(world, motion, guards, visited, size, cell, frame, goals[cell], exit, stride, cancelled);
            // Among equally early arrivals, prefer pausing to pacing
            // back and forth on the guard track.
            const steps = stepsTaken[row + cell];
            const wait = row + size + cell;
            if (steps < stepsTaken[wait]) {
                stepsTaken[wait] = steps;
                visited[wait] = 5;
            }
            if (steps === MAX_MOVES) continue;
            for (let heading = 0; heading < 4; heading++) {
                const next = links[cell * 4 + heading];
                const at = row + stride * size + next;
                if (next < 0 || steps + 1 >= stepsTaken[at]) continue;
                const blockedAt = safety[row + next];
                if (!blockedAt || blockedAt >= frame + stride) {
                    stepsTaken[at] = steps + 1;
                    visited[at] = heading + 1;
                }
            }
        }
    }
    return null;
}

function packCourse(world, motion, guards, visited, size, goal, frame, facing, exit, stride, cancelled) {
    const { player: grid } = world;
    const moves = [];
    let cell = goal;
    while (frame > SETUP_FRAMES) {
        if (cancelled()) return null;
        const code = visited[frame * size + cell];
        if (code === 5) { frame--; continue; }
        if (code < 1 || code > 4 || moves.length >= MAX_MOVES) return null;
        frame -= stride;
        const heading = code - 1;
        moves.push({ frame, heading, x: cell % grid.width, y: Math.floor(cell / grid.width) });
        cell = offset(grid, cell, 3 - heading);
    }
    moves.reverse();
    if (!moves.length) return null;
    const stamps = new Float64Array(moves.length * guards.length * STAMP_WIDTH);
    const current = startMotion(world, guards, { x: -1, y: -1 }, motion.view);
    let tick = 0;
    for (let index = 0; index < moves.length; index++) {
        while (tick < moves[index].frame) {
            if (cancelled() || advancePatrols(current) !== 'settled') return null;
            tick++;
        }
        writeMotionStamp(stamps, index * guards.length * STAMP_WIDTH, current.patrols);
    }
    return { status: 'patrolLine', moves, stamps, arrival: { x: goal % grid.width, y: Math.floor(goal / grid.width),
        facing: exit ? null : facing }, activate: exit ? facing : undefined };
}

module.exports = { lineCrossing };
