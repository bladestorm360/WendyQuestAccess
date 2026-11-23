'use strict';

const { DIRECTIONS, MAX_CELLS } = require('./geometry.cjs');
const { HOUSE_SWITCHES, CAULDRON_VARIABLE, NUGGEDOR_VARIABLE, NUGGEDOR_THRESHOLD, NUGGEDOR_BEFORE, NUGGEDOR_AFTER,
    STAGE, ALL_STAGES, CONNECTION_GATES, CHILLCREST_RETURNS, cauldronGate, WORLD_CAULDRON, worldCauldronGate } = require('./transfer-gates.cjs');

const STAIRS = {
    127: { switchId: HOUSE_SWITCHES[0], gate: 1, condition: 0, open: 2, closed: 6, secretMap: 195, floorMap: 128, floor: 'Third floor' },
    132: { switchId: HOUSE_SWITCHES[1], gate: 2, condition: 1, open: 2, closed: 5, secretMap: 203, floorMap: 133, floor: 'Second floor' }
};
const LAYOUTS = [50, 32, 28, 44];
const LAYOUT_STAGES = [STAGE.zero | STAGE.before, STAGE.one, STAGE.two, STAGE.three | STAGE.after];
const RETURN_BRANCHES = {
    51: { event: 1, tests: [0, 1, 2], maps: [50, 32, 28, 44], x: 17, y: 10 },
    53: { event: 2, tests: [1, 2, 3], maps: [32, 28, 44, 50], x: 39, y: 10 },
    55: { event: 3, tests: [2], maps: [28, 44], x: 2, y: 35 }
};

function houseStair(map, event) { return event === 2 ? STAIRS[map] : undefined; }

function transferTo(command, map) {
    const parameters = command?.parameters;
    if (command?.code !== 201 || !Array.isArray(parameters) || parameters.length !== 6 || parameters[0] !== 0) return null;
    const [, target, x, y] = parameters;
    if (!Number.isInteger(target) || target < 1 || target > 999 || target === map || ![0, 2, 4, 6, 8].includes(parameters[4]) ||
        ![x, y].every(axis => Number.isInteger(axis) && axis >= 0 && axis < MAX_CELLS)) return null;
    return { map: target, x, y, direction: parameters[4], gate: 0 };
}

function audioOnly(common, id = 38) {
    const rows = common?.[id]?.list;
    return rows?.length === 2 && rows[0]?.code === 250 && rows[0].indent === 0 && rows[1]?.code === 0;
}

function callsStairSound(command) { return command?.code === 117 && command.parameters?.[0] === 38; }

function questCommand(command, name) {
    return command?.code === 357 && command.parameters?.[0] === 'Ayatam_HighQualityQuestSystem' && command.parameters[1] === name;
}

function rowIs(command, code, indent = 0) { return command?.code === code && command.indent === indent; }

function parametersAre(command, values) {
    return command?.parameters?.length === values.length && values.every((value, index) => command.parameters[index] === value);
}

function flagsAre(page, ...expected) {
    const flags = Object.entries(page.conditions || {}).filter(([key, enabled]) => key.endsWith('Valid') && enabled);
    return flags.length === expected.length && expected.every(key => page.conditions[key] === true);
}

function landingIs(edge, map, x, y) { return edge?.map === map && edge.x === x && edge.y === y; }

function houseBranches(stair, list, map) {
    const condition = list[stair.condition];
    if (condition?.code !== 111 || condition.indent !== 0 || condition.parameters?.length !== 3 ||
        condition.parameters[0] !== 0 || condition.parameters[1] !== stair.switchId || condition.parameters[2] !== 0) return null;
    const closed = transferTo(list[stair.closed], map);
    const open = transferTo(list[stair.open], map);
    if (open?.map !== stair.secretMap || closed?.map !== stair.floorMap ||
        list[stair.open].indent !== 1 || list[stair.closed].indent !== 1 ||
        list[stair.open + 1]?.code !== 0 || list[stair.open + 2]?.code !== 411 ||
        list[stair.closed + 1]?.code !== 0 || list[stair.closed + 2]?.code !== 412 ||
        list[stair.closed + 3]?.code !== 0 || list.length !== stair.closed + 4) return null;
    if (!callsStairSound(list[stair.condition === 0 ? 1 : 0]) ||
        (stair.condition === 0 && !callsStairSound(list[5]))) return null;
    return [{ ...closed, gate: -stair.gate }, { ...open, gate: stair.gate }];
}

function caffeineEntrance(page, index) {
    if (page.priorityType !== 1) return [];
    const { list } = page;
    if (index === 0 && page.trigger === 1 && flagsAre(page) && list.length === 6 &&
        [101, 401, 401, 201, 123, 0].every((code, at) => rowIs(list[at], code)) &&
        parametersAre(list[4], ['A', 0])) {
        const edge = transferTo(list[3], 87);
        return landingIs(edge, 205, 14, 4) ? [edge] : [];
    }
    if (index === 1 && page.trigger === 0 && flagsAre(page, 'selfSwitchValid') && page.conditions.selfSwitchCh === 'A' &&
        list.length === 2 && rowIs(list[0], 201) && rowIs(list[1], 0)) {
        const edge = transferTo(list[0], 87);
        return landingIs(edge, 205, 14, 4) ? [edge] : [];
    }
    return [];
}

function caffeineEscape(entry, page, common) {
    const { list } = page;
    const codes = [117, 111, 357, 657, 357, 657, 657, 123, 0, 412, 201, 0];
    if (entry.pages.length !== 1 || page.trigger !== 1 || page.priorityType !== 1 || !flagsAre(page) ||
        list.length !== codes.length || !codes.every((code, index) => rowIs(list[index], code, index >= 2 && index <= 8 ? 1 : 0)) ||
        !audioOnly(common) || !callsStairSound(list[0]) || !parametersAre(list[1], [2, 'A', 1]) ||
        !questCommand(list[2], 'completeQuest') || !questCommand(list[4], 'startQuest') ||
        !parametersAre(list[7], ['A', 0])) return [];
    const edge = transferTo(list[10], 87);
    return landingIs(edge, 85, 7, 27) ? [{ ...edge, approach: 2 }] : [];
}

