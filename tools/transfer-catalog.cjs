'use strict';

const { DIRECTIONS, PASSAGE, indexOf, tileKey } = require('../src/world/geometry.cjs');
const { walkingLanding } = require('../src/world/routes.cjs');
const { catalogTransferOptions, shipPort } = require('../src/world/transfer-events.cjs');
const { MAX_LANDINGS, validTile, readCatalog } = require('../src/world/walking-catalog.cjs');
const { timedCave } = require('../src/world/puzzles/cave');

function transferMap(id, map, geometry, flags, common) {
    const events = [];
    const exits = [];
    const portLandings = [];
    const barriers = new Map();
    for (const entry of map.events) {
        if (!entry?.pages?.length) continue;
        const { id: event, x, y, pages } = entry;
        const cell = indexOf(geometry, x, y);
        if (cell < 0) continue;
        // The projected map can add authored barriers but cannot infer a
        // remote switch has removed one. Native state is checked on arrival.
        // The harmless approach switch precedes the south cave exit.
        // Model its onward link only here. A live route stops at the switch.
        const caveSetup = id === 87 && event === 102 && pages.length === 1 &&
            pages[0].trigger === 1 && pages[0].priorityType === 0 && pages[0].list.length === 2 &&
            pages[0].list[0]?.code === 121 && pages[0].list[0].parameters.join(',') === '96,96,0';
        const action = page => !caveSetup && page.list.length > 1 && [0, 1, 2].includes(page.trigger);
        const blocked = pages.some(page => page.priorityType === 1 && !page.through);
        const floor = pages.find(page => page.priorityType !== 1 && page.trigger !== 0 && action(page));
        const normal = pages.find(page => page.priorityType === 1 && action(page));
        const interaction = floor || normal || pages.find(action);
        const rectangle = floor && blocked ? [x, y, x, y] : undefined;
        events.push({ id: event, x, y, normal: !floor && (blocked || !!normal),
            through: !blocked, rectangle, trigger: interaction?.trigger, action: !!interaction });
        if (rectangle) events[events.length - 1].through = false;
        for (const page of pages) {
            const flag = page.image?.tileId > 0 ? flags[page.image.tileId] : undefined;
            if (!page.through && Number.isInteger(flag) && !(flag & 16))
                barriers.set(cell, (barriers.get(cell) || 0) | (flag & PASSAGE));
        }
        if (id === 185 || id === 198 || timedCave(id)) continue;
        for (const destination of catalogTransferOptions(id, entry, common))
            exits.push({ event, ...destination });
        const port = id === 113 && shipPort(entry, pages[0], common);
        if (port) portLandings.push(port);
    }
    const terrain = Array.from(barriers, ([cell, mask]) =>
        [cell % geometry.width, Math.floor(cell / geometry.width), geometry.cells[cell] & ~mask]);
    return { geometry, live: { mode: 'walk', terrain, events, vehicles: [] }, exits, portLandings };
}

function encodePoints(reached) {
    const bits = Buffer.alloc(Math.ceil(reached.length / 8));
    for (let cell = 0; cell < reached.length; cell++) {
        if (reached[cell]) bits[cell >> 3] |= 1 << (cell & 7);
    }
    return bits.toString('base64');
}

function bakeCatalog(sources, maps) {
    const byTile = new Map();
    const origins = [];
    for (const source of sources.values()) {
        // Ports contribute arrival geometry. A walking route cannot use
        // a ship-only port as an outgoing link from the world map.
        for (const { map, x, y } of [...source.exits, ...source.portLandings]) {
            if (!validTile(map, x, y, maps)) continue;
            const key = tileKey(map, x, y);
            if (byTile.has(key)) continue;
            byTile.set(key, origins.length);
            origins.push([map, x, y]);
            if (origins.length > MAX_LANDINGS) throw Error('Too many walking landings');
        }
    }
    const landings = origins.map(([map, x, y]) => {
        const { geometry, live, exits } = sources.get(map);
        const { reached, events, approaches } = walkingLanding(geometry, live, x, y);
        const links = [];
        for (const edge of exits) {
            if (edge.approach ? !(approaches[edge.event] & (1 << DIRECTIONS.indexOf(edge.approach))) : !events[edge.event]) continue;
            const next = byTile.get(tileKey(edge.map, edge.x, edge.y));
            if (next !== undefined) links.push(next, edge.gate);
        }
        return [map, x, y, encodePoints(reached), links];
    });
    const catalog = { version: 1, landings };
    readCatalog(catalog, maps);
    return catalog;
}

module.exports = { transferMap, bakeCatalog };
