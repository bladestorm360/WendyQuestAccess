'use strict';

const { treasureName } = require('../destinations');

// Build 26578620: each listed pickup delegates its native consumed flag and
// reward to common event 35 (coins) or 33 (special chest). Do not automate
// arbitrary props merely because their developer label contains "loot".
const PICKUPS = { 196: [9], 199: [2, 10, 25, 34], 200: [3, 12, 20] };

function caveLootAction(root, scene, event) {
    const map = root.$gameMap;
    const entry = root.$dataMap?.events?.[event?._eventId];
    const page = entry?.pages?.[0];
    if (!PICKUPS[map?._mapId]?.includes(event?._eventId) || map._events[event._eventId] !== event ||
        event._erased || event._pageIndex !== 0 || event._trigger !== 0 || !page || event.list() !== page.list ||
        event._x !== entry.x || event._y !== entry.y || page.list.length > 64 ||
        !['Barrel', 'Chest'].includes(treasureName(entry, page)) ||
        !page.list.some(command => command.code === 117 && [33, 35].includes(command.parameters?.[0]))) return null;
    return { scene, origin: map._mapId, event, list: page.list, loot: true };
}

module.exports = { caveLootAction };
