'use strict';

const { BREAKFAST_MAPS } = require('../src/world/terrain-control-labels.cjs');
const { catalogTransferOptions } = require('../src/world/transfer-events.cjs');
const { movingEnemy } = require('../src/world/destinations');
const { bakeCatalog } = require('./transfer-catalog.cjs');

function consumedEvents(id, map) {
    // These native encounters and conversations leave a walkable route
    // when cleared. Only the regional planning catalog projects them.
    const ids = new Set();
    if (id === 87) {
        ids.add(102);
        for (const event of map.events) {
            if (event && movingEnemy(event.pages[0]) && event.pages.some(page =>
                page.conditions.selfSwitchValid && page.conditions.selfSwitchCh === 'A' &&
                page.list.some(row => row.code === 214))) ids.add(event.id);
        }
    }
    if (id === 85) {
        ids.add(44);
        ids.add(49);
    }
    if (id === 113) {
        ids.add(179);
        ids.add(180);
    }
    if (id === 86) for (const event of [17, 21, 33, 36]) ids.add(event);
    for (const event of ids) if (!map.events[event]) throw Error('Missing regional handoff');
    return ids;
}

function breakfastSource(id, source, map, controls, common) {
    const removed = consumedEvents(id, map);
    const exits = source.exits.filter(edge => BREAKFAST_MAPS.includes(edge.map) && edge.gate === 0 &&
        (id !== 113 || edge.event >= 59 && edge.event <= 71));
    const caveEntries = id === 87 ? [77, 78] : id === 191 ? [1, 2] : [];
    for (const event of caveEntries) {
        for (const edge of catalogTransferOptions(id, map.events[event], common, true)) exits.push({ event, ...edge });
    }
    const opening = id === 77 || id === 79 || id === 80 || id === 81 || id === 84 || id === 85
        ? controls?.find(([event]) => event === 0)?.[1] : undefined;
    return {
        ...source,
        exits,
        portLandings: [],
        opening,
        live: { ...source.live, events: source.live.events.filter(event => !removed.has(event.id)) }
    };
}

function bakeBreakfast(sources, maps) {
    const open = new Map();
    for (const [id, source] of sources) {
        if (!source.opening) {
            open.set(id, source);
            continue;
        }
        const { geometry } = source;
        const terrain = source.opening.map(([cell, flags]) => [cell % geometry.width,
            Math.floor(cell / geometry.width), (geometry.cells[cell] & 240) | flags]);
        open.set(id, { ...source, live: { ...source.live, terrain: [...source.live.terrain, ...terrain] } });
    }
    return [bakeCatalog(sources, maps), bakeCatalog(open, maps)];
}

module.exports = { breakfastSource, bakeBreakfast };
