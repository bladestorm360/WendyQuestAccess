'use strict';
// Explicit environmental producers, separate from character reaction jolts.
// Salt's paired flood commands form one authored floor movement per group.
const sites = {
    19: {35: {1: [9]}, 36: {0: [11]}, 49: {0: [11, 60]}, 68: {0: [11, 40]},
        71: {0: [1]}, 120: {0: [12]}},
    51: {2: {0: [8]}}, 53: {3: {0: [9]}, 4: {0: [9]}}, 55: {4: {0: [7]}},
    27: {24: {1: [18, 28, 37]}, 30: {1: [18, 28, 37]}},
    37: {4: {0: [5]}}
};
function capture(root, scene, interpreter, frame) {
    const map = root.$gameMap, data = root.$dataMap;
    if (interpreter !== map?._interpreter || interpreter._mapId !== map._mapId) return null;
    const pages = data?.events?.[interpreter._eventId]?.pages;
    if (!Array.isArray(pages) || pages.length > 32) return null;
    const page = pages.findIndex(page => page.list === interpreter._list);
    if (!sites[map._mapId]?.[interpreter._eventId]?.[page]?.includes(interpreter._index)) return null;
    const row = interpreter._list[interpreter._index], parameters = row?.parameters;
    if (row?.code !== 357) return null;
    const state = { scene, interpreter, list: interpreter._list, index: interpreter._index, frame,
        screenX: scene._spriteset.x, screenY: scene._spriteset.y, visual: -8 };
    if ([27, 37].includes(map._mapId)) {
        if (parameters[0] !== 'ShakeScreen' || parameters[1] !== 'CreateImpulse') return null;
        state.id = map._mapId === 27 && interpreter._index !== 18 ? 'tremors-strengthen' : 'ground-trembles';
    } else {
        const drain = { 51: 52, 53: 61, 55: 59 }[map._mapId];
        // Capture before the first gate tile changes, ahead of the later flood.
        const flood = drain ? interpreter._list[drain]?.parameters : parameters;
        if (drain && (parameters[0] !== 'Tyruswoo_TileControl' || parameters[1] !== 'set_tile') ||
            flood?.[0] !== 'MapScene' || flood[1] !== 'FloodFill') return null;
        const values = flood[3], x = Number(values.x), y = Number(values.y), layer = Number(values.layer);
        const width = data.width, height = data.height;
        if (![width, height, x, y, layer].every(Number.isSafeInteger) || width < 1 || height < 1 ||
            width > 256 || height > 256 || x < 0 || y < 0 || x >= width || y >= height ||
            layer < 0 || layer > 3 || data.data?.length !== width * height * 6) return null;
        state.cell = (layer * height + y) * width + x;
        state.data = scene._spriteset._tilemap?._mapData;
        if (state.data?.length !== width * height * 6) return null;
        state.before = state.data[state.cell];
        state.id = map._mapId === 19 ? 'cave-floor-shifts' : 'sauce-drains';
    }
    return state;
}
function visible(root, scene, state) {
    const tiles = scene._spriteset?._tilemap;
    if (tiles?.worldVisible !== true) return false;
    return state.cell === undefined ? scene._spriteset.x !== state.screenX || scene._spriteset.y !== state.screenY :
        !tiles._needsRepaint && tiles._mapData === state.data && state.data[state.cell] !== state.before;
}
module.exports = { capture, visible, sites };
