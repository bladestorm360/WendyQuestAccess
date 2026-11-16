'use strict';

const { worldFacingEntrances, transferOptions, shipPort } = require('./transfer-events.cjs');
const { DIRECTIONS } = require('./geometry.cjs');
const { vehicleOnMap } = require('./vehicle-navigation');

const RUINS = [162, 207, 164, 208, 165, 166, 161, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176,
    177, 178, 179, 180];
// The discovery event paints the marker at its paired native entrance.
// Two of the developer labels disagree with the actual entrance number.
const DISCOVERIES = { 11: 89, 75: 76, 78: 80, 81: 83, 85: 84, 86: 88, 90: 13, 92: 93, 97: 96,
    98: 100, 101: 102, 104: 105, 107: 108, 112: 110, 113: 114, 118: 116, 119: 121, 124: 122, 125: 126,
    128: 129, 131: 132, 134: 135, 190: 100 };

const FLOAT_FORT_ENTRANCE = 21;
const FLOOR_EXITS = { 3: ['Russetwood', 12], 4: ['Russetwood', 12], 74: ['Russetwood', 12],
    19: ['Chillcrest', 25], 22: ['Cold Brew Trail', 36], 23: ['Frosty Peak', 27], 56: ['Sunrise Beach', 76] };

const SOLID_EXITS = { 59: ['Cracked Cove', 191], 60: ['Brekky Byway', 77],
    63: ['Poached Pool', 80], 64: ['Poached Pool', 80] };
const BREAKFAST_EXITS = {
    61: ['Shellside', 78], 62: ['Devilled Nook', 79], 65: ['Scrambled Shores', 81],
    66: ['Quiche Coast', 84], 67: ['Quiche Coast', 84], 68: ["Benedict's Bight", 66],
    69: ['Bacon Beach, north entrance', 85], 70: ['Bacon Beach, west entrance', 85], 71: ['Breakfast Stone Island', 86]
};

// Main-story introductions persist in Ayatam's save-backed quest records.
const INTRODUCTIONS = Object.fromEntries([
    [[10], [13]],
    [[16, 19], [14, 15]],
    [[22], [15]],
    [[28, 29, 31, 46], [16, 17]],
    [[34], [17, 18]],
    [[43], [20, 21, 22]],
    [[17, 18, 32, 39, 41, 42], [22, 23]],
    [[52], [23, 24]],
    [[56], [24, 25, 28]],
    [[59, 60], [25, 26, 27]],
    [[61, 62, 63, 64, 65, 66, 67, 68, 69, 70], [26, 27]],
    [[71], [27, 28]],
    [[25], [29, 30]]
].flatMap(([events, quests]) => events.map(id => [id, quests])));
const RUIN_MARKERS = new Map();
for (const [marker, entrance] of Object.entries(DISCOVERIES)) {
    if (entrance === 13) continue;
    if (!RUIN_MARKERS.has(entrance)) RUIN_MARKERS.set(entrance, Number(marker));
}

function learnedQuest(root, id) {
    const party = root.$gameParty;
    const name = 'quest' + id;
    const quest = party?._quests?.[name];
    return quest?.assent === true || quest?.reported === true || party?.getNav?.() === name;
}

function atlasPinAt(root, x, y) {
    return root.$gameSwitches?.value?.(624) === true && root.$gameVariables?.value?.(119) === x &&
        root.$gameVariables.value(120) === y;
}

function worldEntranceRevealed(root, id, spoilers, questMarker = false) {
    if (spoilers) return true;
    // Secret Island uses its native travel and landing rules without a discovery filter.
    if ([13, 51, 90, 94].includes(id)) return true;
    const marker = RUIN_MARKERS.get(id);
    if (marker) return marker === 98 ? root.$gameSwitches?.value?.(159) === true :
        root.$gameSelfSwitches?.value?.([113, marker, 'A']) === true;
    if (questMarker) return true;
    // A missing quest producer leaves ordinary names available.
    if (!root.$gameParty?._quests && typeof root.$gameParty?.getNav !== 'function') return true;
    const on = key => root.$gameSwitches?.value?.(key) === true;
    if (id === FLOAT_FORT_ENTRANCE) return on(38);
    if (id === 23) return on(38) || atlasPinAt(root, 7, 11);
    if (id === 22 && on(38) || (id === 16 || id === 19) && on(33)) return true;
    if (id === 31 && root.$gamePlayer?._vehicleType === 'ship') return true;
    if (id === 43 && on(54) || id === 25 && on(267) || id === 71 && on(97)) return true;
    const prerequisites = INTRODUCTIONS[id];
    return !prerequisites || prerequisites.some(quest => learnedQuest(root, quest));
}

function transfersTo(command, map) {
    return command?.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === map;
}

