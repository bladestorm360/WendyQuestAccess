'use strict';

const { GATE_SWITCHES } = require('./terrain-control-labels.cjs');
const { houseStair, houseBranches } = require('./transfer-events.cjs');
const { numberedHouseName } = require('./map-banner');

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
    66: { 1: ['Caffeine Caverns', 87] },
    78: { 1: ['Caffeine Caverns', 87] },
    79: { 1: ['Caffeine Caverns', 87] },
    80: { 1: ['Caffeine Caverns', 87] },
    81: { 1: ['Caffeine Caverns, west entrance', 87], 2: ['Caffeine Caverns, east entrance', 87] },
    84: { 1: ['Caffeine Caverns', 87] },
    85: { 1: ['Caffeine Caverns, south entrance', 87], 2: ['Caffeine Caverns, west entrance', 87],
        3: ['Caffeine Caverns, east entrance', 87] },
    96: { 2: ['Burgenburg', 94] },
    97: { 18: ['Mech Office', 103] },
    191: { 1: ['Caffeine Caverns, east cave entrance', 87], 2: ['Caffeine Caverns, west cave entrance', 87] },
    204: { 3: ['Return to Frosty Peak', 27] },
    93: { 1: ['Elevator entrance', 98], 8: ['Elevator entrance', 98], 24: ['Elevator entrance', 98],
        25: ['Elevator entrance', 98], 26: ['Elevator entrance', 98] },
    20: { 1: ['Salt Caverns', 19] },
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
    87: {
        73: ['Bacon Beach, south cave exit', 85], 74: ['Devilled Nook', 79], 75: ['Poached Pool', 80],
        76: ['Quiche Coast', 84], 77: ['Bacon Beach, west cave exit', 85], 78: ['Bacon Beach, east cave exit', 85],
        79: ['Cracked Cove, east cave exit', 191], 80: ['Cracked Cove, west cave exit', 191],
        81: ['Scrambled Shores, east cave exit', 81], 82: ['Scrambled Shores, west cave exit', 81],
        83: ["Benedict's Bight", 66], 84: ['Shellside', 78], 91: ['Hidden cave entrance', 205]
    },
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
    45: { 1: ['North mine entrance', 48], 2: ['South mine entrance', 48] },
    48: { 3: ['Return to Nuggedor', 45, 59], 4: ['Return to Nuggedor', 45, 59],
        10: ['Return to Nuggedor', 45, 59], 16: ['Return to Nuggedor', 45, 59] },
    59: { 1: ['North mine entrance', 48], 2: ['South mine entrance', 48] },
    83: { 27: ["Frygor's house", 23] },
    116: { 8: ['Return to Crispy Beach', 13] },
    117: { 11: ['Return to Russetwood', 12] },
    119: { 3: ['Return to Chillcrest', 25] }
};

const SCENE_TRANSFERS = {
    29: { 1: 0 }, 94: { 12: 3, 27: 3 }, 103: { 2: 0, 3: 0, 4: 0, 16: 0, 17: 0, 18: 0, 19: 0 }
};

// These props are drawn in the map layers. Their editor names can be
// the commentator's name, a book title, or a generic group of books.
const INSPECTED_PROPS = {
    96: { 5: 'Letters' },
    125: { 16: 'Keg' },
    136: { 9: 'Cooking pot' },
    139: { 4: 'Stack of books', 6: 'Book', 12: 'Stack of books', 13: 'Stack of books', 14: 'Stack of books' },
    144: { 16: 'Bowl' }, // The Books-named event inspects the bowl of future pickles.
    147: { 24: 'Bed' },
    158: { 2: 'Letters' },
    159: { 10: 'Cupboard', 11: 'Cupboard' }
};

