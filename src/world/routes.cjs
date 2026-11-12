'use strict';

const { DIRECTIONS, COUNTER, LAND, PASSAGE, composeWorld, indexOf, offset, step, clipRectangle } = require('./geometry.cjs');

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
    if (world.mode !== 'walk') return null;
    if (type === 'airship') return pointGoal(world, world.aircraft?.x, world.aircraft?.y);
    if (type !== 'ship' && type !== 'boat') return null;
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

function groundDistances(world, event, cancelled) {
    const ground = { ...world, mode: 'walk', through: false };
    const goals = actionGoals(ground, event, cancelled);
    if (!goals || cancelled()) return null;
    const stops = automaticEvents(ground, cancelled);
    const distance = new Uint16Array(goals.length);
    const queue = new Uint16Array(goals.length);
    let count = 0;
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return null;
        if (!goals[cell] || (stops[cell] && stops[cell] !== event)) continue;
        distance[cell] = 1;
        queue[count++] = cell;
    }
    for (let cursor = 0; cursor < count; cursor++) {
        if ((cursor & 63) === 0 && cancelled()) return null;
        const cell = queue[cursor];
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const previous = offset(ground, cell, 3 - heading);
            if (previous < 0 || distance[previous] || stops[previous] || step(ground, previous, heading) !== cell) continue;
            distance[previous] = distance[cell] + 1;
            queue[count++] = previous;
        }
    }
    return distance;
}

function nearestLanding(world, request, ground, cancelled) {
    let nearest = null;
    let cost = Infinity;
    let bestWalk = Infinity;
    for (let cell = 0; cell < world.cells.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return null;
        // Leave the parked airship behind before the player uses the final
        // interaction. On its tile, native OK would try to board it first.
        if (!(world.cells[cell] & LAND) || (ground && ground[cell] <= 1)) continue;
        let east = Math.abs(cell % world.width - request.x);
        let south = Math.abs(Math.floor(cell / world.width) - request.y);
        if (world.scrollType & 2) east = Math.min(east, world.width - east);
        if (world.scrollType & 1) south = Math.min(south, world.height - south);
        const walk = ground ? ground[cell] - 1 : 0;
        const total = east + south + walk;
        if (total < cost || (total === cost && walk < bestWalk)) {
            nearest = { cell, cost: total };
            cost = total;
            bestWalk = walk;
        }
    }
    return nearest;
}

function landingRoute(world, start, request, area, cancelled) {
    if (world.mode !== 'airship' || !world.hasLandings) return { status: 'unavailable' };
    const linked = Number.isInteger(request.event);
    const ground = linked ? groundDistances(world, request.event, cancelled) : null;
    if (cancelled()) return { status: 'cancelled' };
    if (linked && !ground) return { status: 'unavailable' };
    let site = nearestLanding(world, request, ground, cancelled);
    let discovery;
    if (linked && !site) {
        for (const event of world.events) {
            if (cancelled()) return { status: 'cancelled' };
            if (event.discoveryFor !== request.event) continue;
            const approach = groundDistances(world, event.id, cancelled);
            const candidate = approach && nearestLanding(world, request, approach, cancelled);
            if (candidate && (!site || candidate.cost < site.cost)) {
                site = candidate;
                discovery = event.id;
            }
        }
    }
    if (cancelled()) return { status: 'cancelled' };
    if (!site) return { status: 'unreachable' };
    const goals = new Uint8Array(world.cells.length);
    goals[site.cell] = 1;
    const result = route(world, start, goals, cancelled, area);
    if (result.status === 'ready') {
        result.land = true;
        if (discovery) result.discovery = discovery;
    }
    return result;
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

function pointGoal(world, x, y) {
    const end = indexOf(world, x, y);
    if (end < 0) return null;
    const goals = new Uint8Array(world.cells.length);
    goals[end] = 1;
    return goals;
}

function markerGoals(world, id) {
    const target = world.events.find(event => event.id === id && !event.erased);
    if (!target || world.mode !== 'walk') return null;
    const center = indexOf(world, target.x, target.y);
    if (center < 0) return null;
    if (!world.blocked[center] && (world.cells[center] & PASSAGE)) return pointGoal(world, target.x, target.y);
    // A marked prop may be solid. Route to the walkable perimeter of its
    // actual footprint and leave native input with the player on arrival.
    const rectangle = bounds(world, target);
    const [left, top, right, bottom] = rectangle;
    if (left > right || top > bottom) return null;
    const goals = new Uint8Array(world.cells.length);
    const add = (x, y, heading) => {
        const cell = offset(world, indexOf(world, x, y), heading);
        if (cell >= 0 && !world.blocked[cell] && !inside(world, cell, rectangle)) goals[cell] = 1;
    };
    for (let x = left; x <= right; x++) {
        add(x, top, 3);
        add(x, bottom, 0);
    }
    for (let y = top; y <= bottom; y++) {
        add(left, y, 1);
        add(right, y, 2);
    }
    return goals;
}

function routeGoals(world, request, cancelled) {
    if (request.vehicle) return boardingGoals(world, request.vehicle);
    if (request.waypoint === true) return markerGoals(world, request.event);
    if (Number.isInteger(request.event)) return actionGoals(world, request.event, cancelled, request.surface === true);
    return pointGoal(world, request.targetX, request.targetY);
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
    if (request.landing === true) return landingRoute(world, start, request, area, cancelled);
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
