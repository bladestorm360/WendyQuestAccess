'use strict';

const { DIRECTIONS, MAX_CELLS, MAX_EVENTS } = require('./geometry.cjs');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { questDestinationCurrent } = require('./quest-destinations');

const TOUCH_TRIGGERS = [1, 2];

function createAutowalk(root, ready, preferences, report) {
    let active = null;
    const targetAt = (map, job) => job.vehicle ? parkedVehicle(map, job.vehicle.type) : map._events?.[job.target];

    function stop(scene) {
        if (!active || (scene && active.scene !== scene)) return false;
        active.scene._wqaAutowalkActive = false;
        active = null;
        return true;
    }

    function start(job, result, record) {
        const { scene } = job;
        const map = root.$gameMap;
        const player = root.$gamePlayer;
        const { course, arrival } = result;
        const target = targetAt(map, job);
        if (!preferences().autowalk || !ready(scene) || map.isAnyEventStarting?.() ||
            player._x !== job.x || player._y !== job.y || !Array.isArray(map._events) || map._events.length > MAX_EVENTS + 1 ||
            (!target && !job.nearestLanding && !job.point) || target?._erased ||
            Object.prototype.toString.call(course) !== '[object Uint8Array]' || course.length !== result.distance ||
            course.length >= MAX_CELLS || !Number.isInteger(arrival?.x) || !Number.isInteger(arrival?.y)) return false;
        stop();
        active = { scene, job, map, player, target, targetX: target?._x, targetY: target?._y, page: target?._pageIndex,
            trigger: target?._trigger, x: job.x, y: job.y, index: 0, course, arrival, record,
            manualEntry: result.autowalkStop, pending: null, dirty: false };
        scene._wqaAutowalkActive = scene._wqaPresentation = true;
        return true;
    }

    function end(state, record, failed = false) {
        stop(state.scene);
        report(state.scene, record, failed);
        return 0;
    }

    function changed(state, name = 'Autowalk stopped. Route changed. Request directions again.') {
        return end(state, { kind: 'fieldStatus', name }, true);
    }

    function valid(state) {
        const { map, job, target, player } = state;
        if (map !== root.$gameMap || player !== root.$gamePlayer || travelMode(map, player) !== job.mode ||
            (job.quest && !questDestinationCurrent(root, state.scene, job.quest)) ||
            player._x !== state.x || player._y !== state.y || !Array.isArray(map._events) ||
            map._events.length > MAX_EVENTS + 1) return false;
        const current = targetAt(map, job);
        return current === target && !target?._erased && target?._pageIndex === state.page &&
            target?._x === state.targetX && target?._y === state.targetY && target?._trigger === state.trigger;
    }

    function input(scene, player, direction, manual) {
        const state = active;
        if (!state || state.scene !== scene || state.player !== player) return direction;
        if (manual) {
            stop(scene);
            report(scene, null, true);
            return direction;
        }
        if (!ready(scene) || state.map.isAnyEventStarting?.()) {
            stop(scene);
            report(scene, null, true);
            return 0;
        }
        if (!preferences().autowalk || state.dirty || state.pending || !valid(state)) return changed(state);
        const { map, index, course, arrival, record } = state;
        if (index === course.length) {
            if (player._x !== arrival.x || player._y !== arrival.y ||
                (record.land && !canLand(map, arrival.x, arrival.y))) return changed(state);
            const name = record.boundary ? record.name : 'At ' + record.name;
            return end(state, { ...record, name, legs: [], more: false });
        }
        const step = DIRECTIONS[course[index] & 3];
        const x = map.roundXWithDirection(player._x, step);
        const y = map.roundYWithDirection(player._y, step);
        if (!player.canPass(player._x, player._y, step))
            return changed(state, 'Autowalk stopped. The next tile is blocked.');
        if (player.canStartLocalEvents()) {
            const floor = player.findEventsAt(x, y).find(event =>
                player.canTriggerEvent(event, TOUCH_TRIGGERS, false) && event.list()?.length > 1);
            if (floor) {
                if (floor === state.target && index === course.length - 1) {
                    return end(state, { kind: 'routeDirections', name: 'At ' + record.name, legs: [], activate: step });
                }
                return end(state, { kind: 'routeDirections', name: 'Autowalk stopped', legs: [], boundary: step }, true);
            }
        }
        if (state.manualEntry && index === course.length - 1) return changed(state);
        state.pending = { direction: step, x, y };
        return step;
    }

    function moved(scene, direction, succeeded) {
        const state = active;
        if (!state || state.scene !== scene) return;
        const step = state.pending;
        if (!step || step.direction !== direction || !succeeded || state.player._x !== step.x || state.player._y !== step.y)
            return changed(state);
        state.x = step.x;
        state.y = step.y;
        state.index++;
        state.pending = null;
    }

    return { start, stop, input, moved, active: scene => active?.scene === scene,
        dirty(scene) { if (active?.scene === scene) active.dirty = true; } };
}

module.exports = { createAutowalk };
