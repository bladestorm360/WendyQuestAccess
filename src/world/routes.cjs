'use strict';

const { DIRECTIONS, COUNTER, composeWorld, indexOf, offset, step, clipRectangle } = require('./geometry.cjs');

function bounds(world, event) {
    return clipRectangle(world, event.rectangle || [event.x, event.y, event.x, event.y]);
}

function inside(world, cell, [left, top, right, bottom]) {
    if (cell < 0) return false;
    const x = cell % world.width;
    const y = Math.floor(cell / world.width);
    return x >= left && x <= right && y >= top && y <= bottom;
}

function actionGoals(world, id, cancelled) {
    // Vehicle OK first tries a native disembarkation. Point routes remain
    // available, but this interaction adapter qualifies on-foot approaches.
    if (world.mode !== 'walk') return null;
    const actions = [];
    let target = null;
    for (const event of world.events) {
        if (event.erased || !event.action || ![0, 1, 2].includes(event.trigger)) continue;
        const action = { id: event.id, normal: event.normal === true, trigger: event.trigger, bounds: bounds(world, event) };
        if (action.id === id) target = action;
        actions.push(action);
    }
    if (!target) return null;
    const goals = new Uint8Array(world.cells.length);
    function firstAt(cell, normal, trigger = null) {
        return actions.find(event => event.normal === normal && (trigger === null ||
            (trigger === 0 ? event.trigger === 0 : event.trigger !== 0)) &&
            inside(world, cell, event.bounds));
    }
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return goals;
        if (!target.normal) {
            // The on-tile Action Button and player-touch paths use the
            // target's native priority and trigger, never event contents.
            if (inside(world, cell, target.bounds) && firstAt(cell, false, target.trigger) === target) goals[cell] = 1;
            continue;
        }
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const front = offset(world, cell, heading);
            if (front < 0) continue;
            if (inside(world, front, target.bounds)) {
                if (firstAt(front, true) === target) goals[cell] = DIRECTIONS[heading];
            } else if (world.cells[front] & COUNTER) {
                const across = offset(world, front, heading);
                if (inside(world, across, target.bounds) && !firstAt(front, true) && firstAt(across, true) === target) {
                    goals[cell] = DIRECTIONS[heading];
                }
            }
            if (goals[cell]) break;
        }
    }
    return goals;
}

function route(world, start, goals, cancelled) {
    const parents = new Uint8Array(world.cells.length);
    const frontier = new Uint16Array(world.cells.length);
    parents[start] = 255;
    frontier[0] = start;
    let count = 1;
    for (let cursor = 0; cursor < count; cursor++) {
        if ((cursor & 63) === 0 && cancelled()) return { status: 'cancelled' };
        const cell = frontier[cursor];
        const facing = goals[cell];
        if (facing) {
            const legs = [];
            let index = cell;
            let distance = 0;
            while (index !== start) {
                if ((distance & 63) === 0 && cancelled()) return { status: 'cancelled' };
                const heading = parents[index] - 1;
                const direction = DIRECTIONS[heading];
                const last = legs[legs.length - 1];
                if (last?.direction === direction) last.tiles++;
                else legs.push({ direction, tiles: 1 });
                index = offset(world, index, 3 - heading);
                distance++;
            }
            return { status: 'ready', distance, legs: legs.reverse(),
                arrival: { x: cell % world.width, y: Math.floor(cell / world.width), facing: facing === 1 ? null : facing } };
        }
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const next = step(world, cell, heading);
            if (next < 0 || parents[next]) continue;
            parents[next] = heading + 1;
            frontier[count++] = next;
        }
    }
    return { status: 'unreachable' };
}

function solveRoute(geometry, snapshot, request, cancelled = () => false) {
    if (cancelled()) return { status: 'cancelled' };
    const world = composeWorld(geometry, snapshot, cancelled);
    if (!world) return { status: 'cancelled' };
    const start = indexOf(world, request.x, request.y);
    if (start < 0) return { status: 'unavailable' };
    let goals;
    if (Number.isInteger(request.event)) goals = actionGoals(world, request.event, cancelled);
    else {
        const end = indexOf(world, request.targetX, request.targetY);
        if (end < 0) return { status: 'unavailable' };
        goals = new Uint8Array(world.cells.length);
        goals[end] = 1;
    }
    if (cancelled()) return { status: 'cancelled' };
    return goals ? route(world, start, goals, cancelled) : { status: 'unavailable' };
}

module.exports = { solveRoute };
