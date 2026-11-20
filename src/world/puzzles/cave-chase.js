'use strict';

const { acceptedAction, chaseContinuation } = require('./cave-progression');
const VECTORS = { 2: [0, 1, 'south'], 4: [-1, 0, 'west'], 6: [1, 0, 'east'], 8: [0, -1, 'north'] };

// One native chase owns at most four legs. Physical accepted steps advance
// this owner; no forecast, input injection or frame polling drives speech.
function createChaseGuide(root, graphics) {
    let owner = null;
    const current = scene => owner?.scene === scene && owner.map === root.$gameMap &&
        owner.player === root.$gamePlayer && owner.map._mapId === 201;

    function stop(scene) {
        if (!owner || scene && owner.scene !== scene) return false;
        owner.scene._wqaCaveChaseActive = false;
        graphics._wqaCaveChasePending = false;
        owner = null;
        return true;
    }

    function arm(scene) {
        if (root.$gameMap?._mapId !== 201) return false;
        if (!current(scene)) {
            stop();
            owner = { scene, map: root.$gameMap, player: root.$gamePlayer, pending: null, course: null };
        }
        scene._wqaCaveChaseActive = true;
        return true;
    }

    function begin(scene, legs, target) {
        if (!current(scene) || !Array.isArray(legs) || !legs.length || legs.length > 9) return null;
        let x = owner.player._x, y = owner.player._y, total = 0;
        const course = [];
        for (const { direction, tiles } of legs) {
            const vector = VECTORS[direction];
            if (!vector || !Number.isInteger(tiles) || tiles < 1 || (total += tiles) > 128) return null;
            const prior = course[course.length - 1];
            // The step onto the trigger can finish the preceding straight leg.
            if (prior?.direction === direction) {
                prior.tiles += tiles;
                prior.endX += vector[0] * tiles;
                prior.endY += vector[1] * tiles;
            } else course.push({ direction, tiles, x, y, endX: x + vector[0] * tiles, endY: y + vector[1] * tiles });
            x += vector[0] * tiles;
            y += vector[1] * tiles;
        }
        if (target && (target._x !== x || target._y !== y)) return null;
        Object.assign(owner, { course, index: 0, x: owner.player._x, y: owner.player._y });
        return repeat(scene);
    }

    function repeat(scene) {
        if (!current(scene)) return null;
        const leg = owner.course?.[owner.index];
        if (!leg) return null;
        const [dx, dy, name] = VECTORS[leg.direction];
        const x = owner.player._x - leg.x, y = owner.player._y - leg.y;
        const travelled = x * dx + y * dy;
        if (x * dy !== y * dx || travelled < 0 || travelled >= leg.tiles) return null;
        return { kind: 'fieldStatus', name: `${leg.tiles - travelled} ${name}.` };
    }

    return {
        arm, stop, repeat,
        approach(scene, result) {
            const event = root.$gameMap?._events?.[result.boundaryEvent];
            if (!current(scene) || !event || acceptedAction(root, scene, event)?.chase === undefined ||
                !VECTORS[result.boundary]) return null;
            return begin(scene, [...result.legs, { direction: result.boundary, tiles: 1 }], event);
        },
        accepted(scene, event) {
            if (!current(scene)) return;
            const action = acceptedAction(root, scene, event);
            if (action?.chase === undefined) return stop(scene);
            owner.pending = action;
            owner.course = null;
            graphics._wqaCaveChasePending = true;
        },
        settle(scene) {
            if (!current(scene) || !owner.pending) return null;
            const action = owner.pending;
            owner.pending = null;
            graphics._wqaCaveChasePending = false;
            const chase = chaseContinuation(root, action);
            if (!chase) { stop(scene); return null; }
            return begin(scene, chase.legs, root.$gameMap._events[chase.next]);
        },
        moved(scene, direction, succeeded) {
            if (!current(scene) || !owner.course || !succeeded) return null;
            const [dx, dy] = VECTORS[direction] || [];
            if (owner.player._x !== owner.x + dx || owner.player._y !== owner.y + dy) { stop(scene); return null; }
            owner.x = owner.player._x;
            owner.y = owner.player._y;
            const leg = owner.course[owner.index];
            if (!leg) return null;
            if (owner.x === leg.endX && owner.y === leg.endY) {
                owner.index++;
                return repeat(scene);
            }
            if (!repeat(scene)) stop(scene);
            return null;
        },
        leave(scene, eventId) {
            // Event acceptance precedes interpreter setup. Keep only that exact
            // handoff while native loading and scene gates suppress output.
            if (current(scene) && owner.pending?.event._eventId === eventId) return;
            stop(scene);
        }
    };
}

module.exports = { createChaseGuide };
