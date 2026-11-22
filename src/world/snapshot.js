'use strict';

const { surface, MAX_CELLS, MAX_EVENTS, CELL_BITS } = require('./geometry.cjs');
const { destination, excludedDestination, pageHasInteraction, eventDescription, activeMovingEnemy } = require('./destinations');
const { localDestination, iceOpensPassage, iceMeltChanges, inactiveFloorScene, concealedDestination,
    chillcrestQuestExit, WEST_CHILLCREST, pendingOfficeExit, npcPassage } = require('./local-destinations');
const { worldDestination, worldEventDescription, discoveryEntrance, worldMapExit,
    worldEntranceRevealed } = require('./world-destinations');
const { collectQuestDestinations, questDestinationLabel, questPageHasAction } = require('./quest-destinations');
const { travelMode, aircraftAt, boardingTargets, parkedVehicle } = require('./vehicle-navigation');
const { transferOptions } = require('./transfer-events.cjs');
const { checkpointTarget, usedCheckpoint, caveDestination, patrolDestination, timedCave } = require('./puzzles/cave');
const { GATE_SWITCHES, BREAKFAST_MAPS } = require('./terrain-control-labels.cjs');
const { REMINDERS, saltState } = require('./puzzles/salt-state.cjs');

// Authored combat routes through ruins, caves, mines and their approach maps.
// The secret-cave stealth puzzle uses its separate motion solver.
const DUNGEON_ROUTES = new Set([
    15, 16, 19, 27, 36, 48, 52, 62, 87,
    28, 32, 44, 50, 51, 53, 55,
    93, 97, 104, 105,
    165, 166, 167, 169, 171, 172, 173, 175, 176, 177, 179, 180
]);

