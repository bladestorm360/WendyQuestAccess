'use strict';

const HOUSE_SWITCHES = [503, 525];
const CAULDRON_VARIABLE = 4;
const NUGGEDOR_VARIABLE = 5;
const NUGGEDOR_THRESHOLD = 4;
const NUGGEDOR_BEFORE = 128;
const NUGGEDOR_AFTER = 129;
const WORLD_CAULDRON_GATE = 256;
const WORLD_CAULDRON = Object.freeze({ early: 1, rescued: 2, informed: 4, changed: 8 });
const STAGE = Object.freeze({ zero: 1, one: 2, two: 4, three: 8, before: 16, after: 32 });
const CAULDRON_GATE = 64;
const ALL_STAGES = 63;

function cauldronGate(mask) { return CAULDRON_GATE | mask; }
function worldCauldronGate(mask) { return WORLD_CAULDRON_GATE | mask; }

function validGate(gate) {
    return Number.isInteger(gate) && (Math.abs(gate) <= HOUSE_SWITCHES.length ||
        (gate > CAULDRON_GATE && gate <= (CAULDRON_GATE | ALL_STAGES)) ||
        gate === NUGGEDOR_BEFORE || gate === NUGGEDOR_AFTER ||
        (gate > WORLD_CAULDRON_GATE && gate < WORLD_CAULDRON_GATE + 16));
}

function stageFor(value) {
    if (!Number.isSafeInteger(value)) return 0;
    if (value < 0) return STAGE.before;
    if (value > 3) return STAGE.after;
    return 1 << value;
}

function gateAllows(gate, state) {
    if (gate === 0) return true;
    if (gate === NUGGEDOR_BEFORE || gate === NUGGEDOR_AFTER) {
        const value = state?.[HOUSE_SWITCHES.length + 1];
        return Number.isSafeInteger(value) && (value >= NUGGEDOR_THRESHOLD) === (gate === NUGGEDOR_AFTER);
    }
    if (gate > WORLD_CAULDRON_GATE) return !!(gate & (state?.[HOUSE_SWITCHES.length + 2] || 0));
    if (gate > CAULDRON_GATE) return !!(gate & stageFor(state?.[HOUSE_SWITCHES.length]));
    return state?.[Math.abs(gate) - 1] === (gate > 0);
}

function worldCauldronStage(root) {
    const changed = root.$gameSwitches?.value?.(54);
    if (changed === true) return WORLD_CAULDRON.changed;
    if (changed !== false) return 0;
    const informed = root.$gameSelfSwitches?.value?.([113, 43, 'A']);
    if (informed === true) return WORLD_CAULDRON.informed;
    if (informed !== false) return 0;
    const rescued = root.$gameSwitches?.value?.(462);
    return rescued === true ? WORLD_CAULDRON.rescued : rescued === false ? WORLD_CAULDRON.early : 0;
}

function transferState(root) {
    const state = HOUSE_SWITCHES.map(id => {
        const value = root.$gameSwitches?.value?.(id);
        return typeof value === 'boolean' ? value : null;
    });
    for (const id of [CAULDRON_VARIABLE, NUGGEDOR_VARIABLE]) {
        const progress = root.$gameVariables?.value?.(id);
        state.push(Number.isSafeInteger(progress) ? progress : null);
    }
    state.push(worldCauldronStage(root));
    return state;
}

module.exports = { HOUSE_SWITCHES, CAULDRON_VARIABLE, NUGGEDOR_VARIABLE, NUGGEDOR_THRESHOLD, NUGGEDOR_BEFORE, NUGGEDOR_AFTER,
    STAGE, ALL_STAGES, cauldronGate, WORLD_CAULDRON, worldCauldronGate, validGate, gateAllows, transferState };
