'use strict';

const { surface, MAX_CELLS, CELL_BITS } = require('./geometry.cjs');
const { destination } = require('./destinations');
const { localDestination } = require('./local-destinations');
const { worldDestination, discoveryEntrance } = require('./world-destinations');
const { travelMode, aircraftAt, boardingTargets } = require('./vehicle-navigation');
const { checkpointTarget, caveDestination } = require('./puzzles/cave');

const MAX_EVENTS = 512;

function terrainDelta(changes, layers, flags, count) {
    // The tile editor has already restored these keys to the current map.
    // Re-read only affected columns, including neighbors written by autotiling.
    if (!changes) return new Uint32Array(0);
    const keys = Object.keys(changes);
    const terrain = new Uint32Array(Math.min(keys.length, count));
    const seen = new Uint8Array(count);
    let changedCount = 0;
    for (const key of keys) {
        const flat = Number(key);
        if (!Number.isInteger(flat) || flat < 0 || flat >= count * 6) return null;
        const cell = flat % count;
        if (seen[cell]) continue;
        seen[cell] = 1;
        const flagsAtCell = surface(flags[layers[3 * count + cell]], flags[layers[2 * count + cell]],
            flags[layers[count + cell]], flags[layers[cell]], layers[5 * count + cell]);
        terrain[changedCount++] = (flagsAtCell << CELL_BITS) | cell;
    }
    return terrain.subarray(0, changedCount);
}

function captureWorld(root, routing = true, label) {
    const map = root.$gameMap;
    const player = root.$gamePlayer;
    const data = root.$dataMap;
    const id = map._mapId;
    const mode = travelMode(map, player);
    const { width, height, scrollType } = data;
    const count = width * height;
    if (!Number.isInteger(id) || id < 1 || id > 999 || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || count > MAX_CELLS || !Number.isInteger(scrollType) || scrollType < 0 || scrollType > 3 ||
        !Array.isArray(map._events) || map._events.length > MAX_EVENTS + 1 || !mode ||
        !Number.isInteger(player._x) || !Number.isInteger(player._y)) return null;

    const flags = routing ? root.$dataTilesets?.[map._tilesetId]?.flags : null;
    if (routing && (data.tilesetId !== map._tilesetId || !Array.isArray(flags) || !Array.isArray(data.data) ||
        data.data.length !== count * 6 || !Array.isArray(map._tileEvents) || !Array.isArray(map._vehicles))) return null;
    const terrain = routing ? terrainDelta(root.$gameTileChanges?.[id], data.data, flags, count) : null;
    if (routing && !terrain) return null;

    const events = [];
    const objects = [];
    const tiles = routing ? new Set(map._tileEvents) : null;
    for (const event of map._events) {
        if (!event || (event._erased && mode !== 'airship')) continue;
        const { _eventId: eventId, _x: x, _y: y, _pageIndex: pageIndex, _trigger: trigger } = event;
        const entry = data.events[eventId];
        if (!entry || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const page = entry.pages[pageIndex];
        const action = page?.list.length > 1;
        if (routing) {
            const box = event.blockerProperties;
            const rectangle = box ? [x + box.x1, y + box.y1, x + box.x2, y + box.y2] : undefined;
            if (rectangle && !rectangle.every(Number.isFinite)) return null;
            events.push({ id: eventId, x, y, normal: event._priorityType === 1, through: event._through === true,
                tileFlag: tiles.has(event) ? (flags[event._tileId] | 0) : undefined, rectangle, trigger, action,
                erased: event._erased === true,
                discoveryFor: mode === 'airship' ? discoveryEntrance(id, event) : undefined });
        }
        if (event._erased || !action) continue;
        let target = worldDestination(root, mode, event, entry, page);
        if (target === undefined) target = localDestination(root, event, page);
        if (target === undefined) target = checkpointTarget(id, eventId, pageIndex, trigger)
            ? { name: 'Checkpoint', category: 'objects' } : caveDestination(id, event, entry, page) || destination(entry, page, trigger);
        if (target && (mode !== 'airship' || target.category === 'exits')) {
            if (label) target.name = label(eventId, target.name);
            objects.push({ id: eventId, x, y, ...target });
        }
    }
    if (mode === 'walk') objects.push(...boardingTargets(map));
    if (mode === 'airship') objects.push({ id: 517, x: player._x, y: player._y, name: 'Nearest landing site',
        category: 'vehicles', nearestLanding: true });
    const snapshot = { map: id, mode, x: player._x, y: player._y, objects };
    if (!routing) return snapshot;
    const vehicles = [];
    for (const vehicle of map._vehicles.slice(0, 2)) {
        if (vehicle?._mapId === id && vehicle._type !== mode) vehicles.push({ x: vehicle._x, y: vehicle._y,
            type: vehicle._type, through: vehicle._through === true });
    }
    return { ...snapshot, live: { width, height, scrollType, mode, terrain, events, vehicles, aircraft: aircraftAt(map) } };
}

module.exports = { captureWorld };