function breakfastCaveTransfer(map, entry, page, common) {
    const { id } = entry;
    const { list } = page;
    const ledges = map === 87 && (id === 77 || id === 78);
    if (!ledges && !(map === 191 && (id === 1 || id === 2))) return null;
    if (entry.pages.length !== 1 || !flagsAre(page) || page.trigger !== 1 || !audioOnly(common)) return null;
    if (ledges) {
        const east = id === 78;
        const at = east ? 3 : 2;
        const edge = transferTo(list[at], map);
        if (page.priorityType !== 1 || list.length !== at + 2 || !questCommand(list[0], 'disableAutoMarker') ||
            !rowIs(list[1], 117) || !callsStairSound(list[1]) ||
            (east && (!rowIs(list[2], 121) || !parametersAre(list[2], [96, 96, 0]))) ||
            !rowIs(list[at], 201) || !rowIs(list[at + 1], 0) ||
            !landingIs(edge, 85, east ? 24 : 9, east ? 20 : 11)) return null;
        return edge;
    }
    if (page.priorityType !== 0 || !rowIs(list[0], 117) || !callsStairSound(list[0])) return null;
    const at = id === 1 ? 15 : 2;
    const edge = transferTo(list[at], map);
    if (list.length !== at + 2 || !rowIs(list[at], 201) || !rowIs(list[at + 1], 0)) return null;
    return (id === 1 ? landingIs(edge, 87, 72, 8) && parametersAre(list[6], [2, 'A', 1]) &&
        questCommand(list[7], 'completeQuest') && questCommand(list[9], 'startQuest')
        : landingIs(edge, 87, 40, 11) && questCommand(list[1], 'disableAutoMarker')) ? edge : null;
}

function cauldronExterior(page, index) {
    if (page.priorityType !== 0 || page.trigger !== 1 || !LAYOUTS[index]) return [];
    const { list, conditions } = page;
    if (index === 0) {
        const codes = [111, 357, 657, 357, 657, 657, 123, 0, 412, 117, 201, 0];
        if (!flagsAre(page) || list.length !== codes.length ||
            !codes.every((code, at) => rowIs(list[at], code, at >= 1 && at <= 7 ? 1 : 0)) ||
            !parametersAre(list[0], [2, 'A', 1]) || !questCommand(list[1], 'completeQuest') ||
            !questCommand(list[3], 'startQuest') || !parametersAre(list[6], ['A', 0]) || !callsStairSound(list[9])) return [];
    } else if (!flagsAre(page, 'variableValid') || conditions.variableId !== CAULDRON_VARIABLE ||
        conditions.variableValue !== index || list.length !== 3 ||
        !rowIs(list[0], 117) || !callsStairSound(list[0]) || !rowIs(list[1], 201) || !rowIs(list[2], 0)) return [];
    const edge = transferTo(list[index === 0 ? 10 : 1], 57);
    return landingIs(edge, LAYOUTS[index], 3, 16) && edge.direction === 0 ?
        [{ ...edge, gate: cauldronGate(LAYOUT_STAGES[index]) }] : [];
}

function cauldronReturn(map, list, spec) {
    if (!rowIs(list[0], 117) || !callsStairSound(list[0]) ||
        !rowIs(list[1], 357) || !questCommand(list[1], 'disableAutoMarker')) return [];
    const edges = [];
    let remaining = ALL_STAGES;
    for (const [depth, value] of spec.tests.entries()) {
        const at = 2 + depth * 4;
        const edge = transferTo(list[at + 1], map);
        if (!rowIs(list[at], 111, depth) || !parametersAre(list[at], [1, CAULDRON_VARIABLE, 0, value, 0]) ||
            !rowIs(list[at + 1], 201, depth + 1) || !rowIs(list[at + 2], 0, depth + 1) ||
            !rowIs(list[at + 3], 411, depth) || !landingIs(edge, spec.maps[depth], spec.x, spec.y)) return [];
        const mask = 1 << value;
        edges.push({ ...edge, gate: cauldronGate(mask) });
        remaining &= ~mask;
    }
    const depth = spec.tests.length;
    const end = 2 + depth * 4;
    const fallback = transferTo(list[end], map);
    if (list.length !== end + 2 + depth * 2 || !rowIs(list[end], 201, depth) ||
        !rowIs(list[end + 1], 0, depth) || !landingIs(fallback, spec.maps[depth], spec.x, spec.y)) return [];
    for (let block = depth - 1; block >= 0; block--) {
        const at = end + 2 + (depth - 1 - block) * 2;
        if (!rowIs(list[at], 412, block) || !rowIs(list[at + 1], 0, block)) return [];
    }
    edges.push({ ...fallback, gate: cauldronGate(remaining) });
    return edges;
}

function cauldronSpecial(map, event, page, index, common) {
    if (map === 57 && event === 13) return audioOnly(common) ? cauldronExterior(page, index) : [];
    const spec = RETURN_BRANCHES[map];
    if (spec?.event === event) return index === 0 && page.trigger === 1 && page.priorityType === 1 &&
        flagsAre(page) && audioOnly(common) ? cauldronReturn(map, page.list, spec) : [];
    const sideExit = map === 55 && event === 2;
    const chamber = map === 44 && event === 10;
    if (!sideExit && !chamber) return undefined;
    if (index !== 0 || page.trigger !== 1 || !flagsAre(page) || !audioOnly(common)) return [];
    const { list } = page;
    if (sideExit) {
        const edge = transferTo(list[2], map);
        return page.priorityType === 1 && list.length === 4 && [117, 357, 201, 0].every((code, at) => rowIs(list[at], code)) &&
            callsStairSound(list[0]) && questCommand(list[1], 'disableAutoMarker') &&
            landingIs(edge, 57, 24, 19) ? [edge] : [];
    }
    const codes = [111, 134, 0, 412, 357, 657, 657, 657, 657, 117, 201, 0];
    const edge = transferTo(list[10], map);
    return page.priorityType === 0 && list.length === codes.length &&
        codes.every((code, at) => rowIs(list[at], code, at === 1 || at === 2 ? 1 : 0)) &&
        parametersAre(list[0], [0, 81, 1]) && questCommand(list[4], 'questMarker') && callsStairSound(list[9]) &&
        landingIs(edge, 63, 12, 28) ? [edge] : [];
}

const ISLAND_DOCK = 51;

