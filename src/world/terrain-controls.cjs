'use strict';

// The map-specific records are derived from the installed tile-edit commands.
// Only an active, reachable native control can become a prerequisite.
const { composeWorld } = require('./geometry.cjs');
const { solveWorldRoute } = require('./routes.cjs');

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
        if (onward.status === 'ready') return { ...approach, status: 'controlRoute', event: id };
    }
    return null;
}

module.exports = { routeThroughControl };
