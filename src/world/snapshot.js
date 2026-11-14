'use strict';

const { surface, MAX_CELLS, MAX_EVENTS, CELL_BITS } = require('./geometry.cjs');
const { destination, eventDescription, activeMovingEnemy } = require('./destinations');
const { localDestination, localHandoffName } = require('./local-destinations');
const { worldDestination, worldEventDescription, discoveryEntrance } = require('./world-destinations');
const { collectQuestDestinations, questDestinationLabel } = require('./quest-destinations');
const { travelMode, aircraftAt, boardingTargets } = require('./vehicle-navigation');
const { checkpointTarget, caveDestination, timedCave } = require('./puzzles/cave');

function eventTarget(root, mode, event, entry, page) {
    const map = root.$gameMap._mapId;
    let target = worldDestination(root, mode, event, entry, page);
    if (target === undefined) target = localDestination(root, event, page);
    if (target === undefined) target = checkpointTarget(map, event._eventId, event._pageIndex, event._trigger)
        ? { name: 'Checkpoint', category: 'objects' }
        : caveDestination(map, event, entry, page) || destination(entry, page, event._trigger, map) || undefined;
    if (!target) target = worldEventDescription(root, mode, event, page) ||
        (mode === 'walk' && !timedCave(map) && eventDescription(entry, page, event, localHandoffName(map, event._eventId))) ||
        target;
    return target && mode === 'airship' && target.category !== 'exits' ? null : target;
}

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

function bookmarkId(id) { return 'bookmark-' + id; }

function includeSavedBookmarks(snapshot, entries, current) {
    if (!entries?.length) return snapshot.objects;
    const local = new Map(snapshot.objects.filter(item => item.category === 'bookmarks').map(item => [item.id, item]));
    const excluded = new Map(snapshot.eligibleObjects?.filter(item => item.category === 'bookmarks' &&
        !local.has(item.id) && (!item.quest || current(item.quest))).map(item => [item.id, item]));
    const items = snapshot.objects.filter(item => item.category !== 'bookmarks');
    for (const entry of entries) {
        const id = bookmarkId(entry.id);
        const nearby = local.get(id);
        const blocked = excluded.get(id);
        if (nearby) items.push(nearby);
        else if (blocked) items.push({ ...blocked, outOfReach: true });
        else items.push({ id, category: 'bookmarks', name: entry.name, saved: entry });
    }
    return items;
}

function captureWorld(root, routing = true, label, scene, bookmarks = [], routesOnly = false) {
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
    if (routing && (!Number.isInteger(map._tilesetId) || !Array.isArray(flags) || !Array.isArray(data.data) ||
        data.data.length !== count * 6 || !Array.isArray(map._tileEvents) || !Array.isArray(map._vehicles))) return null;
    const terrain = routing ? terrainDelta(root.$gameTileChanges?.[id], data.data, flags, count) : null;
    if (routing && !terrain) return null;

    const events = [];
    const objects = [];
    const quests = !routesOnly && scene ? collectQuestDestinations(root, scene, mode) : null;
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
                movingEnemy: mode === 'walk' && activeMovingEnemy(root, event),
                discoveryFor: mode === 'airship' ? discoveryEntrance(id, event) : undefined });
        }
        if (routesOnly || event._erased || !action) continue;
        const target = eventTarget(root, mode, event, entry, page);
        const quest = quests?.get(eventId);
        if (target && (!quest || target.category !== 'events')) {
            if (label) target.name = label(eventId, target.name);
            objects.push({ id: eventId, x, y, ...target });
        }
        if (quest && target !== null && (mode !== 'airship' || target?.category === 'exits')) {
            const { entryDirection, eventAction, bumpDirections, handoffs } = target || {};
            objects.push({ id: eventId, x, y, name: questDestinationLabel(entry, quest, target), category: 'quests',
                entryDirection, eventAction, bumpDirections, handoffs, quest });
        }
    }
    if (!routesOnly && mode === 'walk') objects.push(...boardingTargets(map));
    if (!routesOnly && mode === 'airship') objects.push({ id: 517, x: player._x, y: player._y, name: 'Nearest landing site',
        category: 'vehicles', nearestLanding: true });
    for (const bookmark of bookmarks) {
        if (bookmark.map !== id || bookmark.mode !== mode) continue;
        const label = { id: bookmarkId(bookmark.id), category: 'bookmarks', name: bookmark.name };
        if (bookmark.kind === 'point' && bookmark.x < width && bookmark.y < height)
            objects.push({ ...label, x: bookmark.x, y: bookmark.y, point: true });
        if (bookmark.kind === 'entity') {
            // Keep entity bookmarks for the pantry formerly listed as treasure.
            const category = id === 116 && bookmark.event === 7 && bookmark.category === 'treasure' ? 'objects' : bookmark.category;
            let current = objects.find(item => item.id === bookmark.event && item.category === category);
            if (!current && category === 'events') current = objects.find(item => item.id === bookmark.event &&
                ['people', 'exits', 'quests'].includes(item.category));
            if (!current && category === 'objects' && id === 113 && discoveryEntrance(id, map._events[bookmark.event]))
                current = objects.find(item => item.id === bookmark.event && ['events', 'quests'].includes(item.category));
            if (current) objects.push({ ...current, ...label, event: current.id });
        }
    }
    const snapshot = { map: id, mode, x: player._x, y: player._y, width, height, scrollType, objects };
    if (!routing) return snapshot;
    const vehicles = [];
    for (const vehicle of map._vehicles.slice(0, 2)) {
        if (vehicle?._mapId === id && vehicle._type !== mode) vehicles.push({ x: vehicle._x, y: vehicle._y,
            type: vehicle._type, through: vehicle._through === true });
    }
    return { ...snapshot, live: { width, height, scrollType, mode, terrain, events, vehicles,
        tileset: map._tilesetId, aircraft: aircraftAt(map) } };
}

module.exports = { captureWorld, eventTarget, bookmarkId, includeSavedBookmarks };