function islandDismount(entry, page) {
    if (entry?.id !== ISLAND_DOCK || entry.x !== 44 || entry.y !== 2 || entry.pages.length !== 1 ||
        entry.pages[0] !== page || !flagsAre(page) || page.trigger !== 1 || page.priorityType !== 0 ||
        page.moveType !== 0 || page.through) return null;
    const { list } = page;
    const codes = [111, 206, 205, 505, 121, 0, 412, 0];
    const route = list?.[2]?.parameters?.[1];
    if (list?.length !== codes.length || !codes.every((code, index) => rowIs(list[index], code, index >= 1 && index <= 5 ? 1 : 0)) ||
        !parametersAre(list[0], [0, 224, 1]) || list[2].parameters[0] !== -1 ||
        route?.wait !== true || route.repeat || route.skippable !== true || route.list?.length !== 2 ||
        route.list[0]?.code !== 3 || route.list[1]?.code !== 0 || !parametersAre(list[4], [221, 221, 1])) return null;
    // Native disembarkation advances one tile before the authored walk.
    return { map: 113, x: 46, y: 2, facing: 6, sameScene: true, name: 'Secret Island boat landing' };
}

const SHIP_PORTS = {
    30: { map: 26, x: 29, y: 14, direction: 0, facing: 4, turn: 17, name: 'Float Fort port' },
    31: { map: 49, x: 2, y: 13, direction: 2, facing: 6, turn: 18, name: 'Breaded Bay port' }
};

function shipPort(entry, page, common) {
    const port = SHIP_PORTS[entry?.id];
    if (!port || !page || entry.pages.length !== 1 || entry.pages[0] !== page || !flagsAre(page) ||
        page.trigger !== 1 || page.priorityType !== 0 || page.moveType !== 0 || page.through) return null;
    const { list } = page;
    const breaded = entry.id === 31;
    const codes = breaded ? [117, 205, 505, 122, 117, 206, 111, 123, 357, 657, 657, 0, 412, 201, 0]
        : [117, 205, 505, 206, 201, 0];
    const route = list?.[1]?.parameters?.[1];
    // The ports turn the ship before native disembarkation. Breaded Bay
    // also runs native boat positioning and an optional quest branch.
    if (list?.length !== codes.length ||
        !codes.every((code, index) => rowIs(list[index], code, breaded && index >= 7 && index <= 11 ? 1 : 0)) ||
        !parametersAre(list[0], [138]) || !common?.[138]?.list || list[1].parameters[0] !== -1 ||
        route?.wait !== true || route.repeat || route.skippable || route.list?.length !== 2 ||
        route.list[0]?.code !== port.turn || route.list[1]?.code !== 0 ||
        (breaded && (!parametersAre(list[4], [139]) || !common[139]?.list))) return null;
    const edge = transferTo(list[list.length - 2], 113);
    return landingIs(edge, port.map, port.x, port.y) && edge.direction === port.direction
        ? { ...edge, facing: port.facing, name: port.name } : null;
}

function recordsWorldPosition(common) {
    const list = common?.[138]?.list;
    const codes = [355, 108, 408, 122, 122, 122, 122, 122, 108, 408, 122, 122, 0];
    const variables = [[3, 82], [4, 83], [5, 84], [6, 85], [7, 84], [10, 30], [11, 31]];
    return list?.length === codes.length && codes.every((code, index) => rowIs(list[index], code)) &&
        /^console\.log\("[^"\\\r\n]{1,96}"\);?$/.test(list[0].parameters?.[0]) &&
        variables.every(([index, id]) => list[index].parameters?.[0] === id && list[index].parameters[1] === id);
}

function worldDiscovery(entry, destination, common) {
    const [page, completed] = entry?.pages || [];
    if (entry?.pages?.length !== 2 || !destination || page.trigger !== 1 || page.priorityType !== 0 ||
        page.moveType !== 0 || page.through || !flagsAre(page)) return null;
    const { list } = page;
    const fromBeach = entry.id === 78;
    const island = entry.id === 90;
    const hasMessage = entry.id === 75 || entry.id === 92;
    const sharedSwitch = entry.id === 98 || entry.id === 190;
    const codes = [...(fromBeach ? [117, 117] : island ? [] : [117]), 249, 357, 657, 657, 657, 213,
        ...(hasMessage ? [117] : []), sharedSwitch ? 121 : 123, 0];
    if (list.length !== codes.length || !codes.every((code, index) => rowIs(list[index], code))) return null;
    if (fromBeach && (!parametersAre(list[0], [138]) || !recordsWorldPosition(common))) return null;
    if (!island && (!parametersAre(list[fromBeach ? 1 : 0], [131]) || common?.[131]?.list?.length !== 2 ||
        !rowIs(common[131].list[0], 355) || !rowIs(common[131].list[1], 0))) return null;
    if (hasMessage && (!parametersAre(list[list.length - 3], [87]) || common?.[87]?.list?.length !== 9 ||
        ![111, 230, 101, 401, 401, 121, 0, 412, 0].every((code, index) => common[87].list[index].code === code))) return null;
    const [plugin, command, , parameters] = list[codes.indexOf(357)].parameters;
    const raw = parameters?.coordinates;
    if (plugin !== 'Tyruswoo_TileControl' || command !== 'set_tile' || typeof raw !== 'string' || raw.length > 80) return null;
    let tile;
    try { tile = JSON.parse(raw); } catch { return null; }
    if (Number(tile?.x) !== destination.x || Number(tile?.y) !== destination.y || ![2, 3].includes(Number(tile?.z))) return null;
    const finish = list[list.length - 2];
    // Both approaches to this Ruins marker share a story switch. The
    // replacement parallel page only erases its obsolete discovery event.
    if (sharedSwitch) return completed.trigger === 4 && completed.list.length === 2 &&
        rowIs(completed.list[0], 214) && rowIs(completed.list[1], 0) && flagsAre(completed, 'switch1Valid') &&
        completed.conditions.switch1Id === 159 && parametersAre(finish, [159, 159, 0]) ? { switchId: 159 } : null;
    return completed.list.length === 1 && rowIs(completed.list[0], 0) &&
        flagsAre(completed, 'selfSwitchValid') && completed.conditions.selfSwitchCh === 'A' &&
        parametersAre(finish, ['A', 0]) ? { selfSwitch: 'A' } : null;
}

const WORLD_MARKERS = { 18: [71, 60, 1, 14], 29: [73, 49, 26, 9], 41: [70, 62, 22, 26], 42: [72, 61, 13, 18] };
const WORLD_MARKER_CLEAR = { 52: [209, 6, 14], 69: [85, 25, 1], 70: [85, 1, 15] };

function recordsPositionAt(list, index, common) {
    return rowIs(list[index], 117) && parametersAre(list[index], [138]) && recordsWorldPosition(common);
}