function eventTarget(root, mode, event, entry, page, spoilers = false, questMarker = false) {
    const map = root.$gameMap._mapId;
    const patrol = mode === 'walk' && patrolDestination(map, event, page);
    if (patrol) return patrol;
    if ((!spoilers && concealedDestination(map, event)) || !pageHasInteraction(page) ||
        inactiveFloorScene(root, event, page) || excludedDestination(entry, page) ||
        (map === 113 && !worldEntranceRevealed(root, event._eventId, spoilers, questMarker))) return null;
    let target = worldDestination(root, mode, event, entry, page);
    if (target === undefined) target = localDestination(root, event, page);
    if (target === undefined) target = checkpointTarget(map, event._eventId, event._pageIndex, event._trigger)
        ? { name: 'Checkpoint', category: 'checkpoints' }
        : caveDestination(map, event, entry, page) || destination(entry, page, event._trigger, map, event._characterName) || undefined;
    if (!target) target = worldEventDescription(root, mode, event, page) ||
        (mode === 'walk' && !timedCave(map) && eventDescription(root, entry, page, event)) ||
        target;
    // A marker-only page can be named like an ordinary prop in map data.
    // Leave its painted quest waypoint eligible even without an object entry.
    if (target?.category === 'objects' && !questPageHasAction(page)) return undefined;
    if (target && mode === 'airship' && target.category !== 'exits') return null;
    return worldMapExit(root, mode, event, entry, page, target);
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

function nearestWestChillcrestExit(objects, y) {
    return objects.reduce((best, item) => item.category === 'exits' && WEST_CHILLCREST.includes(item.id) &&
        (!best || Math.abs(item.y - y) < Math.abs(best.y - y)) ? item : best, null);
}

function captureWorld(root, routing = true, label, scene, bookmarks = [], routesOnly = false, spoilers = false, questExitId) {
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

    const airshipAvailable = routing && id === 113 && mode === 'walk' && !!parkedVehicle(map, 'airship');
    const seenTorchReminder = id === 19 && root.$gameSwitches?.value?.(200);
    const events = [];
    const objects = [];
    const quests = !routesOnly && scene ? collectQuestDestinations(root, scene, mode) : null;
    const tiles = routing ? new Set(map._tileEvents) : null;
    for (const event of map._events) {
        if (!event || (event._erased && mode !== 'airship' && !airshipAvailable)) continue;
        const { _eventId: eventId, _x: x, _y: y, _pageIndex: pageIndex, _trigger: trigger } = event;
        const entry = data.events[eventId];
        if (!entry || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const page = entry.pages[pageIndex];
        const action = pageHasInteraction(page) && !inactiveFloorScene(root, event, page) &&
            !(seenTorchReminder && REMINDERS.includes(eventId)) &&
            !(trigger === 1 && usedCheckpoint(root, event, page));
        if (routing) {
            const box = event.blockerProperties;
            const rectangle = box ? [x + box.x1, y + box.y1, x + box.x2, y + box.y2] : undefined;
            if (rectangle && !rectangle.every(Number.isFinite)) return null;
            const meltable = mode === 'walk' && action && trigger === 0 && (rectangle || event._priorityType === 1) &&
                iceOpensPassage(entry, page);
            const meltChanges = meltable && iceMeltChanges(entry, page);
            events.push({ id: eventId, x, y, normal: event._priorityType === 1, through: event._through === true,
                tileFlag: tiles.has(event) ? (flags[event._tileId] | 0) : undefined, rectangle, trigger, action,
                erased: event._erased === true,
                meltable: !!meltable,
                ...(meltChanges?.relocate || meltChanges?.clears ? { meltChanges } : {}),
                movingEnemy: mode === 'walk' && activeMovingEnemy(root, event),
                discoveryFor: mode === 'airship' || airshipAvailable ? discoveryEntrance(id, event) : undefined });
        }
        if (routesOnly || event._erased || !spoilers && concealedDestination(id, event)) continue;
        const quest = quests?.get(eventId);
        if (!action && !quest?.waypoint) {
            // The office has a visible access path before its native
            // entrance page is enabled. Broad browsing keeps the entrance.
            if (id === 97 && mode === 'walk' && pendingOfficeExit(root, event, entry))
                objects.push({ id: eventId, x, y, name: 'Mech Office', category: 'exits', eventAction: 'bump' });
            continue;
        }
        const target = action ? eventTarget(root, mode, event, entry, page, spoilers, !!quest) : undefined;
        if (target && (!quest || target.category !== 'events')) {
            if (label) target.name = label(eventId, target.name);
            objects.push({ id: eventId, x, y, ...target });
        } else if (mode === 'ship' && id === 113 && action) {
            const land = eventTarget(root, 'walk', event, entry, page, spoilers, !!quest);
            if (land?.category === 'exits') {
                const edges = transferOptions(id, entry, page, root.$dataCommonEvents);
                const shoreMap = edges[0]?.map;
                if (shoreMap && shoreMap !== 26 && shoreMap !== 49 && edges.every(edge => edge.map === shoreMap))
                    objects.push({ id: eventId, x, y, name: land.name, category: 'exits', shoreMap });
            }
        }
        if (quest && target !== null && (mode !== 'airship' || target?.category === 'exits')) {
            const { entryDirection, eventAction, bumpDirections, handoffs } = target || {};
            // A painted quest marker can own a touch action even when its
            // native page has no separate scene or encounter to list.
            const touch = action && !quest.waypoint && (trigger === 1 || trigger === 2);
            objects.push({ id: eventId, x, y, name: questDestinationLabel(entry, quest, target), category: 'quests',
                entryDirection, eventAction: eventAction ?? (touch ? event._priorityType === 1 ? 'bump' : 'step' : undefined),
                bumpDirections, handoffs, quest });
        }
    }
    // Follow the published rescue objective through the native region
    // exits when the current map has no painted objective marker.
    if (!routesOnly && scene && mode === 'walk' && chillcrestQuestExit(root) &&
        !objects.some(item => item.category === 'quests')) {
        const transitions = id === 25 ? WEST_CHILLCREST : id === 36 ? [5, 24, 25, 26] :
            id === 113 ? [root.$gameVariables?.value?.(119) === 7 &&
                root.$gameVariables?.value?.(120) === 11 ? 23 : 22] : [];
        const exits = objects.filter(item => item.category === 'exits' && transitions.includes(item.id));
        // Several tiles lead to the same next area. Once one is selected,
        // preserve its event identity when Wendy crosses a distance tie.
        const next = exits.find(item => item.id === questExitId) ||
            exits.sort((a, b) => Math.abs(a.x - player._x) + Math.abs(a.y - player._y) -
                Math.abs(b.x - player._x) - Math.abs(b.y - player._y))[0];
        if (next) objects.push({ ...next, category: 'quests', questExit: true, eventAction: 'step',
            handoffs: transitions });
    }
    if (!routesOnly && scene && mode === 'walk' && BREAKFAST_MAPS.includes(id) &&
        !objects.some(item => item.category === 'quests')) {
        const objective = root.$gameParty?.getNav?.();
        if (objective === 'quest26' && id === 87) {
            const exit = objects.find(item => item.category === 'exits' && item.id === 73);
            if (exit) objects.push({ ...exit, category: 'quests', breakfastObjective: objective });
        }
        if (objective === 'quest27' && root.$gameSwitches?.value?.(97) === false) {
            const encounter = id === 86 && objects.find(item => item.category === 'events' && item.id === 17);
            if (encounter) objects.push({ ...encounter, category: 'quests', breakfastObjective: objective });
            else if (id !== 86) objects.push({ id: 'breakfast-objective', category: 'quests', name: 'Breakfast Stone Island',
                breakfastObjective: objective, breakfastRegion: true });
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
            // Redirect saved references to the inaccessible copy of the Sunrise Bay introduction.
            const event = id === 76 && bookmark.event === 78 && category === 'events' ? 79 : bookmark.event;
            let current = objects.find(item => item.id === event && item.category === category);
            // The shop counter is the reachable interaction for either old entry.
            if (!current && (id === 150 || id === 151) &&
                (bookmark.event === 5 && category === 'people' || bookmark.event === 6 && category === 'objects'))
                current = objects.find(item => item.id === 6 && item.category === 'people');
            // Breaded Bay's native boarding tile used to appear as a world exit.
            if (!current && id === 49 && bookmark.event === 12 && category === 'exits')
                current = objects.find(item => item.id === bookmark.event && item.category === 'vehicles');
            if (!current && category === 'events') current = objects.find(item => item.id === bookmark.event &&
                ['people', 'exits', 'quests', 'checkpoints'].includes(item.category));
            if (!current && category === 'objects' && checkpointTarget(id, bookmark.event,
                map._events[bookmark.event]?._pageIndex, map._events[bookmark.event]?._trigger))
                current = objects.find(item => item.id === bookmark.event && item.category === 'checkpoints');
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
        tileset: map._tilesetId, aircraft: aircraftAt(map), airshipAvailable,
        npcPassage: mode === 'walk' ? npcPassage(map) : undefined,
        stableEncounters: mode === 'walk' && DUNGEON_ROUTES.has(id),
        ...(GATE_SWITCHES[id] ? { terrainMap: id, terrainSwitch: GATE_SWITCHES[id],
            terrainGate: root.$gameSwitches?.value?.(GATE_SWITCHES[id]) } : {}),
        ...(id === 55 ? { pullStage: root.$gameVariables?.value?.(4) } : {}),
        ...(id === 19 && !routesOnly ? { salt: saltState(root) } : {}) } };
}

module.exports = { captureWorld, eventTarget, bookmarkId, includeSavedBookmarks, nearestWestChillcrestExit };
