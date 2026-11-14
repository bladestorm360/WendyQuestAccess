'use strict';

const { houseStair, houseBranches } = require('./transfer-events.cjs');

// Each locator describes the active page's native destination. The worker
// still derives the interaction approach from live collision and priority.
const EXITS = {
    13: { 1: ['Crispy Ruins', 16], 2: ['Crispy Ruins', 16],
        7: ["Elder Tater's house", 116], 16: ['Road to Russetwood', 113] },
    16: { 20: ['Road to Russetwood', 113, 114], 21: ['Road to Russetwood', 113, 114] },
    34: { 2: ['Chillcrest', 25] },
    36: { 5: ['Exit toward Frosty Peak', 113], 24: ['Exit toward Frosty Peak', 113],
        25: ['Exit toward Frosty Peak', 113], 26: ['Exit toward Frosty Peak', 113] },
    37: { 3: ['Return to Frosty Peak', 27] },
    96: { 2: ['Burgenburg', 94] },
    204: { 3: ['Return to Frosty Peak', 27] },
    93: { 1: ['Elevator entrance', 98], 8: ['Elevator entrance', 98], 24: ['Elevator entrance', 98],
        25: ['Elevator entrance', 98], 26: ['Elevator entrance', 98] },
    23: { 1: ['Return to Russetwood', 12], 2: ['Second floor', 24] },
    24: { 1: ['First floor', 23] },
    54: { 1: ['Return to Russetwood', 12] },
    117: { 13: ['Second floor', 118] },
    118: { 3: ['First floor', 117] },
    120: { 2: ['Second floor', 122] },
    122: { 1: ['First floor', 120] },
    126: { 2: ['Second floor', 127] },
    127: { 1: ['First floor', 126] },
    157: { 2: ['Second floor', 158] },
    158: { 1: ['First floor', 157] },
    27: { 22: ['Exit toward Mountain Pass', 113], 23: ['Exit toward Mountain Pass', 113] },
    28: { 6: ['Cauldron exterior', 57], 7: ['Third pull room', 55],
        8: ['First pull room', 51], 9: ['Second pull room', 53] },
    32: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51], 8: ['Second pull room', 53] },
    44: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51],
        8: ['Third pull room', 55], 9: ['Second pull room', 53], 10: ['Final chamber', 63] },
    50: { 6: ['Cauldron exterior', 57], 7: ['First pull room', 51] },
    51: { 1: ['Return to Cauldron', 50, 32, 28, 44] },
    53: { 2: ['Return to Cauldron', 32, 28, 44, 50] },
    55: { 2: ['Cauldron exterior', 57], 3: ['Return to Cauldron', 28, 44] },
    57: { 13: ['Cauldron entrance', 50, 32, 28, 44], 14: ['Side entrance', 55], 20: ['Side entrance', 55] },
    58: { 16: ['Side entrance', 55], 22: ['Side entrance', 55] },
    63: { 1: ['Return to Cauldron', 44] },
    87: { 91: ['Hidden cave entrance', 205] },
    128: { 1: ['Second floor', 127] },
    133: { 1: ['First floor', 132] },
    195: { 1: ['Second floor', 127] },
    203: { 1: ['First floor', 132] },
    205: { 8: ['Return to Caffeine Caverns', 87], 12: ['Return to Caffeine Caverns', 87] }
};

// These audited normal-priority pages start when the player tries to move
// into the event. Keep their destinations tied to the active native page.
const TOUCH_TRANSFERS = {
    12: { 27: ["Frygor's house", 117] },
    25: { 8: ['Chillcrest cave', 33], 13: ["Frostyna's house", 119],
        17: ["Elder Frosty's tower", 126], 29: ['Chillcrest house 1', 129],
        30: ['Chillcrest house 2', 130], 31: ['Chillcrest house 3', 131] },
    27: { 17: ['Frosty Peak cave', 37], 44: ['Cold Brew Trail cave', 204] },
    58: { 37: ['Cauldron entrance', 57], 38: ['Cauldron entrance', 57], 39: ['Cauldron entrance', 57] },
    48: { 3: ['Return to Nuggedor', 45, 59], 4: ['Return to Nuggedor', 45, 59],
        10: ['Return to Nuggedor', 45, 59], 16: ['Return to Nuggedor', 45, 59] },
    83: { 27: ["Frygor's house", 23] },
    116: { 8: ['Return to Crispy Beach', 13] },
    117: { 11: ['Return to Russetwood', 12] },
    119: { 3: ['Return to Chillcrest', 25] }
};

const PULLS = { 51: [2], 53: [3, 4], 55: [4] };
const WEST_CHILLCREST = [14, 18, 19];