function worldQuestEntrance(entry, page, index, common) {
    if (page.trigger !== 1) return null;
    const { list } = page;
    const marker = WORLD_MARKERS[entry.id];
    if (marker && entry.pages.length === 2 && page.priorityType === 0) {
        const [switchId, map, x, y] = marker;
        const edge = transferTo(list[1], 113);
        if (!landingIs(edge, map, x, y) || !rowIs(list[1], 201)) return null;
        if (index === 0) return flagsAre(page) && list.length === 8 && recordsPositionAt(list, 0, common) &&
            rowIs(list[2], 357) && questCommand(list[2], 'questMarker') &&
            [3, 4, 5, 6].every(at => rowIs(list[at], 657)) && rowIs(list[7], 0) ? edge : null;
        return flagsAre(page, 'switch1Valid') && page.conditions.switch1Id === switchId && list.length === 3 &&
            rowIs(list[0], 357) && questCommand(list[0], 'disableAutoMarker') && rowIs(list[2], 0) ? edge : null;
    }
    if (entry.id === 46 && entry.pages.length === 2 && page.priorityType === 0 && recordsPositionAt(list, 0, common)) {
        if (index === 0) {
            const edge = transferTo(list[1], 113);
            return flagsAre(page) && list.length === 3 && rowIs(list[1], 201) && rowIs(list[2], 0) &&
                landingIs(edge, 59, 10, 1) ? { ...edge, gate: NUGGEDOR_BEFORE } : null;
        }
        const edge = transferTo(list[6], 113);
        return flagsAre(page, 'variableValid') && page.conditions.variableId === NUGGEDOR_VARIABLE &&
            page.conditions.variableValue === NUGGEDOR_THRESHOLD && list.length === 8 &&
            rowIs(list[1], 357) && questCommand(list[1], 'questMarker') && [2, 3, 4, 5].every(at => rowIs(list[at], 657)) &&
            rowIs(list[6], 201) && rowIs(list[7], 0) && landingIs(edge, 45, 10, 1) ? { ...edge, gate: NUGGEDOR_AFTER } : null;
    }
    if (entry.pages.length !== 1 || !flagsAre(page)) return null;
    const clear = WORLD_MARKER_CLEAR[entry.id];
    if (clear) {
        const edge = transferTo(list[2], 113);
        return list.length === 4 && rowIs(list[0], 357) && questCommand(list[0], 'disableAutoMarker') &&
            recordsPositionAt(list, 1, common) && rowIs(list[2], 201) && rowIs(list[3], 0) &&
            landingIs(edge, ...clear) ? edge : null;
    }
    if (entry.id === 21) {
        const route = list[1]?.parameters?.[1];
        const edge = transferTo(list[3], 113);
        // The authored route clears through mode without moving the player.
        return list.length === 5 && recordsPositionAt(list, 0, common) && rowIs(list[1], 205) &&
            list[1].parameters[0] === -1 && route?.wait === true && !route.repeat && !route.skippable &&
            route.list?.length === 2 && route.list[0].code === 38 && route.list[1].code === 0 &&
            rowIs(list[2], 505) && rowIs(list[3], 201) && rowIs(list[4], 0) && landingIs(edge, 26, 1, 22) ? edge : null;
    }
    if (entry.id === 25) {
        const edge = transferTo(list[10], 113);
        const codes = [117, 111, 357, 657, 357, 657, 657, 123, 0, 412, 201, 0];
        return list.length === codes.length && codes.every((code, at) => rowIs(list[at], code, at >= 2 && at <= 8 ? 1 : 0)) &&
            recordsPositionAt(list, 0, common) && parametersAre(list[1], [2, 'A', 1]) &&
            questCommand(list[2], 'completeQuest') && questCommand(list[4], 'startQuest') &&
            parametersAre(list[7], ['A', 0]) && landingIs(edge, 94, 38, 15) ? edge : null;
    }
    return null;
}

function playerHeading(command, depth = 0) {
    const args = command?.parameters;
    return rowIs(command, 111, depth) && args?.length === 3 && args[0] === 6 && args[1] === -1 && DIRECTIONS.includes(args[2])
        ? args[2] : null;
}

function worldFacingEntrances(entry, page, common) {
    const eitherSide = [3, 4, 74].includes(entry.id);
    if (!eitherSide && ![22, 56, 59, 60, 63, 64].includes(entry.id)) return null;
    const { list } = page;
    if (entry.pages.length !== 1 || page.trigger !== 1 || !flagsAre(page) || !recordsPositionAt(list, 0, common)) return [];
    if (eitherSide) {
        const north = transferTo(list[2], 113);
        const other = transferTo(list[5], 113);
        if (list.length !== 9 || playerHeading(list[1]) !== 8 || !rowIs(list[2], 201, 1) || !rowIs(list[3], 0, 1) ||
            !rowIs(list[4], 411) || !rowIs(list[5], 201, 1) || !rowIs(list[6], 0, 1) ||
            !rowIs(list[7], 412) || !rowIs(list[8], 0) ||
            !landingIs(north, 12, 6, 40) || !landingIs(other, 12, 2, 22)) return [];
        return DIRECTIONS.map(approach => ({ ...(approach === 8 ? north : other), approach }));
    }
    const blocks = (list.length - 2) / 4;
    if (!Number.isInteger(blocks) || blocks < 1 || blocks > DIRECTIONS.length || !rowIs(list[list.length - 1], 0)) return [];
    const edges = [];
    for (let index = 0; index < blocks; index++) {
        const at = 1 + index * 4;
        const approach = playerHeading(list[at]);
        const edge = transferTo(list[at + 1], 113);
        if (!approach || !edge || edges.some(option => option.approach === approach) ||
            !rowIs(list[at + 1], 201, 1) || !rowIs(list[at + 2], 0, 1) || !rowIs(list[at + 3], 412)) return [];
        edges.push({ ...edge, approach });
    }
    return edges;
}

function chillcrestEntrances(entry, page, common) {
    const { list } = page;
    if (entry.pages.length !== 1 || page.trigger !== 1 || page.priorityType !== 0 || !flagsAre(page) ||
        !recordsPositionAt(list, 0, common)) return [];
    const codes = [117, 111, 201, 0, 411, 111, 201, 0, 411, 201, 121, 0, 412, 0, 412, 0];
    const depths = [0, 0, 1, 1, 0, 1, 2, 2, 1, 2, 2, 2, 1, 1, 0, 0];
    if (list.length !== codes.length || !codes.every((code, index) => rowIs(list[index], code, depths[index])) ||
        playerHeading(list[1]) !== 6 || playerHeading(list[5], 1) !== 4 || !parametersAre(list[10], [155, 155, 0])) return [];
    const east = transferTo(list[2], 113);
    const west = transferTo(list[6], 113);
    const other = transferTo(list[9], 113);
    if (!landingIs(east, 25, 1, 17) || !landingIs(west, 25, 47, 27) || !landingIs(other, 25, 23, 36)) return [];
    return [{ ...east, approach: 6 }, { ...west, approach: 4 }, { ...other, approach: 2 }, { ...other, approach: 8 }];
}

