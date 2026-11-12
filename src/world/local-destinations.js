'use strict';

const { houseStair, houseBranches } = require('./transfer-events.cjs');

// Each locator describes the active page's native destination. The worker
// still derives the interaction approach from live collision and priority.
const EXITS = {
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

const PULLS = { 51: [2], 53: [3, 4], 55: [4] };

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
    const exit = EXITS[map]?.[id];
    if (exit) {
        if ((trigger !== 0 && trigger !== 1) ||
            !list.some(command => command.code === 201 && command.parameters[0] === 0 &&
                exit.includes(command.parameters[1], 1))) return null;
        return { name: exit[0], category: 'exits' };
    }
    if (trigger !== 0) return undefined;
    if (PULLS[map]?.includes(id)) return event._pageIndex === 0 ? { name: 'Pull handle', category: 'objects' } : null;
    if (map === 15 && id >= 31 && id <= 33) return { name: 'Gate switch', category: 'objects' };
    if ((map === 128 && id === 11) || (map === 133 && id === 4))
        return { name: 'Hidden passage button', category: 'objects' };
    return undefined;
}

module.exports = { localDestination };
