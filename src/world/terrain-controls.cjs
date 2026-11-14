'use strict';

// The map-specific records are derived from the installed tile-edit commands.
// Only an active, reachable native control can become a prerequisite.
const { composeWorld } = require('./geometry.cjs');
const { solveRoute, solveWorldRoute, encounterObstacles } = require('./routes.cjs');

function routeThroughControl(geometry, live, request, controls, cancelled) {
    if (live.mode !== 'walk' || !controls || request.entrances || request.vehicle || request.area || request.motion)
        return null;
    const current = composeWorld(geometry, live, cancelled);
    if (!current) return { status: 'cancelled' };
    for (const [id, changes] of controls) {
        if (cancelled()) return { status: 'cancelled' };
        if (id === request.event || !live.events.some(event => event.id === id && event.trigger === 0 &&
            event.action && !event.erased)) continue;
        const approach = solveWorldRoute(current, { x: request.x, y: request.y, event: id, field: true }, cancelled);
        if (approach.status !== 'ready') continue;
        // Copy only the affected walking flags. Other dynamic blockers, tiles
        // and ordinary native floor events still gate the proposed connection.
        const opened = { ...current, cells: current.cells.slice() };
        for (const [cell, flags] of changes) opened.cells[cell] = (opened.cells[cell] & 240) | flags;
        const onward = solveWorldRoute(opened, { ...request, x: approach.arrival.x, y: approach.arrival.y }, cancelled);
        if (onward.status === 'ready' || onward.status === 'interrupted') return { ...approach, status: 'controlRoute', event: id };
    }
    return null;
}

function routeThroughIce(geometry, live, request, cancelled) {
    if (live.mode !== 'walk' || request.entrances || request.vehicle || request.area || request.motion) return null;
    const ice = live.events.filter(event => event.meltable && !event.erased && event.id !== request.event);
    if (!ice.length || ice.length > 8) return null;
    const queue = [{ x: request.x, y: request.y, removed: 0, first: null }];
    const visited = new Set();
    // A node clears only verified one-use blockers. Replay normal collision
    // and event ordering for each candidate approach. Copying and search
    // happen on the existing routing worker under its cancellation epoch.
    for (let index = 0; index < queue.length && index < 64; index++) {
        if (cancelled()) return { status: 'cancelled' };
        const { x, y, removed, first } = queue[index];
        const events = removed ? live.events.filter(event =>
            !ice.some((block, slot) => block === event && (removed & (1 << slot)))) : live.events;
        const world = composeWorld(geometry, { ...live, events }, cancelled);
        if (!world) return { status: 'cancelled' };
        if (first) {
            const goal = solveWorldRoute(world, { ...request, x, y }, cancelled);
            if (goal.status === 'cancelled') return goal;
            if (goal.status === 'ready' || goal.status === 'interrupted') return { ...first, status: 'iceRoute' };
        }
        for (const [slot, block] of ice.entries()) {
            if (removed & (1 << slot)) continue;
            const approach = solveWorldRoute(world, { x, y, event: block.id, field: true }, cancelled);
            if (approach.status === 'cancelled') return approach;
            if (approach.status !== 'ready') continue;
            const next = removed | (1 << slot);
            const { x: arrivalX, y: arrivalY } = approach.arrival;
            const key = next + ':' + arrivalX + ':' + arrivalY;
            if (visited.has(key) || queue.length >= 64) continue;
            visited.add(key);
            queue.push({ x: arrivalX, y: arrivalY, removed: next, first: first || { ...approach, event: block.id } });
        }
    }
    return null;
}

function routeThroughTerrain(geometry, live, request, controls, cancelled) {
    const plan = world => routeThroughControl(geometry, world, request, controls, cancelled) ||
        (!request.refresh && routeThroughIce(geometry, world, request, cancelled));
    const direct = plan(live);
    if (direct || cancelled()) return direct;
    if (live.mode !== 'walk' || request.refresh || request.entrances || request.vehicle || request.area || request.motion ||
        (!controls?.length && !live.events.some(event => event.meltable && !event.erased))) return null;
    // Ice and a moving encounter can block different parts of the same
    // route. Use the relaxed world only to prove continuation. Verify the
    // first step on the unchanged snapshot before giving any instructions.
    const obstacles = new Set(encounterObstacles(live.events, request.event));
    if (!obstacles.size) return null;
    const candidate = plan({ ...live, events: live.events.filter(event => !obstacles.has(event)) });
    if (!candidate || candidate.status === 'cancelled') return candidate;
    const prefix = solveRoute(geometry, live, { x: request.x, y: request.y, event: candidate.event, field: true }, cancelled);
    if (prefix.status === 'ready') return { ...prefix, status: candidate.status, event: candidate.event };
    if (prefix.status === 'enemyBlocked') return { ...prefix, terrain: { status: candidate.status, event: candidate.event } };
    return ['interrupted', 'cancelled'].includes(prefix.status) ? prefix : null;
}

module.exports = { routeThroughTerrain, routeThroughControl, routeThroughIce };