const WENDYS_RESTAURANTS = new Set([181, 182, 183, 184, 186]);
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
    return { category: 'exits', eventAction: event._trigger === 1 ? 'step' : undefined,
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

const BREAKFAST_HANDOFFS = Object.freeze({
    85: { 44: 'Beach conversation', 49: 'Beach conversation' },
    86: { 17: 'the island encounter', 21: 'Autosave checkpoint', 33: 'Island warning', 36: 'Island approach' },
    87: { 102: 'Cave exit approach' },
    113: { 179: 'Encounter trigger' }
});

function localHandoffName(map, event) {
    if (map === 13) return BEACH_HANDOFF_NAMES[event];
    if (BREAKFAST_HANDOFFS[map]?.[event]) return BREAKFAST_HANDOFFS[map][event];
    if (map === 55 && event === 8) return 'Side passage warning';
    if (map === 191 && event === 36) return 'Autosave checkpoint';
    if (map === 27 && [27, 32].includes(event)) return 'Peak approach';
    if (map === 15 && event >= 46 && event <= 49) return 'Scene trigger';
    return undefined;
}

// Duplicate trigger tiles can retain their original page after another tile
// has consumed the shared dialogue. Read the native guards, without running
// commands or predicting changes to collision.
// Automatic walking can cross short native bookkeeping/NPC-route triggers.
// Never classify dialogue, common events, transfers, rewards, battles, plugin
// commands or script operands as passive. Cache at most the live page keys.
const passiveFloors = new WeakMap();
const PASSIVE_COMMANDS = new Set([0, 108, 111, 121, 122, 123, 205, 214, 230, 408, 411, 412, 505, 657]);
function passiveFloorPage(page) {
    if (!page || ![1, 2].includes(page.trigger) || page.priorityType === 1 || page.list.length > 128) return false;
    if (!passiveFloors.has(page)) passiveFloors.set(page, page.list.every(command => {
        const p = command.parameters;
        if (!PASSIVE_COMMANDS.has(command.code)) return false;
        if (command.code === 111) return [0, 1, 2].includes(p[0]);
        if (command.code === 122) return p[3] >= 0 && p[3] <= 3;
        if (command.code === 205) return p[0] > 0 && p[1]?.list?.length <= 64 &&
            p[1].list.every(move => Number.isInteger(move.code) && move.code >= 0 && move.code < 45);
        return true;
    }));
    return passiveFloors.get(page);
}

function inactiveFloorScene(root, event, page) {
    if (event._trigger !== 1 || event._pageIndex !== 0) return false;
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    if (map === 76 && (id === 78 || id === 79)) {
        // Both pages give the same introduction. Event 78 is embedded in
        // an impassable tile. Keep the walking approach at event 79 until
        // either copy has set the shared completion switch.
        const completesIntroduction = page.list.some(command => command.code === 121 &&
            command.indent === 0 && command.parameters.join(',') === '465,465,0');
        if (completesIntroduction) return id === 78 || root.$gameSwitches?.value?.(465) === true;
    }
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

const floorCompletions=new WeakMap();
const FLOOR_COMPLETION_ROWS=new Set([0,108,408,101,401,205,505,213,250,230,121,123,214,241,242,223,224,225]);
// Only linear same-map presentation and a verified native completion flag
// qualify; extra bounded flag writes do not make an erase page permanent.
// Choices, transfers, battles and unknown scripts/common events stay opaque.
function floorClearsOnUse(entry,page) {
    if (!page || page.list.length>256 || page.priorityType!==0 || ![1,2].includes(page.trigger) || page.image?.tileId ||
        page.image?.characterName) return false;
    if (!floorCompletions.has(page)) {
        const rows=page.list.filter(row=>!([0,108,408].includes(row.code)));
        // Atlas position updates are a verified one-use navigation marker,
        // not a permanent story wall. Common159 only computes atlas UI coords;
        // the native self-switch/erase page still owns actual completion.
        const atlas=rows.length===5 && [122,122,121,117,123].every((code,i)=>rows[i].code===code) &&
            rows[0].parameters.slice(0,4).join(',')==='119,119,0,0' &&
            rows[1].parameters.slice(0,4).join(',')==='120,120,0,0' &&
            rows.slice(0,2).every(row=>Number.isInteger(row.parameters[4])&&row.parameters[4]>=0&&row.parameters[4]<100) &&
            rows[2].parameters.join(',')==='624,624,0' && rows[3].parameters.join(',')==='159';
        const flags=rows.filter(row=>[121,123].includes(row.code));
        let clears=rows.length>0 && rows.every(row=>row.indent===0&&(FLOOR_COMPLETION_ROWS.has(row.code)||atlas&&[122,117].includes(row.code))&&
            (row.code!==205 || row.parameters[1]?.repeat===false && row.parameters[1].list?.length<=64 &&
                row.parameters[1].list.every(move=>move.code===0||move.code>=15&&move.code<=44)));
        if (clears && rows.some(row=>row.code===214)) clears=true;
        else {
            clears=clears&&flags.length>=1&&flags.length<=4;
            const index=entry.pages.indexOf(page);
            // Several ambush/atlas triggers set a global flag as well as their
            // own completion flag. Any matching unconditional erase page
            // proves the selected event itself clears; never erase its peers.
            clears=clears&&flags.some(flag=>entry.pages.slice(index+1).some(next=>{
                const q=next.conditions;
                const active=Object.keys(q).filter(key=>key.endsWith('Valid')&&q[key]);
                const matches=flag.code===123 ? flag.parameters[1]===0&&active.length===1&&q.selfSwitchValid&&
                    q.selfSwitchCh===flag.parameters[0] : flag.parameters[0]===flag.parameters[1]&&flag.parameters[2]===0&&
                    active.length===1&&q.switch1Valid&&q.switch1Id===flag.parameters[0];
                return matches&&next.priorityType===0&&next.list.length===2&&next.list[0].code===214&&next.list[1].code===0;
            }));
        }
        // The first secret-route glitch erases itself on both branches.
        // Its two common events are the already qualified visual filter pair;
        // it cannot transfer, fight, offer a choice or become a lasting wall.
        const glitch=entry.id===189 && entry.name==='SecretEndingGlitch1' && page===entry.pages[0] &&
            page.list.length===15 && [111,117,250,230,117,101,401,121,214,0,411,214,0,412,0]
                .every((code,i)=>page.list[i].code===code) &&
            page.list[0].parameters.join(',')==='0,452,1' &&
            page.list[1].parameters.join(',')==='40' && page.list[4].parameters.join(',')==='41' &&
            page.list[7].parameters.join(',')==='452,452,0';
        const simpleGlitch=/^SecretEndingGlitch\d+$/.test(entry.name||'') && page===entry.pages[0] &&
            page.list.length===9 && [117,250,230,117,101,401,121,214,0].every((code,i)=>page.list[i].code===code) &&
            page.list[0].parameters.join(',')==='40' && page.list[3].parameters.join(',')==='41' &&
            page.list[6].parameters[0]===page.list[6].parameters[1] && page.list[6].parameters[2]===0;
        floorCompletions.set(page,!!clears||glitch||simpleGlitch);
    }
    return floorCompletions.get(page);
}

const icePages = new WeakMap();

function iceOpensPassage(entry, page) {
    if (!/^Ice(?:Block|ChestIce|$)/.test(entry?.name || '') || page?.trigger !== 0) return false;
    if (!icePages.has(page)) {
        const gameplay = page.list.filter(({ code }) => ![0, 108, 408, 657].includes(code));
        // This exact visible rescue has two introductory lines before the
        // ordinary melt. Its separate actor owns the later conversation.
        const rescue = entry.id === 8 && entry.x === 28 && entry.y === 5 && page === entry.pages[1] &&
            entry.pages[0]?.list[0]?.parameters?.[3]?.animationPath === 'ICE WITH PERSON' &&
            entry.pages[3]?.list[11]?.code === 203 &&
            entry.pages[3].list[11].parameters.join(',') === '6,0,28,5,0' &&
            gameplay[0]?.code === 101 && gameplay[0].parameters[0] === 'Wendy' &&
            gameplay[1]?.code === 401 && gameplay[2]?.code === 401;
        if (rescue) gameplay.splice(0,3);
        const [sound, animation, done] = gameplay;
        const next = entry.pages[entry.pages.indexOf(page) + 1];
        const melts = sound?.code === 250 && sound.parameters[0]?.name === 'WQ/SFX_IceBlockMelt' &&
            animation?.code === 357 && animation.parameters[0] === 'MapScene' &&
            animation.parameters[1] === 'AnimatedObjectSetState' &&
            animation.parameters[3]?.animationState === 'melt' && animation.parameters[3]?.wait === 'true';
        const switchPage = done?.code === 123 && done.indent === 0 && done.parameters[1] === 0 &&
            next?.trigger === 4 && next.conditions?.selfSwitchValid === true &&
            !next.conditions.switch1Valid && !next.conditions.switch2Valid && !next.conditions.variableValid &&
            !next.conditions.itemValid && !next.conditions.actorValid &&
            next.conditions.selfSwitchCh === done.parameters[0];
        let plan = melts && gameplay.length === 3 && switchPage && next.list.length === 2 &&
            next.list[0]?.code === 214 && next.list[1]?.code === 0 ? {} : false;
        // Melting object ice replaces its wide collider with the actual chest
        // collider at the authored position. Never project that space as empty
        // or reveal the hidden chest in the destination browser.
        const chest = entry.name === 'IceChestIce' && page === entry.pages[1] &&
            entry.pages[0]?.list[0]?.parameters?.[3]?.animationPath === 'ICE WITH OBJECT';
        if (chest && melts && gameplay.length === 3) {
            const rows = next?.list.filter(({ code }) => ![0, 108, 408, 505, 657].includes(code)) || [];
            const [graphic, position, erase] = rows;
            const moves = graphic?.parameters?.[1]?.list;
            if (switchPage && rows.length === 3 && graphic?.code === 205 && position?.code === 203 &&
                erase?.code === 214 && graphic.parameters[0] === position.parameters[0] &&
                moves?.length === 2 && moves[0].code === 41 && moves[0].parameters?.join(',') === 'Chest,0' &&
                moves[1].code === 0 && graphic.parameters[1].wait === true && position.parameters[1] === 0) {
                plan = { relocate: [position.parameters[0],position.parameters[2],position.parameters[3]] };
            }
            // One chest variant erases directly after the awaited animation;
            // its separate splash callback moves/unhides the existing chest.
            const splashMove = next?.list[11], splashRoute = next?.list[12];
            if (done?.code === 214 && next?.conditions.selfSwitchValid && next.conditions.selfSwitchCh === 'B' &&
                splashMove?.code === 203 && splashMove.parameters[1] === 0 && splashRoute?.code === 205 &&
                splashRoute.parameters[0] === splashMove.parameters[0] &&
                splashRoute.parameters[1]?.list.map(move => move.code).join(',') === '15,40,14,0' &&
                splashRoute.parameters[1].list[2].parameters?.join(',') === '0,0') {
                plan = { relocate: [splashMove.parameters[0],splashMove.parameters[2],splashMove.parameters[3]] };
            }
        }
        // Russetwood's northern block uses the ordinary ice graphic, but
        // its splash callback brings the hidden chest to the melted tile.
        // Verify that exact native relocation instead of leaving the chest
        // at its off-path holding position in the worker projection.
        const splash = entry.pages[3];
        if (plan && entry.id === 57 && entry.x === 44 && entry.y === 9 && page === entry.pages[1] &&
            entry.pages[0]?.list[0]?.parameters?.[3]?.animationPath === 'ICE WITHOUT PERSON' &&
            splash?.trigger === 4 && splash.conditions.selfSwitchValid && splash.conditions.selfSwitchCh === 'B' &&
            splash.list[0]?.code === 203 && splash.list[0].parameters.join(',') === '58,0,44,9,0' &&
            splash.list[1]?.code === 205 && splash.list[1].parameters[0] === 58 &&
            splash.list[1].parameters[1]?.list.map(move => move.code).join(',') === '14,0' &&
            splash.list[1].parameters[1].list[0].parameters?.join(',') === '0,0')
            plan = { relocate: [58,44,9] };
        // This audited melt runs a non-escapable native encounter and then
        // retires actor11 via switch446. Name only the visible ice prerequisite;
        // the original script/battle owns all progression and player control.
        if (melts && entry.id === 7 && page === entry.pages[1] && page.list[19]?.code === 123 &&
            page.list[19].parameters.join(',') === 'C,0' && page.list[20]?.code === 301 &&
            page.list[20].parameters.join(',') === '0,76,false,false' && page.list[27]?.code === 121 &&
            page.list[27].parameters.join(',') === '446,446,0' && next?.list.length === 2 &&
            next.list[0].code === 214) plan = { clears: [11] };
        icePages.set(page, plan);
    }
    return !!icePages.get(page);
}

function iceMeltChanges(entry, page) {
    return iceOpensPassage(entry, page) ? icePages.get(page) : undefined;
}

// Hand-audited discovery pages. The authored cave return page and the
// stairs to a room opened in play remain normal destinations.
function concealedDestination(map, event) {
    if (event?._pageIndex !== 0) return false;
    const id = event._eventId;
    return map === 128 && id === 11 || map === 133 && id === 4;
}

function visibleChestBarrier(root, map, id, spoilers) {
    // The native chest is drawn across the obstruction. Keep its label in
    // the browser and use the local terrain in a blocked route response.
    if (map === 204 && id === 1 && root.$gameSwitches?.value?.(GATE_SWITCHES[map]) === false)
        return 'Chest is unreachable beyond a gap in the floor.';
    if (map === 79 && id === 6 && !spoilers && root.$gameSwitches?.value?.(GATE_SWITCHES[map]) === false)
        return 'Chest is unreachable across the water.';
    return '';
}

// Mech Double closes this actual entrance; it is not an unlockable gate.
// Explain a failed beach route only from the enclosed side, using the live
// solid door and the selected native transfer. Never change reachability.
function closedRuinsDoorReason(root, target) {
    const map = root.$gameMap;
    if (map?._mapId !== 16) return '';
    const door = map._events?.[37];
    const event = map._events?.[target];
    const page = root.$dataMap?.events?.[target]?.pages?.[event?._pageIndex];
    return door && !door._erased && door._pageIndex === 2 && door._priorityType === 1 &&
        door._through === false && door._characterName === '!$AnimatedDoors' &&
        root.$gamePlayer?._y < door._y && !event?._erased && page &&
        (target === 19 && root.$dataMap.events[19].x === 41 && root.$dataMap.events[19].y === 32 ||
            page.list.some(command => command.code === 201 && command.parameters[0] === 0 && command.parameters[1] === 13))
        ? 'Blocked by the closed ruins door.' : '';
}

function eventSwitchPage(entry, index, switchId, destination) {
    const page = entry?.pages?.[index];
    return page?.trigger === 3 && page.conditions.switch1Valid && page.conditions.switch1Id === switchId &&
        page.list.some(command => command.code === 201 && command.indent === 0 &&
            command.parameters[0] === 0 && command.parameters[1] === destination);
}

function pendingOfficeExit(root, event, entry) {
    return root.$gameMap._mapId === 97 && event._eventId === 18 && event._pageIndex === -1 &&
        root.$gameSwitches?.value?.(103) === false &&
        entry.pages[0]?.trigger === 1 && entry.pages[0].priorityType === 1 &&
        entry.pages[0].conditions.switch1Valid && entry.pages[0].conditions.switch1Id === 103 &&
        entry.pages[0].list.some(command => command.code === 201 && command.indent === 0 &&
            command.parameters[0] === 0 && command.parameters[1] === 103);
}

const NPC_PASSAGES = {
    // After speaking, Frostyna joins the party. Her follow-up floor
    // reminders retire under the same rescue switch as the sprite.
    119: { event: 4, x: 3, y: 9, art: '~Frostyna', name: 'Frostyna',
        clears: [4, 9, 10, 11, 12, 13] },
    // The officer jumps two tiles south and saves his new position after
    // speaking with Baconator. He remains a solid NPC at the new tile.
    191: { event: 3, x: 33, y: 17, art: 'NPCs - 32x32', name: 'Search and Rescue Officer',
        movesTo: [33, 19] }
};

function npcPassage(map) {
    const passage = NPC_PASSAGES[map?._mapId];
    if (!passage) return null;
    const event = map._events?.[passage.event];
    return event && !event._erased && event._pageIndex === 0 && event._trigger === 0 &&
        event._priorityType === 1 && event._through === false && event._characterName === passage.art &&
        event._x === passage.x && event._y === passage.y ? passage : null;
}

// Preserve the verified no-Eggward route after the earlier sequence breaks.
// These optional meeting/mention tiles can be walked around. Sir Chicken's
// repeated north-path warning53 remains a real native routing prerequisite.
function optionalSceneAvoidance(root) {
    if(root.$gameMap?._mapId!==76||root.$gameSwitches?.value?.(462)!==true||
        root.$gameSwitches.value(463)!==true||root.$gameSwitches.value(90)!==false)return undefined;
    return [50,51,76,77,79].filter(id=>{
        const event=root.$gameMap._events?.[id],page=root.$dataMap?.events?.[id]?.pages?.[0];
        return event&&!event._erased&&event._pageIndex===0&&event._trigger===1&&event._priorityType===0&&
            page?.list.some(row=>row.code===121&&row.parameters[0]===(id===50||id===51?90:465));
    });
}

// The ordinary quest still points to Eggward during the alternate departure.
// Once Wendy has actually seen the first local glitch, expose the real north
// exit as the continuation, not one of the unrelated generic mention scenes.
// This is navigation only: the player still activates both glitches, all
// warning stages and the native exit that commits the sequence break.
function sunriseSequenceExit(root) {
    if (!optionalSceneAvoidance(root) || root.$gameMap._events?.[95]?._erased !== true ||
        root.$gameSwitches.value(466) === true) return false;
    const event=root.$gameMap._events?.[2],page=root.$dataMap?.events?.[2]?.pages?.[event?._pageIndex];
    return !!event && !event._erased && event._trigger===1 && event._priorityType===0 &&
        page?.list.some(row=>row.code===201&&row.parameters.join(',')==='0,113,43,28,0,0');
}

function mapBoardDirectionsObtained(root, page) {
    const condition = page.list?.[0];
    const args = condition?.parameters;
    // Ten boards share three pathway types. This exact branch chooses the
    // native already-drawn dialogue, including knowledge from another board.
    return condition?.code === 111 && condition.indent === 0 && args?.length === 3 &&
        args[0] === 0 && args[2] === 1 && Number.isInteger(args[1]) && args[1] >= 205 && args[1] <= 207 &&
        root.$gameSwitches?.value?.(args[1]) === true;
}

function localDestination(root, event, page) {
    const map = root.$gameMap._mapId;
    const id = event._eventId;
    const trigger = event._trigger;
    const list = page.list;
    // The five terminals use the LAB A5 computer tile. The two papers
    // on the workshop desk have different art and keep document labels.
    if (map === 105 && [18, 70, 71, 72, 73].includes(id) && event._pageIndex === 0 && trigger === 0)
        return { name: 'Computer', category: 'objects' };
    if (map === 106 && id === 19 && event._pageIndex === 0 && trigger === 0)
        return { name: 'Crowned skeleton', category: 'objects' };
    // Generic town doors use the destination interior's stable house number,
    // including both native Nuggedor variants. Keep named homes and shops.
    // Only an unconditional direct transfer supplies this label; no route or
    // native activation semantics change and future destinations stay gated.
    if ((trigger===0 || trigger===1) && /^To(?:Generic)?House$/.test(root.$dataMap?.events?.[id]?.name || '')) {
        const transfer=list.find(row=>row.code===201 && row.indent===0 && row.parameters[0]===0);
        const name=transfer && numberedHouseName(transfer.parameters[1]);
        if(name)return {name,category:'exits',...(trigger===1 && event._priorityType===1 ? {eventAction:'bump'} : {})};
    }
    const townExit = chillcrestExit(root, event, page);
    if (townExit) return townExit;
    if (map === 134 && id === 10 && trigger === 0 && (event._pageIndex === 0 || event._pageIndex === 1))
        return { name: 'Window', category: 'objects' };
    // These counters have a separate public prompt for the same dialogue.
    // Publish one NPC at the interaction tile where the player can talk.
    if ((map === 150 || map === 151) && trigger === 0 && (id === 5 || id === 6))
        return id === 6 ? { name: map === 150 ? 'Helly' : 'Shelly', category: 'people', eventAction: 'talk' } : null;
    // The two diners share one conversation beginning with Kitty's line.
    // Navigation follows each physical speaker at their own interaction tile.
    if (map === 186 && trigger === 0 && (id === 15 || id === 16))
        return { name: id === 15 ? 'Jay' : 'Kitty', category: 'people', eventAction: 'talk' };
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
            // The note scene occupies the only north-side action approach
            // to Elder Tater's door. Retain that native floor handoff before
            // the exit's failed-step interaction; nothing bypasses the note.
            return { name: transfer[0], category: 'exits', eventAction: 'bump',
                ...(map === 116 && id === 8 ? { handoffs: [13] } : {}) };
    }
    const floorAction = trigger === 1 && event._priorityType !== 1;
    if (map === 27 && floorAction && [27, 32].includes(id) &&
        list[list.length - 3]?.code === 121 && list[list.length - 3].parameters[0] === 41 && list[list.length - 2]?.code === 214)
        return { name: 'Peak approach', category: 'events', eventAction: 'step', handoffs: [27, 32] };
    const to = (mapId, indent = 0) => list.some(command => command.code === 201 &&
        command.indent === indent && command.parameters[0] === 0 && command.parameters[1] === mapId);
    if ((trigger === 0 || trigger === 1) && SCENE_TRANSFERS[map]?.[id] === event._pageIndex && to(map))
        return { name: map === 103 ? 'Encounter trigger' : 'Scene trigger', category: 'events',
            eventAction: floorAction ? 'step' : trigger === 1 ? 'bump' : undefined };
    if (floorAction) {
        // The quay transfers to a facing tile and the overworld's native
        // boat-positioning event completes boarding there.
        if (map === 26 && id === 5 && event._pageIndex === 1 && list.some(command => command.code === 201 &&
            command.indent === 0 && command.parameters.join(',') === '0,113,17,6,6,0'))
            return { name: 'Board the boat from the quay', category: 'vehicles', eventAction: 'step' };
        // Breaded Bay's west dock selects its port and triggers the
        // overworld's same native boarding service after the transfer.
        if (map === 49 && id === 12 && event._pageIndex === 0 &&
            list[0]?.code === 122 && list[0].parameters.join(',') === '81,81,0,0,1' &&
            list[1]?.code === 121 && list[1].parameters.join(',') === '221,221,0' &&
            list[2]?.code === 201 && list[2].parameters.join(',') === '0,113,36,9,4,0')
            return { name: 'Board the boat from the dock', category: 'vehicles', eventAction: 'step' };
        if (map === 26 && (id === 6 || id === 7) && to(113))
            return { name: 'Return to world map', category: 'exits', eventAction: 'step', handoffs: [6, 7] };
        if (map === 17 && id === 7 && to(19)) return { name: 'Salt Caverns', category: 'exits', eventAction: 'step' };
        if (map === 86 && id === 17 && list.some(command => command.code === 301 && command.indent === 0))
            return { name: 'Island encounter', category: 'events', eventAction: 'step' };
        if (map === 94 && (id === 12 || id === 27) && to(93))
            return { name: 'Road to Mech Office', category: 'exits', eventAction: 'step' };
        if (map === 193 && id === 3 && event._pageIndex === 0 &&
            list.some(command => command.code === 121 && command.indent === 0 &&
                command.parameters.join(',') === '483,483,0') &&
            eventSwitchPage(root.$dataMap?.events?.[id], 1, 483, 98))
            return { name: 'Elevator to the lower landing', category: 'exits', eventAction: 'step' };
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
        if (map === 87 && id === 73) target.handoffs = [102];
        if (map === 55 && id === 2) target.handoffs = [8];
        if (map === 191 && id === 1) target.handoffs = [36];
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
        return { name: 'Elevator to the upper landing', category: 'exits', eventAction: 'step' };
    if (COVERED_CHESTS[map] === id) {
        return trigger === 0 && list.length > 1 && event._characterName === 'Chest'
            ? { name: 'Chest', category: 'treasure' } : null;
    }
    if (trigger !== 0) return undefined;
    if ((id === 4 || id === 5) && WENDYS_RESTAURANTS.has(map) && root.$dataMap?.events?.[id]?.name === 'Kathryn') {
        if (id === 4 && page.image?.characterName === 'NPC - Wendys Staff')
            return { name: 'Kathryn', category: 'people', eventAction: 'talk' };
        // Nuggedor delegates the shop command to its region's common event.
        if (id === 5 && list.some(row => row.code === 302 || row.code === 117 && row.parameters[0] === 46 &&
            root.$dataCommonEvents?.[46]?.list[0]?.code === 302))
            return { name: 'Kathryn', category: 'merchants' };
    }
    // The ice is drawn by MapScene's animated objects, independently of the
    // blank action sprite and any underlying chest.
    if (/^Ice(?:Block|ChestIce|$)/.test(root.$dataMap?.events?.[id]?.name || '') &&
        list.some(({ code, parameters }) => code === 250 && parameters[0]?.name === 'WQ/SFX_IceBlockMelt') &&
        list.some(({ code, parameters }) => code === 357 && parameters[0] === 'MapScene' &&
            parameters[1] === 'AnimatedObjectSetState'))
        return { name: 'Ice block', category: 'objects' };
    const prop = INSPECTED_PROPS[map]?.[id];
    if (prop) return { name: prop, category: 'objects' };
    // The workshop has a book on the desk and two separate cupboards.
    if (map === 120 && (id === 11 || id === 12)) return { name: 'Cupboard', category: 'objects' };
    // This event's editor name describes an item. The visible prop is a drawer.
    if (map === 124 && id === 15) return { name: 'Drawer', category: 'objects' };
    if (map === 138 && id === 4) return { name: 'Book', category: 'objects' };
    if (map === 138 && id === 9) return { name: 'Food basket', category: 'objects' };
    if (map === 195 && id === 4) return { name: 'Clothing', category: 'objects' };
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
        return { name: 'Map board', category: 'objects', ...(mapBoardDirectionsObtained(root, page) ? { directionsObtained: true } : {}) };
    // The base game shows a generic prompt and identifies these only after OK.
    if ((map === 128 && id === 11) || (map === 133 && id === 4))
        return { name: 'Hidden passage button', category: 'objects' };
    return undefined;
}

module.exports = { optionalSceneAvoidance, sunriseSequenceExit, floorClearsOnUse, localDestination, localHandoffName, iceOpensPassage, iceMeltChanges, inactiveFloorScene, passiveFloorPage, concealedDestination,
    visibleChestBarrier, closedRuinsDoorReason, npcPassage,
    chillcrestExit, chillcrestQuestExit, WEST_CHILLCREST, pendingOfficeExit, BREAKFAST_HANDOFFS, WENDYS_RESTAURANTS };