function worldCauldronEntrances(entry, page, index, common) {
    const { list } = page;
    if (entry.pages.length !== 3 || page.trigger !== 1 || page.priorityType !== 0 || !recordsPositionAt(list, 0, common))
        return [];
    if (index === 1) {
        const edge = transferTo(list[1], 113);
        return list.length === 3 && flagsAre(page, 'selfSwitchValid') && page.conditions.selfSwitchCh === 'A' &&
            rowIs(list[1], 201) && rowIs(list[2], 0) && landingIs(edge, 58, 20, 23) ?
            [{ ...edge, gate: worldCauldronGate(WORLD_CAULDRON.informed) }] : [];
    }
    if (index === 2) {
        const codes = [117, 111, 201, 0, 411, 111, 201, 0, 412, 0, 412, 0];
        const depths = [0, 0, 1, 1, 0, 1, 2, 2, 1, 1, 0, 0];
        const north = transferTo(list[2], 113);
        const east = transferTo(list[6], 113);
        if (list.length !== codes.length || !codes.every((code, at) => rowIs(list[at], code, depths[at])) ||
            !flagsAre(page, 'switch1Valid') || page.conditions.switch1Id !== 54 ||
            playerHeading(list[1]) !== 8 || playerHeading(list[5], 1) !== 6 ||
            !landingIs(north, 57, 20, 23) || !landingIs(east, 57, 1, 13)) return [];
        const gate = worldCauldronGate(WORLD_CAULDRON.changed);
        return [{ ...north, approach: 8, gate }, { ...east, approach: 6, gate }];
    }
    const codes = [117, 111, 201, 0, 411, 111, 111, 201, 0, 411, 201, 0, 412, 0, 412, 0,
        412, 111, 230, 101, 401, 101, 401, 401, 101, 401, 401, 123, 0, 412, 0];
    const depths = [0, 0, 1, 1, 0, 1, 2, 3, 3, 2, 3, 3, 2, 2, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0];
    const north = transferTo(list[2], 113);
    const rescued = transferTo(list[7], 113);
    const early = transferTo(list[10], 113);
    if (list.length !== codes.length || !codes.every((code, at) => rowIs(list[at], code, depths[at])) ||
        !flagsAre(page) || playerHeading(list[1]) !== 8 || playerHeading(list[5], 1) !== 6 ||
        !parametersAre(list[6], [0, 462, 0]) || !parametersAre(list[17], [0, 462, 0]) || !parametersAre(list[27], ['A', 0]) ||
        !landingIs(north, 58, 20, 23) || !landingIs(rescued, 58, 20, 23) || !landingIs(early, 58, 1, 13)) return [];
    // Native dialogue and the self-switch follow the reservation when the rescue is complete.
    return [{ ...north, approach: 8, gate: worldCauldronGate(WORLD_CAULDRON.early | WORLD_CAULDRON.rescued) },
        { ...rescued, approach: 6, gate: worldCauldronGate(WORLD_CAULDRON.rescued) },
        { ...early, approach: 6, gate: worldCauldronGate(WORLD_CAULDRON.early) }];
}

function worldWalkingEntrance(entry, page, common) {
    if (entry.pages.length !== 1 || page.trigger !== 1 || !flagsAre(page)) return null;
    const { list } = page;
    if (list.length < 3 || !rowIs(list[0], 117) || !parametersAre(list[0], [138]) ||
        !rowIs(list[1], 201) || !recordsWorldPosition(common)) return null;
    const edge = transferTo(list[1], 113);
    if (list.length === 3 && rowIs(list[2], 0)) return edge;
    // Secret Island turns on its visited flag after the native reservation.
    return entry.id === 13 && list.length === 4 && landingIs(edge, 206, 9, 16) &&
        rowIs(list[2], 121) && parametersAre(list[2], [619, 619, 0]) && rowIs(list[3], 0) ? edge : null;
}

function islandReturn(entry, page) {
    const { list } = page;
    if (![2, 3, 4, 5, 6, 8].includes(entry.id) || entry.pages.length !== 1 || page.priorityType !== 0 ||
        page.trigger !== 1 || !flagsAre(page) || list.length !== 3 || !rowIs(list[0], 122) ||
        !parametersAre(list[0], [81, 81, 0, 0, 2]) || !rowIs(list[1], 201) || !rowIs(list[2], 0)) return null;
    const edge = transferTo(list[1], 206);
    return landingIs(edge, 113, 48, 7) && edge.direction === 0 ? edge : null;
}

function bayReturn(entry, page) {
    const { list } = page;
    if (entry.id < 3 || entry.id > 10 || entry.pages.length !== 1 || page.trigger !== 1 || page.priorityType !== 0 ||
        !flagsAre(page) || list.length !== 3 || !rowIs(list[0], 357) || !questCommand(list[0], 'disableAutoMarker') ||
        !rowIs(list[1], 201) || !rowIs(list[2], 0)) return null;
    const edge = transferTo(list[1], 49);
    return landingIs(edge, 113, 39, 9) && edge.direction === 0 ? edge : null;
}

