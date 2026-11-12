'use strict';

const { transferOptions, cauldronIntroductionFinished, SHIP_PORTS, shipPort, ISLAND_DOCK, islandDismount,
    worldDiscovery } = require('./transfer-events.cjs');
const { discoveryEntrance } = require('./world-destinations');
const { travelMode, vehicleOnMap } = require('./vehicle-navigation');
const { transferState, gateAllows } = require('./transfer-gates.cjs');
const { tileKey } = require('./geometry.cjs');

function liveEntrance(root, event, state, mode) {
    const map = root.$gameMap;
    const id = event?._eventId;
    if (!Number.isInteger(id) || id < 1 || map?._events?.[id] !== event || event._erased ||
        event._through || event._moveRouteForcing) return null;
    const entry = root.$dataMap?.events?.[id];
    const page = entry?.pages?.[event._pageIndex];
    if (!page || event._trigger !== page.trigger || event._priorityType !== page.priorityType) return null;
    const common = root.$dataCommonEvents;
    const craft = mode === 'ship' && vehicleOnMap(map, mode);
    let destination;
    if (mode === 'walk') destination = transferOptions(map._mapId, entry, page, common).find(edge => gateAllows(edge.gate, state));
    else if (craft && id === ISLAND_DOCK && root.$gameSwitches?.value?.(224) === false)
        destination = islandDismount(entry, page);
    else if (craft) destination = shipPort(entry, page, common);
    if (!destination || !root.$dataMapInfos?.[destination.map] ||
        (destination.sameScene && (event._x !== entry.x || event._y !== entry.y)) ||
        (craft && !craft.isLandOk?.(event._x, event._y, destination.facing))) return null;
    return { ...destination, event: id, sourceX: event._x, sourceY: event._y, action: page.trigger === 0 || page.priorityType === 1,
        mode, craft, list: page.list };
}

function liveDiscovery(root, event, target) {
    const map = root.$gameMap;
    const id = event?._eventId;
    if (!target || discoveryEntrance(map._mapId, event) !== target || event._through || event._moveRouteForcing ||
        event._priorityType !== 0) return null;
    const entry = root.$dataMap?.events?.[id];
    const destination = root.$dataMap?.events?.[target];
    const completion = worldDiscovery(entry, destination, root.$dataCommonEvents);
    if (!completion || event._x !== entry.x || event._y !== entry.y) return null;
    return { event: id, mode: 'walk', map: 113, x: event._x, y: event._y, sourceX: event._x, sourceY: event._y,
        sameScene: true, action: false, list: entry.pages[0].list, discoveryFor: target, completion };
}

function discoveryComplete(root, { event, completion }) {
    const discovery = root.$gameMap._events?.[event];
    if (completion.selfSwitch) return discovery?._pageIndex === 1 &&
        root.$gameSelfSwitches?.value?.([113, event, completion.selfSwitch]) === true;
    return (discovery?._pageIndex === 1 || discovery?._erased === true) &&
        root.$gameSwitches?.value?.(completion.switchId) === true;
}

