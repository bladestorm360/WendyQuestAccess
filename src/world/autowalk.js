'use strict';

const { DIRECTIONS, MAX_CELLS, MAX_EVENTS } = require('./geometry.cjs');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { questDestinationCurrent } = require('./quest-destinations');
const { atApproach, atBoardingApproach } = require('./interaction-approach');

const { activeMovingEnemy, pageHasInteraction } = require('./destinations');
const { inactiveFloorScene, passiveFloorPage } = require('./local-destinations');

const { admitPatrolLine, patrolStepReady } = require('./puzzles/patrol-line-playback');

const TOUCH_TRIGGERS = [1, 2];

function createAutowalk(root, ready, preferences, report, refreshReady = () => false, reroute = () => false, cleanup = () => false) {
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
        const line = result.status === 'patrolLine' && admitPatrolLine(result, job.line, root.Graphics.frameCount);
        if (result.status === 'patrolLine' && !line) return false;
        const target = targetAt(map, job);
        if (!preferences().autowalk || !ready(scene) || map.isAnyEventStarting?.() ||
            player._x !== job.x || player._y !== job.y || !Array.isArray(map._events) || map._events.length > MAX_EVENTS + 1 ||
            (!target && !job.nearestLanding && !job.point) || target?._erased ||
            (!line && (Object.prototype.toString.call(course) !== '[object Uint8Array]' ||
                course.length !== result.distance || course.length >= MAX_CELLS)) ||
            !Number.isInteger(arrival?.x) || !Number.isInteger(arrival?.y)) return false;
        stop();
        active = { scene, job, map, player, target, targetX: target?._x, targetY: target?._y, page: target?._pageIndex,
            trigger: target?._trigger, x: job.x, y: job.y, index: 0, course, line, arrival, record,
            manualEntry: result.autowalkStop, pending: null, dirty: false, gate: result.gate,
            refreshCourse: job.map === 200 && !!job.caveWalk && !job.caveWalk.pickupEscape &&
                result.status === 'ready' && !line && !result.gate };
        scene._wqaAutowalkActive = scene._wqaPresentation = true;
        if (job.caveWalk) scene._wqaCaveReview = false;
        return true;
    }

    function wait(job, delay) {
        if (!ready(job.scene)) return false;
        stop();
        active = { scene: job.scene, player: root.$gamePlayer, map: root.$gameMap,
            x: root.$gamePlayer._x, y: root.$gamePlayer._y, job, due: root.Graphics.frameCount + delay };
        job.scene._wqaAutowalkActive = job.scene._wqaPresentation = true;
        return true;
    }

    function end(state, record, failed = false, arrived = false) {
        stop(state.scene);
        report(state.scene, record, failed, arrived, state.job);
        return 0;
    }

    function arrive(state, record) {
        const { facing, ...rest } = record;
        const { player, target, map, job, arrival } = state;
        // Use the native turn only for the interaction the route verified.
        // An event on the current tile, a nearer event, or a parked vehicle
        // can take priority before the final input.
        if (DIRECTIONS.includes(facing) && player._direction !== facing && job.mode === 'walk' &&
            target && !rest.bump && !rest.activate && !rest.boundary) {
            const current = job.vehicle ? atBoardingApproach(map, job.vehicle.type, target, arrival) :
                atApproach(map, player, target, arrival);
            if (!current) return changed(state, 'Autowalk stopped. The interaction approach changed. Request directions again.');
            player.setDirection(facing);
        }
        if ((job.caveCrystal || job.caveLoot) && atApproach(map, player, target, arrival) && job.caveAction?.(target)) {
            stop(state.scene);
            if (job.caveLoot) report(state.scene, null, false, true, job);
            if (facing === null) player.checkEventTriggerHere([0]);
            else player.checkEventTriggerThere([0]);
            // Complete the native Action Button path instead of leaving its
            // event queued behind the visible interaction icon for another
            // update. Reserved/common event priority stays with the engine.
            if (target.isStarting()) map.setupStartingEvent();
            return 0;
        }
        if (rest.npcBlocker)
            return end(state, { kind: 'fieldStatus', name: 'Blocked by ' + rest.npcBlocker + '.' });
        const turn = facing && player._direction !== facing;
        const needsAction = rest.activate || rest.boundary || rest.prerequisite || rest.bump || rest.enter ||
            rest.conversation || rest.board || rest.land || rest.guideAction || rest.guide || rest.reenter;
        const detail = turn || needsAction ? { ...rest, legs: [], facing: turn || rest.bump ? facing : undefined,
            more: false, directionsOnly: true,
            beaconOnly: !turn } : null;
        return end(state, detail, false, true);
    }

    function changed(state, name = 'Autowalk stopped. Route changed. Request directions again.') {
        const { scene, map, player, job } = state;
        // Retire the stale course before asking the existing asynchronous
        // router to recapture. Native input never searches or waits for it.
        // A transfer, quest replacement or manual displacement cannot inherit
        // this continuation. The normal cancellation sites still own those.
        if (!state.pending && ready(scene) && preferences().autowalk && map === root.$gameMap &&
            player === root.$gamePlayer && player._x === state.x && player._y === state.y &&
            travelMode(map, player) === job.mode && (!job.quest || questDestinationCurrent(root, scene, job.quest))) {
            stop(scene);
            if (reroute(job)) return 0;
        }
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

    function holdRefresh(scene) {
        const state = active;
        // A guard can request native page refresh while Wendy interpolates.
        // Keep the already certified movement owner inert through that narrow
        // gate; do not discard its remaining crossing or admit other loading.
        if (!(state?.scene === scene && state.job.caveWalk &&
            (!state.dirty || state.due || state.refreshCourse) && !state.pending &&
            preferences().autowalk && refreshReady(scene, state.refreshPaused === true) &&
            !root.$gameMap.isAnyEventStarting?.() &&
            (state.due ? state.map === root.$gameMap && state.player === root.$gamePlayer &&
                state.player._x === state.x && state.player._y === state.y &&
                travelMode(state.map, state.player) === state.job.mode : valid(state)))) return false;
        // Game_Map consumes refresh before player input, while MapScene only
        // republishes readiness at the end of that update. Hold the same inert
        // lease across that one publication boundary as well.
        state.refreshPaused = true;
        return true;
    }

    function input(scene, player, direction, manual) {
        const state = active;
        if (!state || state.scene !== scene || state.player !== player) return direction;
        if (manual) {
            stop(scene);
            // Manual input ends automatic movement. The beacon can still
            // follow the player's accepted step toward the same destination.
            report(scene, null, false, false, state.job);
            return direction;
        }
        if (!ready(scene) && holdRefresh(scene)) return 0;
        if (!ready(scene) || state.map?.isAnyEventStarting?.() || !preferences().autowalk) {
            if (state.job.caveWalk && root.$gameMap?._mapId === 200 && root.$gameMap._needsRefresh &&
                !root.$gameMap._interpreter?._list && preferences().autowalk) {
                state.job.caveContinue = true;
                return end(state, null, false, true);
            }
            return end(state, null, true);
        }
        state.refreshPaused = false;
        if (state.due) {
            if (root.Graphics.frameCount < state.due) return 0;
            return end(state, null, false, true);
        }
        if (state.dirty && state.refreshCourse && !state.pending && valid(state)) {
            // A completed distraction can change a remote event page during
            // an ordinary course. Retire it and ask the existing worker for a
            // fresh route; never reuse a dirtied course or a timed forecast.
            state.job.caveContinue = true;
            return end(state, null, false, true);
        }
        if (state.dirty || state.pending || !valid(state)) return changed(state);
        const { map, index, course, line, arrival, record, job } = state;
        const length = line ? line.moves.length : course.length;
        if (index === length) {
            if (player._x !== arrival.x || player._y !== arrival.y ||
                (record.land && !canLand(map, arrival.x, arrival.y))) return changed(state);
            if (record.enemyBlocked && !job.enemyCurrent?.()) return changed(state);
            if (record.enemyBlocked) return end(state, { ...record, legs: [], more: false, directionsOnly: true });
            return arrive(state, record);
        }
        if (state.gate) {
            const allowed = state.gate();
            if (!allowed) return 0;
            if (allowed < 0) {
                // A stale forecast leaves Wendy in the starting pocket.
                job.caveContinue = true;
                return end(state, null, false, true);
            }
            state.gate = null;
        }
        const now = line && root.Graphics.frameCount;
        const move = line && line.moves[index];
        if (line && now < line.frame + move.frame) return 0;
        const step = DIRECTIONS[line ? move.heading : course[index] & 3];
        const x = map.roundXWithDirection(player._x, step);
        const y = map.roundYWithDirection(player._y, step);
        if (line && !patrolStepReady(line, player, map, root.$dataMap, index, now, x, y))
            return changed(state, 'Autowalk stopped. Guard timing changed. Request directions again.');
        if (!player.canPass(player._x, player._y, step)) {
            if (job.mode === 'walk' && player.findEventsAt(x, y).some(event => activeMovingEnemy(root, event)))
                return changed(state, 'Autowalk stopped. Blocked by an enemy.');
            return changed(state, 'Autowalk stopped. The next tile is blocked.');
        }
        if (player.canStartLocalEvents()) {
            const floor = player.findEventsAt(x, y).find(event =>
                player.canTriggerEvent(event, TOUCH_TRIGGERS, false) && event.list()?.length > 1);
            if (floor) {
                if (index === length - 1 && floor._eventId === job.caveFloor && job.caveAction?.(floor)) {
                    if (job.caveArrives) end(state, null, false, true);
                    else stop(scene);
                    return step;
                }
                const page = root.$dataMap?.events?.[floor._eventId]?.pages?.[floor._pageIndex];
                // Even an invisible cleanup page starts the native interpreter.
                // Hand the step back to the player before the native event gate.
                if (page && (!pageHasInteraction(page) || inactiveFloorScene(root, floor, page) ||
                    !job.caveWalk && passiveFloorPage(page))) {
                    if (cleanup(job, floor, page, x, y)) {
                        stop(scene);
                        return step;
                    }
                    return end(state, { kind: 'routeDirections', name: 'Autowalk paused', legs: [],
                        boundary: step, boundaryName: 'Map cleanup', manualHandoff: true }, true);
                }
                if (floor === state.target && index === length - 1) {
                    return arrive(state, { ...record, activate: step });
                }
                return end(state, { kind: 'routeDirections', name: 'Autowalk stopped', legs: [], boundary: step }, true);
            }
        }
        if (state.manualEntry && index === length - 1) return changed(state);
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

    return { start, wait, stop, input, moved, holdRefresh, active: scene => active?.scene === scene,
        dirty(scene) { if (active?.scene === scene) active.dirty = true; } };
}

module.exports = { createAutowalk };
