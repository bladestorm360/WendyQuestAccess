'use strict';

const TERRAIN = [36, 120, 68, 49];
const ORDERED = [19, 20, 21, 22];
const REMINDERS = [105, 113, 116, 117, 118, 119];
const BITS = [55, 58, 57, 56, 42, 59, 60, 62];

function saltControlName(id) {
    const tile = TERRAIN.indexOf(id);
    const color = ORDERED.indexOf(id);
    if (tile >= 0) return 'Terrain crystal ' + (tile + 1);
    if (color >= 0) return ['Yellow', 'Blue', 'Green', 'Red'][color] + ' crystal';
    return id === 97 ? 'Crystal reset' : '';
}

function saltState(root) {
    const switches = root.$gameSwitches;
    const lit = root.$gameSelfSwitches;
    const order = root.$gameVariables?.value?.(3);
    if (!switches?.value || !Number.isInteger(order) || order < 0 || order > 4) return null;
    let mask = 0;
    for (const [bit, id] of BITS.entries()) if (switches.value(id)) mask |= 1 << bit;
    const hits = [29, 27, 28, 26].reduce((value, id, bit) => value | (switches.value(id) ? 1 << bit : 0), 0);
    return { mask, order, hits, finalOpen: lit?.value?.([19, 35, 'B']) === true, eastOpen: lit?.value?.([19, 71, 'A']) === true };
}

module.exports = { TERRAIN, ORDERED, REMINDERS, saltState, saltControlName };