// All three tiles share a story check before the west exit is opened. The
// dialogue pages must remain scenes while their transfer branch is disabled.
function chillcrestExit(root, event, page) {
    if (!page || root.$gameMap._mapId !== 25) return undefined;
    const id = event._eventId;
    const west = WEST_CHILLCREST.includes(id);
    const east = id === 7 || id === 15 || id === 16;
    if (!west && !east && id !== 6) return undefined;
    const { list } = page;
    const conditional = west && event._pageIndex === 0;
    if (conditional && root.$gameSwitches?.value?.(33) !== true) return undefined;
    const x = west ? 12 : east ? 14 : 13;
    const y = id === 6 ? 18 : 17;
    const transfer = list.find(command => command.code === 201 && command.indent === (conditional ? 1 : 0) &&
        command.parameters[0] === 0 && command.parameters[1] === 113 &&
        command.parameters[2] === x && command.parameters[3] === y);
    if (!transfer) return undefined;
    if (conditional) {
        const start = list.findIndex(command => command.code === 111 && command.indent === 0 &&
            command.parameters[0] === 0 && command.parameters[1] === 33 && command.parameters[2] === 1);
        const otherwise = list[list.indexOf(transfer) - 1];
        if (start < 0 || otherwise?.code !== 411 || otherwise.indent !== 0) return undefined;
    }
    if (event._trigger !== 0 && event._trigger !== 1) return undefined;
    return { name: west ? 'West exit toward Cold Brew Trail' : east ? 'East exit toward Frosty Float' :
        'South exit toward Salt Caverns', category: 'exits', eventAction: event._trigger === 1 ? 'step' : undefined,
        ...(west ? { handoffs: WEST_CHILLCREST } : {}) };
}

function chillcrestQuestExit(root) {
    return root.$gameParty?.getNav?.() === 'quest15' &&
        root.$gameSwitches?.value?.(33) === true && root.$gameSwitches.value(38) === false;
}
// These events exist before their ice block's movement route assigns the
// chest sprite. The stock page image can stay blank even after the reveal.
const COVERED_CHESTS = { 14: 20, 15: 15, 29: 11, 134: 22 };

// Only these authored Crispy Beach floor events can qualify a route up to
// its first native interruption. The route still ends before the event.
const BEACH_HANDOFF_NAMES = Object.freeze({
    12: 'Beach path', 30: 'Beach path', 34: 'Beach checkpoint', 35: 'Beach checkpoint',
    10: 'Story event', 11: 'Story event', 13: 'Story event', 21: 'Story event', 22: 'Story event',
    23: 'Story event', 24: 'Story event', 25: 'Story event', 26: 'Story event', 27: 'Story event'
});
const BEACH_HANDOFFS = Object.freeze(Object.keys(BEACH_HANDOFF_NAMES).map(Number));

function localHandoffName(map, event) {
    if (map === 13) return BEACH_HANDOFF_NAMES[event];
    if (map === 27 && [27, 32].includes(event)) return 'Peak approach';
    if (map === 15 && event >= 46 && event <= 49) return 'Scene trigger';
    return undefined;
}

// Duplicate trigger tiles can retain their original page after another tile
// has consumed the shared dialogue. Read the native guards, without running
// commands or predicting changes to collision.
function inactiveFloorScene(root, event, page) {
    if (event._trigger !== 1 || event._pageIndex !== 0) return false;
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    // The Cold Brew Trail boundary updates the atlas pin and leaves
    // native walking in control. Crossing it needs no player intervention.
    if (map === 36 && id === 35 && page.list.length === 7 && page.list[4]?.code === 117 &&
        page.list[4].parameters[0] === 159) return true;
    const condition = page.list[0];
    if (condition?.code !== 111 || condition.indent !== 0) return false;
    const [type, key, value] = condition.parameters;
    const active = id => root.$gameSwitches?.value?.(id) === true;
    if (map === 119 && id >= 9 && id <= 13 && type === 0 && key === 33 && value === 0) {
        const inner = page.list[1];
        return active(33) || (inner?.code === 111 && inner.indent === 1 &&
            inner.parameters[0] === 0 && inner.parameters[1] === 448 && inner.parameters[2] === 1 && active(448));
    }
    if (map !== 25) return false;
    if ((id === 45 || id === 46) && type === 0 && key === 511 && value === 1) return active(511);
    if ((id === 40 || id === 41) && type === 8 && key === 2) {
        const idol = root.$dataItems?.[2];
        return !!idol && root.$gameParty?.hasItem?.(idol) === false;
    }
    return false;
}

const icePages = new WeakMap();