function worldDestination(root, mode, event, entry, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    const land = mode === 'walk' || mode === 'airship';
    if (map !== 113) return undefined;
    const solid = SOLID_EXITS[id];
    if (land && solid && event._trigger === 1 && event._priorityType === 1 && event._pageIndex === 0) {
        const edges = worldFacingEntrances(entry, page, root.$dataCommonEvents);
        const bumpDirections = edges?.filter(edge => edge.map === solid[1])
            .reduce((mask, edge) => mask | (1 << DIRECTIONS.indexOf(edge.approach)), 0);
        return bumpDirections ? { name: solid[0], category: 'exits', eventAction: 'bump', bumpDirections } : null;
    }
    const breakfast = BREAKFAST_EXITS[id];
    if (land && breakfast && event._trigger === 1 && event._pageIndex === 0 &&
        transferOptions(map, entry, page, root.$dataCommonEvents).some(edge => edge.map === breakfast[1]))
        return { name: breakfast[0], category: 'exits', eventAction: event._priorityType === 1 ? 'bump' : 'step' };
    if (event._trigger === 1 && event._priorityType !== 1) {
        const list = page.list;
        if (id === 30 || id === 31) {
            if (mode !== 'ship') return null;
            const port = shipPort(entry, page, root.$dataCommonEvents);
            const craft = vehicleOnMap(root.$gameMap, mode);
            return port && craft?.isLandOk(event._x, event._y, port.facing)
                ? { name: port.name, category: 'exits' } : null;
        }
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
            if (id === FLOAT_FORT_ENTRANCE && transferOptions(map, entry, page, root.$dataCommonEvents)
                .some(edge => edge.map === 26)) return { name: 'Float Fort', category: 'exits', eventAction: 'step' };
            if (id === 13 && transfersTo(list[1], 206))
                return { name: 'Secret Island', category: 'exits', handoffs: [90] };
            const floor = FLOOR_EXITS[id];
            if (floor && transferOptions(map, entry, page, root.$dataCommonEvents).some(edge => edge.map === floor[1]))
                return id === 19 ? { name: floor[0], category: 'exits', eventAction: 'step' } :
                    { name: floor[0], category: 'exits' };
            if (id === 43 && transferOptions(map, entry, page, root.$dataCommonEvents).some(edge =>
                edge.map === 57 || edge.map === 58))
                return { name: 'Cauldron', category: 'exits' };
            if (mode === 'walk' && discoveryEntrance(map, event))
                return { name: 'Discovery marker', category: 'events', eventAction: 'step' };
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
    if (sailing) return { name: 'Discovery marker', category: 'events', eventAction: 'step' };
    if (mode === 'ship' && (id === 155 || id === 156) && page.list.some(command =>
        command.code === 357 && command.parameters?.[0] === 'WendyQuest' && command.parameters[1] === 'ShowRewardTokens')) {
        const marked = root.$gameSelfSwitches?.value?.([113, id === 155 ? 24 : 158, 'A']) === true;
        return { name: marked ? 'Map marker' : 'Scene trigger', category: 'events', eventAction: 'step' };
    }
    return null;
}

// These approaches sit inside the edge, or extend a contiguous band
// around a corner. The side describes the exit on the current map.
const EXIT_SIDES = {
    15: { 2: 'Northeast', 3: 'Northeast', 5: 'Northeast' },
    17: { 8: 'South' }, 20: { 2: 'North', 3: 'North' }, 26: { 6: 'West' },
    27: { 23: 'West' }, 29: { 1: 'North' },
    77: { 58: 'East' }, 80: { 2: 'North', 13: 'North', 34: 'North', 35: 'North', 38: 'North' },
    134: { 10: 'North' }, 209: { 16: 'South' }
};

function worldMapExit(root, mode, event, entry, page, target) {
    const map = root.$gameMap._mapId;
    if (mode !== 'walk' || map === 113 || map === 185 || target?.category === 'vehicles' ||
        ![0, 1, 2].includes(event._trigger) ||
        !page.list.some(row => row.code === 201 && row.parameters?.[0] === 0 && row.parameters[1] === 113 &&
            (row.indent === 0 || target?.category === 'exits'))) return target;
    const { width, height } = root.$dataMap;
    const { x, y } = entry;
    const vertical = y === 0 ? 'North' : y === height - 1 ? 'South' : '';
    const horizontal = x === 0 ? 'West' : x === width - 1 ? 'East' : '';
    const side = EXIT_SIDES[map]?.[event._eventId] ||
        vertical + (vertical ? horizontal.toLowerCase() : horizontal);
    return { ...target, category: 'exits', name: side ? side + ' exit to world map' : 'World map',
        eventAction: target?.eventAction ?? (event._trigger ? event._priorityType === 1 ? 'bump' : 'step' : undefined) };
}

function discoveryEntrance(map, event) {
    if (map !== 113 || event?._erased || event?._pageIndex !== 0 || event._trigger !== 1) return undefined;
    return DISCOVERIES[event._eventId];
}

function worldBoundaryName(root, id, spoilers) {
    if (root.$gameMap._mapId === 113 && !worldEntranceRevealed(root, id, spoilers)) return '';
    const entrance = discoveryEntrance(root.$gameMap._mapId, root.$gameMap._events?.[id]);
    return entrance ? 'Discovery marker' : '';
}

module.exports = { worldDestination, worldEventDescription, worldBoundaryName, discoveryEntrance, worldMapExit, worldEntranceRevealed, FLOAT_FORT_ENTRANCE };