// These exits always transfer. Their surrounding branches update the atlas
// or quest journal; they do not gate passage or select a different landing.
function regionalExit(map, entry, page, index, common) {
    const { list } = page;
    if (map === 76 && [2, 3, 92].includes(entry.id)) {
        const codes = [111, 111, 121, 122, 122, 117, 121, 121, 121, 121, 0, 412, 0, 412, 201, 117, 0];
        const depths = [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0];
        const edge = transferTo(list[14], map);
        return entry.pages.length === 1 && flagsAre(page) && page.trigger === 1 && page.priorityType === 0 &&
            list.length === codes.length && codes.every((code, at) => rowIs(list[at], code, depths[at])) &&
            parametersAre(list[0], [0, 464, 0]) && parametersAre(list[1], [0, 466, 1]) &&
            parametersAre(list[5], [159]) && parametersAre(list[15], [48]) && common?.[159]?.list && common?.[48]?.list &&
            landingIs(edge, 113, 43, 28) ? [edge] : [];
    }
    if (map === 209 && entry.id === 9) {
        const edge = transferTo(list[2], map);
        return entry.pages.length === 1 && flagsAre(page) && page.trigger === 1 && page.priorityType === 0 &&
            list.length === 4 && callsStairSound(list[0]) && questCommand(list[1], 'disableAutoMarker') &&
            rowIs(list[2], 201) && rowIs(list[3], 0) && audioOnly(common) && landingIs(edge, 52, 12, 93) ? [edge] : [];
    }
    if (map === 52 && entry.id === 15) {
        const codes = [117, 357, 657, 657, 657, 657, 111, 357, 657, 357, 657, 657, 123, 0, 412, 117, 121, 201, 0];
        const edge = transferTo(list[17], map);
        return entry.pages.length === 1 && flagsAre(page) && page.trigger === 1 && page.priorityType === 1 &&
            list.length === codes.length && codes.every((code, at) => rowIs(list[at], code, at >= 7 && at <= 13 ? 1 : 0)) &&
            recordsPositionAt(list, 0, common) && questCommand(list[1], 'questMarker') &&
            parametersAre(list[6], [2, 'A', 1]) && questCommand(list[7], 'completeQuest') &&
            questCommand(list[9], 'startQuest') && parametersAre(list[12], ['A', 0]) &&
            callsStairSound(list[15]) && parametersAre(list[16], [89, 89, 0]) && audioOnly(common) &&
            landingIs(edge, 209, 10, 7) ? [edge] : [];
    }
    const mine = { 3: [50, 16], 4: [51, 4], 10: [31, 4], 16: [25, 22] }[entry.id];
    if (map === 48 && mine) {
        const codes = [117, 111, 201, 0, 411, 201, 0, 412, 0];
        const depths = [0, 0, 1, 1, 0, 1, 1, 0, 0];
        const after = transferTo(list[2], map), before = transferTo(list[5], map);
        return entry.pages.length === 1 && flagsAre(page) && page.trigger === 1 && page.priorityType === 1 &&
            list.length === codes.length && codes.every((code, at) => rowIs(list[at], code, depths[at])) &&
            callsStairSound(list[0]) && audioOnly(common) && parametersAre(list[1], [1, 5, 0, 4, 1]) &&
            landingIs(after, 45, ...mine) && landingIs(before, 59, ...mine) ?
            [{ ...before, gate: NUGGEDOR_BEFORE }, { ...after, gate: NUGGEDOR_AFTER }] : [];
    }
    if (map === 61 && entry.id === 1) {
        const edge = transferTo(list[index === 0 ? 1 : 2], map);
        const codes = index === 0 ? [117, 201, 357, 657, 657, 657, 657, 0] : [357, 117, 201, 0];
        return entry.pages.length === 2 && index <= 1 && page.trigger === 1 && page.priorityType === 1 &&
            (index === 0 ? flagsAre(page) : flagsAre(page, 'switch1Valid') && page.conditions.switch1Id === 72) &&
            list.length === codes.length && codes.every((code, at) => rowIs(list[at], code)) && audioOnly(common) &&
            callsStairSound(list[index === 0 ? 0 : 1]) && questCommand(list[index === 0 ? 2 : 0], index === 0 ? 'questMarker' : 'disableAutoMarker') &&
            landingIs(edge, 48, 6, 5) ? [edge] : [];
    }
    return null;
}

// These verified wrapper families have one unconditional literal reservation.
// Branches only update a journal/ambient flag; no branch skips or replaces it.
// Keep the allowlist local: dialogue rejection, choice and patrol reset pages
// elsewhere must never become an invented walking connection.
const WRAPPED_SHAPES = Object.freeze({
        '14:2:0':'357,111,122,121,0,412,201,0', '14:3:0':'357,111,122,121,0,412,201,0',
        '49:12:0':'122,121,201,357,0', '63:14:0':'117,117,201,0',
        '97:18:0':'117,111,242,221,230,0,412,357,657,657,657,657,111,357,657,357,657,657,123,0,412,201,0',
        '106:12:0':'117,235,201,0', '106:13:0':'117,221,235,357,201,0',
        '116:8:0':'117,201,242,0',
        '134:10:2':'111,123,357,657,357,657,657,117,0,412,117,201,0',
        '181:3:0':'111,121,0,412,117,201,0',
        '105:11:0':'250,117,242,221,134,230,121,201,0',
        '128:11:0':'101,401,111,101,401,101,401,0,412,230,250,230,250,121,201,0',
        '196:22:0':'121,117,242,221,201,122,222,0',
        '202:4:0':'111,281,121,0,411,121,122,0,412,117,121,117,201,0'
});
function wrappedExit(map, entry, page, index, common) {
    const list = page.list;
    if (map===94 && [12,27].includes(entry.id) && index===5 && flagsAre(page,'variableValid') &&
        page.conditions.variableId===16 && page.conditions.variableValue===5 &&
        list.map(row=>row.code).join(',') === '243,242,230,101,401,401,101,401,230,101,401,122,121,121,121,122,122,117,357,657,357,657,657,250,134,117,230,201,230,117,134,357,0') {
        const edge=transferTo(list[27],map);
        return landingIs(edge,93,13,64) && list[27].indent===0 ? edge : null;
    }
    const shape = WRAPPED_SHAPES[map+':'+entry.id+':'+index];
    if (!shape || list.map(row=>row.code).join(',') !== shape) return null;
    if (map === 97 ? !flagsAre(page,'switch1Valid') || page.conditions.switch1Id !== 103 :
        map === 134 ? !flagsAre(page,'selfSwitchValid') || page.conditions.selfSwitchCh !== 'A' : !flagsAre(page)) return null;
    for (const row of list) if (row.code === 117) {
        const id = row.parameters[0];
        if ([37,38].includes(id) && audioOnly(common,id)) continue;
        if ((map === 134 || map === 202) && id === 48 && common?.[48]?.list?.length === 2 &&
            rowIs(common[48].list[0],122) && parametersAre(common[48].list[0],[12,12,0,0,0])) continue;
        if (map === 105 && id === 47 && common?.[47]?.list?.length === 2 &&
            rowIs(common[47].list[0],122) && parametersAre(common[47].list[0],[12,12,0,0,1])) continue;
        const haze = common?.[7]?.list;
        if (map === 63 && id === 7 && haze?.length === 3 && haze[0].code === 357 &&
            haze[0].parameters[0] === 'FilterControllerMZ' && haze[0].parameters[1] === 'eraseFilter' && haze[1].code === 657 && haze[2].code === 0) continue;
        return null;
    }
    const reservation = list.find(row=>row.code===201);
    return reservation.indent === 0 ? transferTo(reservation,map) : null;
}

