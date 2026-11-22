'use strict';

const CONTROLS = Object.freeze({
    12: { 56: 'the bridge button' },
    27: { 43: 'the bridge button' },
    36: { 37: 'the passage button' },
    37: { 4: 'the cave crystal' },
    53: { 3: 'the pull handle', 4: 'the pull handle' },
    55: { 4: 'the pull handle' },
    62: { 17: 'the north bridge button', 18: 'the south bridge button' },
    93: { 58: 'the passage button' },
    103: { 5: 'the office door control' },
    97: { 7: 'the scene with Chomps' },
    104: { 6: 'the workshop door control' },
    105: { 5: 'Elder Tater' },
    106: { 3: 'the rescue encounter', 6: 'the rescue encounter', 7: 'the rescue encounter', 8: 'the rescue encounter' },
    204: { 3: 'the exit to Frosty Peak' }
});

// A control can take effect in another event's active page, after the
// player's native interaction or encounter. The baker checks these producers.
const TERRAIN_PAGES = Object.freeze({
    37: { 4: [5, 0, 1] },
    77: { 0: [28, 0, 0] },
    79: { 0: [12, 0, 0] },
    80: { 0: [27, 0, 0] },
    81: { 0: [20, 0, 0] },
    84: { 0: [17, 0, 0] },
    85: { 0: [29, 0, 0] },
    97: { 7: [8, 1, 0] },
    105: { 5: [12, 1, 0] },
    204: { 3: [4, 0, 1] }
});

const GATE_SWITCHES = Object.freeze({
    37: 145, 77: 97, 79: 97, 80: 97, 81: 97, 84: 97, 85: 97,
    97: 103, 105: 119, 106: 115, 204: 145
});

const BREAKFAST_MAPS = [66, 77, 78, 79, 80, 81, 84, 85, 86, 87, 113, 191];

// Only the eight audited, choice-free tile buttons may be activated by
// ordinary Autowalk. Cache qualification by the native page, never by text.
// Dialogue, scripts, combat, crystals with choices and pull sequences retain
// their existing player interaction; automatic movement still reaches them.
const simplePages = new WeakMap();
function simpleTerrainControl(map, event, entry) {
    if (!CONTROLS[map]?.[event?._eventId] || event._pageIndex !== 0 || event._trigger !== 0) return false;
    const page = entry?.pages?.[0], next = entry?.pages?.[1];
    if (!page || page !== event.page?.() || page.list.length > 192) return false;
    if (!simplePages.has(page)) {
        const rows = page.list.filter(row => ![0,108,408,657].includes(row.code));
        const done = rows[rows.length - 1];
        simplePages.set(page, !!(next?.conditions.selfSwitchValid && next.conditions.selfSwitchCh === 'A' &&
            done?.code === 123 && done.parameters.join(',') === 'A,0' &&
            rows.some(row => row.code === 357) && rows.every(row => row.code === 250 || row === done ||
                row.code === 357 && row.parameters[0] === 'Tyruswoo_TileControl' && row.parameters[1] === 'set_tile')));
    }
    return simplePages.get(page);
}

module.exports = { CONTROLS, TERRAIN_PAGES, GATE_SWITCHES, BREAKFAST_MAPS, simpleTerrainControl };
