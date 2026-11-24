'use strict';
// Explicit environmental producers, separate from character reaction jolts.
// Salt's paired flood commands form one authored floor movement per group.
const sites = {
    19: {35: {1: [9]}, 36: {0: [11]}, 49: {0: [11, 60]}, 68: {0: [11, 40]},
        71: {0: [1]}, 120: {0: [12]}},
    51: {2: {0: [8]}}, 53: {3: {0: [9]}, 4: {0: [9]}}, 55: {4: {0: [7]}},
    27: {24: {1: [18, 28, 37]}, 30: {1: [18, 28, 37]}},
    37: {4: {0: [5]}}, 63: {13: {0: [5]}}
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
    const state = { scene, mapId: map._mapId, interpreter, list: interpreter._list, index: interpreter._index, frame,
        screenX: scene._spriteset.x, screenY: scene._spriteset.y, visual: -8 };
    if (map._mapId === 63) {
        // The first mutation precedes native tile refresh. The whole thirteen-
        // tile broken-hole graphic, not the later Chomps flag, proves the reveal.
        if(parameters[0]!=='Tyruswoo_TileControl' || parameters[1]!=='set_tile' ||
            parameters[3]?.tileId!=='D2,4' || data.width!==25 || data.height!==32)return null;
        state.id='cauldron-wall-breaks';state.cell=(3*32+4)*25+15;
        state.data=scene._spriteset._tilemap?._mapData;
        if(state.data?.length!==25*32*6)return null;
        state.before=state.data[state.cell];state.wall=true;
    } else if ([27, 37].includes(map._mapId)) {
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
    if(state.wall) {
        if(tiles._needsRepaint || tiles._mapData!==state.data || state.before===802 ||
            (root.$gameScreen?._flashColor?.[3]||0)>=200)return false;
        // D2,4 through D6,6 form the inspected ragged cave opening; the two
        // lower outside corners are not replaced by this native scene.
        for(let y=4;y<=6;y++)for(let x=15;x<=19;x++) {
            if(y===6 && (x===15||x===19))continue;
            if(state.data[(3*32+y)*25+x]!==768+8*y+x-13)return false;
        }
        return true;
    }
    return state.cell === undefined ? scene._spriteset.x !== state.screenX || scene._spriteset.y !== state.screenY :
        !tiles._needsRepaint && tiles._mapData === state.data && state.data[state.cell] !== state.before;
}
module.exports = { capture, visible, sites };
