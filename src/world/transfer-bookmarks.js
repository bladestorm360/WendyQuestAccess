'use strict';

const { transferOptions, stairState, gateAllows } = require('./transfer-events.cjs');
const { tileKey } = require('./geometry.cjs');

function liveEntrance(root, event, state) {
    const map = root.$gameMap;
    const id = event?._eventId;
    if (!Number.isInteger(id) || id < 1 || map?._events?.[id] !== event || event._erased ||
        event._through || event._moveRouteForcing) return null;
    const entry = root.$dataMap?.events?.[id];
    const page = entry?.pages?.[event._pageIndex];
    if (!page || event._trigger !== page.trigger || event._priorityType !== page.priorityType) return null;
    const destination = transferOptions(map._mapId, entry, page, root.$dataCommonEvents).find(edge => gateAllows(edge.gate, state));
    if (!destination || !root.$dataMapInfos?.[destination.map]) return null;
    return { ...destination, event: id, sourceX: event._x, sourceY: event._y, action: page.trigger === 0 || page.priorityType === 1,
        list: page.list };
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
        const entrance = liveEntrance(root, root.$gameMap?._events?.[edge.event], stairState(root.$gameSwitches));
        return !!entrance && entrance.list === edge.list && entrance.map === edge.map &&
            entrance.x === edge.x && entrance.y === edge.y && entrance.action === edge.action &&
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

    function reserved(scene, player, map, x, y) {
        if (!pending) return;
        const { edge, bookmark } = pending;
        const interpreter = root.$gameMap?._interpreter;
        if (!edge || pending.scene !== scene || pending.player !== player || pending.map !== root.$gameMap ||
            interpreter?._eventId !== edge.event || interpreter._list !== edge.list ||
            map !== edge.map || x !== edge.x || y !== edge.y) return clear();
        pending = { scene, player, ownerMap: root.$gameMap, map, x, y, bookmark };
    }

    function settle(scene) {
        if (!pending) return null;
        const landing = pending;
        clear();
        const player = root.$gamePlayer;
        if (scene === landing.scene || player !== landing.player || root.$gameMap !== landing.ownerMap ||
            root.$gameMap._mapId !== landing.map || player._x !== landing.x || player._y !== landing.y) return null;
        const { bookmark, map, x, y } = landing;
        return { ...bookmark, trail: [...bookmark.trail, tileKey(map, x, y)] };
    }

    return {
        clear, current, accepted, reserved, settle,
        matchesState: state => stairState(root.$gameSwitches).every((value, index) => state[index] === value),
        candidates() {
            const state = stairState(root.$gameSwitches);
            const entrances = [];
            for (const event of root.$gameMap._events) {
                const edge = liveEntrance(root, event, state);
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
