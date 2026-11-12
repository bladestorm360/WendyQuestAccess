'use strict';

const { MAX_CELLS } = require('./geometry.cjs');

const STAIRS = {
    127: { switchId: 503, gate: 1, condition: 0, open: 2, closed: 6, secretMap: 195, floorMap: 128, floor: 'Third floor' },
    132: { switchId: 525, gate: 2, condition: 1, open: 2, closed: 5, secretMap: 203, floorMap: 133, floor: 'Second floor' }
};

function houseStair(map, event) { return event === 2 ? STAIRS[map] : undefined; }

function transferTo(command, map) {
    const parameters = command?.parameters;
    if (command?.code !== 201 || !Array.isArray(parameters) || parameters.length !== 6 || parameters[0] !== 0) return null;
    const [, target, x, y] = parameters;
    if (!Number.isInteger(target) || target < 1 || target > 999 || target === map ||
        ![x, y].every(axis => Number.isInteger(axis) && axis >= 0 && axis < MAX_CELLS)) return null;
    return { map: target, x, y, gate: 0 };
}

function audioOnly(common) {
    const rows = common?.[38]?.list;
    return rows?.length === 2 && rows[0]?.code === 250 && rows[0].indent === 0 && rows[1]?.code === 0;
}

function callsStairSound(command) { return command?.code === 117 && command.parameters?.[0] === 38; }

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

function transferOptions(map, entry, page, common) {
    if (!page || ![0, 1].includes(page.trigger) || page.moveType !== 0 || page.through ||
        ![0, 1].includes(page.priorityType) || /^(?:test|debug|developer)/i.test(entry.name || '') ||
        !Array.isArray(page.list) || page.list.length < 2 || page.list.length > 32) return [];
    const stair = houseStair(map, entry.id);
    if (stair) return audioOnly(common) ? houseBranches(stair, page.list, map) || [] : [];
    const commands = page.list.filter(row => ![0, 108, 408].includes(row.code));
    if (commands.length === 2 && callsStairSound(commands[0]) && commands[0].indent === 0 && audioOnly(common)) commands.shift();
    const destination = commands.length === 1 && commands[0].indent === 0 && transferTo(commands[0], map);
    return destination ? [destination] : [];
}

function stairState(switches) {
    return [STAIRS[127], STAIRS[132]].map(stair => {
        const value = switches?.value?.(stair.switchId);
        return typeof value === 'boolean' ? value : null;
    });
}

function gateAllows(gate, state) { return gate === 0 || state?.[Math.abs(gate) - 1] === (gate > 0); }

module.exports = { houseStair, houseBranches, transferOptions, stairState, gateAllows };
