'use strict';

const { composeWorld, indexOf, offset, step } = require('../geometry.cjs');
const { tickPatrol, advancePosition } = require('./patrol-motion.cjs');

function motionWorld(geometry, live, patrols, cancelled, barrier = 0) {
    if (geometry.scrollType || live.mode !== 'walk' || live.through || patrols.length > 17 ||
        patrols.some(actor => indexOf(geometry, actor.x, actor.y) < 0) ||
        (barrier && !patrols.some(actor => actor.id === barrier && actor.forced))) return null;
    const moving = new Set(patrols.map(actor => actor.id));
    const events = live.events.filter(event => !moving.has(event.id));
    const player = composeWorld(geometry, { ...live, events }, cancelled);
    if (!player) return null;
    // Map events collide with all non-through events. Players collide with
    // normal priority events plus rectangles and native tile/vehicle checks.
    const patrol = composeWorld(geometry, { ...live, events: events.map(event => ({ ...event, normal: true })) }, cancelled);
    return patrol ? { player, patrol, barrier } : null;
}

function changeOccupancy(state, actor, cell, delta) {
    if (actor.through || cell < 0) return;
    state.bodies[cell] += delta;
    if (actor.normal) state.normal[cell] += delta;
    if (actor.hazard) state.hazards[cell] += delta;
}

function startMotion(world, patrols, player, view) {
    const size = world.patrol.cells.length;
    const state = { world, patrols: patrols.map(actor => ({ ...actor })), player: { ...player }, view: { ...view },
        bodies: new Uint8Array(size), normal: new Uint8Array(size), hazards: new Uint8Array(size) };
    for (const actor of state.patrols) changeOccupancy(state, actor, indexOf(world.patrol, actor.x, actor.y), 1);
    return state;
}

function advancePatrols(state) {
    const { world: { patrol: world }, player } = state;
    const playerCell = indexOf(world, player.x, player.y);
    function tryStep(actor, heading) {
        const cell = indexOf(world, actor.x, actor.y);
        if (cell < 0) return null;
        const next = offset(world, cell, heading);
        if (next < 0) return null;
        if (!actor.through) {
            if (actor.hazard && next === playerCell) return 'contact';
            if ((actor.normal && next === playerCell) || state.bodies[next] || step(world, cell, heading) < 0) return null;
        }
        return { x: next % world.width, y: Math.floor(next / world.width) };
    }
    // The copied actors retain native event order. A reserved tile blocks the
    // next event in that same update, before the player is allowed to move.
    for (const actor of state.patrols) {
        const x = actor.x;
        const y = actor.y;
        const result = tickPatrol(actor, player, state.view, tryStep);
        if (result !== 'settled') return result;
        if (actor.id === state.world.barrier && !actor.forced) return 'boundary';
        // An adjacent move on these non-looping maps cannot hit the actor's
        // own occupied tile. Only logical tile changes affect occupancy.
        if (actor.x !== x || actor.y !== y) {
            const cell = indexOf(world, actor.x, actor.y);
            if (cell < 0) return 'boundary';
            changeOccupancy(state, actor, indexOf(world, x, y), -1);
            changeOccupancy(state, actor, cell, 1);
        }
        if (actor.hazard && actor.x === player.x && actor.y === player.y) return 'contact';
    }
    return 'settled';
}

function scrollAxis(position, from, to, extent, tiles) {
    const rounded = Math.round(extent * 16) / 16;
    if (tiles < rounded) return position;
    const center = (rounded - 1) / 2;
    if (to > from && to - position > center) return Math.min(position + to - from, tiles - rounded);
    if (to < from && to - position < center) return Math.max(position + to - from, 0);
    return position;
}

function advancePlayer(state, heading) {
    const { world: { player: world }, player, view } = state;
    if (heading !== null) {
        const cell = indexOf(world, player.x, player.y);
        const next = step(world, cell, heading);
        if (next < 0) return 'blocked';
        if (state.hazards[next]) return 'contact';
        if (state.normal[next]) return 'blocked';
        player.x = next % world.width;
        player.y = Math.floor(next / world.width);
    }
    const x = player.rx;
    const y = player.ry;
    advancePosition(player);
    view.x = scrollAxis(view.x, x, player.rx, view.width, world.width);
    view.y = scrollAxis(view.y, y, player.ry, view.height, world.height);
    return 'settled';
}

module.exports = { motionWorld, startMotion, advancePatrols, advancePlayer };