function createTransferBookmarks(root, host) {
    let approach = null;
    let pending = null;

    function clear() {
        if (approach) {
            approach.scene._wqaBookmarkEntrance = false;
            approach.scene._wqaBookmarkLanding = false;
        }
        approach = null;
        if (pending) host.graphics._wqaBookmarkTransferPending = false;
        pending = null;
    }

    function current(edge, mode = travelMode(root.$gameMap, root.$gamePlayer)) {
        const map = root.$gameMap;
        if (mode !== edge.mode) return false;
        const event = map?._events?.[edge.event];
        const entrance = edge.discoveryFor ? liveDiscovery(root, event, edge.discoveryFor) :
            liveEntrance(root, event, transferState(root), mode);
        return !!entrance && entrance.craft === edge.craft && entrance.list === edge.list && entrance.map === edge.map &&
            entrance.x === edge.x && entrance.y === edge.y && entrance.direction === edge.direction &&
            entrance.action === edge.action &&
            entrance.sourceX === edge.sourceX && entrance.sourceY === edge.sourceY;
    }

    function accepted(scene, event) {
        if (approach?.scene !== scene || !approach.edge) return;
        const { edge, bookmark, map, player } = approach;
        clear();
        // Native interpreter setup retires the old same-scene browser
        // even when a different event won acceptance.
        if (edge.sameScene) scene._wqaBookmarkEntrance = true;
        if (map !== root.$gameMap || player !== root.$gamePlayer || event !== map._events[edge.event] || !current(edge)) return;
        if (edge.sameScene) {
            if (player._x !== edge.sourceX || player._y !== edge.sourceY || (edge.facing && player._direction !== edge.facing)) return;
            pending = { scene, player, ownerMap: map, map: edge.map, x: edge.x, y: edge.y, bookmark, sameScene: true,
                discovery: edge.discoveryFor ? { event: edge.event, completion: edge.completion } : null };
        } else {
            // The native main interpreter must subsequently reserve this exact landing.
            pending = { scene, edge, bookmark, map, player };
        }
        host.graphics._wqaBookmarkTransferPending = true;
    }

    function landingAccepted(scene, player) {
        if (approach?.scene !== scene || !approach.airship) return;
        const { airship, map, bookmark, x, y } = approach;
        if (player !== approach.player || map !== root.$gameMap || player._x !== x || player._y !== y ||
            travelMode(map, player) !== 'airship' || vehicleOnMap(map, 'airship') !== airship) {
            clear();
            scene._wqaBookmarkLanding = true;
            return;
        }
        approach = null;
        // Keep the scene's landing flag until the immediately following
        // native leave marker closes its controls and other observations.
        pending = { scene, player, ownerMap: map, map: map._mapId, x, y, bookmark, sameScene: true };
        host.graphics._wqaBookmarkTransferPending = true;
    }

    function reserved(scene, player, map, x, y, direction) {
        if (!pending) return;
        const { edge, bookmark } = pending;
        const interpreter = root.$gameMap?._interpreter;
        if (!edge || pending.scene !== scene || pending.player !== player || pending.map !== root.$gameMap ||
            interpreter?._eventId !== edge.event || interpreter._list !== edge.list ||
            map !== edge.map || x !== edge.x || y !== edge.y || direction !== edge.direction) return clear();
        // The surface port reservation comes from the accepted event only
        // after native getOff stops the same ship and begins the handback.
        if (edge.craft && (player._vehicleType !== 'ship' || player._vehicleGettingOff !== true ||
            vehicleOnMap(root.$gameMap, 'ship') !== edge.craft || edge.craft._driving !== false)) return clear();
        const firstCauldronWalk = map === 32 && (direction || player._direction) === 2 &&
            root.$gameSelfSwitches?.value?.([32, 5, 'A']) === false;
        pending = { scene, player, ownerMap: root.$gameMap, map, x, y, bookmark, firstCauldronWalk };
    }

    function settle(scene) {
        if (!pending) return null;
        const landing = pending;
        clear();
        const player = root.$gamePlayer;
        const { bookmark, map, x, y } = landing;
        if ((scene === landing.scene) !== !!landing.sameScene || player !== landing.player || root.$gameMap !== landing.ownerMap ||
            root.$gameMap._mapId !== map || player._x !== x ||
            (landing.discovery && !discoveryComplete(root, landing.discovery))) return null;
        const key = tileKey(map, x, y);
        if (player._y === y) return { ...bookmark, trail: [...bookmark.trail, key] };
        if (!landing.firstCauldronWalk || player._y !== y + 3 || (root.$dataMap?.scrollType & 1) ||
            !cauldronIntroductionFinished(root)) return null;
        // The intro's native forced route is complete by field readiness.
        return { ...bookmark, trail: [...bookmark.trail, key, tileKey(map, x, player._y)] };
    }

    return {
        clear, current, accepted, landingAccepted, reserved, settle,
        islandLanding() {
            const map = root.$gameMap;
            return liveEntrance(root, map?._events?.[ISLAND_DOCK], null, travelMode(map, root.$gamePlayer));
        },
        matchesState: state => transferState(root).every((value, index) => state[index] === value),
        discovery(event, target) { return liveDiscovery(root, root.$gameMap._events?.[event], target); },
        discoveries(entrances) {
            const map = root.$gameMap;
            if (map._mapId !== 113) return [];
            const targets = new Set(entrances.map(edge => edge.event));
            const active = [];
            for (const event of map._events) {
                const target = discoveryEntrance(map._mapId, event);
                if (!targets.has(target)) continue;
                const edge = liveDiscovery(root, event, target);
                if (edge) active.push({ event: edge.event, target });
            }
            return active;
        },
        candidates() {
            const state = transferState(root);
            const map = root.$gameMap;
            const mode = travelMode(map, root.$gamePlayer);
            const events = mode === 'walk' ? map._events :
                mode === 'ship' ? Object.keys(SHIP_PORTS).map(id => map._events[id]) : [];
            const entrances = [];
            for (const event of events) {
                const edge = liveEntrance(root, event, state, mode);
                if (edge) entrances.push(edge);
            }
            const ground = [];
            if (mode === 'ship' || mode === 'airship') {
                for (const event of map._events) {
                    const edge = liveEntrance(root, event, state, 'walk');
                    if (edge) ground.push(edge);
                }
            }
            return { entrances, ground, state };
        },
        arm(scene, bookmark, edge) {
            clear();
            approach = { scene, bookmark, edge, map: root.$gameMap, player: root.$gamePlayer };
            scene._wqaBookmarkEntrance = true;
        },
        armAirship(scene, bookmark, { x, y }) {
            clear();
            const map = root.$gameMap;
            const airship = vehicleOnMap(map, 'airship');
            if (!airship) return;
            approach = { scene, bookmark, map, player: root.$gamePlayer, airship, x, y };
            scene._wqaBookmarkLanding = true;
        },
        leave(scene) {
            if (scene) {
                scene._wqaBookmarkEntrance = false;
                scene._wqaBookmarkLanding = false;
            }
            if (approach?.scene === scene || (pending && pending.scene !== scene)) clear();
        }
    };
}

module.exports = { createTransferBookmarks };
