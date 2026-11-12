'use strict';

const { MAX_CELLS } = require('./geometry.cjs');
const { HOUSE_SWITCHES, CAULDRON_VARIABLE, STAGE, ALL_STAGES, cauldronGate } = require('./transfer-gates.cjs');

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

function audioOnly(common) {
    const rows = common?.[38]?.list;
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

function transferOptions(map, entry, page, common) {
    if (!page || ![0, 1].includes(page.trigger) || page.moveType !== 0 || page.through ||
        ![0, 1].includes(page.priorityType) || /^(?:test|debug|developer)/i.test(entry.name || '') ||
        !Array.isArray(page.list) || page.list.length < 2 || page.list.length > 32) return [];
    const stair = houseStair(map, entry.id);
    if (stair) return audioOnly(common) ? houseBranches(stair, page.list, map) || [] : [];
    const index = entry.pages.indexOf(page);
    if (map === 87 && entry.id === 91) return caffeineEntrance(page, index);
    const special = cauldronSpecial(map, entry.id, page, index, common);
    if (special !== undefined) return special;
    const commands = page.list.filter(row => ![0, 108, 408].includes(row.code));
    if (commands.length === 2 && callsStairSound(commands[0]) && commands[0].indent === 0 && audioOnly(common)) commands.shift();
    const destination = commands.length === 1 && commands[0].indent === 0 && transferTo(commands[0], map);
    return destination ? [destination] : [];
}

function catalogTransferOptions(map, entry, common) {
    const { pages } = entry;
    if (map === 87 && entry.id === 91 && pages.length === 2) {
        const first = transferOptions(map, entry, pages[0], common);
        return first.length && transferOptions(map, entry, pages[1], common).length ? first : [];
    }
    if (map === 57 && entry.id === 13 && pages.length === LAYOUTS.length) {
        const variants = pages.map(page => transferOptions(map, entry, page, common));
        return variants.every(options => options.length === 1) ? variants.flat() : [];
    }
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

module.exports = { houseStair, houseBranches, transferOptions, catalogTransferOptions, cauldronIntroductionFinished };
