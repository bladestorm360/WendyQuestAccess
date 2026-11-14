'use strict';

const { MAX_CELLS, composeWorld } = require('../geometry.cjs');
const { solveWorldRoute } = require('../routes.cjs');

const { TERRAIN, ORDERED, REMINDERS } = require('./salt-state.cjs');
const CONTROLS = [...TERRAIN, ...ORDERED, 97];
const ENCOUNTERS = [7, 48, 101, 102, 127, 133, 134, 135, 136, 137];

function advance(state, event) {
    let { mask, order, hits, finalOpen, eastOpen } = state;
    const terrain = TERRAIN.indexOf(event);
    if (terrain >= 0) {
        mask ^= [65, 2, 52, 25][terrain];
        if ((mask & 104) === 104) {
            mask |= 128;
            eastOpen = true;
        }
    } else if (event === 97) {
        if (!order && !hits) return null;
        order = hits = 0;
    } else {
        const index = ORDERED.indexOf(event);
        // The native wrong-order branch resets the attempt. Only plan
        // correct presses and an intentional reset if recovery needs one.
        if (index !== order || hits & (1 << index)) return null;
        hits |= 1 << index;
        if (++order === 4) finalOpen = true;
    }
    return { mask, order, hits, finalOpen, eastOpen };
}

function applyState(live, model, state, cleared) {
    const edits = new Map();
    for (const packed of live.terrain) edits.set(packed & (MAX_CELLS - 1), packed);
    for (const [bit, open, closed] of model.floods) {
        const filled = bit === 8 ? state.eastOpen : bit === 9 ? state.finalOpen : !!(state.mask & (1 << bit));
        const initial = bit === 8 ? live.salt.eastOpen : bit === 9 ? live.salt.finalOpen : !!(live.salt.mask & (1 << bit));
        if (filled === initial) continue;
        for (const packed of filled ? open : closed) edits.set(packed & (MAX_CELLS - 1), packed);
    }
    const events = live.events.map(event => {
        if (cleared.includes(event.id) || cleared.includes(105) && REMINDERS.includes(event.id))
            return { ...event, normal: false, action: false, erased: true };
        if (event.id === 35 && state.finalOpen || event.id === 71 && state.eastOpen)
            return { ...event, normal: false, action: false };
        const bit = model.blockers[event.id];
        if (bit === undefined) return event;
        return { ...event, normal: !(state.mask & (1 << bit)) };
    });
    return { ...live, terrain: Uint32Array.from(edits.values()), events };
}

function solveSaltRoute(base, live, request, model, cancelled) {
    if (!live.salt || live.mode !== 'walk' || !(model?.floods?.length === 7) ||
        base.width !== 50 || base.height !== 70 || request.vehicle || request.area) return null;
    const start = { state: live.salt, x: request.x, y: request.y, first: null, actions: [], cleared: [] };
    const queue = [start];
    const keyFor = ({ mask, order, hits, finalOpen, eastOpen }, x, y, cleared = []) =>
        [mask, order, hits, +finalOpen, +eastOpen, x, y, ...cleared].join(',');
    const seen = new Set([keyFor(start.state, start.x, start.y)]);
    // The first leg uses the current terrain. Future legs use copied
    // switch/collision states and are never handed to native movement.
    const north = request.event === 2 || request.event === 3 || ORDERED.includes(request.event);
    const priority = node => node.actions.length - (north ? node.state.order * 5 +
        (node.state.eastOpen ? 3 : 0) + (node.y < 37 ? 3 : node.y < 45 ? 1 : 0) : 0);
    for (let attempts = 0; queue.length && attempts < 220; attempts++) {
        if (cancelled()) return { status: 'cancelled' };
        if (north) queue.sort((left, right) => priority(left) - priority(right));
        const node = queue.shift();
        const { state, x, y, cleared } = node;

        const world = composeWorld(base, node.first ? applyState(live, model, state, cleared) : live, cancelled);
        if (!world) return { status: 'cancelled' };
        const goal = solveWorldRoute(world, { ...request, x, y }, cancelled);
        if (goal.status === 'cancelled') return goal;
        if (node.first && goal.status === 'ready')
            return { ...node.first, status: 'saltRoute', actions: node.actions };
        if (node.actions.length >= 18) continue;
        const floor = new Map();
        function push(next, approach, event, nextCleared, boundary = 0, kind = 'action') {
            const { x, y } = approach.arrival;
            const key = keyFor(next, x, y, nextCleared);
            if (seen.has(key) || queue.length >= 320) return;
            seen.add(key);
            queue.push({ state: next, x, y, cleared: nextCleared,
                first: node.first || { ...approach, boundary, prerequisiteKind: kind },
                actions: [...node.actions, event] });
        }
        function rememberFloor(route) {
            const id = route.boundaryEvent;
            if (route.status === 'interrupted' && (id === 18 || REMINDERS.includes(id))) floor.set(id, route);
        }
        rememberFloor(goal);
        for (const event of CONTROLS) {
            if (event === request.event) continue;
            const next = advance(state, event);
            if (!next) continue;
            const approach = solveWorldRoute(world, { x, y, event, field: true }, cancelled);
            if (approach.status === 'cancelled') return approach;
            if (approach.status === 'ready') push(next, approach, event, cleared);
            else rememberFloor(approach);
        }
        for (const event of ENCOUNTERS) {
            if (cleared.includes(event) || !world.events.some(item => item.id === event && !item.erased && item.action)) continue;
            const approach = solveWorldRoute(world, { x, y, event, field: true, bumpDirections: 15 }, cancelled);
            if (approach.status === 'cancelled') return approach;
            if (approach.status === 'ready') push(state, approach, event, [...cleared, event].sort((a, b) => a - b), approach.arrival.facing, 'encounter');
            else rememberFloor(approach);
        }
        for (const [id, approach] of floor) {
            const event = REMINDERS.includes(id) ? 105 : id;
            if (!cleared.includes(event))
                push(state, approach, event, [...cleared, event].sort((a, b) => a - b), approach.boundary, 'floor');
        }
    }
    return null;
}

module.exports = { solveSaltRoute };
