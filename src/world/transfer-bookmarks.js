'use strict';

const { transferOptions, cauldronIntroductionFinished, SHIP_PORTS, shipPort } = require('./transfer-events.cjs');
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
    const destination = mode === 'walk' ? transferOptions(map._mapId, entry, page, common).find(edge => gateAllows(edge.gate, state))
        : craft && shipPort(entry, page, common);
    if (!destination || !root.$dataMapInfos?.[destination.map] ||
        (craft && !craft.isLandOk?.(event._x, event._y, destination.facing))) return null;
    return { ...destination, event: id, sourceX: event._x, sourceY: event._y, action: page.trigger === 0 || page.priorityType === 1,
        mode, craft, list: page.list };
}

function createTransferBookmarks(root, host) {
    let approach = null;
    let pending = null;

    function clear() {
        if (approach) approach.scene._wqaBookmarkEntrance = false;
        approach = null;
        if (pending) host.graphics._wqaBookmarkTransferPending = false;
        pending = null;
    }

    function current(edge) {
        const map = root.$gameMap;
        const mode = travelMode(map, root.$gamePlayer);
        if (mode !== edge.mode) return false;
        const entrance = liveEntrance(root, map?._events?.[edge.event], transferState(root), mode);
        return !!entrance && entrance.craft === edge.craft && entrance.list === edge.list && entrance.map === edge.map &&
            entrance.x === edge.x && entrance.y === edge.y && entrance.direction === edge.direction &&
            entrance.action === edge.action &&
            entrance.sourceX === edge.sourceX && entrance.sourceY === edge.sourceY;
    }

    function accepted(scene, event) {
        if (approach?.scene !== scene) return;
        const { edge, bookmark, map, player } = approach;
        clear();
        if (map !== root.$gameMap || player !== root.$gamePlayer || event !== map._events[edge.event] || !current(edge)) return;
        // The native main interpreter must subsequently reserve this exact landing.
        pending = { scene, edge, bookmark, map, player };
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
        if (scene === landing.scene || player !== landing.player || root.$gameMap !== landing.ownerMap ||
            root.$gameMap._mapId !== map || player._x !== x) return null;
        const key = tileKey(map, x, y);
        if (player._y === y) return { ...bookmark, trail: [...bookmark.trail, key] };
        if (!landing.firstCauldronWalk || player._y !== y + 3 || (root.$dataMap?.scrollType & 1) ||
            !cauldronIntroductionFinished(root)) return null;
        // The intro's native forced route is complete by field readiness.
        return { ...bookmark, trail: [...bookmark.trail, key, tileKey(map, x, player._y)] };
    }

    return {
        clear, current, accepted, reserved, settle,
        matchesState: state => transferState(root).every((value, index) => state[index] === value),
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
            return { entrances, state };
        },
        arm(scene, bookmark, edge) {
            clear();
            approach = { scene, bookmark, edge, map: root.$gameMap, player: root.$gamePlayer };
            scene._wqaBookmarkEntrance = true;
        },
        leave(scene) {
            if (approach?.scene === scene || (pending && pending.scene !== scene)) clear();
        }
    };
}

module.exports = { createTransferBookmarks };
