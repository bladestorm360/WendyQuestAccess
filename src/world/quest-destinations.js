'use strict';

const { destination, excludedDestination, eventName, treasureName } = require('./destinations');

const PLUGIN = 'Ayatam_HighQualityQuestSystem';
const MAX_MARKERS = 128;
const MAX_MEMBERS = 512;
const MAX_COMMANDS = 8192;
const END_OR_COMMENT = [0, 108, 408, 657];
const ACTION = [0, 1, 2];

function activeMarker(marker, parent) {
    return marker?._active === true && marker.parent === parent && marker.worldVisible && marker.worldAlpha > 0 &&
        marker.renderable && marker.texture?.valid && marker.bitmap && marker.x !== -9999 && marker.y !== -9999 &&
        Number.isFinite(marker.x) && Number.isFinite(marker.y);
}

function refersToQuest(value, nav, name) {
    return typeof value === 'string' && (value === nav || value === name || 'quest' + Number.parseInt(value, 10) === nav);
}

function objectiveId(value) {
    return Number.isInteger(Number(value)) ? 'set' + value : value;
}

function linkedPage(root, page, marker, nav, name, objective) {
    const location = marker._location?.location;
    if (marker._generated && typeof location === 'string' && location) {
        return page.list.some(command => command.code === 201 && command.parameters[0] === 0 &&
            root.$dataMapInfos?.[command.parameters[1]]?.name === location);
    }
    return page.list.some(command => {
        const args = command.parameters;
        if (command.code !== 357 || args[0] !== PLUGIN || !args[3]) return false;
        const options = args[3];
        if (!marker._generated) {
            const set = Number(options.objectiveId) === 0 ? null : objectiveId(options.objectiveId);
            return args[1] === 'questMarker' && set === (marker._setId || null) &&
                (marker._questId ? refersToQuest(options.questId, nav, name) : Number(options.questId) === 0);
        }
        if (marker._reporting) return args[1] === 'completeQuest' && refersToQuest(options.questId, nav, name);
        if (!marker._setId) return false;
        if (args[1] === 'completeQuestObjective')
            return refersToQuest(options.questId, nav, name) && objectiveId(options.objectiveId) === marker._setId;
        return args[1] === 'sendQuestEvent' && objective?._contentType === 'eventquest' &&
            typeof objective._contentId === 'string' && typeof options.eventName === 'string' &&
            options.eventName.toLowerCase() === objective._contentId.toLowerCase();
    });
}

function questPageHasAction(page) {
    return page.list.some(command => !END_OR_COMMENT.includes(command.code) &&
        !(command.code === 357 && command.parameters[0] === PLUGIN &&
            ['questMarker', 'disableAutoMarker'].includes(command.parameters[1])));
}

function collectQuestDestinations(root, scene, mode) {
    const spriteset = scene?._spriteset;
    const markers = spriteset?._ayatamQuestIconSprite;
    const parent = spriteset?._tilemap?.parent;
    const config = root.Ayatam?.QUEST;
    const nav = root.$gameParty?.getNav?.();
    if (!parent || config?.needsRefresh !== false || typeof nav !== 'string' || !/^quest[1-9]\d?$/.test(nav) ||
        !Array.isArray(markers) || !markers.length || markers.length > MAX_MARKERS) return null;
    const name = config.QuestDatabase?.[Number(nav.slice(5)) - 1]?.QuestName;
    const map = root.$gameMap;
    const targets = new Map();
    let members = 0;
    let commands = 0;
    for (let index = 0; index < markers.length; index++) {
        const marker = markers[index];
        if (!activeMarker(marker, parent) || (marker._questId && marker._questId !== nav)) continue;
        const ids = marker._generated ? marker._eventIds : [marker._eventId];
        if (!Array.isArray(ids) || (members += ids.length) > MAX_MEMBERS) return null;
        const objective = marker._generated && marker._setId && root.$gameParty.questObjectives?.(nav, marker._setId);
        for (const id of ids) {
            if (!Number.isInteger(id) || id < 1 || targets.has(id)) continue;
            const event = map._events[id];
            const entry = root.$dataMap.events[id];
            const page = entry?.pages[event?._pageIndex];
            if (!event || event._erased || !Array.isArray(page?.list) || page.list.length < 2 ||
                (!ACTION.includes(event._trigger) && (marker._generated || event._trigger !== 4))) continue;
            if ((commands += page.list.length) > MAX_COMMANDS) return null;
            if (excludedDestination(entry, page) || !linkedPage(root, page, marker, nav, name, objective)) continue;
            const waypoint = !ACTION.includes(event._trigger) || !questPageHasAction(page);
            if (waypoint && mode !== 'walk') continue;
            targets.set(id, { markers, index, marker, bitmap: marker.bitmap, nav, map, id, event, page,
                pageIndex: event._pageIndex, trigger: event._trigger, priority: event._priorityType, through: event._through,
                x: event._x, y: event._y, waypoint, reporting: marker._reporting === true });
        }
    }
    return targets;
}

function questDestinationLabel(entry, lease, ordinary) {
    const safe = ordinary || destination(entry, lease.page, lease.trigger, lease.map?._mapId);
    const name = (safe?.category !== 'events' && safe?.name) || treasureName(entry, lease.page) ||
        (lease.waypoint ? eventName(entry) : '');
    if (lease.waypoint) {
        const anchor = name.replace(/^quest\s*marker\s*/i, '');
        return anchor ? 'Quest marker near ' + anchor : 'Quest marker';
    }
    return name || (lease.reporting ? 'Quest turn-in' : 'Quest objective');
}

function questDestinationCurrent(root, scene, lease) {
    const spriteset = scene._spriteset;
    const marker = lease.marker;
    const event = lease.event;
    return root.Ayatam?.QUEST?.needsRefresh === false && root.$gameParty?.getNav?.() === lease.nav &&
        root.$gameMap === lease.map && lease.map._events[lease.id] === event && !event._erased &&
        event._pageIndex === lease.pageIndex && event._trigger === lease.trigger && event._priorityType === lease.priority &&
        event._through === lease.through && event._x === lease.x && event._y === lease.y &&
        root.$dataMap?.events?.[lease.id]?.pages[event._pageIndex] === lease.page &&
        spriteset?._ayatamQuestIconSprite === lease.markers && lease.markers[lease.index] === marker &&
        marker.bitmap === lease.bitmap && activeMarker(marker, spriteset?._tilemap?.parent);
}

module.exports = { collectQuestDestinations, questDestinationLabel, questDestinationCurrent, questPageHasAction };
