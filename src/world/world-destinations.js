'use strict';

const { worldFacingEntrances, transferOptions } = require('./transfer-events.cjs');
const { DIRECTIONS } = require('./geometry.cjs');
const { vehicleOnMap } = require('./vehicle-navigation');

const RUINS = [162, 207, 164, 208, 165, 166, 161, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176,
    177, 178, 179, 180];
// The discovery event paints the marker at its paired native entrance.
// Two of the developer labels disagree with the actual entrance number.
const DISCOVERIES = { 11: 89, 75: 76, 78: 80, 81: 83, 85: 84, 86: 88, 90: 13, 92: 93, 97: 96,
    98: 100, 101: 102, 104: 105, 107: 108, 112: 110, 113: 114, 118: 116, 119: 121, 124: 122, 125: 126,
    128: 129, 131: 132, 134: 135, 190: 100 };

const FLOOR_EXITS = { 3: ['Russetwood', 12], 4: ['Russetwood', 12], 74: ['Russetwood', 12],
    19: ['Chillcrest', 25], 22: ['Cold Brew Trail', 36], 56: ['Sunrise Beach', 76] };

const SOLID_EXITS = { 59: ['Cracked Cove', 191], 60: ['Cracked Cove', 77],
    63: ['Poached Pools', 80], 64: ['Poached Pools', 80] };

function transfersTo(command, map) {
    return command?.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === map;
}

function worldDestination(root, mode, event, entry, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    const land = mode === 'walk' || mode === 'airship';
    if (map !== 113) {
        if (mode === 'walk' && (map === 206 || RUINS.includes(map)) && event._trigger === 1 &&
            page.list.some(command => transfersTo(command, 113))) return { name: 'Return to world map', category: 'exits' };
        return undefined;
    }
    const solid = SOLID_EXITS[id];
    if (land && solid && event._trigger === 1 && event._priorityType === 1 && event._pageIndex === 0) {
        const edges = worldFacingEntrances(entry, page, root.$dataCommonEvents);
        const bumpDirections = edges?.filter(edge => edge.map === solid[1])
            .reduce((mask, edge) => mask | (1 << DIRECTIONS.indexOf(edge.approach)), 0);
        return bumpDirections ? { name: solid[0], category: 'exits', eventAction: 'bump', bumpDirections } : null;
    }
    if (event._trigger === 1 && event._priorityType !== 1) {
        const list = page.list;
        if (id === 30 && transfersTo(list[4], 26)) return { name: 'Float Fort', category: 'exits' };
        if (id === 31 && transfersTo(list[13], 49)) return { name: 'Breaded Bay', category: 'exits' };
        if (id === 51) {
            if (land || root.$gameSwitches?.value?.(224) !== false || list[1]?.code !== 206) return null;
            const craft = vehicleOnMap(root.$gameMap, mode);
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
        if (land) {
            if (id === 13 && transfersTo(list[1], 206)) return { name: 'Secret Island', category: 'exits' };
            const floor = FLOOR_EXITS[id];
            if (floor && transferOptions(map, entry, page, root.$dataCommonEvents).some(edge => edge.map === floor[1]))
                return id === 19 ? { name: floor[0], category: 'exits', eventAction: 'step' } :
                    { name: floor[0], category: 'exits' };
            if (id === 43 && transferOptions(map, entry, page, root.$dataCommonEvents).some(edge =>
                edge.map === 57 || edge.map === 58))
                return { name: 'Cauldron', category: 'exits' };
            if (mode === 'walk' && discoveryEntrance(map, event))
                return { name: 'Scene trigger', category: 'events', eventAction: 'step' };
            const number = /^EnterSecretArea(\d+)$/.exec(entry.name)?.[1];
            if (number && transfersTo(list[1], RUINS[Number(number) - 1]))
                return { name: 'Lost Ruins ' + number, category: 'exits' };
        }
    }
    // Surface travel uses the native port events. Land destinations remain
    // available when the map returns to walking control.
    return land ? undefined : null;
}

// These authored discovery tiles can also be approached by boat.
function worldEventDescription(root, mode, event, page) {
    const map = root.$gameMap._mapId;
    if (map !== 113 || event._pageIndex !== 0 || event._trigger !== 1 || event._priorityType === 1) return null;
    const id = event._eventId;
    const sailing = (mode === 'ship' || mode === 'boat') && (id === 24 || id === 158) &&
        page.list.some(command => command.code === 357 && command.parameters?.[0] === 'Tyruswoo_TileControl' &&
            command.parameters[1] === 'set_tile');
    return sailing ? { name: 'Scene trigger', category: 'events', eventAction: 'step' } : null;
}

function discoveryEntrance(map, event) {
    if (map !== 113 || event?._erased || event?._pageIndex !== 0 || event._trigger !== 1) return undefined;
    return DISCOVERIES[event._eventId];
}

function worldBoundaryName(root, id) {
    const entrance = discoveryEntrance(root.$gameMap._mapId, root.$gameMap._events?.[id]);
    return entrance ? 'Scene trigger' : '';
}

module.exports = { worldDestination, worldEventDescription, worldBoundaryName, discoveryEntrance };
