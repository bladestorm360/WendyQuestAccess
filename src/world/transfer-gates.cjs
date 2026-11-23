'use strict';

const HOUSE_SWITCHES = [503, 525];
const CAULDRON_VARIABLE = 4;
const NUGGEDOR_VARIABLE = 5;
const NUGGEDOR_THRESHOLD = 4;
const NUGGEDOR_BEFORE = 128;
const NUGGEDOR_AFTER = 129;
const WORLD_CAULDRON_GATE = 256;
const CHILLCREST_RETURNS = Object.freeze({14:512,18:513,19:514});
// Audited native page conditions, captured once with each field request.
const CONNECTION_GATES = Object.freeze({ beach:768, forest:769, salt:770, nuggedorDoors:771,
    burgenburg:772, office:773, cafe:774, cauldronReturn:775 });
const CONNECTION_OFFSET = HOUSE_SWITCHES.length + 6;
const WORLD_CAULDRON = Object.freeze({ early: 1, rescued: 2, informed: 4, changed: 8 });
const STAGE = Object.freeze({ zero: 1, one: 2, two: 4, three: 8, before: 16, after: 32 });
const CAULDRON_GATE = 64;
const ALL_STAGES = 63;

function cauldronGate(mask) { return CAULDRON_GATE | mask; }
function worldCauldronGate(mask) { return WORLD_CAULDRON_GATE | mask; }

function validGate(gate) {
    return Number.isInteger(gate) && (Object.values(CONNECTION_GATES).includes(gate) || Object.values(CHILLCREST_RETURNS).includes(gate) || Math.abs(gate) <= HOUSE_SWITCHES.length ||
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
    const connection = Object.values(CONNECTION_GATES).indexOf(gate);
    if (connection >= 0) return state?.[CONNECTION_OFFSET + connection] === true;
    const west = Object.values(CHILLCREST_RETURNS).indexOf(gate);
    if (west >= 0) return state?.[HOUSE_SWITCHES.length + 3 + west] === true;
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
    // Native west-exit page precedence: party actor, event self-switch D,
    // completed variable10 sequence, then the initial rescued-Elder branch.
    const progress = root.$gameVariables?.value?.(10);
    const recruited = root.$gameParty?._actors?.includes(4) === true;
    for (const event of Object.keys(CHILLCREST_RETURNS)) state.push(recruited ||
        root.$gameSelfSwitches?.value?.([25, Number(event), 'D']) === true ||
        Number.isSafeInteger(progress) && (progress >= 4 || progress < 1 && root.$gameSwitches?.value?.(33) === true));
    const switches = root.$gameSwitches;
    state.push(switches?.value?.(11) === true, switches?.value?.(23) === true,
        switches?.value?.(39) === true, switches?.value?.(424) === false,
        switches?.value?.(404) === true || switches?.value?.(405) === true || root.$gameVariables?.value?.(16) >= 5,
        switches?.value?.(103) === true, root.$gameSelfSwitches?.value?.([134,10,'A']) === true,
        switches?.value?.(477) === false);
    return state;
}

module.exports = { CONNECTION_GATES, CHILLCREST_RETURNS, HOUSE_SWITCHES, CAULDRON_VARIABLE, NUGGEDOR_VARIABLE, NUGGEDOR_THRESHOLD, NUGGEDOR_BEFORE, NUGGEDOR_AFTER,
    STAGE, ALL_STAGES, cauldronGate, WORLD_CAULDRON, worldCauldronGate, validGate, gateAllows, transferState };
