'use strict';

const { MAX_CELLS } = require('./geometry.cjs');

function directEntrance(root, event) {
    const map = root.$gameMap;
    const id = event?._eventId;
    if (!Number.isInteger(id) || id < 1 || map?._events?.[id] !== event || event._erased ||
        event._pageIndex !== 0 || event._trigger !== 1 || event._through || event._moveRouteForcing) return null;
    const entry = root.$dataMap?.events?.[id];
    const page = entry?.pages?.[0];
    if (!page || entry.pages.length !== 1 || /^(?:test|debug|developer)/i.test(entry.name || '') ||
        page.trigger !== 1 || page.moveType !== 0 || page.through ||
        (page.priorityType !== 0 && page.priorityType !== 1) || event._priorityType !== page.priorityType ||
        Object.entries(page.conditions || {}).some(([key, value]) => key.endsWith('Valid') && value) ||
        !Array.isArray(page.list) || page.list.length < 2 || page.list.length > 32) return null;
    // A transfer-only page can be verified before its interpreter starts.
    // Choices, switch gates and pages that call other events need their own producer.
    let transfer;
    for (const command of page.list) {
        if ([0, 108, 408].includes(command.code)) continue;
        if (transfer || command.code !== 201 || command.indent !== 0) return null;
        transfer = command.parameters;
    }
    if (!Array.isArray(transfer) || transfer.length !== 6) return null;
    const [type, destination, x, y] = transfer;
    if (type !== 0 || !Number.isInteger(destination) || destination < 1 || destination > 999 ||
        destination === map._mapId || !root.$dataMapInfos?.[destination] ||
        ![x, y].every(axis => Number.isInteger(axis) && axis >= 0 && axis < MAX_CELLS)) return null;
    return { event: id, map: destination, x, y, sourceX: event._x, sourceY: event._y, normal: page.priorityType === 1,
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
        const entrance = directEntrance(root, root.$gameMap?._events?.[edge.event]);
        return !!entrance && entrance.list === edge.list && entrance.map === edge.map &&
            entrance.x === edge.x && entrance.y === edge.y && entrance.normal === edge.normal &&
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
        return landing.bookmark;
    }

    return {
        clear, current, accepted, reserved, settle,
        candidates(bookmark) {
            const entrances = [];
            for (const event of root.$gameMap._events) {
                const edge = directEntrance(root, event);
                if (edge?.map === bookmark.map) entrances.push(edge);
            }
            return entrances;
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
