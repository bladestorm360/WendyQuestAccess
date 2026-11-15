'use strict';

const { CONTROLS, TERRAIN_PAGES } = require('../src/world/terrain-control-labels.cjs');
const { surface } = require('../src/world/geometry.cjs');

function tileFor(label, flags, autotile) {
    const match = /^([A-E])([0-7]),(\d+)$/.exec(label);
    if (!match) throw Error('Unsupported tile edit');
    const index = +match[2] + +match[3] * 8;
    const tile = match[1] !== 'A' ? 'BCDE'.indexOf(match[1]) * 256 + index :
        index >= 128 ? 1536 + index - 128 : 2048 + index * 48;
    if (!Number.isInteger(flags[tile])) throw Error('Unknown terrain control tile');
    if (autotile && tile >= 2048 && (flags.slice(tile, tile + 48).length !== 48 ||
        flags.slice(tile, tile + 48).some(flag => (flag & 31) !== (flags[tile] & 31))))
        throw Error('Terrain control autotile changes walking flags by shape');
    return tile;
}

function applyFlood(map, { x, y, layer, regionID }, write) {
    const { width, height, data } = map;
    const size = width * height;
    const seed = +y * width + +x;
    const expected = +regionID;
    if (!Number.isInteger(+x) || !Number.isInteger(+y) || +x < 0 || +x >= width || +y < 0 || +y >= height ||
        !Number.isInteger(+layer) || +layer < 0 || +layer > 3 || data[size * 5 + seed] !== expected || expected <= 0)
        throw Error('Unsupported terrain flood');
    const queue = [seed];
    const seen = new Set(queue);
    for (const cell of queue) {
        if (queue.length > 256) throw Error('Terrain flood exceeds the verified footprint budget');
        write(cell, +layer);
        const column = cell % width;
        for (const neighbor of [column > 0 ? cell - 1 : -1, column + 1 < width ? cell + 1 : -1,
            cell - width, cell + width]) {
            if (neighbor < 0 || neighbor >= size || seen.has(neighbor) || data[size * 5 + neighbor] !== expected) continue;
            seen.add(neighbor);
            queue.push(neighbor);
        }
    }
}

function bakeControls(id, map, flags) {
    const definitions = TERRAIN_PAGES[id];
    if (!definitions && !CONTROLS[id]) return;
    const size = map.width * map.height;
    return Object.keys(definitions || CONTROLS[id]).map(Number).map(eventId => {
        const [source, index, depth] = definitions?.[eventId] || [eventId, 0, 0];
        const page = map.events[source]?.pages?.[index];
        const edits = page?.list.filter(({ code, parameters }) => code === 357 &&
            (parameters[0] === 'Tyruswoo_TileControl' && parameters[1] === 'set_tile' ||
             parameters[0] === 'MapScene' && parameters[1] === 'FloodFill'));
        if (!(edits?.length >= 1 && edits.length <= 48) || !definitions && ![0, 1].includes(page.trigger))
            throw Error('Unverified terrain control');
        const changed = new Map();
        const columnAt = cell => Array.from({ length: 4 }, (_, layer) => map.data[layer * size + cell]);
        const at = (tiles, cell) => surface(flags[tiles[3]], flags[tiles[2]], flags[tiles[1]], flags[tiles[0]],
            map.data[size * 5 + cell]) & 15;
        for (const { indent, parameters } of edits) {
            if (indent !== depth) throw Error('Unverified terrain control branch');
            const args = parameters[3];
            const flood = parameters[1] === 'FloodFill';
            const tile = tileFor(flood ? args.tileID : args.tileId, flags, flood);
            function write(cell, layer, clear) {
                const layers = changed.get(cell) || columnAt(cell);
                layers[layer] = tile;
                if (clear) layers.fill(0, layer + 1);
                changed.set(cell, layers);
            }
            if (flood) {
                applyFlood(map, args, write);
                continue;
            }
            const coords = JSON.parse(args.coordinates);
            const operation = JSON.parse(args.relativity);
            const x = +coords.x, y = +coords.y, z = +coords.z;
            if (operation.mode !== 'Absolute' || !['true', 'false'].includes(operation.clearUpperLayers) ||
                !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) ||
                x < 0 || x >= map.width || y < 0 || y >= map.height || z < 0 || z > 3)
                throw Error('Unsupported tile edit');
            if (operation.allowAutotiling === 'true') tileFor(args.tileId, flags, true);
            write(y * map.width + x, z, operation.clearUpperLayers === 'true');
        }
        const updates = [];
        for (const [cell, layers] of changed) {
            const passage = at(layers, cell);
            if (passage !== at(columnAt(cell), cell)) updates.push([cell, passage]);
        }
        if (id !== 53 && id !== 55) return [eventId, updates];
        const move = map.events[eventId].pages[0].list[0];
        const route = move.parameters?.[1];
        const expected = id === 53 ? [1, 1, 1, 1, 2, 19, 0] : [3, 4, 17, 0];
        if (move.code !== 205 || move.parameters[0] !== -1 || !route?.wait || route.repeat !== false ||
            route.skippable !== (id === 55) || route.list.length !== expected.length ||
            !expected.every((code, index) => code === route.list[index].code))
            throw Error('Unverified pull handle movement');
        const headings = [0, 1, 2, 3];
        return [eventId, updates, { pulled: expected.filter(code => code >= 1 && code <= 4).map(code => headings[code - 1]),
            skippable: route.skippable }];
    });
}

module.exports = { bakeControls };
