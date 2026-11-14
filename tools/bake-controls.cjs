'use strict';

const { CONTROLS } = require('../src/world/terrain-control-labels.cjs');
const { surface } = require('../src/world/geometry.cjs');

function bakeControls(id, map, flags) {
    const definitions = CONTROLS[id];
    if (!definitions) return;
    const size = map.width * map.height;
    return Object.keys(definitions).map(Number).map(eventId => {
        const page = map.events[eventId]?.pages?.[0];
        const edits = page?.list.filter(command => command.code === 357 && command.parameters[1] === 'set_tile');
        if (page?.trigger !== 0 || !(edits?.length >= 1 && edits.length <= 25)) throw Error('Unverified terrain control');
        const changed = new Map();
        for (const command of edits) {
            const { tileId, coordinates, relativity } = command.parameters[3];
            const coords = JSON.parse(coordinates);
            const operation = JSON.parse(relativity);
            const match = /^([A-E])([0-7]),(\d+)$/.exec(tileId);
            const x = Number(coords.x), y = Number(coords.y), z = Number(coords.z);
            if (!match || command.indent !== 0 || operation.mode !== 'Absolute' || operation.clearUpperLayers !== 'false' ||
                !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) ||
                x < 0 || x >= map.width || y < 0 || y >= map.height || z < 0 || z > 3)
                throw Error('Unsupported tile edit');
            const cell = y * map.width + x;
            const index = +match[2] + +match[3] * 8;
            const tile = match[1] === 'A' ? (index >= 128 ? 1536 + index - 128 : 2048 + index * 48) :
                ('BCDE'.indexOf(match[1]) * 256) + index;
            if (!Number.isInteger(flags[tile])) throw Error('Unknown terrain control tile');
            const layers = changed.get(cell) || Array.from({ length: 4 }, (_, layer) => map.data[layer * size + cell]);
            layers[z] = tile;
            changed.set(cell, layers);
        }
        const updates = [];
        const at = (tiles, cell) => surface(flags[tiles[3]], flags[tiles[2]], flags[tiles[1]], flags[tiles[0]],
            map.data[size * 5 + cell]) & 15;
        for (const [cell, layers] of changed) {
            if (at(layers, cell) !== at(Array.from({ length: 4 }, (_, layer) => map.data[layer * size + cell]), cell))
                updates.push([cell, at(layers, cell)]);
        }
        return [eventId, updates];
    });
}

module.exports = { bakeControls };
