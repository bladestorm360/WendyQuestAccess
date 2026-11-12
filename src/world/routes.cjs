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

function actionGoals(world, id, cancelled, surface) {
    const actions = [];
    let target = null;
    for (const event of world.events) {
        if (event.erased || !event.action || ![0, 1, 2].includes(event.trigger)) continue;
        const action = { id: event.id, normal: event.normal === true, trigger: event.trigger, bounds: bounds(world, event) };
        if (action.id === id) target = action;
        actions.push(action);
    }
    // Only qualified floor events take control while driving a surface craft.
    if (!target || (world.mode !== 'walk' &&
        (!surface || world.mode === 'airship' || target.normal || target.trigger === 0))) return null;
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

function boardingGoals(world, type) {
    if (world.mode !== 'walk' || (type !== 'ship' && type !== 'boat')) return null;
    const vehicle = world.vehicles?.find(candidate => candidate.type === type);
    if (!vehicle || (type === 'boat' && world.vehicles.some(candidate =>
        candidate.type === 'ship' && candidate.x === vehicle.x && candidate.y === vehicle.y))) return null;
    const cell = indexOf(world, vehicle.x, vehicle.y);
    if (cell < 0) return null;
    const aircraft = world.aircraft && indexOf(world, world.aircraft.x, world.aircraft.y);
    const goals = new Uint8Array(world.cells.length);
    for (let heading = 0; heading < DIRECTIONS.length; heading++) {
        const before = offset(world, cell, 3 - heading);
        // Native OK checks for an aircraft on the current tile first.
        if (before >= 0 && before !== aircraft) goals[before] = DIRECTIONS[heading];
    }
    return goals;
}

function automaticEvents(world, cancelled) {
    const stops = new Uint16Array(world.cells.length);
    // Native movement selects the first active non-normal touch event in
    // map order. Through affects collision but leaves touch eligibility intact.
    for (const event of world.events) {
        if (event.erased || event.normal || !event.action || (event.trigger !== 1 && event.trigger !== 2)) continue;
        const [left, top, right, bottom] = bounds(world, event);
        for (let y = top; y <= bottom; y++) {
            if (cancelled()) return stops;
            for (let x = left; x <= right; x++) {
                const cell = y * world.width + x;
                if (!stops[cell]) stops[cell] = event.id;
            }
        }
    }
    return stops;
}

function trace(world, start, goal, facing, parents, cancelled, stops) {
    const legs = [];
    let cell = goal;
    let arrival = goal;
    let boundary = 0;
    let boundaryEvent = 0;
    let distance = 0;
    let traced = 0;
    while (cell !== start) {
        if ((traced++ & 63) === 0 && cancelled()) return { status: 'cancelled' };
        const heading = parents[cell] - 1;
        const direction = DIRECTIONS[heading];
        const previous = offset(world, cell, 3 - heading);
        if (cell !== goal && stops?.[cell]) {
            // The first interruption encountered from the origin wins.
            legs.length = 0;
            distance = 0;
            arrival = previous;
            boundary = direction;
            boundaryEvent = stops[cell];
        } else {
            const last = legs[legs.length - 1];
            if (last?.direction === direction) last.tiles++;
            else legs.push({ direction, tiles: 1 });
            distance++;
        }
        cell = previous;
    }
    const result = { status: boundary ? 'interrupted' : 'ready', distance, legs: legs.reverse(),
        arrival: { x: arrival % world.width, y: Math.floor(arrival / world.width),
            facing: !boundary && facing !== 1 ? facing : null } };
    if (boundary) Object.assign(result, { boundary, boundaryEvent });
    return result;
}

function route(world, start, goals, cancelled, area, stops, crossStops = false) {
    const parents = new Uint8Array(world.cells.length);
    const frontier = new Uint16Array(world.cells.length);
    parents[start] = 255;
    frontier[0] = start;
    let count = 1;
    for (let cursor = 0; cursor < count; cursor++) {
        if ((cursor & 63) === 0 && cancelled()) return { status: 'cancelled' };
        const cell = frontier[cursor];
        const facing = goals[cell];
        if (facing) return trace(world, start, cell, facing, parents, cancelled, crossStops ? stops : null);
        if (!crossStops && cell !== start && stops?.[cell]) continue;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const next = step(world, cell, heading);
            if (next < 0 || parents[next] || (area && !inside(world, next, area))) continue;
            parents[next] = heading + 1;
            frontier[count++] = next;
        }
    }
    return { status: 'unreachable' };
}

