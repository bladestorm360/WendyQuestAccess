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

function interactionTiles(world, cancelled, includeBumps = false) {
    const normal = new Uint16Array(world.cells.length);
    const here = new Uint16Array(world.cells.length);
    const bump = includeBumps ? new Uint16Array(world.cells.length) : null;
    const touch = new Uint16Array(world.cells.length);
    const terminals = new Set();
    let buttonTransfers;
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
        if (event.mapTransfer) terminals.add(event.id);
        const layer = event.normal ? normal : event.trigger === 0 ? here : touch;
        const [left, top, right, bottom] = bounds(world, event);
        for (let y = top; y <= bottom; y++) {
            if (cancelled()) break;
            for (let x = left; x <= right; x++) {
                const cell = y * world.width + x;
                if (!layer[cell]) layer[cell] = event.id;
                if (event.mapTransfer && !event.normal && event.trigger === 0) {
                    buttonTransfers ??= new Uint16Array(world.cells.length);
                    if (!buttonTransfers[cell]) buttonTransfers[cell] = event.id;
                }
                if (bump && event.normal && event.trigger !== 0 && !bump[cell]) bump[cell] = event.id;
            }
        }
    }
    if (buttonTransfers) for (let cell = 0; cell < touch.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) break;
        // Actual native touch priority wins an overlapping button entrance.
        if (!touch[cell]) touch[cell] = buttonTransfers[cell];
    }
    return { normal, here, touch, bump, boats, aircraft, terminals };
}

function buttonEvent(world, tiles, cell, heading) {
    const front = offset(world, cell, heading);
    // Native OK tries vehicles and the player's own tile first. A counter
    // extends the check only when the nearer tile starts no event.
    if (tiles.aircraft === cell || tiles.boats[front]) return 0;
    if (tiles.here[cell] || front < 0) return tiles.here[cell];
    return tiles.normal[front] || ((world.cells[front] & COUNTER) ? tiles.normal[offset(world, front, heading)] || 0 : 0);
}

