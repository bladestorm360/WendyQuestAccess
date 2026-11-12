'use strict';

const { surfaceVehicle } = require('./vehicle-navigation');

const RUINS = [162, 207, 164, 208, 165, 166, 161, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176,
    177, 178, 179, 180];

function transfersTo(command, map) {
    return command?.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === map;
}

function worldDestination(root, mode, event, entry, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    if (map !== 113) {
        if (mode === 'walk' && (map === 206 || RUINS.includes(map)) && event._trigger === 1 &&
            page.list.some(command => transfersTo(command, 113))) return { name: 'Return to world map', category: 'exits' };
        return undefined;
    }
    if (event._trigger === 1 && event._priorityType !== 1) {
        const list = page.list;
        if (id === 30 && transfersTo(list[4], 26)) return { name: 'Float Fort', category: 'exits' };
        if (id === 31 && transfersTo(list[13], 49)) return { name: 'Breaded Bay', category: 'exits' };
        if (id === 51) {
            if (mode === 'walk' || root.$gameSwitches?.value?.(224) !== false || list[1]?.code !== 206) return null;
            const craft = surfaceVehicle(root.$gameMap, mode);
            if (!craft?.isLandOk(event._x, event._y, 6)) return null;
            return { name: 'Secret Island boat landing', category: 'exits', entryDirection: 6 };
        }
        if (id === 94) {
            if (mode !== 'walk' || root.$gameSwitches?.value?.(221) !== false ||
                list[4]?.code !== 117 || list[4].parameters[0] !== 139) return null;
            // Common Event 139 places the ship to the west and then invokes
            // native boarding using the direction of the last walking step.
            return { name: 'Board the boat from the island dock', category: 'vehicles', entryDirection: 4 };
        }
        if (mode === 'walk') {
            if (id === 13 && transfersTo(list[1], 206)) return { name: 'Secret Island', category: 'exits' };
            const number = /^EnterSecretArea(\d+)$/.exec(entry.name)?.[1];
            if (number && transfersTo(list[1], RUINS[Number(number) - 1]))
                return { name: 'Lost Ruins ' + number, category: 'exits' };
        }
    }
    // Surface travel uses the native port events. Land destinations remain
    // available when the map returns to walking control.
    return mode === 'walk' ? undefined : null;
}

function worldBoundaryName(root, id) {
    if (root.$gameMap._mapId !== 113) return '';
    const event = root.$gameMap._events?.[id];
    const entry = root.$dataMap?.events?.[id];
    if (event?._erased || event?._pageIndex !== 0 || event._trigger !== 1) return '';
    if (id === 90 && entry?.name === 'SecretAreaIsland') return 'Secret Island discovery';
    const number = /^SecretArea(\d+)$/.exec(entry?.name)?.[1];
    return number && RUINS[Number(number) - 1] ? `Lost Ruins ${number} discovery` : '';
}

module.exports = { worldDestination, worldBoundaryName };