function iceOpensPassage(entry, page) {
    if (!/^Ice(?:Block|$)/.test(entry?.name || '') || page?.trigger !== 0) return false;
    if (!icePages.has(page)) {
        const gameplay = page.list.filter(({ code }) => ![0, 108, 408, 657].includes(code));
        const [sound, animation, done] = gameplay;
        const next = entry.pages[entry.pages.indexOf(page) + 1];
        // Verify the ordinary melt followed by an erase-only page. Other
        // variants can stage a chest, a cutscene or combat as part of melting.
        const opens = gameplay.length === 3 && sound.code === 250 &&
            sound.parameters[0]?.name === 'WQ/SFX_IceBlockMelt' &&
            animation.code === 357 && animation.parameters[0] === 'MapScene' &&
            animation.parameters[1] === 'AnimatedObjectSetState' &&
            animation.parameters[3]?.animationState === 'melt' && animation.parameters[3]?.wait === 'true' &&
            done.code === 123 && done.indent === 0 && done.parameters[1] === 0 &&
            next?.trigger === 4 && next.conditions?.selfSwitchValid === true &&
            !next.conditions.switch1Valid && !next.conditions.switch2Valid && !next.conditions.variableValid &&
            !next.conditions.itemValid && !next.conditions.actorValid &&
            next.conditions.selfSwitchCh === done.parameters[0] &&
            next.list.length === 2 && next.list[0]?.code === 214 && next.list[1]?.code === 0;
        icePages.set(page, opens);
    }
    return icePages.get(page);
}

// Hand-audited discovery pages. The authored cave return page and the
// stairs to a room opened in play remain normal destinations.
function concealedDestination(map, event) {
    if (event?._pageIndex !== 0) return false;
    const id = event._eventId;
    return map === 128 && id === 11 || map === 133 && id === 4 || map === 87 && id === 91;
}

