'use strict';

// Locators refer to the build-checked authored event pages. Display names are
// mod-owned, and every target still goes through the live route worker.
const EXITS = {
    206: { 11: ['Cave entrance', [2, 32], 196] },
    196: { 20: ['Next cave room', [0], 199], 22: ['Exit to island', [4], 206] },
    199: { 3: ['Previous cave room', [0], 196], 26: ['Next cave room', [0], 200] },
    200: { 2: ['Previous cave room', [0], 199], 11: ['Chase room entrance', [4], 201] },
    201: { 1: ['Previous cave room', [0], 200], 2: ['Staircase passage', [6], 202] },
    202: { 4: ['Chamber entrance', [12], 197] },
    197: { 10: ['Exit to island', [9], 206] }
};
const LINE = [9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const CRYSTALS = { 5: [582, [25]], 10: [583, [6]], 19: [584, [8, 25, 45]] };
const CHASES = { 3: [4, 4], 8: [9, 3], 10: [11, 3], 12: [13, 3], 14: [24, 3],
    15: [26, 3], 16: [27, 3], 17: [28, 3], 18: [29, 3] };
const CHASE_FLOORS = new Map(Object.values(CHASES));
// Native chase triggers launch a scripted route behind Wendy. Give the
// verified continuous walk to the next trigger before stepping into it.
const CHASE_LEGS = {
    4: [[8, 5], [4, 4], [8, 2]],
    9: [[8, 6], [6, 1], [8, 6], [6, 4]],
    11: [[6, 2], [2, 7]],
    13: [[2, 2], [6, 4]],
    24: [[6, 4], [8, 4]],
    26: [[8, 4], [4, 4], [8, 5]],
    27: [[6, 10]],
    28: [[2, 3], [6, 1], [2, 5], [6, 3]],
    29: [[8, 13], [4, 8], [8, 8]]
};
const CHASE_SEQUENCE = Object.keys(CHASE_LEGS).map(Number).concat(2);
const HEADINGS = { 2: 'south', 4: 'west', 6: 'east', 8: 'north' };

function chaseDirections(eventId) {
    const legs = CHASE_LEGS[eventId];
    if (!legs) return '';
    return 'Walk ' + legs.map(([heading, tiles]) => tiles + ' ' + HEADINGS[heading]).join(', then ') +
        (eventId === 29 ? ' to the next room.' : ' to the next chase trigger.');
}

function chaseHandoff(root, eventId) {
    const map = root.$gameMap;
    if (map._mapId !== 201) return '';
    const chase = CHASE_FLOORS.get(eventId);
    const event = map._events[eventId];
    if (event?._pageIndex !== 0 || event._erased || !chase) return '';
    const item = root.$dataMap?.events?.[eventId];
    const command = item?.pages[0].list[chase];
    return event._x === item?.x && event._y === item.y && command?.code === 205 &&
        CHASES[command.parameters[0]]?.[0] === eventId ? chaseDirections(eventId) : '';
}

const ARRIVALS = { 196: 'Entered the patrol rooms.', 199: 'Reached the patrol line room.',
    200: 'Reached the distraction room.', 201: 'Reached the chase room.',
    202: 'Cleared the chase. Reached the staircase passage.', 197: 'Reached the reward chamber.',
    206: 'Returned to the island.' };

function corridorMap(id) { return Number.isInteger(id) && Object.prototype.hasOwnProperty.call(EXITS, id); }

function caveDestination(map, event, entry, page) {
    if (!page) return null;
    const id = event._eventId;
    const exit = EXITS[map]?.[id];
    if (exit && event._pageIndex === 0 && event._trigger === 1 && exit[1].some(index =>
        page.list[index]?.code === 201 && page.list[index].parameters[0] === 0 &&
        page.list[index].parameters[1] === exit[2])) return { name: exit[0], category: 'exits' };
    if (map === 197 && id === 11 && event._trigger === 0) return { name: 'Statue', category: 'objects' };
    if (event._pageIndex !== 0 || event._trigger !== 1 || event._x !== entry.x || event._y !== entry.y) return null;
    if (map === 199 && (id === 22 || id === 24))
        return { name: 'Patrol line trigger', category: 'events', eventAction: 'step' };
    if (map === 201 && CHASE_FLOORS.has(id))
        return { name: 'Mech chase trigger', category: 'events', eventAction: 'step' };
    if (map === 202 && id >= 5 && id <= 11)
        return { name: 'Staircase scene', category: 'events', eventAction: 'step' };
    return null;
}

function acceptedAction(root, scene, event) {
    const map = root.$gameMap;
    const origin = map._mapId;
    const id = event._eventId;
    const entry = root.$dataMap?.events?.[id];
    const page = entry?.pages?.[0];
    if (map._events?.[id] !== event || event._pageIndex !== 0 || event._erased || !page ||
        event.list() !== page.list || event._trigger !== page.trigger || event._x !== entry.x || event._y !== entry.y) return null;
    const base = { scene, origin, event, list: page.list };
    const exit = EXITS[origin]?.[id];
    if (exit && event._trigger === 1) return { ...base, exit };
    if (origin === 199 && (id === 22 || id === 24)) return { ...base, line: id === 22 ? 24 : 22 };
    if (origin === 201 && CHASE_FLOORS.has(id)) return { ...base, chase: CHASE_FLOORS.get(id) };
    if (origin === 200 && CRYSTALS[id]) {
        const [gate, crystal] = CRYSTALS[id];
        const blocked = root.$gameSwitches?.value?.(gate);
        if (typeof blocked === 'boolean') return { ...base, crystal, blocked };
    }
    if (origin === 202 && id >= 5 && id <= 11 && root.$gameSwitches?.value?.(585) === false)
        return { ...base, stairs: true };
    return null;
}

function ownsRoute(map, list, index, expectedActor) {
    const command = list[index];
    const id = command?.parameters?.[0];
    const actor = map._events?.[id];
    return command?.code === 205 && (expectedActor === undefined || id === expectedActor) &&
        actor?._moveRouteForcing === true && actor._moveRoute === command.parameters[1];
}

function activeDistraction(map, data, id) {
    const page = data?.events?.[id]?.pages?.[0];
    return !!page && CRYSTALS[id]?.[1].some(index => ownsRoute(map, page.list, index));
}

function chaseContinuation(root, action) {
    const { event, list, chase } = action;
    const map = root.$gameMap;
    if (map?._mapId !== 201 || chase === undefined || !event._erased ||
        root.$gamePlayer._moveSpeed !== 4 || !ownsRoute(map, list, chase)) return null;
    const id = event._eventId;
    const next = CHASE_SEQUENCE[CHASE_SEQUENCE.indexOf(id) + 1];
    const legs = CHASE_LEGS[id];
    if (!next || !legs || root.$gamePlayer._x !== event._x || root.$gamePlayer._y !== event._y) return null;
    return { next, legs: legs.map(([direction, tiles]) => ({ direction, tiles })) };
}

function localOutcome(root, action) {
    const { event, list, line, chase, crystal } = action;
    const map = root.$gameMap;
    if (line) {
        const other = map._events?.[line];
        if (event._erased && other?._x === 0 && other._y === 0 &&
            LINE.every((id, index) => ownsRoute(map, list, 1 + index * 85, id))) return 'The patrol line started moving.';
    } else if (chase !== undefined) {
        if (event._erased && ownsRoute(map, list, chase))
            return 'A mech started chasing you. ' + chaseDirections(event._eventId);
    } else if (crystal) {
        if (action.blocked) return 'The crystal did not activate.';
        if (crystal.some(index => ownsRoute(map, list, index))) return 'The distraction crystal activated.';
    } else if (action.stairs && root.$gameSwitches?.value?.(585) === true) return 'The staircase scene finished.';
    return '';
}

function landing(root, action, scene) {
    if (!action.exit || !scene._transfer || root.$gameMap._mapId !== action.exit[2]) return '';
    const player = root.$gamePlayer;
    const id = action.exit[2];
    for (const index of action.exit[1]) {
        const command = action.list[index];
        if (command?.code !== 201 || command.parameters[0] !== 0 || command.parameters[1] !== id) continue;
        const [, , x, y] = command.parameters;
        // The staircase and chamber move the player north before the first
        // settled field. Their exact native landing and forced path share X.
        const travel = id === 202 ? 7 : id === 197 ? 5 : 0;
        if (player._x === x && player._y >= y - travel && player._y <= y) return ARRIVALS[id];
    }
    return '';
}

function createCaveProgress(root, graphics) {
    const pending = new WeakMap();

    function cancel() {
        const removed = pending.delete(root.$gameMap);
        graphics._wqaCaveProgressPending = false;
        return removed;
    }

    return {
        cancel,
        accepted(scene, event) {
            const action = acceptedAction(root, scene, event);
            if (!action) return;
            pending.set(root.$gameMap, action);
            graphics._wqaCaveProgressPending = true;
        },
        settle(scene) {
            if (!graphics._wqaCaveProgressPending) return null;
            const action = pending.get(root.$gameMap);
            cancel();
            if (!action) return null;
            if (action.scene !== scene) {
                const outcome = landing(root, action, scene);
                return outcome ? { outcome, arrived: true } : null;
            }
            if (root.$gameMap._mapId !== action.origin) return null;
            const outcome = localOutcome(root, action);
            return outcome ? { outcome, arrived: false } : null;
        }
    };
}

module.exports = { CHASE_LEGS, chaseHandoff, CHASES, CRYSTALS, activeDistraction, corridorMap, caveDestination,
    createCaveProgress, acceptedAction, chaseContinuation };
