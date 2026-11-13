'use strict';

const { DIRECTIONS, MAX_CELLS } = require('./geometry.cjs');
const { CARDINAL, bearing } = require('./spatial-direction');
const { parkedVehicle, vehicleOnMap, canLand, travelMode } = require('./vehicle-navigation');
const { questDestinationCurrent } = require('./quest-destinations');

const MAX_EVENTS = 513;
const PULSE_LIFETIME = 12;
const NORMAL_TRIGGERS = [0, 1, 2];

function nextTile(map, x, y, direction) {
    return [map.roundXWithDirection(x, direction), map.roundYWithDirection(y, direction)];
}

function firstStartable(player, x, y, triggers, normal) {
    return player.findEventsAt(x, y).find(event =>
        player.canTriggerEvent(event, triggers, normal) && event.list()?.length > 1);
}

function atApproach(map, player, target, { x, y, facing }) {
    if (!player.canStartLocalEvents()) return false;
    if (facing === null && target._trigger !== 0) return firstStartable(player, x, y, [1, 2], false) === target;
    const forward = nextTile(map, x, y, facing ?? player._direction);
    if (map.airship?.()?.pos(x, y) || map.ship?.()?.pos(...forward) || map.boat?.()?.pos(...forward)) return false;
    // Native OK checks the player's tile before looking in front. A startable
    // event there or before a counter changes which interaction will win.
    const here = firstStartable(player, x, y, [0], false);
    if (here || facing === null) return here === target;
    const next = firstStartable(player, ...forward, NORMAL_TRIGGERS, true);
    if (next) return next === target;
    return map.isCounter(...forward) &&
        firstStartable(player, ...nextTile(map, ...forward, facing), NORMAL_TRIGGERS, true) === target;
}