function routeGoals(world, request, cancelled) {
    if (request.vehicle) return boardingGoals(world, request.vehicle);
    if (Number.isInteger(request.event)) return actionGoals(world, request.event, cancelled, request.surface === true);
    const end = indexOf(world, request.targetX, request.targetY);
    if (end < 0) return null;
    const goals = new Uint8Array(world.cells.length);
    goals[end] = 1;
    return goals;
}

function entryGoal(world, goals, request, area) {
    const heading = DIRECTIONS.indexOf(request.entryDirection);
    const event = world.events.find(item => item.id === request.event);
    if (!event || heading < 0) return null;
    const cell = indexOf(world, event.x, event.y);
    if (cell < 0 || goals[cell] !== 1 || (area && !inside(world, cell, area))) return null;
    const before = offset(world, cell, 3 - heading);
    if (before < 0 || step(world, before, heading) !== cell) return null;
    goals.fill(0);
    goals[before] = 1;
    return { cell, direction: request.entryDirection };
}

function finishEntry(world, result, entry) {
    if (!entry || result.status !== 'ready') return result;
    const last = result.legs[result.legs.length - 1];
    if (last?.direction === entry.direction) last.tiles++;
    else result.legs.push({ direction: entry.direction, tiles: 1 });
    result.distance++;
    result.arrival = { x: entry.cell % world.width, y: Math.floor(entry.cell / world.width), facing: null };
    return result;
}

function solveWorldRoute(world, request, cancelled = () => false) {
    const start = indexOf(world, request.x, request.y);
    if (start < 0) return { status: 'unavailable' };
    const area = request.area && clipRectangle(world, request.area);
    if (request.area && (!area || !inside(world, start, area))) return { status: 'unavailable' };
    const goals = routeGoals(world, request, cancelled);
    if (cancelled()) return { status: 'cancelled' };
    if (!goals) return { status: 'unavailable' };
    const entry = request.entryDirection === undefined ? null : entryGoal(world, goals, request, area);
    if (request.entryDirection !== undefined && !entry) return { status: 'unreachable' };
    if (request.field !== true || world.mode === 'airship')
        return finishEntry(world, route(world, start, goals, cancelled, area), entry);
    const stops = automaticEvents(world, cancelled);
    let blockedApproach = false;
    for (let cell = 0; cell < stops.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return { status: 'cancelled' };
        if (cell === start || !goals[cell] || !stops[cell] || stops[cell] === request.event) continue;
        goals[cell] = 0;
        blockedApproach = true;
    }
    if (!entry && goals[start] && stops[start] === request.event) {
        const reenter = DIRECTIONS.some((_, heading) => {
            const adjacent = step(world, start, heading);
            return adjacent >= 0 && !stops[adjacent] && (!area || inside(world, adjacent, area)) &&
                step(world, adjacent, 3 - heading) === start;
        });
        return reenter ? { ...trace(world, start, start, 1, null, cancelled), reenter: true } : { status: 'unreachable' };
    }
    const clear = route(world, start, goals, cancelled, area, stops);
    if (clear.status !== 'unreachable') return finishEntry(world, clear, entry);
    const possible = route(world, start, goals, cancelled, area, stops, true);
    return possible.status === 'unreachable' && blockedApproach ? { status: 'approachBlocked' } : finishEntry(world, possible, entry);
}

function solveRoute(geometry, snapshot, request, cancelled = () => false) {
    if (cancelled()) return { status: 'cancelled' };
    const world = composeWorld(geometry, snapshot, cancelled);
    return world ? solveWorldRoute(world, request, cancelled) : { status: 'cancelled' };
}

module.exports = { solveRoute, solveWorldRoute, routeGoals, inside };
