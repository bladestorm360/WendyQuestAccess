'use strict';

// The map-specific records are derived from the installed tile-edit commands.
// Only an active, reachable native control can become a prerequisite.
const { composeWorld, indexOf, step } = require('./geometry.cjs');
const { solveRoute, solveWorldRoute, encounterObstacles } = require('./routes.cjs');

function routeThroughControl(geometry, live, request, controls, cancelled, remoteAccess) {
    if (live.mode !== 'walk' || !controls || request.entrances || request.vehicle || request.area || request.motion)
        return null;
    const current = composeWorld(geometry, live, cancelled);
    if (!current) return { status: 'cancelled' };
    const map = live.terrainMap;
    const gate = live.terrainSwitch;
    if (gate && live.terrainGate !== false) return null;
    const remote = map === 204 || gate === 97;
    if (remote && request.refresh) return null;
    let best;
    for (const [id, changes, pull] of controls) {
        if (cancelled()) return { status: 'cancelled' };
        const control = current.events.find(event => event.id === id && event.action && !event.erased);
        if (!changes.length || id === request.event || (!remote && !control)) continue;
        const stepOn = control?.trigger === 1 && !control.normal;
        if (!remote && !stepOn && control.trigger !== 0) continue;
        const approach = remote ? null : solveWorldRoute(current, { x: request.x, y: request.y, event: id,
            field: true, stopBeforeEvent: stepOn }, cancelled);
        if (approach?.status === 'cancelled') return approach;
        const detour = pull && live.pullStage === 2 && id === 4 && approach?.status !== 'ready';
        if (approach && !detour && (stepOn ? approach.status !== 'interrupted' || approach.boundaryEvent !== id
            : approach.status !== 'ready')) continue;
        let origin = stepOn && !remote ? control : approach?.arrival || request;
        if (pull && !detour) {
            let cell = indexOf(current, origin.x, origin.y);
            for (const heading of pull.pulled) {
                const next = step(current, cell, heading);
                if (next >= 0) cell = next;
                else if (!pull.skippable) { cell = -1; break; }
            }
            if (cell < 0) continue;
            origin = { x: cell % current.width, y: Math.floor(cell / current.width) };
        }
        // Model only the audited terrain change on a detached copy. The
        // approach to the control always used current collision and events.
        // Retire the used handle, or the duplicate floor trigger set, just
        // as their native page changes do. Rebuild collision on the worker.
        let projected = live.events;
        if (stepOn && !remote || pull)
            projected = projected.filter(event => !controls.some(([used]) => used === event.id));
        if (gate === 103) {
            // Chomps leaves the corridor, and the previously disabled
            // office door gets its normal-priority touch page.
            projected = projected.filter(event => event.id !== 8).map(event => event.id === 18
                ? { ...event, trigger: 1, normal: true, action: true, through: false } : event);
        }
        const opened = projected === live.events
            ? { ...current, cells: current.cells.slice() } : composeWorld(geometry, { ...live, events: projected }, cancelled);
        if (!opened) return { status: 'cancelled' };
        for (const [cell, flags] of changes) opened.cells[cell] = (opened.cells[cell] & 240) | flags;
        if (gate === 103) {
            // The native wall scene takes Wendy to the north end of the
            // corridor before releasing control. Verify each forward edge
            // of the authored continuation against the projected terrain.
            let cell = indexOf(opened, origin.x, origin.y);
            for (const heading of [3, 3, 3, 3, 3, 3, 2, 3, 3, 3]) {
                cell = step(opened, cell, heading);
                if (cell < 0) break;
            }
            if (cell < 0) continue;
            origin = { x: cell % opened.width, y: Math.floor(cell / opened.width) };
        }
        const onward = solveWorldRoute(opened, { ...request, x: origin.x, y: origin.y }, cancelled);
        if (onward.status === 'cancelled') return onward;
        let afterIce;
        if (onward.status !== 'ready' && onward.status !== 'interrupted') {
            if (gate !== 97) continue;
            // The bridge work can reveal an approach that is still blocked
            // by a separate, ordinary ice interaction. Verify both effects
            // on worker-owned copies before naming the first prerequisite.
            const next = routeThroughIce(geometry, { ...live, events: projected },
                { ...request, x: origin.x, y: origin.y }, cancelled, changes);
            if (next?.status === 'cancelled') return next;
            if (!next) continue;
            afterIce = next.event;
        }
        if (detour) {
            const exit = solveWorldRoute(current, { x: request.x, y: request.y, event: 2,
                field: true, bumpDirections: 15, handoffs: [8] }, cancelled);
            if (exit.status === 'ready' || exit.status === 'interrupted' && exit.boundaryEvent === 8)
                return { ...exit, status: 'terrainExit', event: 2, gate: 'pull' };
            if (exit.status === 'cancelled') return exit;
            continue;
        }
        if (remote) {
            const exit = map === 204 ? solveWorldRoute(current, { x: request.x, y: request.y,
                event: id, field: true, stopBeforeEvent: true }, cancelled) : remoteAccess?.();
            if (exit?.status === 'cancelled') return exit;
            if (exit && (exit.status === 'ready' || exit.status === 'interrupted' || exit.needsEncounter))
                return { ...exit, status: 'terrainExit', event: id, gate, ...(afterIce && { afterIce }) };
            return request.refresh ? null : { status: 'terrainGate', gate, ...(afterIce && { afterIce }) };
        }
        if (!best || approach.distance < best.distance)
            best = { ...approach, status: 'controlRoute', event: id, gate, step: stepOn };
    }
    return best || null;
}

function routeThroughIce(geometry, live, request, cancelled, terrain = []) {
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
        for (const [cell, flags] of terrain) world.cells[cell] = (world.cells[cell] & 240) | flags;
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

function routeThroughTerrain(geometry, live, request, controls, cancelled, remoteAccess) {
    const plan = world => routeThroughControl(geometry, world, request, controls, cancelled) ||
        (!request.refresh && routeThroughIce(geometry, world, request, cancelled));
    const direct = remoteAccess ? routeThroughControl(geometry, live, request, controls, cancelled, remoteAccess) : plan(live);
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
    if (!['controlRoute', 'iceRoute'].includes(candidate.status)) return null;
    if (candidate.step) {
        const first = solveRoute(geometry, live, { x: request.x, y: request.y, event: candidate.event,
            field: true, stopBeforeEvent: true }, cancelled);
        if (first.status === 'interrupted' && first.boundaryEvent === candidate.event)
            return { ...first, status: 'controlRoute', event: candidate.event, gate: candidate.gate, step: true };
        return first.status === 'cancelled' || first.status === 'enemyBlocked' ? first : null;
    }
    const prefix = solveRoute(geometry, live, { x: request.x, y: request.y, event: candidate.event, field: true }, cancelled);
    if (prefix.status === 'ready') return { ...prefix, status: candidate.status, event: candidate.event, gate: candidate.gate };
    if (prefix.status === 'enemyBlocked') return { ...prefix, terrain: { status: candidate.status, event: candidate.event } };
    return ['interrupted', 'cancelled'].includes(prefix.status) ? prefix : null;
}

module.exports = { routeThroughTerrain, routeThroughControl, routeThroughIce };