function atBoardingApproach(map, type, target, { x, y, facing }) {
    if (type === 'airship') return target.pos(x, y);
    if (!CARDINAL[facing] || map.airship?.()?.pos(x, y)) return false;
    const [a, b] = nextTile(map, x, y, facing);
    if (!target.pos(a, b)) return false;
    return type !== 'boat' || !map.ship?.()?.pos(a, b);
}

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

    function next(state) {
        const step = state.course[state.index];
        return step ? DIRECTIONS[step & 3] : state.arrival.facing;
    }

    function start(scene, id, x, y, result, approachReady, vehicle, { quest, point = false, request, destinationReady } = {}) {
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
            x, y, course, arrival, approachReady, request, destinationReady, revision: 0, dirty: false, index: 0, facing: player._direction, queued: false, preparing: false, arriving: false };
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

    function invalidate(scene, keepPreparation = false, routeChanged = true) {
        const state = route;
        if (!state || state.scene !== scene) return;
        state.arriving = false;
        if (routeChanged) refresh(state);
        if (!keepPreparation || !state.preparing) pulseOff(state);
        wake(state);
    }

    function actor(scene, character, direction) {
        const state = route;
        if (!state || state.scene !== scene) return;
        if (character === state.player && CARDINAL[direction] ) {
            if (!state.preparing) pulseOff(state);
            return;
        }
        if (character === state.player) return invalidate(scene, true);
        if (character === state.target || !CARDINAL[direction] ||
            state.index === state.course.length) return invalidate(scene);
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
            if (direction !== expected || state.index >= state.course.length) state.offCourse = true;
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
        const turned = state.facing !== state.player._direction;
        state.facing = state.player._direction;
        if (!success && direction === expected && !state.waiting && !state.waitForMove && !state.dirty) refresh(state);
        if (success || turned || direction === expected) invalidate(scene, !state.offCourse, false);
    }

    function fail(state, text) {
        if (stop(state.scene)) report(text);
    }

    function pulse(state) {
        const { scene, map, player, x, y } = state;
        if (route !== state) return;
        state.queued = false;
        if (!enabled() || !fieldReady(scene, true)) return stop(scene);
        if (!fieldReady(scene)) return wake(state, 1);
        if (!validTarget(state, false) || !Array.isArray(map._events) || map._events.length > MAX_EVENTS)
            return fail(state, 'Destination changed. Request directions again.');
        if (state.approachReady && !state.approachReady()) return fail(state, 'Patrol approach changed. Request directions again.');
        const displaced = state.offCourse || player._x !== x || player._y !== y || !validTarget(state);
        const step = state.course[state.index];
        const direction = next(state);
        const blocked = !displaced && step && !player.canPass(x, y, direction);
        if (state.request && reroute) {
            if ((displaced || blocked) && !state.dirty && !state.waiting && !state.waitForMove) refresh(state);
            if (state.dirty && !state.waiting) {
                if (reroute.submit(state)) state.dirty = false;
                else wake(state, 4);
            }
            if (state.waitForMove || displaced || blocked || (!step && (state.waiting || state.dirty))) return;
        } else {
            if (displaced) return fail(state, validTarget(state) ?
                'Off route. Request directions again.' : 'Destination changed. Request directions again.');
            if (blocked) return fail(state, 'Route blocked. Request directions again.');
        }
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
        const facing = player._direction;
        let cue = cues.beaconPulse;
        let interval = 18;
        let gain = beaconVolume / 100;
        if (step) {
            const distance = step >> 2;
            interval = distance <= 3 ? 14 : distance <= 10 ? 20 : 26;
            gain *= distance <= 3 ? 1 : distance <= 10 ? 0.8 : 0.65;
            cue = direction === facing ? cue : cues.beaconTurn;
        } else {
            let matches;
            if (state.point) matches = true;
            else if (state.aircraft) matches = canLand(map, x, y);
            else if (state.vehicle) matches = atBoardingApproach(map, state.vehicle, state.target, state.arrival);
            else if (state.quest?.waypoint) matches = player.canStartLocalEvents();
            else matches = atApproach(map, player, state.target, state.arrival);
            if (x !== state.arrival.x || y !== state.arrival.y || !matches)
                return fail(state, 'Approach changed. Request directions again.');
            cue = direction === null || direction === facing ? cues.beaconArrival : cues.beaconTurn;
        }
        const source = cue === cues.beaconArrival ? [0, 0, 1] : bearing(facing, direction);
        if (!source) return fail(state, 'Beacon direction is unavailable.');
        const until = frame() + PULSE_LIFETIME;
        const ready = () => route === state && fieldReady(scene) && validTarget(state) && frame() < until &&
            player._x === x && player._y === y && player._direction === facing;
        if (!audio.play(scene, hrtf, cue, gain, source, ready, status => {
            if (status < 0) fail(state, 'Beacon audio is unavailable.');
        }, 'beacon')) return wake(state, 4);
        if (route !== state) return;
        scene._wqaBeaconUntil = until;
        if (cue === cues.beaconArrival) state.arriving = true;
        else wake(state, interval);
    }

    return {
        enabled, start, stop, actor, invalidate, moved,
        refreshResult(state, revision, x, y, result) {
            if (route !== state || state.revision !== revision) return;
            state.waiting = false;
            if (!fieldReady(state.scene) || !validTarget(state, false) || state.player._x !== x || state.player._y !== y) {
                if (fieldReady(state.scene, true)) { state.dirty = true; wake(state); }
                return;
            }
            const { course, arrival } = result || {};
            if (result?.status !== 'ready' || result.reenter || Object.prototype.toString.call(course) !== '[object Uint8Array]' ||
                course.length !== result.distance || course.length >= MAX_CELLS || !arrival ||
                !Number.isInteger(arrival.x) || !Number.isInteger(arrival.y) ||
                (arrival.facing !== null && !CARDINAL[arrival.facing])) {
                // Keep the selected destination. A new step or blocker change
                // can open a route, while an unavailable result stays silent.
                state.offCourse = state.waitForMove = true;
                pulseOff(state);
                return;
            }
            if (state.request.refreshFacing !== undefined) arrival.facing = state.request.refreshFacing;
            const sameEdge = !state.offCourse && state.x === x && state.y === y &&
                state.course[state.index] === course[0] && state.arrival.facing === arrival.facing;
            if (!sameEdge) pulseOff(state);
            Object.assign(state, { x, y, course, arrival, index: 0, offCourse: false, waitForMove: false,
                targetX: state.target?._x, targetY: state.target?._y });
            if (!sameEdge || !course.length || !state.scene._wqaBeaconDue) wake(state);
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