function conditionalCatalog(map, entry, common) {
    const {pages,id}=entry;
    // The same house returns to the town layout selected by native variable5.
    if ([139,141,143,145,154,155,156,183].includes(map) && pages.length === 2 &&
        flagsAre(pages[0]) && flagsAre(pages[1],'variableValid') &&
        pages[1].conditions.variableId === 5 && pages[1].conditions.variableValue === 4) {
        const edges=pages.map(page=>transferOptions(map,entry,page,common)[0]);
        if (edges[0]?.map===59 && edges[1]?.map===45 && edges[0].x===edges[1].x && edges[0].y===edges[1].y)
            return edges.map((edge,i)=>({...edge,gate:i?NUGGEDOR_AFTER:NUGGEDOR_BEFORE}));
    }
    // Following Chomps temporarily closes the older town's doors/mines.
    if (map === 59 && pages.length === 2 && flagsAre(pages[0]) &&
        flagsAre(pages[1],'switch1Valid') && pages[1].conditions.switch1Id === 424 &&
        !pageMayTransfer(pages[1],common))
        return transferOptions(map,entry,pages[0],common).map(edge=>({...edge,gate:CONNECTION_GATES.nuggedorDoors}));
    const spec=map===13&&id===16?[3,2,11,'beach']:map===16&&[20,21].includes(id)?[2,1,23,'forest']:
        map===17&&id===7?[3,2,39,'salt']:null;
    if (spec && pages.length===spec[0] && flagsAre(pages[spec[1]],'switch1Valid') &&
        pages[spec[1]].conditions.switch1Id===spec[2])
        return transferOptions(map,entry,pages[spec[1]],common).map(edge=>({...edge,gate:CONNECTION_GATES[spec[3]]}));
    if (map===94 && [12,27].includes(id) && pages.length===8 &&
        [6,7].every((i)=>flagsAre(pages[i],'switch1Valid')&&pages[i].conditions.switch1Id===i+398)) {
        const edges=[6,7].map(i=>transferOptions(map,entry,pages[i],common)[0]);
        if (edges.every(edge=>landingIs(edge,93,13,64)))
            return [{...edges[0],gate:CONNECTION_GATES.burgenburg}];
    }
    if (map===97&&id===18&&pages.length===1) return transferOptions(map,entry,pages[0],common)
        .map(edge=>({...edge,gate:CONNECTION_GATES.office}));
    if (map===134&&id===10&&pages.length===3) return transferOptions(map,entry,pages[2],common)
        .map(edge=>({...edge,gate:CONNECTION_GATES.cafe}));
    return null;
}

function transferOptions(map, entry, page, common) {
    if (!page || ![0, 1].includes(page.trigger) || page.moveType !== 0 || page.through ||
        ![0, 1].includes(page.priorityType) || /^(?:test|debug|developer)/i.test(entry.name || '') ||
        !Array.isArray(page.list) || page.list.length < 2 || page.list.length > 40) return [];
    const stair = houseStair(map, entry.id);
    if (stair) return audioOnly(common) ? houseBranches(stair, page.list, map) || [] : [];
    const index = entry.pages.indexOf(page);
    if (map === 25 && index === 0 && CHILLCREST_RETURNS[entry.id]) return chillcrestReturn(entry);
    const wrapped = wrappedExit(map,entry,page,index,common);
    if (wrapped) return [wrapped];
    if (map===58 && [3,4,27,28].includes(entry.id) && entry.pages.length===1 && flagsAre(page) &&
        page.list.map(row=>row.code).join(',')==='111,101,401,205,505,0,411,201,0,412,0' &&
        parametersAre(page.list[0],[0,477,0]) && page.list[6].indent===0 && page.list[7].indent===1) {
        const edge=transferTo(page.list[7],map);
        if(landingIs(edge,113,entry.id<5?44:45,entry.id<5?13:14))
            return [{...edge,gate:CONNECTION_GATES.cauldronReturn}];
    }
    const regional = regionalExit(map, entry, page, index, common);
    if (regional) return regional;
    if (map === 87 && entry.id === 73) return caffeineEscape(entry, page, common);
    if (map === 87 && entry.id === 91) return caffeineEntrance(page, index);
    const breakfast = breakfastCaveTransfer(map, entry, page, common);
    if (breakfast) return [breakfast];
    const special = cauldronSpecial(map, entry.id, page, index, common);
    if (special !== undefined) return special;
    if (map === 113) {
        if (entry.id === 19) return chillcrestEntrances(entry, page, common);
        if (entry.id === 43) return worldCauldronEntrances(entry, page, index, common);
        const facing = worldFacingEntrances(entry, page, common);
        if (facing) return facing;
    }
    if (map === 26 && (entry.id === 6 || entry.id === 7) && flagsAre(page)) {
        const { list } = page;
        const edge = transferTo(list[2], map);
        // Float Fort's foot exit parks the boat on the world map before the
        // transfer. This native entry cannot board it from the town map.
        if (list.length === 4 && rowIs(list[0], 122) && parametersAre(list[0], [81, 81, 0, 0, 0]) &&
            rowIs(list[1], 117) && parametersAre(list[1], [139]) && common?.[139]?.list &&
            rowIs(list[2], 201) && landingIs(edge, 113, 14, 6) && edge.direction === 0 && rowIs(list[3], 0))
            return [edge];
    }
    const world = map === 113 ? worldQuestEntrance(entry, page, index, common) || worldWalkingEntrance(entry, page, common) :
        map === 206 ? islandReturn(entry, page) : map === 49 ? bayReturn(entry, page) : null;
    if (world) return [world];
    const saltcaster = common?.[48]?.list;
    const resetSaltcaster = saltcaster?.length === 2 && rowIs(saltcaster[0], 122) &&
        parametersAre(saltcaster[0], [12, 12, 0, 0, 0]) && rowIs(saltcaster[1], 0);
    // These deterministic journal/ambient updates cannot change the transfer
    // or its landing. Keep unknown scripts and all real gates excluded.
    const commands = page.list.filter(row => ![0, 108, 408].includes(row.code) &&
        !(row.indent === 0 && (questCommand(row, 'disableAutoMarker') ||
            resetSaltcaster && row.code === 117 && parametersAre(row, [48]))));
    // Door37 and stair38 are both independently verified one-SE events.
    // Their harmless prefix must not erase a literal house/shop connection.
    if (commands.length === 2 && commands[0].code === 117 && [37,38].includes(commands[0].parameters?.[0]) &&
        commands[0].indent === 0 && audioOnly(common, commands[0].parameters[0])) commands.shift();
    const destination = commands.length === 1 && commands[0].indent === 0 && transferTo(commands[0], map);
    return destination ? [destination] : [];
}

