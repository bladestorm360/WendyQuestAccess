'use strict';

const { surface, CELL_BITS } = require('../src/world/geometry.cjs');

// Derive the exact region footprints from the authored seeds. A0,1 is a
// single uniform collision family across all 48 native autotile shapes.
function bakeSalt(map, flags) {
    const count = map.width * map.height;
    const data = map.data;
    const regions = [1, 2, 3, 4, 6, 10, 11];
    const ids = [36, 120, 68, 49, 71, 35];
    const commands = ids.flatMap(id => map.events[id].pages.flatMap(page => page.list
        .filter(command => command.code === 357 && command.parameters[1] === 'FloodFill')
        .map(command => command.parameters[3])));
    const regionsLayer = 5 * count;
    const fill = 2048 + 8 * 48;
    if (flags.slice(fill, fill + 48).some(flag => flag !== flags[fill])) throw Error('Salt Caverns fill flags vary');
    function result(region, kind) {
        const command = commands.find(entry => +entry.regionID === region && entry.tileID === kind);
        if (!command && kind === 'B0,0') return [];
        if (!command || +command.layer !== 3) throw Error('Unsupported Salt Caverns flood');
        const start = +command.y * map.width + +command.x;
        if (data[regionsLayer + start] !== region) throw Error('Invalid Salt Caverns flood seed');
        const queue = [start];
        const seen = new Set(queue);
        const packed = [];
        for (const cell of queue) {
            const column = cell % map.width;
            for (const neighbor of [column ? cell - 1 : -1, column + 1 < map.width ? cell + 1 : -1,
                cell - map.width, cell + map.width]) {
                if (data[regionsLayer + neighbor] !== region || neighbor < 0 || neighbor >= count || seen.has(neighbor)) continue;
                seen.add(neighbor);
                queue.push(neighbor);
            }
            const value = surface(flags[kind === 'A0,1' ? fill : 0], flags[data[2 * count + cell]],
                flags[data[count + cell]], flags[data[cell]], region);
            packed.push((value << CELL_BITS) | cell);
        }
        return packed;
    }
    const switches = [55, 58, 57, 56, 42];
    const blockers = {};
    for (const event of map.events) {
        if (!event || event.pages.length !== 2) continue;
        const [before, after] = event.pages;
        const conditions = after.conditions;
        const bit = switches.indexOf(conditions.switch1Id);
        if (bit >= 0 && conditions.switch1Valid && before.priorityType === 1 && after.priorityType === 0)
            blockers[event.id] = bit;
    }
    return { floods: regions.map((region, index) => [index < 5 ? index : index + 3,
        result(region, 'A0,1'), result(region, 'B0,0')]), blockers };
}

module.exports = { bakeSalt };