// A failed native movement attempt checks the adjacent normal-priority
// touch event. Counter extensions and action-button priority do not apply.
function bumpEvent(world, tiles, cell, heading) {
    const front = offset(world, cell, heading);
    return front >= 0 && tiles.bump[front] && step(world, cell, heading) < 0 ? tiles.bump[front] : 0;
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

function groundDistances(world, request, cancelled, tiles = interactionTiles(world, cancelled)) {
    const ground = { ...world, mode: 'walk', through: false };
    const goals = request.approach ? orientedApproach(ground, tiles, request, cancelled)?.goals :
        routeGoals(ground, request, cancelled, tiles);
    if (!goals || cancelled()) return null;
    const stops = tiles.touch;
    const distance = new Uint16Array(goals.length);
    const queue = new Uint16Array(goals.length);
    let count = 0;
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return null;
        if (!goals[cell] || (stops[cell] && stops[cell] !== request.event)) continue;
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
    // An oriented floor transfer can be entered directly from a valid
    // landing tile. A solid event still needs a separate action position.
    const occupiesAction = Number.isInteger(request.event) && request.waypoint !== true &&
        (!request.approach || world.events.find(event => event.id === request.event)?.normal);
    for (let cell = 0; cell < world.cells.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return null;
        // Leave the parked airship behind before the player uses the final
        // interaction. On its tile, native OK would try to board it first.
        if (!(world.cells[cell] & LAND) || (ground && (!ground[cell] || (occupiesAction && ground[cell] === 1)))) continue;
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
    const destination = linked || request.targetX !== undefined;
    const tiles = destination ? interactionTiles(world, cancelled, !!request.bumpDirections) : null;
    const ground = destination ? groundDistances(world, request, cancelled, tiles) : null;
    if (cancelled()) return { status: 'cancelled' };
    if (destination && !ground) return { status: 'unavailable' };
    let site = nearestLanding(world, request, ground, cancelled);
    let discovery;
    if (linked && !site) {
        for (const event of world.events) {
            if (cancelled()) return { status: 'cancelled' };
            if (event.discoveryFor !== request.event) continue;
            const approach = groundDistances(world, { event: event.id }, cancelled, tiles);
            const candidate = approach && nearestLanding(world, request, approach, cancelled);
            if (candidate && (!site || candidate.cost < site.cost)) {
                site = candidate;
                discovery = event.id;
            }
        }
    }
    return flyToLanding(world, start, site, area, cancelled, discovery);
}

function flyToLanding(world, start, site, area, cancelled, discovery) {
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

function airshipEntranceRoute(world, start, request, area, cancelled) {
    if (world.mode !== 'airship' || !world.hasLandings || !request.entrances.length ||
        request.entrances.length > MAX_EVENTS) return { status: 'unavailable' };
    const tiles = interactionTiles(world, cancelled);
    let best = null;
    let chosen = null;
    let discovery;
    let rank = Infinity;
    // Search ranked walking entrances using the current floor events and
    // landing flags. Once a rank can be reached, compare only its approaches.
    for (const entrance of request.entrances.slice().sort((a, b) => a.rank - b.rank)) {
        if (cancelled()) return { status: 'cancelled' };
        if (entrance.rank > rank) break;
        const target = { x: request.x, y: request.y, event: entrance.event, approach: entrance.approach };
        const ground = groundDistances(world, target, cancelled, tiles);
        let site = ground && nearestLanding(world, target, ground, cancelled);
        let viaDiscovery;
        if (!site) for (const candidate of request.discoveries || []) {
            if (cancelled()) return { status: 'cancelled' };
            if (candidate.target !== entrance.event) continue;
            const reveal = { ...target, event: candidate.event, approach: undefined };
            const approach = groundDistances(world, reveal, cancelled, tiles);
            const next = approach && nearestLanding(world, reveal, approach, cancelled);
            if (next && (!site || next.cost < site.cost)) {
                site = next;
                viaDiscovery = candidate.event;
            }
        }
        if (site && (!best || site.cost < best.cost)) {
            best = site;
            chosen = entrance;
            rank = entrance.rank;
            discovery = viaDiscovery;
        }
    }
    const result = flyToLanding(world, start, best, area, cancelled, discovery);
    if (result.status === 'ready') {
        result.entrance = chosen.event;
        if (chosen.approach) result.approach = chosen.approach;
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

function route(world, start, goals, cancelled, area, stops, crossStops = false, preference, terminalStops) {
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
        if (cell !== start && stops?.[cell] && (!crossStops || terminalStops?.has(stops[cell]))) continue;
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
    if (request.bumpDirections) {
        if (world.mode !== 'walk') return null;
        const goals = new Uint8Array(world.cells.length);
        for (let cell = 0; cell < goals.length; cell++) {
            if ((cell & 63) === 0 && cancelled()) return null;
            for (let heading = 0; heading < DIRECTIONS.length; heading++) {
                if ((request.bumpDirections & (1 << heading)) && bumpEvent(world, tiles, cell, heading) === request.event) {
                    goals[cell] = DIRECTIONS[heading];
                    break;
                }
            }
        }
        return goals;
    }
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
    return { cell, before, direction: request.entryDirection };
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

function beforeFloorEvent(world, result, event) {
    // Leave the final activation step to the existing manual/Autowalk
    // handoff. The actor has not run yet; its outcome is never projected.
    const last = result.legs[result.legs.length - 1];
    const goal = indexOf(world, result.arrival.x, result.arrival.y);
    if (--last.tiles === 0) result.legs.pop();
    const before = offset(world, goal, 3 - DIRECTIONS.indexOf(last.direction));
    return { ...result, status: 'interrupted', distance: result.distance - 1,
        boundary: last.direction, boundaryEvent: event,
        arrival: { x: before % world.width, y: Math.floor(before / world.width), facing: null } };
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
    const bumps = new Uint8Array(MAX_EVENTS + 1);
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
            if (tiles.bump && next < 0) {
                const bump = tiles.bump[offset(world, cell, heading)];
                if (bump) bumps[bump] |= 1 << heading;
            }
            if (next >= 0 && !reached[next]) {
                reached[next] = 1;
                queue[count++] = next;
            }
        }
    }
    return { reached, events, bumps };
}

// A local destination can require leaving and re-entering its map.
// Seed the transfer graph with actual native interaction approaches, never
// the occupied floor trigger itself or an arbitrary neighboring component.
function routeApproachPoints(geometry, snapshot, request, cancelled) {
    const world = composeWorld(geometry, snapshot, cancelled);
    const tiles = interactionTiles(world, cancelled, !!request.bumpDirections);
    const goals = routeGoals(world, request, cancelled, tiles);
    if (!goals) return [];
    const cells = new Set();
    for (let cell = 0; cell < goals.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return [];
        if (!goals[cell]) continue;
        if (!tiles.touch[cell]) cells.add(cell);
        else if (tiles.touch[cell] === request.event) {
            for (let heading = 0; heading < 4; heading++) {
                const before = offset(world, cell, 3 - heading);
                if (before >= 0 && !tiles.touch[before] && step(world, before, heading) === cell &&
                    (request.entryDirection === undefined || request.entryDirection === DIRECTIONS[heading])) cells.add(before);
            }
        }
        if (cells.size > 32) return [];
    }
    return Array.from(cells, cell => ({ x: cell % world.width, y: Math.floor(cell / world.width) }));
}

function walkingLanding(geometry, snapshot, x, y, cancelled = () => false) {
    const world = composeWorld(geometry, snapshot, cancelled);
    const start = indexOf(world, x, y);
    if (start < 0) return null;
    const tiles = interactionTiles(world, cancelled);
    const { reached, events } = reachableApproaches(world, start, tiles, cancelled);
    // Reaching a different floor event does not mean the player retains
    // control there. A landing itself is already occupied on native handback.
    const approaches = new Uint8Array(MAX_EVENTS + 1);
    for (let cell = 0; cell < reached.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return null;
        if (!reached[cell]) continue;
        if (cell !== start && tiles.touch[cell]) {
            reached[cell] = 0;
            continue;
        }
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const button = buttonEvent(world, tiles, cell, heading);
            if (button) approaches[button] |= 1 << heading;
            const next = step(world, cell, heading);
            if (next >= 0 && tiles.touch[next]) approaches[tiles.touch[next]] |= 1 << heading;
        }
    }
    return { reached, events, approaches };
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
    if (candidate.bumpDirections) return (approaches.bumps[id] & candidate.bumpDirections) !== 0;
    if (!events[id]) return false;
    if (candidate.entryDirection === undefined) return true;
    const target = world.events.find(event => event.id === id);
    const heading = DIRECTIONS.indexOf(candidate.entryDirection);
    const cell = indexOf(world, target.x, target.y);
    if (heading < 0 || cell < 0 || stops[cell] !== id) return false;
    const before = offset(world, cell, 3 - heading);
    return before >= 0 && reached[before] && (!stops[before] || before === start) && step(world, before, heading) === cell;
}

function flightApproaches(world, tiles, candidates, cancelled, grounded = false) {
    const available = new Uint8Array(candidates.length);
    const landingAvailable = world.hasLandings && world.cells.some(value => value & LAND);
    const connected = new Map();
    const discoveries = new Map();
    for (const event of world.events) {
        if (!event.discoveryFor) continue;
        if (!discoveries.has(event.discoveryFor)) discoveries.set(event.discoveryFor, []);
        discoveries.get(event.discoveryFor).push(event.id);
    }
    const canReach = (id, bumpDirections) => {
        const key = id * 16 + (bumpDirections || 0);
        if (!connected.has(key)) {
            const distance = groundDistances(world, { event: id, bumpDirections }, cancelled, tiles);
            connected.set(key, !!distance?.some((value, cell) => value > 1 && (world.cells[cell] & LAND)));
        }
        return connected.get(key);
    };
    for (let index = 0; index < candidates.length; index++) {
        if (cancelled()) return null;
        const candidate = candidates[index];
        const id = candidate.event;
        if (grounded) {
            if (candidate.vehicle || candidate.nearestLanding) continue;
            const key = 'ground:' + (Number.isInteger(id) ? id + ':' + (candidate.bumpDirections || 0) + ':' + !!candidate.waypoint :
                candidate.targetX + ',' + candidate.targetY);
            if (!connected.has(key)) {
                const distance = groundDistances(world, candidate, cancelled, tiles);
                connected.set(key, !!distance?.some((value, cell) => value > 1 && (world.cells[cell] & LAND)));
            }
            if (connected.get(key) || Number.isInteger(id) && !candidate.waypoint &&
                discoveries.get(id)?.some(event => canReach(event))) available[index] = 1;
            continue;
        }
        if (indexOf(world, candidate.targetX, candidate.targetY) >= 0 ||
            (landingAvailable && (candidate.nearestLanding || (Number.isInteger(id) && !candidate.waypoint &&
                (canReach(id, candidate.bumpDirections) || discoveries.get(id)?.some(event => canReach(event))))))) available[index] = 1;
    }
    return available;
}

function openedNpcPassage(geometry, snapshot, gate, cancelled) {
    // Only the audited event and its coupled cleanup pages may change.
    // Keep all other collision in the projected world.
    const events = gate.movesTo ? snapshot.events.map(event => event.id === gate.event
        ? { ...event, x: gate.movesTo[0], y: gate.movesTo[1] } : event) :
        snapshot.events.filter(event => !gate.clears.includes(event.id));
    return composeWorld(geometry, { ...snapshot, events }, cancelled);
}

function npcPassageRoute(geometry, live, world, request, cancelled) {
    const gate = live.npcPassage;
    if (!gate || request.event === gate.event || request.area || request.vehicle) return null;
    const approach = solveWorldRoute(world, { x: request.x, y: request.y, event: gate.event, field: true }, cancelled);
    if (approach.status === 'cancelled') return approach;
    if (approach.status !== 'ready') return null;
    const opened = openedNpcPassage(geometry, live, gate, cancelled);
    if (!opened) return { status: 'cancelled' };
    const { x, y } = approach.arrival;
    const onward = solveWorldRoute(opened, { ...request, x, y }, cancelled);
    if (onward.status === 'cancelled') return onward;
    if (onward.status === 'ready' || onward.status === 'interrupted' &&
        (onward.boundaryEvent === request.event || request.handoffs?.includes(onward.boundaryEvent)))
        return { ...approach, status: 'npcBlocked', npc: gate.event };
    return null;
}

function findReachable(geometry, snapshot, { x, y, candidates, groundedFlight = false }, cancelled = () => false) {
    // Each event can have ordinary, generic and quest entries. Add vehicle
    // entries and up to 64 saved bookmarks.
    if (!Array.isArray(candidates) || candidates.length > MAX_EVENTS * 3 + 4 + 64) return { status: 'unavailable' };
    const world = composeWorld(geometry, snapshot, cancelled);
    if (!world) return { status: 'cancelled' };
    const start = indexOf(world, x, y);
    if (start < 0) return { status: 'unavailable' };
    const tiles = interactionTiles(world, cancelled, candidates.some(candidate => !!candidate.bumpDirections));
    if (world.mode === 'airship') {
        const available = flightApproaches(world, tiles, candidates, cancelled, groundedFlight);
        return available && !cancelled() ? { status: 'reachable', available } : { status: 'cancelled' };
    }
    const approaches = reachableApproaches(world, start, tiles, cancelled);
    if (!approaches) return { status: 'cancelled' };
    const available = new Uint8Array(candidates.length);
    let handoffRoutes;
    let afterNpc;
    const gate = snapshot.npcPassage;
    const gateApproach = gate && approaches.events[gate.event];
    for (let index = 0; index < candidates.length; index++) {
        if (cancelled()) return { status: 'cancelled' };
        const candidate = candidates[index];
        if (approachAvailable(world, start, candidate, tiles, approaches, cancelled)) {
            available[index] = 1;
        } else if (world.mode === 'walk' && Number.isInteger(candidate.event) &&
            Array.isArray(candidate.handoffs) && candidate.handoffs.length <= 16) {
            // The qualified beach targets share at most two event IDs,
            // including aliases in Quests and saved bookmarks.
            handoffRoutes ??= new Map();
            if (!handoffRoutes.has(candidate.event) && handoffRoutes.size < 2) {
                const prefix = solveWorldRoute(world, { ...candidate, x, y, field: true }, cancelled, tiles);
                if (prefix.status === 'cancelled') return prefix;
                handoffRoutes.set(candidate.event, prefix.status === 'interrupted' ? prefix.boundaryEvent : 0);
            }
            const handoff = handoffRoutes.get(candidate.event);
            if (handoff && candidate.handoffs.includes(handoff)) available[index] = 2;
        }
        if (!available[index] && gateApproach) {
            if (!afterNpc) {
                const opened = openedNpcPassage(geometry, snapshot, gate, cancelled);
                if (!opened) return { status: 'cancelled' };
                const interactions = interactionTiles(opened, cancelled, candidates.some(candidate => !!candidate.bumpDirections));
                const reached = reachableApproaches(opened, start, interactions, cancelled);
                if (!reached) return { status: 'cancelled' };
                afterNpc = { opened, interactions, reached };
            }
            const { opened, interactions, reached } = afterNpc;
            if (approachAvailable(opened, start, candidate, interactions, reached, cancelled)) available[index] = 1;
            else if (Number.isInteger(candidate.event) && candidate.handoffs?.length <= 16) {
                afterNpc.handoffs ??= new Map();
                if (!afterNpc.handoffs.has(candidate.event) && afterNpc.handoffs.size < 2) {
                    const prefix = solveWorldRoute(opened, { ...candidate, x, y, field: true }, cancelled, interactions);
                    if (prefix.status === 'cancelled') return prefix;
                    afterNpc.handoffs.set(candidate.event, prefix.status === 'interrupted' ? prefix.boundaryEvent : 0);
                }
                if (candidate.handoffs.includes(afterNpc.handoffs.get(candidate.event))) available[index] = 1;
            }
        }
    }
    return { status: 'reachable', available };
}

function entranceRoute(world, start, events, tiles, cancelled) {
    const walking = world.mode === 'walk';
    if ((!walking && world.mode !== 'ship') || !Array.isArray(events) || !events.length || events.length > MAX_EVENTS)
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
        if (!walking || (touch && cell !== start)) continue;
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

function orientedApproach(world, tiles, candidate, cancelled, start) {
    const heading = DIRECTIONS.indexOf(candidate.approach);
    const target = world.events.find(event => event.id === candidate.event && !event.erased && event.action);
    if (!target || heading < 0 || target.trigger !== 1) return null;
    if (target.normal) {
        const goals = new Uint8Array(world.cells.length);
        for (let cell = 0; cell < goals.length; cell++) {
            if ((cell & 63) === 0 && cancelled()) return null;
            if ((cell === start || !tiles.touch[cell]) && buttonEvent(world, tiles, cell, heading) === target.id)
                goals[cell] = candidate.approach;
        }
        return { goals };
    }
    const goals = actionGoals(world, candidate.event, cancelled, false, tiles);
    const entry = goals && entryGoal(world, goals, { event: candidate.event, entryDirection: candidate.approach });
    return entry ? { goals, entry } : null;
}

function transferEntranceRoute(world, start, request, tiles, cancelled) {
    const ordinary = request.entrances.filter(edge => !edge.approach);
    let direct = entranceRoute(world, start, ordinary, tiles, cancelled);
    if (world.mode === 'walk') {
        let rank = ordinary.find(edge => edge.event === direct.entrance)?.rank ?? Infinity;
        for (const candidate of request.entrances) {
            if (cancelled()) return { status: 'cancelled' };
            if (!candidate.approach || candidate.rank > rank) continue;
            const approach = orientedApproach(world, tiles, candidate, cancelled, start);
            if (!approach || (approach.entry && approach.entry.before !== start && tiles.touch[approach.entry.before])) continue;
            const result = finishEntry(world, route(world, start, approach.goals, cancelled, undefined, tiles.touch), approach.entry);
            if (result.status === 'ready' && (candidate.rank < rank || result.distance < direct.distance)) {
                direct = { ...result, entrance: candidate.event, approach: candidate.approach };
                rank = candidate.rank;
            }
        }
        if (direct.status === 'unavailable' && request.entrances.some(edge => edge.approach)) direct = { status: 'unreachable' };
    }
    if (world.mode !== 'walk' || direct.status !== 'unreachable' || !request.discoveries?.length) return direct;
    const ranks = new Map(request.entrances.map(edge => [edge.event, edge.rank]));
    const choices = request.discoveries.filter(edge => ranks.has(edge.target))
        .map(edge => ({ event: edge.event, rank: ranks.get(edge.target) }));
    if (!choices.length) return direct;
    const via = entranceRoute(world, start, choices, tiles, cancelled);
    if (via.status === 'ready') via.discoveryFor = request.discoveries.find(edge => edge.event === via.entrance)?.target;
    return via;
}

function shipLandingRoute(world, request, cancelled) {
    if (world.mode !== 'ship') return { status: 'unavailable' };
    const { event, x, y, facing } = request.shipLanding;
    // Verify walking reachability from the settled native tile before
    // offering the sailing route to the authored disembarkation event.
    const walking = solveWorldRoute({ ...world, mode: 'walk' }, { ...request, x, y, shipLanding: undefined }, cancelled);
    if (walking.status !== 'ready') return walking.status === 'cancelled' ? walking : { status: 'unreachable' };
    const sailing = solveWorldRoute(world, { x: request.x, y: request.y, event, entryDirection: facing,
        surface: true, field: true }, cancelled);
    if (sailing.status === 'ready') {
        sailing.entrance = event;
        if (walking.entrance) sailing.groundEntrance = walking.discoveryFor ?? walking.entrance;
        if (walking.approach) sailing.groundApproach = walking.approach;
    }
    return sailing;
}

function solveWorldRoute(world, request, cancelled = () => false, readyTiles) {
    const start = indexOf(world, request.x, request.y);
    if (start < 0) return { status: 'unavailable' };
    const area = request.area && clipRectangle(world, request.area);
    if (request.area && (!area || !inside(world, start, area))) return { status: 'unavailable' };
    if (request.landing === true) return request.entrances !== undefined
        ? airshipEntranceRoute(world, start, request, area, cancelled) : landingRoute(world, start, request, area, cancelled);
    if (request.shipLanding && request.entrances === undefined) return shipLandingRoute(world, request, cancelled);
    const tiles = readyTiles || interactionTiles(world, cancelled, !!request.bumpDirections);
    if (request.entrances !== undefined) {
        const result = transferEntranceRoute(world, start, request, tiles, cancelled);
        if (request.shipLanding && request.groundEntrances?.length && ['unavailable', 'unreachable'].includes(result.status))
            return shipLandingRoute(world, { ...request, entrances: request.groundEntrances }, cancelled);
        return result;
    }
    const goals = routeGoals(world, request, cancelled, tiles);
    if (cancelled()) return { status: 'cancelled' };
    if (!goals) return { status: 'unavailable' };
    const entry = request.entryDirection === undefined ? null : entryGoal(world, goals, request, area);
    if (request.entryDirection !== undefined && !entry) return { status: 'unreachable' };
    if (request.field !== true || world.mode === 'airship')
        return finishEntry(world, route(world, start, goals, cancelled, area), entry);
    const stops = tiles.touch;
    const terminalStops = tiles.terminals;
    let blockedApproach = false;
    const handoffs = new Set();
    let coveredGoals;
    const targetStop = request.waypoint === true ? undefined : request.event;
    for (let cell = 0; cell < stops.length; cell++) {
        if ((cell & 63) === 0 && cancelled()) return { status: 'cancelled' };
        if (cell === start || !goals[cell] || !stops[cell] || stops[cell] === targetStop) continue;
        if (terminalStops.has(stops[cell]) && stops[cell] !== request.event) {
            // A covered approach is not permission to enter another map.
            // Only an explicit graph plan may select that entrance itself.
            goals[cell] = 0;
            blockedApproach = true;
            continue;
        }
        if (!entry && request.handoffs?.includes(stops[cell])) handoffs.add(stops[cell]);
        coveredGoals ??= new Uint8Array(goals.length);
        coveredGoals[cell] = goals[cell];
        goals[cell] = 0;
        blockedApproach = true;
    }
    if (!entry && goals[start] && stops[start] === targetStop &&
        world.events.find(event => event.id === targetStop)?.trigger !== 0) {
        const reenter = canReenter(world, start, stops, area);
        return reenter ? { ...trace(world, start, start, 1, null, cancelled), reenter: true } : { status: 'unreachable' };
    }
    const clear = route(world, start, goals, cancelled, area, stops);
    if (clear.status !== 'unreachable') {
        const result = finishEntry(world, clear, entry);
        if (result.status !== 'ready' || request.stopBeforeEvent !== true || !result.distance) return result;
        const goal = indexOf(world, result.arrival.x, result.arrival.y);
        if (stops[goal] !== targetStop) return result;
        return beforeFloorEvent(world, result, targetStop);
    }
    // Native entrances terminate local transit for every destination.
    // Verified graph routing selects an entrance as a goal; it never
    // authorizes walking across its tile to an unrelated local target.
    const possible = route(world, start, goals, cancelled, area, stops, true, undefined, terminalStops);
    if (possible.status !== 'unreachable') return finishEntry(world, possible, entry);
    if (coveredGoals) {
        // A floor event may occupy the only button/bump/counter approach,
        // waypoint or oriented entrance predecessor. Prove the full path
        // with the unchanged native colliders, then return only its prefix
        // before the first floor event. One bounded fallback search replaces
        // missing per-map metadata; real walls and closed gates stay blocked.
        for (let cell = 0; cell < goals.length; cell++) {
            if ((cell & 63) === 0 && cancelled()) return { status: 'cancelled' };
            if (coveredGoals[cell]) goals[cell] = coveredGoals[cell];
        }
        const covered = route(world, start, goals, cancelled, area, stops, true, undefined, terminalStops);
        if (covered.status !== 'unreachable')
            return covered.status === 'ready' ? beforeFloorEvent(world, covered,
                stops[indexOf(world, covered.arrival.x, covered.arrival.y)]) : covered;
    }
    // A verified approach can itself be a floor event. Stop before stepping
    // onto it, then let the native interpreter run before continuing.
    let handoff;
    for (const event of handoffs) {
        const prefix = solveWorldRoute(world, { x: request.x, y: request.y, event, field: true,
            stopBeforeEvent: true, area }, cancelled, tiles);
        if (prefix.status === 'cancelled') return prefix;
        if (prefix.status === 'interrupted' && (!handoff || prefix.distance < handoff.distance)) handoff = prefix;
    }
    return handoff || (blockedApproach ? { status: 'approachBlocked' } : possible);
}

function encounterObstacles(events, target) {
    return events.filter(event => event.movingEnemy && event.normal && !event.through &&
        !event.erased && event.id !== target && !event.rectangle && !Number.isInteger(event.tileFlag));
}

function encounterRoute(geometry, snapshot, world, request, cancelled, reversing, stable) {
    // Keep all other colliders and floor triggers in the planning copy.
    // Live collision still determines how far the player can safely walk.
    const enemies = encounterObstacles(world.events, request.event);
    if (cancelled()) return { status: 'cancelled' };
    if (!enemies.length) return null;
    const occupied = new Map(enemies.map(event => [indexOf(world, event.x, event.y), event.id]));
    const excluded = new Set(enemies);
    const relaxed = composeWorld(geometry, { ...snapshot,
        events: snapshot.events.filter(event => !excluded.has(event)) }, cancelled);
    if (!relaxed) return { status: 'cancelled' };
    const possible = solveWorldRoute(relaxed, request, cancelled);
    if (!['ready', 'interrupted'].includes(possible.status) || possible.reenter)
        return possible.status === 'cancelled' ? possible : null;
    // If Wendy already followed this route and an enemy now crosses it, a
    // fresh detour can undo that progress on every request. Offer the safe
    // prefix to the blocker if the relaxed route really continues forward.
    if (reversing && (possible.legs[0]?.direction ?? possible.boundary) === 10 - request.followedDirection)
        return null;
    const legs = [];
    let cell = indexOf(world, request.x, request.y);
    let distance = 0;
    const blocked = (enemy, boundary) => ({ status: 'enemyBlocked', enemy, boundary, legs, distance,
        arrival: { x: cell % world.width, y: Math.floor(cell / world.width), facing: null },
        ...(possible.entrance && { entrance: possible.entrance, approach: possible.approach, needsEncounter: true }) });
    for (const leg of possible.legs) {
        const heading = DIRECTIONS.indexOf(leg.direction);
        let walked = 0;
        while (walked < leg.tiles) {
            if ((distance & 63) === 0 && cancelled()) return { status: 'cancelled' };
            const next = step(world, cell, heading);
            if (next < 0) {
                const enemy = occupied.get(offset(world, cell, heading));
                if (!enemy) return null;
                if (walked) legs.push({ ...leg, tiles: walked });
                return blocked(enemy, leg.direction);
            }
            cell = next;
            walked++;
            distance++;
        }
        legs.push(leg);
    }
    if (possible.status === 'interrupted') {
        // The final activation edge is outside the returned walking legs.
        // Check it against the current collider too before naming the floor event.
        const heading = DIRECTIONS.indexOf(possible.boundary);
        if (step(world, cell, heading) >= 0) return possible;
        const enemy = occupied.get(offset(world, cell, heading));
        return enemy ? blocked(enemy, possible.boundary) : null;
    }
    if (!stable) return null;
    const heading = DIRECTIONS.indexOf(possible.arrival.facing);
    const enemy = heading >= 0 && occupied.get(offset(world, cell, heading));
    if (enemy && (possible.entrance || request.event)) {
        const tiles = interactionTiles(world, cancelled, !!request.bumpDirections);
        if (cancelled()) return { status: 'cancelled' };
        const interaction = request.bumpDirections ? bumpEvent : buttonEvent;
        if (interaction(world, tiles, cell, heading) === enemy)
            return blocked(enemy, possible.arrival.facing);
    }
    return possible;
}

function solveRoute(geometry, snapshot, request, cancelled = () => false) {
    if (cancelled()) return { status: 'cancelled' };
    const world = composeWorld(geometry, snapshot, cancelled);
    if (!world) return { status: 'cancelled' };
    const onFoot = world.mode === 'walk' && request.field === true && !request.area && !request.vehicle;
    const stable = onFoot && snapshot.stableEncounters === true;
    const preferred = stable && encounterRoute(geometry, snapshot, world, request, cancelled, false, true);
    if (preferred) return preferred;
    const result = solveWorldRoute(world, request, cancelled);
    const inaccessible = ['unreachable', 'approachBlocked'].includes(result.status);
    if (world.mode === 'walk' && request.field === true && inaccessible) {
        const prerequisite = npcPassageRoute(geometry, snapshot, world, request, cancelled);
        if (prerequisite) return prerequisite;
    }
    if (!onFoot || stable || request.entrances !== undefined) return result;
    const reversing = result.status === 'ready' && DIRECTIONS.includes(request.followedDirection) &&
        result.legs[0]?.direction === 10 - request.followedDirection;
    return reversing || inaccessible
        ? encounterRoute(geometry, snapshot, world, request, cancelled, reversing, false) || result : result;
}

module.exports = { solveRoute, solveWorldRoute, encounterObstacles, findReachable, walkingLanding, routeApproachPoints, routeGoals, inside };
