'use strict';

const { DIRECTIONS, COUNTER, LAND, PASSAGE, MAX_EVENTS, composeWorld, indexOf, offset, step, clipRectangle } =
    require('./geometry.cjs');

function bounds(world, event) {
    return clipRectangle(world, event.rectangle || [event.x, event.y, event.x, event.y]);
}

function inside(world, cell, [left, top, right, bottom]) {
    if (cell < 0) return false;
    const x = cell % world.width;
    const y = Math.floor(cell / world.width);
    return x >= left && x <= right && y >= top && y <= bottom;
}

function interactionTiles(world, cancelled) {
    const normal = new Uint16Array(world.cells.length);
    const here = new Uint16Array(world.cells.length);
    const touch = new Uint16Array(world.cells.length);
    const boats = new Uint8Array(world.cells.length);
    for (const vehicle of world.vehicles || []) {
        const cell = indexOf(world, vehicle.x, vehicle.y);
        if (cell >= 0) boats[cell] = 1;
    }
    const aircraft = world.aircraft ? indexOf(world, world.aircraft.x, world.aircraft.y) : -1;
    // The native interpreter takes the first startable event in map order.
    // Each layer preserves the priority and trigger accepted by one check.
    for (const event of world.events) {
        if (cancelled()) break;
        if (event.erased || !event.action || ![0, 1, 2].includes(event.trigger) ||
            !Number.isInteger(event.id) || event.id < 1 || event.id > MAX_EVENTS) continue;
        const layer = event.normal ? normal : event.trigger === 0 ? here : touch;
        const [left, top, right, bottom] = bounds(world, event);
        for (let y = top; y <= bottom; y++) {
            if (cancelled()) break;
            for (let x = left; x <= right; x++) {
                const cell = y * world.width + x;
                if (!layer[cell]) layer[cell] = event.id;
            }
        }
    }
    return { normal, here, touch, boats, aircraft };
}

function buttonEvent(world, tiles, cell, heading) {
    const front = offset(world, cell, heading);
    // Native OK tries vehicles and the player's own tile first. A counter
    // extends the check only when the nearer tile starts no event.
    if (tiles.aircraft === cell || tiles.boats[front]) return 0;
    if (tiles.here[cell] || front < 0) return tiles.here[cell];
    return tiles.normal[front] || ((world.cells[front] & COUNTER) ? tiles.normal[offset(world, front, heading)] || 0 : 0);
}