// Qualify all native west-return page variants before exposing this graph
// edge. Its gate follows actual page precedence, not a story assumption.
function chillcrestReturn(entry) {
    const gate = CHILLCREST_RETURNS[entry?.id], pages = entry?.pages;
    if (!gate || pages?.length !== 7) return [];
    for (const [i,page] of pages.entries()) if (page.trigger !== (entry.id === 14 && i === 5 ? 0 : 1) ||
        page.priorityType !== 0 || page.through || page.moveType !== 0) return [];
    for (let i = 1; i <= 4; i++) if (!flagsAre(pages[i], 'variableValid') ||
        pages[i].conditions.variableId !== 10 || pages[i].conditions.variableValue !== i) return [];
    if (!flagsAre(pages[0]) || !flagsAre(pages[5], 'selfSwitchValid') || pages[5].conditions.selfSwitchCh !== 'D' ||
        !flagsAre(pages[6], 'actorValid') || pages[6].conditions.actorId !== 4) return [];
    const edges = [4,5,6].map(i => pages[i].list.length === 2 && rowIs(pages[i].list[0],201) &&
        rowIs(pages[i].list[1],0) && transferTo(pages[i].list[0],25));
    if (!edges.every(edge => landingIs(edge,113,12,17) && edge.direction === 0)) return [];
    const at = entry.id === 14 ? 5 : 0, list = pages[0].list;
    if (!rowIs(list[at],111) || !parametersAre(list[at],[0,33,1]) ||
        list.length !== at + 23 || !rowIs(list[at+18],411) || !rowIs(list[at+19],201,1) ||
        !landingIs(transferTo(list[at+19],25),113,12,17)) return [];
    return [{...edges[0],gate}];
}

function catalogTransferOptions(map, entry, common, regional = false) {
    const { pages } = entry;
    if (map === 25 && CHILLCREST_RETURNS[entry.id]) return chillcrestReturn(entry);
    if (!regional && (map === 87 && (entry.id === 77 || entry.id === 78) ||
        map === 191 && (entry.id === 1 || entry.id === 2))) return [];
    if (map === 61 && entry.id === 1 && pages.length === 2) {
        const variants = pages.map(page => transferOptions(map, entry, page, common));
        return variants.every(options => options.length === 1) ? variants[0] : [];
    }
    if (map === 87 && entry.id === 91 && pages.length === 2) {
        const first = transferOptions(map, entry, pages[0], common);
        return first.length && transferOptions(map, entry, pages[1], common).length ? first : [];
    }
    if (map === 113 && entry.id === 43 && pages.length === 3) {
        const variants = pages.map(page => transferOptions(map, entry, page, common));
        return variants.every((options, index) => options.length === [3, 1, 2][index]) ? variants.flat() : [];
    }
    if (map === 113 && pages.length === 2 && (WORLD_MARKERS[entry.id] || entry.id === 46)) {
        const [before, after] = pages.map(page => transferOptions(map, entry, page, common)[0]);
        if (!before || !after) return [];
        if (entry.id === 46) return [before, after];
        return landingIs(after, before.map, before.x, before.y) && before.direction === after.direction ? [before] : [];
    }
    if (map === 57 && entry.id === 13 && pages.length === LAYOUTS.length) {
        const variants = pages.map(page => transferOptions(map, entry, page, common));
        return variants.every(options => options.length === 1) ? variants.flat() : [];
    }
    const conditional=conditionalCatalog(map,entry,common);
    if (conditional) return conditional;
    return pages.length === 1 && flagsAre(pages[0]) ? transferOptions(map, entry, pages[0], common) : [];
}

function cauldronIntroductionFinished(root) {
    const entry = root.$dataMap?.events?.[5];
    const [intro, complete] = entry?.pages || [];
    if (entry?.pages?.length !== 2 || intro.trigger !== 3 || !flagsAre(intro) || complete.trigger !== 0 ||
        !flagsAre(complete, 'selfSwitchValid') || complete.conditions.selfSwitchCh !== 'A' ||
        root.$gameMap._events?.[5]?._pageIndex !== 1 || root.$gameSelfSwitches?.value?.([32, 5, 'A']) !== true) return false;
    const { list } = intro;
    const move = list[4]?.parameters?.[1];
    return list.length === 22 && rowIs(list[3], 111) && parametersAre(list[3], [6, -1, 2]) &&
        rowIs(list[4], 205, 1) && list[4].parameters[0] === -1 && move?.wait === true &&
        move.repeat === false && move.skippable === false && move.list?.length === 4 &&
        [1, 1, 1, 0].every((code, index) => move.list[index].code === code) &&
        rowIs(list[20], 123) && parametersAre(list[20], ['A', 0]);
}

// A transfer can be recognizable as a boundary even when its exact
// destination is not statically qualified for graph routing. Common-event
// data is immutable within a loaded game; cache by that owner and page.
const TRANSFER_BOUNDARIES = new WeakMap();
function pageMayTransfer(page, common) {
    if (!page || !Array.isArray(page.list)) return false;
    const owner = common && typeof common === 'object' ? common : page;
    let cache = TRANSFER_BOUNDARIES.get(owner);
    if (!cache) TRANSFER_BOUNDARIES.set(owner, cache = new WeakMap());
    if (cache.has(page)) return cache.get(page);
    const pending = [page.list], seen = new Set();
    let rows = 0, found = false;
    while (pending.length && !found) {
        const list = pending.pop();
        for (const row of list) {
            // Unknown/over-budget scripts cannot prove walk-through transit.
            if (++rows > 2048 || row.code === 201 ||
                ([355,655].includes(row.code) && /\b(?:reserveTransfer|performTransfer)\s*\(/.test(row.parameters?.[0] || ''))) {
                found = true; break;
            }
            if (row.code !== 117) continue;
            const id = row.parameters?.[0];
            if (seen.has(id)) continue;
            if (seen.size >= 32) { found = true; break; }
            seen.add(id);
            const nested = common?.[id]?.list;
            if (Array.isArray(nested)) pending.push(nested);
        }
    }
    cache.set(page, found);
    return found;
}

module.exports = { pageMayTransfer, houseStair, houseBranches, transferOptions, catalogTransferOptions, cauldronIntroductionFinished,
    SHIP_PORTS, shipPort, ISLAND_DOCK, islandDismount, worldDiscovery, worldFacingEntrances };
