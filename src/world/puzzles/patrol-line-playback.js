'use strict';

const { STAMP_WIDTH, matchesNativeMotionStamp } = require('./patrol-motion.cjs');
const { lineDestination, lineActors, HORIZON, MAX_MOVES, MANUAL_HORIZON, REACTION_FRAMES } = require('./patrol-line-state.cjs');

function authoredRoute(route, authored) {
    // Saved game state can hold a deserialized copy of the same route.
    return !!authored && (route === authored ||
        route?.repeat === authored.repeat && route.skippable === authored.skippable &&
        route.list?.length === authored.list?.length && route.list.every((step, index) => {
            const expected = authored.list[index];
            return step.code === expected.code && (step.code !== 15 || step.parameters?.[0] === expected.parameters?.[0]);
        }));
}

function capturePatrolLine(root, motion, event) {
    const map = root.$gameMap;
    if (!motion || !lineDestination(map._mapId, event) || motion.speed !== 4) return null;
    const guards = lineActors(motion.patrols);
    if (!guards) return null;
    // Only the authored line trigger owns this schedule. Keep route
    // identities in the game and send the planner numeric copies only.
    const trigger = [22, 24].find(id => map._events[id]?._erased);
    const routes = root.$dataMap?.events?.[trigger]?.pages?.[0]?.list;
    if (!routes || routes.length > 1200) return null;
    const owned = new Map();
    for (const command of routes) {
        if (command.code === 205) owned.set(command.parameters[0], command.parameters[1]);
    }
    const refs = guards.map(({ id }) => {
        const actor = map._events[id];
        return actor && authoredRoute(actor._moveRoute, owned.get(id)) ? {
            actor, route: actor._moveRoute, original: actor._originalMoveRoute, page: actor._pageIndex
        } : null;
    });
    return refs.every(Boolean) ? { refs, frame: motion.frame, speed: motion.speed, tilemap: root.$dataMap } : null;
}

function admitPatrolLine(result, capture, frame) {
    const { moves, stamps } = result;
    if (!capture || !Array.isArray(moves) || !moves.length || moves.length > MAX_MOVES ||
        Object.prototype.toString.call(stamps) !== '[object Float64Array]' ||
        stamps.length !== moves.length * capture.refs.length * STAMP_WIDTH ||
        !moves.every((move, i) => Number.isInteger(move.frame) && move.frame > 0 && move.frame <= HORIZON &&
            (!i || move.frame >= moves[i - 1].frame + 16) && Number.isInteger(move.heading) &&
            move.heading >= 0 && move.heading < 4 && Number.isInteger(move.x) && Number.isInteger(move.y)) ||
        capture.frame + moves[0].frame <= frame) return null;
    return { ...capture, moves, stamps };
}

function patrolStepReady(state, player, map, data, index, now, x, y) {
    const move = state.moves[index];
    if (state.tilemap !== data || player.realMoveSpeed() !== state.speed ||
        x !== move.x || y !== move.y || now !== state.frame + move.frame) return false;
    return patrolPhaseMatches(state, map, state.stamps, index);
}

function patrolPhaseMatches(state, map, stamps, sample) {
    let offset = sample * state.refs.length * STAMP_WIDTH;
    for (const { actor, route, original, page } of state.refs) {
        if (map._events[actor._eventId] !== actor || actor._erased || actor._pageIndex !== page ||
            actor._moveRoute !== route || actor._originalMoveRoute !== original ||
            !matchesNativeMotionStamp(stamps, offset, actor)) return false;
        offset += STAMP_WIDTH;
    }
    return true;
}

module.exports = { capturePatrolLine, admitPatrolLine, patrolStepReady, patrolPhaseMatches, MANUAL_HORIZON, REACTION_FRAMES };
