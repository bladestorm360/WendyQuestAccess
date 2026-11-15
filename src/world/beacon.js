'use strict';

const { DIRECTIONS, MAX_CELLS } = require('./geometry.cjs');
const { CARDINAL, bearing } = require('./spatial-direction');
const { parkedVehicle, vehicleOnMap, canLand, travelMode } = require('./vehicle-navigation');
const { questDestinationCurrent } = require('./quest-destinations');
const { nextTile, atApproach, atBoardingApproach } = require('./interaction-approach');

const MAX_EVENTS = 513;
const PULSE_LIFETIME = 12;
const SLOW_INTERVAL = 90;
const FAST_INTERVAL = 18;

function covers(actor, x, y, dx = 0, dy = 0) {
    const fromX = actor._x + dx;
    const fromY = actor._y + dy;
    const box = actor.blockerProperties;
    if (!box) return x === fromX && y === fromY;
    return x >= fromX + box.x1 && x <= fromX + box.x2 && y >= fromY + box.y1 && y <= fromY + box.y2;
}

function createBeacon(root, fieldReady, audio, preferences, report, reroute) {
    const cues = audio.cues;
    let route = null;
    const frame = () => root.Graphics.frameCount;

    function enabled() {
        const { enabled, beacon, beaconVolume } = preferences();
        return enabled && beacon && beaconVolume > 0;
    }

    function pulseOff(state) {
        audio.retire(state.scene, 'beacon');
        state.scene._wqaBeaconUntil = 0;
        state.preparing = false;
    }

    function stop(scene) {
        if (!route || (scene && route.scene !== scene)) return false;
        const retired = route;
        route = null;
        reroute?.cancel(retired);
        pulseOff(retired);
        retired.scene._wqaBeaconActive = false;
        retired.scene._wqaBeaconDue = 0;
        return true;
    }

    function wake(state, delay = 0) {
        if (route === state) state.scene._wqaBeaconDue = Math.max(1, frame() + delay);
    }

    function schedule(state, delay = 0) {
        const due = state.scene._wqaBeaconDue;
        if (!due || frame() + delay < due) wake(state, delay);
    }

    function next(state) {
        const step = state.course[state.index];
        return step ? DIRECTIONS[step & 3] : state.arrival.facing;
    }

    function start(scene, id, x, y, result, approachReady, vehicle, { quest, point = false, request, destinationReady, enemyCurrent, alreadyReported = false } = {}) {
        if (!enabled() || !fieldReady(scene)) return false;
        const map = root.$gameMap;
        const player = root.$gamePlayer;
        const target = vehicle ? parkedVehicle(map, vehicle) : map._events?.[id];
        const { course, arrival } = result;
        const aircraft = result.land ? vehicleOnMap(map, 'airship') : null;
        if ((!target && !aircraft && !point) || target?._erased || player._x !== x || player._y !== y ||
            Object.prototype.toString.call(course) !== '[object Uint8Array]' ||
            course.length !== result.distance || course.length >= MAX_CELLS ||
            !arrival || !Number.isInteger(arrival.x) || !Number.isInteger(arrival.y) ||
            (arrival.facing !== null && !CARDINAL[arrival.facing])) return false;
        stop();
        route = { scene, map, player, id, vehicle, quest, target, aircraft, point, mode: travelMode(map, player),
            targetX: target?._x, targetY: target?._y, page: target?._pageIndex,
            x, y, course, arrival, approachReady, request, destinationReady, enemyCurrent,
            enemyBlock: result.status === 'enemyBlocked' ? result : null,
            reportedEnemy: alreadyReported ? result.enemy : undefined, revision: 0, dirty: false, index: 0,
            initialDistance: course.length, lastPing: null, queued: false, preparing: false, arriving: false };
        scene._wqaBeaconActive = scene._wqaPresentation = true;
        wake(route);
        return true;
    }

    function validTarget(state, position = true) {
        const { map, id, target, page, targetX, targetY, vehicle, aircraft } = state;
        if (map !== root.$gameMap || state.player !== root.$gamePlayer || travelMode(map, state.player) !== state.mode ||
            (state.destinationReady && !state.destinationReady()) || (aircraft && vehicleOnMap(map, 'airship') !== aircraft) ||
            (state.quest && !questDestinationCurrent(root, state.scene, state.quest))) return false;
        if (!target) return state.point ? travelMode(map, state.player) === state.mode : !!aircraft;
        const current = vehicle ? parkedVehicle(map, vehicle) : map._events?.[id];
        return current === target && !target._erased &&
            target._pageIndex === page && (!position || (target._x === targetX && target._y === targetY));
    }

    function refresh(state) {
        if (!state.request || !reroute) return;
        state.revision++;
        state.dirty = true;
        state.waitForMove = false;
        reroute.cancel(state);
    }

    function invalidate(scene) {
        const state = route;
        if (!state || state.scene !== scene) return;
        state.arriving = false;
        refresh(state);
        pulseOff(state);
        wake(state);
    }

    function actor(scene, character, direction) {
        const state = route;
        if (!state || state.scene !== scene) return;
        // The native input callback confirms accepted steps. Simple facing
        // changes have no effect on absolute compass audio.
        if (character === state.player) {
            if (!direction) schedule(state);
            return;
        }
        if (character === state.target || state.enemyBlock && character._eventId === state.enemyBlock.enemy ||
            !CARDINAL[direction]) return invalidate(scene);
        if (!next(state)) return;
        const upcoming = nextTile(state.map, state.x, state.y, next(state));
        const [newX, newY] = nextTile(state.map, character._x, character._y, direction);
        const dx = newX - character._x;
        const dy = newY - character._y;
        if (covers(character, state.x, state.y) || covers(character, ...upcoming) ||
            covers(character, state.x, state.y, dx, dy) || covers(character, ...upcoming, dx, dy)) invalidate(scene);
    }

    function moved(scene, direction, success) {
        const state = route;
        if (!state || state.scene !== scene) return;
        const expected = next(state);
        if (success) {
            refresh(state);
            if (direction !== expected || state.index >= state.course.length) {
                state.offCourse = true;
                pulseOff(state);
            }
            else {
                const [x, y] = nextTile(state.map, state.x, state.y, direction);
                if (state.player._x !== x || state.player._y !== y) state.offCourse = true;
                else {
                    state.x = x;
                    state.y = y;
                    state.index++;
                }
            }
        }
        if (!success && direction === expected && !state.waiting && !state.waitForMove && !state.dirty) refresh(state);
        if (success || direction === expected) schedule(state, state.index === state.course.length ? 0 : 1);
    }

    function fail(state, text) {
        if (stop(state.scene)) report(text);
    }

    function pulse(state) {
        const { scene, map, player, x, y } = state;
        if (route !== state) return;
        state.queued = false;
        if (!enabled() || !fieldReady(scene, true)) return stop(scene);
        const settled = fieldReady(scene);
        if (!validTarget(state, false) || !Array.isArray(map._events) || map._events.length > MAX_EVENTS)
            return fail(state, 'Destination changed. Request directions again.');
        if (state.approachReady && !state.approachReady()) return fail(state, 'Patrol approach changed. Request directions again.');
        const displaced = state.offCourse || player._x !== x || player._y !== y || !validTarget(state);
        const step = state.course[state.index];
        const direction = next(state);
        const blocked = !displaced && step && !player.canPass(x, y, direction);
        if (state.request && reroute) {
            if (state.enemyBlock && !state.enemyCurrent?.(state.enemyBlock) && !state.dirty && !state.waiting) refresh(state);
            if ((displaced || blocked) && !state.dirty && !state.waiting && !state.waitForMove) refresh(state);
            if (state.dirty && !state.waiting) {
                if (settled && reroute.submit(state)) state.dirty = false;
                else schedule(state, 4);
            }
            if (state.waitForMove || displaced || blocked || (!step && (state.waiting || state.dirty))) {
                if (state.enemyBlock) schedule(state, 18);
                return;
            }
        } else {
            if (displaced) return fail(state, validTarget(state) ?
                'Off route. Request directions again.' : 'Destination changed. Request directions again.');
            if (blocked) return fail(state, 'Route blocked. Request directions again.');
        }
        if (!step && state.enemyBlock) return wake(state, 18);
        const facing = player._direction;
        const arrived = !step && (direction === null || direction === facing);
        if (!step && !settled) return schedule(state, 4);
        const remaining = state.course.length - state.index;
        const progress = Math.max(0, Math.min(1, (remaining - 1) / Math.max(1, state.initialDistance - 1)));
        const interval = FAST_INTERVAL + Math.round((SLOW_INTERVAL - FAST_INTERVAL) * progress);
        if (!arrived && state.lastPing !== null && frame() - state.lastPing < interval)
            return schedule(state, state.lastPing + interval - frame());

        const { hrtf, beaconVolume } = preferences();
        if (!audio.isPrepared(hrtf)) {
            if (!state.preparing) {
                state.preparing = audio.prepare(scene, hrtf, () => route === state && fieldReady(scene, true) &&
                    (!state.quest || validTarget(state)), status => {
                    state.preparing = false;
                    if (status < 0) fail(state, 'Beacon audio is unavailable.');
                    else wake(state);
                }, 'beacon');
            }
            return wake(state, 8);
        }
        if (!step) {
            let matches;
            if (state.point) matches = true;
            else if (state.aircraft) matches = canLand(map, x, y);
            else if (state.vehicle) matches = atBoardingApproach(map, state.vehicle, state.target, state.arrival);
            else if (state.quest?.waypoint) matches = player.canStartLocalEvents();
            else matches = atApproach(map, player, state.target, state.arrival);
            if (x !== state.arrival.x || y !== state.arrival.y || !matches)
                return fail(state, 'Approach changed. Request directions again.');
        }
        const cue = arrived ? cues.beaconArrival : cues.beaconPulse;
        const source = arrived ? [0, 0, 1] : bearing(8, direction);
        if (!source) return fail(state, 'Beacon direction is unavailable.');
        const until = frame() + PULSE_LIFETIME;
        const ready = () => route === state && fieldReady(scene, !arrived) &&
            validTarget(state) && frame() < until && !state.offCourse &&
            (!arrived || player._x === x && player._y === y && player._direction === facing);
        if (!audio.play(scene, hrtf, cue, beaconVolume / 100, source, ready, status => {
            if (status < 0) fail(state, 'Beacon audio is unavailable.');
        }, 'beacon')) return wake(state, 4);
        if (route !== state) return;
        scene._wqaBeaconUntil = until;
        if (cue === cues.beaconArrival) state.arriving = true;
        else {
            state.lastPing = frame();
            schedule(state, interval);
        }
    }

    return {
        enabled, start, stop, actor, invalidate, moved,
        refreshResult(state, revision, x, y, result) {
            if (route !== state || state.revision !== revision) return;
            state.waiting = false;
            if (!fieldReady(state.scene, true) || !validTarget(state, false) || state.player._x !== x || state.player._y !== y) {
                if (fieldReady(state.scene, true)) { state.dirty = true; wake(state); }
                return;
            }
            const { course, arrival } = result || {};
            const enemyBlock = result?.status === 'enemyBlocked' ? result : null;
            if (enemyBlock && !state.enemyCurrent?.(enemyBlock)) {
                state.dirty = true;
                pulseOff(state);
                return wake(state, 18);
            }
            if ((!enemyBlock && result?.status !== 'ready') || result.reenter || Object.prototype.toString.call(course) !== '[object Uint8Array]' ||
                course.length !== result.distance || course.length >= MAX_CELLS || !arrival ||
                !Number.isInteger(arrival.x) || !Number.isInteger(arrival.y) ||
                (arrival.facing !== null && !CARDINAL[arrival.facing])) {
                // Keep the selected destination. A new step or blocker change
                // can open a route, while an unavailable result stays silent.
                state.offCourse = state.waitForMove = true;
                pulseOff(state);
                return;
            }
            if (!enemyBlock && state.request.refreshFacing !== undefined) arrival.facing = state.request.refreshFacing;
            const wasOffCourse = state.offCourse;
            Object.assign(state, { x, y, course, arrival, enemyBlock, index: 0, offCourse: false, waitForMove: false,
                targetX: state.target?._x, targetY: state.target?._y });
            if (enemyBlock && state.reportedEnemy !== enemyBlock.enemy) {
                state.reportedEnemy = enemyBlock.enemy;
                report(course.length ? 'Route blocked by an enemy. Beacon leads to the last clear tile.' : 'Blocked by an enemy.');
            } else if (!enemyBlock) state.reportedEnemy = undefined;
            if (wasOffCourse || !course.length) schedule(state);
            else schedule(state, Math.max(0, (state.lastPing ?? frame()) - frame() + FAST_INTERVAL));
        },
        active: scene => route?.scene === scene,
        questActive: scene => route?.scene === scene && !!route.quest,
        expire(scene) {
            if (route?.scene !== scene) return;
            if (route.arriving) stop(scene);
            else pulseOff(route);
        },
        update(scene) {
            const state = route;
            if (!state || state.scene !== scene || state.queued || state.arriving) return;
            const renderer = root.Graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return stop(scene);
            state.queued = true;
            scene._wqaBeaconDue = 0;
            renderer.once('postrender', () => {
                try { pulse(state); } catch { if (route === state) fail(state, 'Beacon route is unavailable.'); }
            });
        }
    };
}

module.exports = { createBeacon };
