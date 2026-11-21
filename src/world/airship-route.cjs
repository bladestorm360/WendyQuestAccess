"use strict";

const { solveRoute, findReachable } = require('./routes.cjs');

function availableAircraft(live) {
    const craft = live?.aircraft;
    return live?.mode === 'walk' && live.airshipAvailable === true &&
        Number.isInteger(craft?.x) && Number.isInteger(craft?.y) ? craft : null;
}

// This runs only in the route worker. Four bounded searches compare the
// existing direct walk with boarding, flight/landing and the ground leg.
// Native objects and vehicle actions remain in the renderer/native owners.
function onFootAirshipRoute(base, live, request, direct, cancelled, resolveFlight) {
    const craft = availableAircraft(live);
    if (!craft || !base.hasLandings || request.field !== true || request.area || request.motion || request.vehicle)
        return null;
    const boarding = solveRoute(base, live, { x: request.x, y: request.y, vehicle: 'airship',
        field: true, limit: request.limit }, cancelled);
    if (cancelled() || boarding.status === 'cancelled') return { status: 'cancelled' };
    if (boarding.status !== 'ready') return null;
    const flightLive = { ...live, mode: 'airship', through: false, airshipAvailable: false };
    const flightRequest = { ...request, x: craft.x, y: craft.y, landing: true, detour: undefined };
    const flight = resolveFlight ? resolveFlight(flightLive, flightRequest) : solveRoute(base, flightLive, flightRequest, cancelled);
    if (cancelled() || flight.status === 'cancelled') return { status: 'cancelled' };
    if (flight.status !== 'ready' || !flight.land) return null;
    const event = flight.discovery ?? flight.entrance ?? request.event;
    const groundRequest = { x: flight.arrival.x, y: flight.arrival.y, event,
        targetX: request.targetX, targetY: request.targetY, waypoint: request.waypoint,
        bumpDirections: request.bumpDirections, field: true, stopBeforeEvent: request.stopBeforeEvent,
        entryDirection: flight.discovery ? undefined : flight.approach ?? request.entryDirection };
    const ground = solveRoute(base, { ...live, aircraft: { x: flight.arrival.x, y: flight.arrival.y },
        airshipAvailable: false }, groundRequest, cancelled);
    if (cancelled() || ground.status === 'cancelled') return { status: 'cancelled' };
    if (ground.status !== 'ready' && !(ground.status === 'interrupted' && ground.boundaryEvent === event)) return null;
    const distance = boarding.distance + flight.distance + ground.distance + 2;
    // Compare complete direct walks. Remote plans expose only their next
    // entrance leg: compare those only when both plans use the same entrance.
    const nextEntrance = flight.discovery ?? flight.entrance;
    const sameGoal = !request.transfer || direct.entrance === nextEntrance &&
        (flight.discovery !== undefined || direct.approach === flight.approach);
    const directWalk = direct.status === 'ready' || direct.status === 'interrupted' && direct.boundaryEvent === request.event;
    if (sameGoal && directWalk && direct.distance <= distance) return null;
    return { ...boarding, airshipBoarding: { x: craft.x, y: craft.y,
        landing: { x: flight.arrival.x, y: flight.arrival.y }, totalDistance: distance,
        flightDistance: flight.distance, groundDistance: ground.distance } };
}

function onFootAirshipReachable(base, live, request, direct, cancelled) {
    const craft = availableAircraft(live);
    if (!craft || !base.hasLandings || direct.status !== 'reachable') return direct;
    const board = solveRoute(base, live, { x: request.x, y: request.y, vehicle: 'airship', field: true }, cancelled);
    if (cancelled() || board.status === 'cancelled') return { status: 'cancelled' };
    if (board.status !== 'ready') return direct;
    const flight = findReachable(base, { ...live, mode: 'airship', through: false, airshipAvailable: false },
        { ...request, x: craft.x, y: craft.y, groundedFlight: true }, cancelled);
    if (flight.status !== 'reachable') return flight;
    const available = direct.available.slice();
    for (let n = 0; n < available.length; n++) {
        if (cancelled()) return { status: 'cancelled' };
        if (!available[n] && flight.available[n]) available[n] = 1;
    }
    return { status: 'reachable', available };
}

module.exports = { onFootAirshipRoute, onFootAirshipReachable };