function localDestination(root, event, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    const trigger = event._trigger;
    const list = page.list;
    const townExit = chillcrestExit(root, event, page);
    if (townExit) return townExit;
    const stairs = houseStair(map, id);
    if (stairs) {
        // The landing changes within the same native page when the hidden
        // passage opens. Read the exact condition but only speak the target.
        if (trigger !== 1 || !houseBranches(stairs, list, map)) return null;
        const open = root.$gameSwitches?.value?.(stairs.switchId);
        if (typeof open !== 'boolean') return null;
        return { name: open ? 'Secret room stairs' : stairs.floor, category: 'exits' };
    }
    if (event._pageIndex === 0 && trigger === 1 && event._priorityType === 1) {
        if (map === 76 && id === 64 && list.some(command =>
            command.code === 201 && command.indent === 0 && command.parameters[0] === 0 && command.parameters[1] === 112)) {
            // The first native branch turns Wendy away until switch 267 is on.
            return root.$gameSwitches?.value?.(267) === true
                ? { name: 'Board airship', category: 'vehicles', eventAction: 'bump' }
                : { name: 'Scene trigger', category: 'events', eventAction: 'bump' };
        }
        const transfer = TOUCH_TRANSFERS[map]?.[id];
        if (transfer && list.some(command => command.code === 201 && command.parameters[0] === 0 &&
            transfer.includes(command.parameters[1], 1)))
            return { name: transfer[0], category: 'exits', eventAction: 'bump' };
    }
    const floorAction = trigger === 1 && event._priorityType !== 1;
    if (map === 27 && floorAction && [27, 32].includes(id) &&
        list[list.length - 3]?.code === 121 && list[list.length - 3].parameters[0] === 41 && list[list.length - 2]?.code === 214)
        return { name: 'Peak approach', category: 'events', eventAction: 'step', handoffs: [27, 32] };
    const to = (mapId, indent = 0) => list.some(command => command.code === 201 &&
        command.indent === indent && command.parameters[0] === 0 && command.parameters[1] === mapId);
    if (floorAction) {
        if (map === 14 && id === 25 && to(117)) return { name: "Return to Frygor's house", category: 'exits', eventAction: 'step' };
        if (map === 64 && id === 1 && to(59, 1) && to(45, 1)) return { name: 'Return to Nuggedor', category: 'exits', eventAction: 'step' };
        if (map === 192 && id === 1 && to(98, 1))
            return root.$gameSwitches?.value?.(404) === true
                ? { name: 'Elevator to the lower landing', category: 'exits', eventAction: 'step' }
                : { name: 'Ride elevator', category: 'events', eventAction: 'step' };
        if (map === 192 && id === 12 && event._pageIndex === 1)
            return { name: 'Ride elevator', category: 'events', eventAction: 'step' };
        if ((map === 57 || map === 58) && /^(?:Halt|ToMap)$/.test(root.$dataMap?.events?.[id]?.name || '')) {
            const guardedReturn = to(113);
            if (guardedReturn || (to(113, 1) && root.$gameSwitches?.value?.(477) === false))
                return { name: 'Return to world map', category: 'exits', eventAction: 'step' };
        }
    }
    const exit = EXITS[map]?.[id];
    if (exit) {
        if ((trigger !== 0 && trigger !== 1) ||
            !list.some(command => command.code === 201 && command.parameters[0] === 0 &&
                exit.includes(command.parameters[1], 1))) return null;
        const target = { name: exit[0], category: 'exits' };
        if (trigger === 1 && event._priorityType === 1) target.eventAction = 'bump';
        if (map === 13 && id === 7) target.handoffs = BEACH_HANDOFFS;
        return target;
    }
    // Follow Elder Tater is a live parallel NPC page. A route approaches
    // the person without trying to start the background interpreter.
    if (map === 13 && id === 5 && event._pageIndex === 1 && trigger === 4 && page.image?.characterName === '~ElderTater')
        return { name: 'Elder Tater', category: 'people', waypoint: true, handoffs: BEACH_HANDOFFS };
    // Stepping onto the platform starts the ride through switches 481 and
    // 483. This page plays no dialogue and has no direct transfer command.
    if (map === 98 && id === 16 && trigger === 1 && event._pageIndex === 0 &&
        list[0]?.code === 121 && list[0].parameters[0] === 481 &&
        list[1]?.code === 121 && list[1].parameters[0] === 483)
        return { name: 'Ride elevator', category: 'events', eventAction: 'step' };
    if (COVERED_CHESTS[map] === id) {
        return trigger === 0 && list.length > 1 && event._characterName === 'Chest'
            ? { name: 'Chest', category: 'treasure' } : null;
    }
    if (trigger !== 0) return undefined;
    // The ice is drawn by MapScene's animated objects, independently of the
    // blank action sprite and any underlying chest.
    if (/^Ice(?:Block|ChestIce|$)/.test(root.$dataMap?.events?.[id]?.name || '') &&
        list.some(({ code, parameters }) => code === 250 && parameters[0]?.name === 'WQ/SFX_IceBlockMelt') &&
        list.some(({ code, parameters }) => code === 357 && parameters[0] === 'MapScene' &&
            parameters[1] === 'AnimatedObjectSetState'))
        return { name: 'Ice block', category: 'objects' };
    // The workshop has a book on the desk and two separate cupboards.
    if (map === 120 && (id === 11 || id === 12)) return { name: 'Cupboard', category: 'objects' };
    // This event's editor name describes an item. The visible prop is a drawer.
    if (map === 124 && id === 15) return { name: 'Drawer', category: 'objects' };
    if (map === 138 && id === 4) return { name: 'Book', category: 'objects' };
    if (map === 138 && id === 9) return { name: 'Food basket', category: 'objects' };
    if (map === 146 && id === 15) return { name: 'Bowl', category: 'objects' };
    // These are visibly placed pickups. Use their visible type, including
    // the drink and burger variants with item-specific editor names.
    if ((map === 119 && id === 23) || (map === 151 && id === 11))
        return { name: 'Drink', category: 'objects' };
    if (map === 158 && id === 17) return { name: 'Burger', category: 'objects' };
    // The three pantry props share a label in both native interaction states.
    if (map === 116 && [7, 9, 10].includes(id)) return { name: 'Pantry', category: 'objects' };
    if (PULLS[map]?.includes(id)) return event._pageIndex === 0 ? { name: 'Pull handle', category: 'objects' } : null;
    // All three physical forest buttons use the native action button.
    // The quest-enabled page stays browsable while an obstacle blocks access.
    if (map === 15 && id >= 31 && id <= 33 && page.image?.characterName === '!Button')
        return { name: 'Gate switch', category: 'objects', showBlocked: event._pageIndex === 1 };
    if (map === 27 && id === 43 && event._pageIndex === 0) return { name: 'Bridge button', category: 'objects' };
    if (map === 87 && id >= 121 && id <= 130 && page.list[35]?.parameters?.[3]?.pictureName === 'system/Caffeine Caverns Map')
        return { name: 'Map board', category: 'objects' };
    // The base game shows a generic prompt and identifies these only after OK.
    if ((map === 128 && id === 11) || (map === 133 && id === 4))
        return { name: 'Hidden passage button', category: 'objects' };
    return undefined;
}

module.exports = { localDestination, localHandoffName, iceOpensPassage, inactiveFloorScene, concealedDestination,
    chillcrestExit, chillcrestQuestExit, WEST_CHILLCREST };
