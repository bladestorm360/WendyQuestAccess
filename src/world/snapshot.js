'use strict';

const { surface, MAX_CELLS, CELL_BITS } = require('./geometry.cjs');

const MAX_EVENTS = 512;

function label(entry, page) {
    const name = typeof entry.name === 'string' && entry.name.trim();
    if (!name || name.length > 64 || /^ev(?:ent)?\s*\d+$/i.test(name) ||
        /^(?:test|debug|developer)/i.test(name)) return '';
    if (/chest|treasure|loot|collectible/i.test(name + (page.image?.characterName || ''))) return 'Treasure';
    if (page.list.some(command => command.code >= 125 && command.code <= 128)) return 'Interaction';
    if (/^distraction\s*crystal/i.test(name)) return 'Distraction crystal';
    if (/^final\s*crystal/i.test(name)) return 'Crystal';
    return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
}

function captureWorld(root) {
    const map = root.$gameMap;
    const player = root.$gamePlayer;
    const data = root.$dataMap;
    const id = map._mapId;
    const { width, height, scrollType } = data;
    const count = width * height;
    const flags = root.$dataTilesets?.[map._tilesetId]?.flags;
    if (!Number.isInteger(id) || id < 1 || id > 999 || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || count > MAX_CELLS || !Number.isInteger(scrollType) || scrollType < 0 || scrollType > 3 ||
        data.tilesetId !== map._tilesetId || !Array.isArray(flags) || !Array.isArray(data.data) ||
        data.data.length !== count * 6 || !Array.isArray(map._events) || map._events.length > MAX_EVENTS + 1 ||
        !Array.isArray(map._tileEvents) || !Array.isArray(map._vehicles) || player._vehicleType !== 'walk' ||
        player._through || !Number.isInteger(player._x) || !Number.isInteger(player._y)) return null;

    // The tile editor has already restored these keys to the current map.
    // Re-read only affected columns, including neighbors written by autotiling.
    const changes = root.$gameTileChanges?.[id];
    const keys = changes ? Object.keys(changes) : [];
    const terrain = new Uint32Array(Math.min(keys.length, count));
    let changedCount = 0;
    if (changes) {
        const seen = new Uint8Array(count);
        const layers = data.data;
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
    }

    const events = [];
    const objects = [];
    const tiles = new Set(map._tileEvents);
    for (const event of map._events) {
        if (!event || event._erased) continue;
        const { _eventId: eventId, _x: x, _y: y, _pageIndex: pageIndex, _trigger: trigger } = event;
        const entry = data.events[eventId];
        if (!entry || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const page = entry.pages[pageIndex];
        const action = page?.list.length > 1;
        const box = event.blockerProperties;
        const rectangle = box ? [x + box.x1, y + box.y1, x + box.x2, y + box.y2] : undefined;
        if (rectangle && !rectangle.every(Number.isFinite)) return null;
        events.push({ id: eventId, x, y, normal: event._priorityType === 1, through: event._through === true,
            tileFlag: tiles.has(event) ? (flags[event._tileId] | 0) : undefined, rectangle, trigger, action });
        const name = action && trigger === 0 ? label(entry, page) : '';
        if (name) objects.push({ id: eventId, name, x, y });
    }
    const vehicles = [];
    for (const vehicle of map._vehicles.slice(0, 2)) {
        if (vehicle?._mapId === id) vehicles.push({ x: vehicle._x, y: vehicle._y, through: vehicle._through === true });
    }
    return { map: id, x: player._x, y: player._y, objects,
        live: { width, height, scrollType, mode: 'walk', terrain: terrain.subarray(0, changedCount), events, vehicles } };
}

module.exports = { captureWorld };
