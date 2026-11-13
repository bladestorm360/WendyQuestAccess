'use strict';

const { houseStair, houseBranches } = require('./transfer-events.cjs');

// Each locator describes the active page's native destination. The worker
// still derives the interaction approach from live collision and priority.
const EXITS = {
    13: { 1: ['Crispy Ruins', 16], 2: ['Crispy Ruins', 16],
        7: ["Elder Tater's house", 116], 16: ['Road to Russetwood', 113] },
    28: { 6: ['Cauldron exterior', 57], 7: ['Third pull room', 55],
        8: ['First pull room', 51], 9: ['Second pull room', 53] },
    32: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51], 8: ['Second pull room', 53] },
    44: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51],
        8: ['Third pull room', 55], 9: ['Second pull room', 53], 10: ['Final chamber', 63] },
    50: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51] },
    51: { 1: ['Return to Cauldron', 50, 32, 28, 44] },
    53: { 2: ['Return to Cauldron', 32, 28, 44, 50] },
    55: { 2: ['Cauldron exterior', 57], 3: ['Return to Cauldron', 28, 44] },
    57: { 13: ['Cauldron entrance', 50, 32, 28, 44], 14: ['Side entrance', 55], 20: ['Side entrance', 55] },
    58: { 16: ['Side entrance', 55], 22: ['Side entrance', 55] },
    63: { 1: ['Return to Cauldron', 44] },
    87: { 91: ['Hidden cave entrance', 205] },
    128: { 1: ['Second floor', 127] },
    133: { 1: ['First floor', 132] },
    195: { 1: ['Second floor', 127] },
    203: { 1: ['First floor', 132] },
    205: { 8: ['Return to Caffeine Caverns', 87], 12: ['Return to Caffeine Caverns', 87] }
};

// These audited normal-priority pages start when the player tries to move
// into the event. Keep their destinations tied to the active native page.
const TOUCH_TRANSFERS = {
    12: { 27: ["Frygor's house", 117] },
    25: { 13: ["Frostyna's house", 119] },
    27: { 17: ['Frosty Peak cave', 37], 44: ['Cold Brew Trail cave', 204] },
    48: { 3: ['Return to Nuggedor', 45, 59], 4: ['Return to Nuggedor', 45, 59],
        10: ['Return to Nuggedor', 45, 59], 16: ['Return to Nuggedor', 45, 59] },
    83: { 27: ["Frygor's house", 23] },
    116: { 8: ['Return to Crispy Beach', 13] },
    117: { 11: ['Return to Russetwood', 12] },
    119: { 3: ['Return to Chillcrest', 25] }
};

const PULLS = { 51: [2], 53: [3, 4], 55: [4] };

// Only these authored Crispy Beach floor events can qualify a route up to
// its first native interruption. The route still ends before the event.
const BEACH_HANDOFF_NAMES = Object.freeze({
    12: 'Beach path', 30: 'Beach path', 34: 'Beach checkpoint', 35: 'Beach checkpoint',
    10: 'Story event', 11: 'Story event', 13: 'Story event', 21: 'Story event', 22: 'Story event',
    23: 'Story event', 24: 'Story event', 25: 'Story event', 26: 'Story event', 27: 'Story event'
});
const BEACH_HANDOFFS = Object.freeze(Object.keys(BEACH_HANDOFF_NAMES).map(Number));

function localHandoffName(map, event) {
    return map === 13 ? BEACH_HANDOFF_NAMES[event] : undefined;
}

function localDestination(root, event, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    const trigger = event._trigger;
    const list = page.list;
    const stairs = houseStair(map, id);
    if (stairs) {
        // The landing changes within the same native page when the hidden
        // passage opens. Read the exact condition but only speak the target.
        if (trigger !== 1 || !houseBranches(stairs, list, map)) return null;
        const open = root.$gameSwitches?.value?.(stairs.switchId);
        if (typeof open !== 'boolean') return null;
        return { name: open ? 'Secret room stairs' : stairs.floor, category: 'exits' };
    }
    if (event._pageIndex === 0 && trigger === 1 && event._priorityType === 1) {
        if (map === 58 && id >= 37 && id <= 39 && list.some(command =>
            command.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === 57))
            return { name: 'Scene trigger', category: 'events', eventAction: 'bump' };
        if (map === 76 && id === 64 && list.some(command =>
            command.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === 112)) {
            // The first native branch turns Wendy away until switch 267 is on.
            return root.$gameSwitches?.value?.(267) === true
                ? { name: 'Board airship', category: 'vehicles', eventAction: 'bump' }
                : { name: 'Scene trigger', category: 'events', eventAction: 'bump' };
        }
        const transfer = TOUCH_TRANSFERS[map]?.[id];
        if (transfer && list.some(command => command.code === 201 && command.parameters[0] === 0 &&
            transfer.includes(command.parameters[1], 1)))
            return { name: transfer[0], category: 'exits', eventAction: 'bump' };
    }
    const exit = EXITS[map]?.[id];
    if (exit) {
        if ((trigger !== 0 && trigger !== 1) ||
            !list.some(command => command.code === 201 && command.parameters[0] === 0 &&
                exit.includes(command.parameters[1], 1))) return null;
        const target = { name: exit[0], category: 'exits' };
        if (map === 13 && id === 7) target.handoffs = BEACH_HANDOFFS;
        return target;
    }
    // Follow Elder Tater is a live parallel NPC page. A route approaches
    // the person without trying to start the background interpreter.
    if (map === 13 && id === 5 && event._pageIndex === 1 && trigger === 4 && page.image?.characterName === '~ElderTater')
        return { name: 'Elder Tater', category: 'people', waypoint: true, handoffs: BEACH_HANDOFFS };
    if (trigger !== 0) return undefined;
    if (PULLS[map]?.includes(id)) return event._pageIndex === 0 ? { name: 'Pull handle', category: 'objects' } : null;
    if (map === 15 && id >= 31 && id <= 33) return { name: 'Gate switch', category: 'objects' };
    if (map === 87 && id >= 121 && id <= 130 && page.list[35]?.parameters?.[3]?.pictureName === 'system/Caffeine Caverns Map')
        return { name: 'Map board', category: 'objects' };
    if ((map === 128 && id === 11) || (map === 133 && id === 4))
        return { name: 'Hidden passage button', category: 'objects' };
    return undefined;
}

module.exports = { localDestination, localHandoffName };
