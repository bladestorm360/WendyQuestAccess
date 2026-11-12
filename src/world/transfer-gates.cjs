'use strict';

const HOUSE_SWITCHES = [503, 525];
const CAULDRON_VARIABLE = 4;
const STAGE = Object.freeze({ zero: 1, one: 2, two: 4, three: 8, before: 16, after: 32 });
const CAULDRON_GATE = 64;
const ALL_STAGES = 63;

function cauldronGate(mask) { return CAULDRON_GATE | mask; }

function validGate(gate) {
    return Number.isInteger(gate) && (Math.abs(gate) <= HOUSE_SWITCHES.length ||
        (gate > CAULDRON_GATE && gate <= (CAULDRON_GATE | ALL_STAGES)));
}

function stageFor(value) {
    if (!Number.isSafeInteger(value)) return 0;
    if (value < 0) return STAGE.before;
    if (value > 3) return STAGE.after;
    return 1 << value;
}

function gateAllows(gate, state) {
    if (gate === 0) return true;
    if (gate > CAULDRON_GATE) return !!(gate & stageFor(state?.[HOUSE_SWITCHES.length]));
    return state?.[Math.abs(gate) - 1] === (gate > 0);
}

function transferState(root) {
    const state = HOUSE_SWITCHES.map(id => {
        const value = root.$gameSwitches?.value?.(id);
        return typeof value === 'boolean' ? value : null;
    });
    const progress = root.$gameVariables?.value?.(CAULDRON_VARIABLE);
    state.push(Number.isSafeInteger(progress) ? progress : null);
    return state;
}

module.exports = { HOUSE_SWITCHES, CAULDRON_VARIABLE, STAGE, ALL_STAGES, cauldronGate, validGate, gateAllows, transferState };