function actionGoals(world, id, cancelled, surface, tiles = interactionTiles(world, cancelled)) {
    const target = world.events.find(event => event.id === id && !event.erased && event.action &&
        [0, 1, 2].includes(event.trigger));
    // Only qualified floor events take control while driving a surface craft.
    if (!target || (world.mode !== 'walk' &&
        (!surface || world.mode === 'airship' || target.normal || target.trigger === 0))) return null;
    const goals = new Uint8Array(world.cells.length);
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return goals;
        if (!target.normal && target.trigger !== 0) {
            if (tiles.touch[cell] === id) goals[cell] = 1;
            continue;
        }
        if (!target.normal && tiles.here[cell] !== id) continue;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            if (buttonEvent(world, tiles, cell, heading) !== id) continue;
            const needsFacing = target.normal || DIRECTIONS.some((_, index) => tiles.boats[offset(world, cell, index)]);
            goals[cell] = needsFacing ? DIRECTIONS[heading] : 1;
            break;
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

function groundDistances(world, event, cancelled, tiles = interactionTiles(world, cancelled)) {
    const ground = { ...world, mode: 'walk', through: false };
    const goals = actionGoals(ground, event, cancelled, false, tiles);
    if (!goals || cancelled()) return null;
    const stops = tiles.touch;
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
    const tiles = linked ? interactionTiles(world, cancelled) : null;
    const ground = linked ? groundDistances(world, request.event, cancelled, tiles) : null;
    if (cancelled()) return { status: 'cancelled' };
    if (linked && !ground) return { status: 'unavailable' };
    let site = nearestLanding(world, request, ground, cancelled);
    let discovery;
    if (linked && !site) {
        for (const event of world.events) {
            if (cancelled()) return { status: 'cancelled' };
            if (event.discoveryFor !== request.event) continue;
            const approach = groundDistances(world, event.id, cancelled, tiles);
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

function route(world, start, goals, cancelled, area, stops, crossStops = false, preference) {
    const parents = new Uint8Array(world.cells.length);
    const frontier = new Uint16Array(world.cells.length);
    parents[start] = 255;
    frontier[0] = start;
    let count = 1;
    let preferred = -1;
    let bestRank = Infinity;
    for (let cursor = 0; cursor < count; cursor++) {
        if ((cursor & 63) === 0 && cancelled()) return { status: 'cancelled' };
        const cell = frontier[cursor];
        const facing = goals[cell];
        if (facing) {
            const rank = preference?.ranks[cell];
            if (!preference || rank === preference.best) return trace(world, start, cell, facing, parents, cancelled, crossStops ? stops : null);
            if (rank < bestRank) {
                preferred = cell;
                bestRank = rank;
            }
        }
        if (!crossStops && cell !== start && stops?.[cell]) continue;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const next = step(world, cell, heading);
            if (next < 0 || parents[next] || (area && !inside(world, next, area))) continue;
            parents[next] = heading + 1;
            frontier[count++] = next;
        }
    }
    if (preferred >= 0) return trace(world, start, preferred, goals[preferred], parents, cancelled);
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

function routeGoals(world, request, cancelled, tiles) {
    if (request.vehicle) return boardingGoals(world, request.vehicle);
    if (request.waypoint === true) return markerGoals(world, request.event);
    if (Number.isInteger(request.event)) return actionGoals(world, request.event, cancelled, request.surface === true, tiles);
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

function canReenter(world, start, stops, area) {
    return DIRECTIONS.some((_, heading) => {
        const adjacent = step(world, start, heading);
        return adjacent >= 0 && !stops[adjacent] && (!area || inside(world, adjacent, area)) &&
            step(world, adjacent, 3 - heading) === start;
    });
}

function reachableApproaches(world, start, tiles, cancelled) {
    const reached = new Uint8Array(world.cells.length);
    const events = new Uint8Array(MAX_EVENTS + 1);
    const queue = new Uint16Array(reached.length);
    let count = 1;
    queue[0] = start;
    reached[start] = 1;
    for (let cursor = 0; cursor < count; cursor++) {
        if ((cursor & 63) === 0 && cancelled()) return null;
        const cell = queue[cursor];
        const stop = tiles.touch[cell];
        if (stop && (cell !== start || canReenter(world, start, tiles.touch))) events[stop] = 1;
        // A floor event can be the destination, but cannot carry a route
        // through the next room before native progression has occurred.
        if (stop && cell !== start) continue;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const action = world.mode === 'walk' && buttonEvent(world, tiles, cell, heading);
            if (action) events[action] = 1;
            const next = step(world, cell, heading);
            if (next >= 0 && !reached[next]) {
                reached[next] = 1;
                queue[count++] = next;
            }
        }
    }
    return { reached, events };
}

function walkingLanding(geometry, snapshot, x, y) {
    const world = composeWorld(geometry, snapshot, () => false);
    const start = indexOf(world, x, y);
    if (start < 0) return null;
    const tiles = interactionTiles(world, () => false);
    const { reached, events } = reachableApproaches(world, start, tiles, () => false);
    // Reaching a different floor event does not mean the player retains
    // control there. A landing itself is already occupied on native handback.
    for (let cell = 0; cell < reached.length; cell++) {
        if (cell !== start && tiles.touch[cell]) reached[cell] = 0;
    }
    return { reached, events };
}

function approachAvailable(world, start, candidate, tiles, approaches, cancelled) {
    const { reached, events } = approaches;
    const stops = tiles.touch;
    if (candidate.targetX !== undefined) {
        const cell = indexOf(world, candidate.targetX, candidate.targetY);
        return cell >= 0 && reached[cell] && (!stops[cell] || cell === start);
    }
    if (candidate.vehicle || candidate.waypoint) {
        const goals = routeGoals(world, candidate, cancelled, tiles);
        return goals?.some((goal, cell) => goal && reached[cell] && (!stops[cell] || cell === start));
    }
    const id = candidate.event;
    if (!events[id]) return false;
    if (candidate.entryDirection === undefined) return true;
    const target = world.events.find(event => event.id === id);
    const heading = DIRECTIONS.indexOf(candidate.entryDirection);
    const cell = indexOf(world, target.x, target.y);
    if (heading < 0 || cell < 0 || stops[cell] !== id) return false;
    const before = offset(world, cell, 3 - heading);
    return before >= 0 && reached[before] && (!stops[before] || before === start) && step(world, before, heading) === cell;
}

function flightApproaches(world, tiles, candidates, cancelled) {
    const available = new Uint8Array(candidates.length);
    const landingAvailable = world.hasLandings && world.cells.some(value => value & LAND);
    const connected = new Map();
    const discoveries = new Map();
    for (const event of world.events) {
        if (!event.discoveryFor) continue;
        if (!discoveries.has(event.discoveryFor)) discoveries.set(event.discoveryFor, []);
        discoveries.get(event.discoveryFor).push(event.id);
    }
    const canReach = id => {
        if (!connected.has(id)) {
            const distance = groundDistances(world, id, cancelled, tiles);
            connected.set(id, !!distance?.some((value, cell) => value > 1 && (world.cells[cell] & LAND)));
        }
        return connected.get(id);
    };
    for (let index = 0; index < candidates.length; index++) {
        if (cancelled()) return null;
        const candidate = candidates[index];
        const id = candidate.event;
        if (indexOf(world, candidate.targetX, candidate.targetY) >= 0 ||
            (landingAvailable && (candidate.nearestLanding || (Number.isInteger(id) && !candidate.waypoint &&
                (canReach(id) || discoveries.get(id)?.some(canReach)))))) available[index] = 1;
    }
    return available;
}

function findReachable(geometry, snapshot, { x, y, candidates }, cancelled = () => false) {
    // One ordinary and one quest entry per event, vehicle entries and up
    // to 64 saved bookmarks.
    if (!Array.isArray(candidates) || candidates.length > MAX_EVENTS * 2 + 4 + 64) return { status: 'unavailable' };
    const world = composeWorld(geometry, snapshot, cancelled);
    if (!world) return { status: 'cancelled' };
    const start = indexOf(world, x, y);
    if (start < 0) return { status: 'unavailable' };
    const tiles = interactionTiles(world, cancelled);
    if (world.mode === 'airship') {
        const available = flightApproaches(world, tiles, candidates, cancelled);
        return available && !cancelled() ? { status: 'reachable', available } : { status: 'cancelled' };
    }
    const approaches = reachableApproaches(world, start, tiles, cancelled);
    if (!approaches) return { status: 'cancelled' };
    const available = new Uint8Array(candidates.length);
    for (let index = 0; index < candidates.length; index++) {
        if (cancelled()) return { status: 'cancelled' };
        if (approachAvailable(world, start, candidates[index], tiles, approaches, cancelled)) available[index] = 1;
    }
    return { status: 'reachable', available };
}

function entranceRoute(world, start, events, tiles, cancelled) {
    if (world.mode !== 'walk' || !Array.isArray(events) || !events.length || events.length > MAX_EVENTS)
        return { status: 'unavailable' };
    const eligible = new Map(events.map(item => Number.isInteger(item) ? [item, 1] : [item.event, item.rank]));
    const goals = new Uint8Array(world.cells.length);
    const owners = new Uint16Array(world.cells.length);
    const ranks = new Uint16Array(world.cells.length);
    const stops = tiles.touch;
    let best = Infinity;
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return { status: 'cancelled' };
        const touch = stops[cell];
        if (eligible.has(touch) && (cell !== start || canReenter(world, start, stops))) {
            goals[cell] = 1;
            owners[cell] = touch;
            ranks[cell] = eligible.get(touch);
            best = Math.min(best, ranks[cell]);
        }
        if (touch && cell !== start) continue;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const target = buttonEvent(world, tiles, cell, heading);
            const rank = eligible.get(target);
            if (!rank || (ranks[cell] && ranks[cell] <= rank)) continue;
            const needsFacing = tiles.here[cell] !== target ||
                DIRECTIONS.some((_, index) => tiles.boats[offset(world, cell, index)]);
            goals[cell] = needsFacing ? DIRECTIONS[heading] : 1;
            owners[cell] = target;
            ranks[cell] = rank;
            best = Math.min(best, rank);
        }
    }
    const result = route(world, start, goals, cancelled, undefined, stops, false, { best, ranks });
    if (result.status === 'ready') {
        const cell = indexOf(world, result.arrival.x, result.arrival.y);
        result.entrance = owners[cell];
        if (cell === start && stops[cell] === result.entrance) result.reenter = true;
    }
    return result;
}

function solveWorldRoute(world, request, cancelled = () => false) {
    const start = indexOf(world, request.x, request.y);
    if (start < 0) return { status: 'unavailable' };
    const area = request.area && clipRectangle(world, request.area);
    if (request.area && (!area || !inside(world, start, area))) return { status: 'unavailable' };
    if (request.landing === true) return landingRoute(world, start, request, area, cancelled);
    const tiles = interactionTiles(world, cancelled);
    if (request.entrances !== undefined) return entranceRoute(world, start, request.entrances, tiles, cancelled);
    const goals = routeGoals(world, request, cancelled, tiles);
    if (cancelled()) return { status: 'cancelled' };
    if (!goals) return { status: 'unavailable' };
    const entry = request.entryDirection === undefined ? null : entryGoal(world, goals, request, area);
    if (request.entryDirection !== undefined && !entry) return { status: 'unreachable' };
    if (request.field !== true || world.mode === 'airship')
        return finishEntry(world, route(world, start, goals, cancelled, area), entry);
    const stops = tiles.touch;
    let blockedApproach = false;
    const targetStop = request.waypoint === true ? undefined : request.event;
    for (let cell = 0; cell < stops.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return { status: 'cancelled' };
        if (cell === start || !goals[cell] || !stops[cell] || stops[cell] === targetStop) continue;
        goals[cell] = 0;
        blockedApproach = true;
    }
    if (!entry && goals[start] && stops[start] === targetStop) {
        const reenter = canReenter(world, start, stops, area);
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

module.exports = { solveRoute, solveWorldRoute, findReachable, walkingLanding, routeGoals, inside };
