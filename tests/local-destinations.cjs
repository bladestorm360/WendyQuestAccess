'use strict';

const assert = require('node:assert/strict');
const { captureWorld, eventTarget } = require('../src/world/snapshot');
const { questDestinationLabel } = require('../src/world/quest-destinations');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { mapPlace } = require('../src/world/map-banner');
const { browse, createDestinationBrowser } = require('../src/world/destinations');

async function verifyLocalDestinations(c, load, verifyRoute, verifyWorker, read) {
    const browser = createDestinationBrowser();
    const snapshot = { x: 2, y: 0, width: 20, height: 20, scrollType: 0, objects: [
        { id: 1, category: 'objects', x: 13, y: 0 },
        { id: 2, category: 'objects', x: 5, y: 0 },
        { id: 3, category: 'objects', x: 2, y: 0 },
        { id: 4, category: 'people', x: 10, y: 0 },
        { id: 5, category: 'people', x: 4, y: 0 },
        { id: 'saved', category: 'bookmarks', x: 0, y: 0, saved: {} }
    ] };
    assert.equal(browse(browser, snapshot, []).target.id, 3);
    assert.equal(browse(browser, snapshot, ['nextDestination']).target.id, 2);
    snapshot.x = 12;
    assert.equal(browse(browser, snapshot, []).target.id, 2, 'the selected ID survives a new order');
    assert.equal(browse(browser, snapshot, ['previousDestination']).target.id, 1);
    assert.equal(browse(browser, snapshot, ['nextCategory']).target.id, 4, 'enter the category at the nearest NPC');
    assert.equal(browse(browser, snapshot, ['previousCategory']).target.id, 1);
    snapshot.x = 19;
    snapshot.scrollType = 2;
    browser.category = 'all';
    assert.equal(browse(browser, snapshot, []).target.id, 'saved', 'local bookmarks use wrapped distance');
    const commonEvents = read('CommonEvents.json');
    const maps = read('MapInfos.json').filter(Boolean);
    assert.equal(maps.length, 239);
    let checked = 0;
    let fallbackCount = 0;
    let icePages = 0;
    const cleanupPages = [0, 0];
    let weatherSetupPages = 0;
    let playtestPages = 0;
    let storyChomps = 0;
    const coveredChests = new Map([[14, 20], [15, 15], [29, 11], [134, 22]]);
    const discoveredCovers = new Map();
    const transfers = new Set();
    const roomNames = new Set();
    for (const { id } of maps) {
        const map = read(`Map${String(id).padStart(3, '0')}.json`);
        for (const event of map.events.filter(Boolean))
            for (const page of event.pages)
                for (const command of page.list)
                    if (command.code === 201 && command.parameters[0] === 0) transfers.add(command.parameters[1]);
    }
    const unsafe = /\b(?:gold|coins?|easter\s*egg|guide to combat|combat\s*volume|locket)\b/i;
    for (const { id, name } of maps) {
        const data = read(`Map${String(id).padStart(3, '0')}.json`);
        const place = mapPlace({ $gameMap: { _mapId: id }, $dataMap: data });
        if (data.displayName.trim()) assert.equal(place, data.displayName.trim());
        else if (place) {
            fallbackCount++;
            assert(transfers.has(id), `Named fallback map ${id} has an authored transfer`);
            assert.doesNotMatch(place, /secret|greyblock|test/i);
        }
        if (transfers.has(id) && !/greyblock|grayblock/i.test(name) &&
            /house|workshop|genericshop|^wendys/i.test(name)) assert(place, `Transferred room ${id} needs a name`);
        if (id >= 117 && id <= 125) {
            assert(place && !roomNames.has(place), 'each Russetwood room has a distinct place name');
            roomNames.add(place);
        }
        const root = { $dataMap: data, $dataCommonEvents: commonEvents, $gameMap: { _mapId: id },
            $gameSwitches: { value: () => false }, $gameSelfSwitches: { value: () => false } };
        for (const entry of data.events) {
            if (!entry) continue;
            for (const [index, page] of entry.pages.entries()) {
                if (entry.name === 'IceChestIce') {
                    for (const { code, parameters } of page.list) {
                        if (code !== 205 || !parameters[1].list.some(move =>
                            move.code === 41 && move.parameters[0] === 'Chest')) continue;
                        if (discoveredCovers.has(id)) assert.equal(discoveredCovers.get(id), parameters[0]);
                        discoveredCovers.set(id, parameters[0]);
                    }
                }
                const weatherSetup = /^NoRain$/i.test(entry.name);
                const playtest = /^Playtest/i.test(entry.name);
                if (page.list.length < 2 || (!weatherSetup && ![0, 1, 2].includes(page.trigger))) continue;
                if ([0, 1, 2].includes(page.trigger)) checked++;
                const event = { _eventId: entry.id, _pageIndex: index, _trigger: page.trigger,
                    _priorityType: page.priorityType, _characterName: page.image.characterName };
                const ordinary = eventTarget(root, 'walk', event, entry, page);
                if (page.trigger <= 1 && page.list.length === 2 && page.list[0].code === 214) {
                    assert.equal(ordinary, null, `erase-only page at map ${id} event ${entry.id}`);
                    cleanupPages[page.trigger]++;
                }
                if (weatherSetup || playtest) {
                    assert.equal(ordinary, null, `excluded event at map ${id} event ${entry.id}`);
                    if (weatherSetup) weatherSetupPages++;
                    else playtestPages++;
                }
                if (entry.name === 'Chomps' && ordinary?.name === 'Chomps' && ordinary.category === 'people')
                    storyChomps++;
                if (page.list.some(({ code, parameters }) =>
                    code === 250 && parameters[0]?.name === 'WQ/SFX_IceBlockMelt')) {
                    assert.deepEqual(ordinary, { name: 'Ice block', category: 'objects' });
                    icePages++;
                }
                if (id === 120 && [11, 12].includes(entry.id)) assert.deepEqual(ordinary, { name: 'Cupboard', category: 'objects' });
                if (id === 124 && entry.id === 15) assert.deepEqual(ordinary, { name: 'Drawer', category: 'objects' });
                if ((id === 128 || id === 195) && entry.id === 9)
                    assert.deepEqual(ordinary, { name: 'Book', category: 'objects' });
                const lease = { page, map: root.$gameMap, trigger: page.trigger, waypoint: false };
                const names = [ordinary?.name, questDestinationLabel(entry, lease, ordinary)];
                for (const name of names) assert(!unsafe.test(name || ''), `unsafe label at map ${id} event ${entry.id} page ${index}`);
                if (ordinary?.category === 'treasure') assert.match(ordinary.name, /^(Chest|Treasure)$/);
                if (ordinary?.category === 'events')
                    assert.equal(ordinary.name, id === 98 && entry.id === 16 ? 'Ride elevator' : 'Scene trigger');
            }
        }
    }
    assert.equal(icePages, 46);
    assert.deepEqual(cleanupPages, [66, 80]);
    console.log('Verified 146 erase-only action and floor pages are omitted across all maps.');
    assert(weatherSetupPages > 1 && playtestPages === 1 && storyChomps > 0);
    console.log(`Excluded ${weatherSetupPages} No Rain setup pages and ${playtestPages} playtest page. Retained ${storyChomps} story Chomps NPC pages.`);
    assert.deepEqual(discoveredCovers, new Map([...coveredChests].filter(([id]) => id !== 29)));
    console.log(`Checked ${icePages} ice interactions and native chest sprite reveals across all maps.`);
    console.log(`Verified ${fallbackCount} fallback place names against native transfers.`);
    console.log(`Checked ${checked} actionable pages on all ${maps.length} maps for spoiler-free pathfinder and quest labels.`);
    const inBattle = c.$gameParty.inBattle;
    c.$gameParty.inBattle = () => false;
    c.$gameMessage = { isBusy: () => false };
    c.$gameSelfSwitches.setValue = (key, value) => {
        const previous = c.$gameSelfSwitches.value;
        c.$gameSelfSwitches.value = check => check.join(',') === key.join(',') ? value : previous(check);
    };
    function select(fixture, event, start, name, category = 'exits') {
        const { gameMap, player, geometry } = fixture;
        player.setPosition(...start);
        const view = captureWorld(c);
        const target = view.objects.find(item => item.id === event);
        assert.equal(target?.name, name, `map ${fixture.id}, event ${event}`);
        assert.equal(target.category, category);
        const request = { x: start[0], y: start[1], event, field: true };
        const result = solveRoute(geometry, view.live, request);
        assert.equal(result.status, 'ready', `map ${fixture.id}, event ${event} from ${start}`);
        verifyRoute(fixture, request, result);
        const source = gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
            setup(list, eventId) {
                Object.assign(this, { _list: list, _eventId: eventId, _mapId: gameMap._mapId, _index: 0, _branch: {} });
            }
        });
        assert(gameMap.setupStartingMapEvent());
        assert.equal(source._eventId, event);
        assert.equal(source._list, gameMap._events[event].list());
        return source;
    }
    function transfer(fixture, event, start, name, destination, landing) {
        const source = select(fixture, event, start, name);
        const { player } = fixture;
        // Resource, dialogue and quest commands stand in for their native
        // completion. Branches and transfer use the installed interpreter.
        for (let count = 0; !player.isTransferring() && count < 40; count++) assert(source.executeCommand());
        assert(player.isTransferring());
        assert.equal(player._newMapId, destination);
        assert.deepEqual([player._newX, player._newY], landing);
    }

    const beachSwitches = [31];
    const beach = load(13, { switches: beachSwitches, self: ['13,5,C', '13,8,A', '13,14,A', '13,20,A'] });
    const beachMap = beach.gameMap;
    const elder = beachMap.event(5);
    elder.setPosition(beachMap.event(21).x + 2, elder.y);
    elder.setThrough(true);
    beachMap.event(8).SetBlocker(-1, -1, 1, 0);
    beach.player.setPosition(beachMap.event(20).x, beachMap.event(20).y + 1);
    const beachView = captureWorld(c);
    const destination = id => {
        const target = beachView.objects.find(item => item.id === id);
        assert(target);
        return { event: id, waypoint: !!target.waypoint, handoffs: target.handoffs };
    };
    const fromBeach = { x: beachView.x, y: beachView.y };
    const candidates = [destination(1), destination(5), destination(7)];
    assert(!beachView.objects.some(item => item.id === 16 && item.category === 'exits'),
        'the current Russetwood dialogue page is not an exit');
    const directCandidates = candidates.map(({ handoffs, ...candidate }) => candidate);
    const availability = entries => findReachable(beach.geometry, beachView.live, { ...fromBeach, candidates: entries });
    assert.deepEqual([...availability(directCandidates).available], [0, 0, 0]);
    assert.deepEqual([...availability(candidates).available], [0, 2, 2]);
    assert.equal(availability([{ ...candidates[1], handoffs: [35] }]).available[0], 0,
        'an unqualified first floor event cannot admit the target');
    function measure(entries) {
        const started = performance.now();
        for (let run = 0; run < 60; run++) availability(entries);
        return performance.now() - started;
    }
    console.log('Throttled 60 matched beach availability requests: %s ms direct, %s ms with floor events.',
        measure(directCandidates).toFixed(2), measure(candidates).toFixed(2));
    const elderRequest = { ...fromBeach, ...candidates[1], field: true };
    const prefix = solveRoute(beach.geometry, beachView.live, elderRequest);
    assert.equal(prefix.status, 'interrupted');
    assert.equal(prefix.boundaryEvent, 30);
    const { x: beachX, y: beachY } = prefix.arrival;
    verifyRoute(beach, { ...fromBeach, targetX: beachX, targetY: beachY }, { ...prefix, status: 'ready' });
    await verifyWorker(beach, elderRequest, beachView.live, result => assert.deepEqual(result, prefix));
    assert(beach.player.canPass(beachX, beachY, prefix.boundary));
    beach.player.setPosition(beachMap.roundXWithDirection(beachX, prefix.boundary),
        beachMap.roundYWithDirection(beachY, prefix.boundary));
    beach.player.checkEventTriggerHere([1, 2]);
    assert.equal(beachMap.events().find(event => event.isStarting()).eventId(), 30);
    const beforeTrigger = { ...fromBeach, field: true, event: 30, stopBeforeEvent: true };
    const trigger = beachView.objects.find(item => item.id === 30 && item.category === 'events');
    assert.equal(trigger?.name, 'Scene trigger');
    assert.equal(trigger.eventAction, 'step');
    assert.equal(availability([beforeTrigger]).available[0], 1);
    assert.deepEqual(solveRoute(beach.geometry, beachView.live, beforeTrigger), prefix);
    await verifyWorker(beach, { ...beforeTrigger, autowalk: true }, beachView.live, result => {
        assert.equal(result.status, 'interrupted');
        assert.equal(result.boundary, prefix.boundary);
        assert.deepEqual(result.arrival, prefix.arrival);
        assert.equal(result.course.length, prefix.distance, 'autowalk excludes the activation step');
    });
    assert(!beachView.objects.some(item => item.category === 'events' && [5, 7].includes(item.id)),
        'the parallel elder page and named transfer are excluded from Events');
    beachSwitches.push(321);
    for (const id of [12, 30]) {
        const pathEvent = beachMap.event(id);
        pathEvent._pageIndex = pathEvent.findProperPageIndex();
        assert.equal(pathEvent._pageIndex, 1);
        assert.equal(pathEvent.list()[0].code, 214);
    }
    const nextView = captureWorld(c);
    assert(!nextView.objects.some(item => [12, 30].includes(item.id)));
    assert(nextView.live.events.filter(event => [12, 30].includes(event.id)).every(event => !event.action));
    const next = solveRoute(beach.geometry, nextView.live, elderRequest);
    assert.equal(next.status, 'interrupted');
    assert.equal(next.boundaryEvent, 35);
    assert(nextView.objects.some(item => item.id === 35 && item.name === 'Scene trigger'));
    beach.player.setPosition(beachMap.event(21).x + 1, beachMap.event(21).y);
    const eastern = captureWorld(c);
    const reached = findReachable(beach.geometry, eastern.live, { x: eastern.x, y: eastern.y, candidates });
    assert.deepEqual([...reached.available], [0, 1, 1]);
    const road = load(13, { switches: [11] });
    const roadEvent = road.gameMap.event(16);
    road.player.setPosition(roadEvent.x - 1, roadEvent.y);
    assert(captureWorld(c).objects.some(item => item.id === roadEvent.eventId() && item.name === 'Road to Russetwood'));
    console.log('Verified native Crispy Beach gate activation, next checkpoint, and direct access on the far side.');

    function eventAvailability(id, switches, events, visible) {
        const fixture = load(id, { switches });
        fixture.player.setPosition(5, 10);
        const view = captureWorld(c);
        for (const eventId of events) {
            assert.equal(view.objects.some(item => item.id === eventId && item.category === 'events'), visible);
            assert.equal(view.live.events.find(item => item.id === eventId)?.action ?? false, visible);
        }
        return { fixture, view };
    }
    const houseScenes = [9, 10, 11, 12, 13];
    eventAvailability(119, [], houseScenes, true);
    for (const switches of [[448], [33], [462]]) {
        const { fixture, view } = eventAvailability(119, switches, houseScenes, false);
        assert(view.objects.some(item => item.id === 3 && item.category === 'exits'));
        const goal = { x: 5, y: 10, targetX: 5, targetY: 11, field: true };
        const route = solveRoute(fixture.geometry, view.live, goal);
        assert.equal(route.status, 'ready');
        verifyRoute(fixture, goal, route);
    }
    eventAvailability(25, [475], [45, 46], true);
    eventAvailability(25, [475, 511], [45, 46], false);
    eventAvailability(25, [475, 33], [45, 46], false);
    const nativeHasItem = c.$gameParty.hasItem;
    try {
        c.$gameParty.hasItem = () => false;
        eventAvailability(25, [], [40, 41], false);
        c.$gameParty.hasItem = item => item === c.$dataItems[2];
        eventAvailability(25, [], [40, 41], true);
        eventAvailability(25, [307], [40, 41], false);
    } finally {
        c.$gameParty.hasItem = nativeHasItem;
    }
    console.log('Verified active, consumed, and cleanup pages in Chillcrest and Frostyna’s house.');

    transfer(load(127), 2, [6, 2], 'Third floor', 128, [6, 11]);
    transfer(load(127, { switches: [503] }), 2, [6, 2], 'Secret room stairs', 195, [6, 11]);
    transfer(load(195), 1, [6, 11], 'Second floor', 127, [6, 2]);
    transfer(load(132), 2, [12, 2], 'Second floor', 133, [12, 9]);
    transfer(load(132, { switches: [525] }), 2, [12, 2], 'Secret room stairs', 203, [12, 11]);
    transfer(load(203), 1, [12, 11], 'First floor', 132, [12, 2]);
    transfer(load(87), 91, [12, 64], 'Hidden cave entrance', 205, [14, 4]);
    transfer(load(87, { self: ['87,91,A'] }), 91, [12, 64], 'Hidden cave entrance', 205, [14, 4]);
    transfer(load(205), 12, [14, 4], 'Return to Caffeine Caverns', 87, [12, 64]);
    for (const [id, event, x, y, gate, index] of [[128, 11, 1, 6, 503, 13], [133, 4, 6, 5, 525, 11]]) {
        const source = select(load(id), event, [x, y], 'Interaction', 'objects');
        let set;
        c.$gameSwitches.setValue = (...values) => { set = values; };
        source._index = index;
        assert.equal(source.currentCommand().code, 121);
        assert(source.executeCommand());
        assert.deepEqual(set, [gate, true]);
    }

    for (const [progress, main] of [[0, 50], [1, 32], [2, 28], [3, 44]]) {
        transfer(load(57, { variables: { 4: progress } }), 13, [7, 4], 'Cauldron entrance', main, [3, 16]);
        transfer(load(51, { variables: { 4: progress } }), 1, [5, 10], 'Return to Cauldron', main, [17, 10]);
        transfer(load(53, { variables: { 4: progress } }), 2, [7, 10], 'Return to Cauldron', main, [39, 10]);
    }
    for (const [progress, main] of [[2, 28], [3, 44]]) {
        transfer(load(55, { variables: { 4: progress } }), 3, [8, 11], 'Return to Cauldron', main, [2, 35]);
    }

    const stopped = load(58);
    stopped.player.setPosition(20, 23);
    const stoppedView = captureWorld(c);
    const request = { x: 20, y: 23, event: 16, field: true, beacon: true, limit: 8 };
    const beforeGuard = solveRoute(stopped.geometry, stoppedView.live, request);
    assert.equal(beforeGuard.status, 'interrupted');
    assert.equal(beforeGuard.arrival.facing, null);
    const target = stoppedView.objects.find(item => item.id === 16);
    assert.match(formatSpeech({ kind: 'routeDirections', name: target.name, legs: beforeGuard.legs,
        boundary: beforeGuard.boundary }), /Floor event one tile/);
    await verifyWorker(stopped, request, stoppedView.live, result => assert.deepEqual(result, beforeGuard));
    const { x, y } = beforeGuard.arrival;
    verifyRoute(stopped, { x: request.x, y: request.y, targetX: x, targetY: y }, { ...beforeGuard, status: 'ready' });
    const nextX = stopped.gameMap.roundXWithDirection(x, beforeGuard.boundary);
    const nextY = stopped.gameMap.roundYWithDirection(y, beforeGuard.boundary);
    stopped.player.setPosition(nextX, nextY);
    stopped.player.checkEventTriggerHere([1, 2]);
    const guard = stopped.gameMap.events().find(event => event.isStarting());
    assert.match(guard.event().name, /^Halt/);
    const guardSource = Object.assign(new c.Game_Interpreter(), { _list: guard.list() });
    guardSource._index = guardSource._list.findIndex(command => command.code === 201);
    assert(guardSource.executeCommand());
    assert.equal(stopped.player._newMapId, 113);

    const guarded = load(57);
    guarded.player.setPosition(20, 23);
    assert.equal(solveRoute(guarded.geometry, captureWorld(c).live, { ...request, event: 14 }).status, 'interrupted');
    const open = load(57, { switches: [81] });
    select(open, 14, [20, 23], 'Side entrance');
    const occupied = load(57, { switches: [81] });
    occupied.player.setPosition(7, 3);
    const reentry = solveRoute(occupied.geometry, captureWorld(c).live, { x: 7, y: 3, event: 13, field: true });
    assert.equal(reentry.status, 'ready');
    assert(reentry.reenter);
    assert.match(formatSpeech({ kind: 'routeDirections', name: 'Cauldron entrance', legs: [], reenter: true }),
        /Walk off this tile and back/);

    for (const [map, id, x, y, progress, index] of [[51, 2, 5, 10, 0, 7], [53, 3, 7, 10, 1, 118],
        [53, 4, 7, 10, 1, 95], [55, 4, 8, 11, 2, 66]]) {
        const fixture = load(map, { variables: { 4: progress } });
        const source = select(fixture, id, [x, y], 'Pull handle', 'objects');
        let result;
        c.$gameVariables.setValue = (...values) => { result = values; };
        source._index = index;
        assert.equal(source.currentCommand().code, 122);
        assert(source.executeCommand());
        assert.deepEqual(result, [4, progress + 1]);
    }
    const spent = load(53, { variables: { 4: 2 } });
    spent.player.setPosition(7, 10);
    assert(!captureWorld(c).objects.some(item => item.name === 'Pull handle'));
    for (const [mapId, ice, x, y] of [[14, 31, 53, 39], [15, 53, 46, 44], [29, 12, 3, 7], [134, 4, 4, 4]]) {
        const chest = coveredChests.get(mapId);
        const self = [`${mapId},${ice},A`];
        const iced = load(mapId, { self });
        iced.player.setPosition(x, y + 1);
        const before = captureWorld(c).objects;
        assert.deepEqual(before.filter(item => item.id === ice).map(({ name, category }) => [name, category]),
            [['Ice block', 'objects']]);
        assert(!before.some(item => item.id === chest), 'blank chest is absent');
        const revealed = load(mapId, { self: [...self, `${mapId},${ice},B`, `${mapId},${chest},B`] });
        revealed.player.setPosition(x, y + 1);
        const prop = revealed.gameMap._events[chest];
        // Execute the visible result of the ice event's native move-route
        // command. Its action page need not update its static page image.
        Object.assign(prop, { _characterName: 'Chest', _x: x, _y: y });
        const after = captureWorld(c).objects;
        assert.deepEqual(after.filter(item => item.id === chest).map(({ name, category }) => [name, category]),
            [['Chest', 'treasure']]);
        assert(!after.some(item => item.id === ice), 'melted ice is no longer actionable');
        const opened = load(mapId, { self: [...self, `${mapId},${ice},B`, `${mapId},${chest},A`] });
        opened.player.setPosition(x, y + 1);
        assert(!captureWorld(c).objects.some(item => item.id === chest), 'opened chest is not a destination');
    }
    const partyMembers = c.$gameParty.members;
    c.$gameParty.members = () => [3];
    const forest = load(15, { switches: [18] });
    forest.player.setPosition(25, 24);
    const forestTargets = captureWorld(c).objects.filter(item => item.name === 'Gate switch');
    assert.deepEqual(forestTargets.map(item => item.id), [31, 32, 33]);
    assert.equal(forest.gameMap._events[17]._pageIndex, 1);
    assert.equal(forest.player.canPass(24, 25, 8), false);
    const opened = load(15, { switches: [18], variables: { 1: 3 } });
    assert.equal(opened.gameMap._events[17]._pageIndex, 2);
    assert.equal(opened.player.canPass(24, 25, 8), true);
    c.$gameParty.members = partyMembers;

    for (const self of [[], ['116,7,A']]) {
        const house = load(116, { self });
        house.player.setPosition(5, 6);
        const targets = captureWorld(c).objects.filter(item => [7, 9, 10].includes(item.id));
        assert.deepEqual(targets.map(item => [item.id, item.name, item.category]),
            [[7, 'Pantry', 'objects'], [9, 'Pantry', 'objects'], [10, 'Pantry', 'objects']]);
    }
    const common = c.$dataCommonEvents;
    c.$dataCommonEvents = commonEvents;
    const world = load(113);
    world.player.setPosition(14, 30);
    const view = captureWorld(c);
    for (const id of [3, 4, 74]) {
        const entries = view.objects.filter(item => item.id === id);
        assert.deepEqual(entries.map(({ name, category }) => [name, category]), [['Russetwood', 'exits']]);
    }
    for (const id of [78, 90, 124, 159, 185]) {
        const entries = view.objects.filter(item => item.id === id);
        assert.deepEqual(entries.map(({ name, category, eventAction }) => [name, category, eventAction]),
            [['Scene trigger', 'events', 'step']]);
    }
    const ruinsAmbush = load(172);
    ruinsAmbush.player.setPosition(5, 5);
    assert.deepEqual(captureWorld(c).objects.filter(item => item.id === 31)
        .map(({ name, category, eventAction }) => [name, category, eventAction]), [['Scene trigger', 'events', 'bump']]);
    const completed = load(113, { self: ['113,159,A', '113,160,A', '113,78,A'] });
    completed.player.setPosition(14, 30);
    assert(!captureWorld(c).objects.some(item => [78, 159, 160].includes(item.id)));
    for (const [id, states] of [[20, {}], [21, { switches: [23] }]]) {
        const ruins = load(16, states);
        ruins.player.setPosition(52, 7);
        const exits = captureWorld(c).objects.filter(item => item.id === id);
        assert.deepEqual(exits.map(({ name, category }) => [name, category]), [['Road to Russetwood', 'exits']]);
    }
    for (const [map, id, floor] of [[23, 2, 'Second floor'], [24, 1, 'First floor'],
        [117, 13, 'Second floor'], [118, 3, 'First floor'], [120, 2, 'Second floor'], [122, 1, 'First floor'],
        [126, 2, 'Second floor'], [127, 1, 'First floor'], [127, 2, 'Third floor'], [128, 1, 'Second floor'],
        [132, 2, 'Second floor'], [133, 1, 'First floor'], [157, 2, 'Second floor'], [158, 1, 'First floor'],
        [195, 1, 'Second floor'], [203, 1, 'First floor']]) {
        const building = load(map);
        building.player.setPosition(2, 2);
        const stairs = captureWorld(c).objects.filter(item => item.id === id);
        assert.deepEqual(stairs.map(({ name, category }) => [name, category]), [[floor, 'exits']], `stairs on map ${map}`);
    }
    for (const self of [[], ['118,12,A', '118,13,A']]) {
        const reading = load(118, { self });
        reading.player.setPosition(9, 9);
        const books = captureWorld(c).objects.filter(item => [12, 13].includes(item.id));
        assert.deepEqual(books.map(({ name, category }) => [name, category]), Array(2).fill(['Book', 'objects']));
    }
    const russetwood = load(12);
    russetwood.player.setPosition(6, 22);
    const townTargets = captureWorld(c).objects;
    assert(townTargets.some(item => item.id === 11 && item.name === 'Barrel'));
    assert(townTargets.some(item => item.id === 17 && item.category === 'people' && item.name === 'Old Bill'));

    const house = load(118);
    house.player.setPosition(11, 13);
    const residents = captureWorld(c).objects.filter(item => item.category === 'people');
    assert.deepEqual(residents.map(({ name, eventAction }) => [name, eventAction]),
        [['Tatoria', 'talk'], ['Frygor', 'talk']]);
    const departed = load(118, { self: ['118,5,A'] });
    departed.player.setPosition(11, 13);
    assert(!captureWorld(c).objects.some(item => item.id === 5), 'Frygor is omitted after the native interaction retires');

    const chillcrest = load(25);
    chillcrest.player.setPosition(20, 20);
    const kara = captureWorld(c).objects.find(item => item.id === 11);
    assert.equal(kara?.category, 'people');
    assert.equal(kara.name, 'Kara');
    assert.equal(kara.eventAction, 'talk');

    const archaeologist = read('Map048.json').events[21];
    const conversation = archaeologist.pages[1];
    const speaker = eventTarget({ $gameMap: { _mapId: 48 } }, 'walk',
        { _eventId: 21, _pageIndex: 1, _trigger: 0 }, archaeologist, conversation);
    assert.deepEqual(speaker, { category: 'people', name: 'Archaeologist', eventAction: 'talk' });
    console.log('Verified unique Russetwood exits, generic ambush and discovery triggers, and spoiler-free books and barrels.');

    for (const [map, id, x, y, kind, switches] of [
        [12, 27, 2, 22, 'exits'], [25, 13, 23, 36, 'exits'], [27, 17, 21, 47, 'exits'],
        [27, 44, 21, 47, 'exits'], [48, 3, 56, 7, 'exits'], [48, 4, 56, 7, 'exits'],
        [48, 10, 30, 8, 'exits'], [48, 16, 34, 30, 'exits'], [76, 64, 15, 1, 'vehicles', [97, 267]],
        [83, 27, 12, 19, 'exits'], [113, 59, 39, 26, 'exits'], [113, 60, 39, 26, 'exits'],
        [113, 63, 41, 39, 'exits'], [113, 64, 39, 39, 'exits'], [116, 8, 5, 6, 'exits'],
        [117, 11, 8, 12, 'exits'], [119, 3, 9, 11, 'exits'],
        [58, 37, 6, 4, 'events', [462]], [58, 38, 6, 4, 'events', [462]], [58, 39, 6, 4, 'events', [462]],
        [76, 64, 15, 1, 'events', [97]]
    ]) {
        const f = load(map, { switches });
        const { gameMap, player, geometry } = f;
        player.setPosition(x, y);
        const view = captureWorld(c);
        const target = view.objects.find(item => item.id === id && item.category === kind);
        assert.equal(target?.eventAction, 'bump', `map ${map}, event ${id}`);
        if (kind === 'events') assert.equal(target.name, 'Scene trigger');
        const request = { x, y, event: id, bumpDirections: target.bumpDirections ?? 15, field: true };
        const route = solveRoute(geometry, view.live, request);
        assert.equal(route.status, 'ready', `map ${map}, event ${id} from ${x},${y}`);
        assert.equal(findReachable(geometry, view.live, { x, y, candidates: [request] }).available[0], 1);
        if (map === 116) {
            assert.equal(target.name, 'Return to Crispy Beach');
            await verifyWorker(f, { ...request, autowalk: true }, view.live, output => {
                assert.deepEqual(output.arrival, route.arrival);
                assert.equal(output.course.length, route.distance);
                assert(!output.autowalkStop);
            });
        }
        if (map === 113 && id === 59) {
            assert.equal(route.arrival.facing, 8);
            assert.notEqual(solveRoute(geometry, view.live, { ...request, bumpDirections: 1 }).status, 'ready');
        }
        verifyRoute(f, { x, y, targetX: route.arrival.x, targetY: route.arrival.y }, route);
        const { x: atX, y: atY, facing } = route.arrival;
        player.setPosition(atX, atY);
        player.facing = facing;
        assert(!player.canPass(atX, atY, facing));
        player.checkEventTriggerTouch(gameMap.roundXWithDirection(atX, facing), gameMap.roundYWithDirection(atY, facing));
        assert.equal(gameMap.events().find(event => event.isStarting())?.eventId(), id);
        assert.match(formatSpeech({ kind: 'routeDirections', name: target.name, legs: route.legs.slice(0, 8), facing,
            bump: true }), /Move (north|south|east|west) to activate/);
    }

    const shore = load(113);
    shore.player.setPosition(46, 0);
    const shoreline = captureWorld(c);
    const fromShore = { x: shoreline.x, y: shoreline.y, event: 94, field: true, stopBeforeEvent: true };
    assert.deepEqual(shoreline.objects.filter(item => item.id === 94).map(item => item.category), ['vehicles']);
    assert.deepEqual([...findReachable(shore.geometry, shoreline.live, { ...fromShore,
        candidates: [{ event: 94, entryDirection: 4 }, { event: 94 }] }).available], [0, 1]);
    // The generic approach is valid native movement, but this side cannot board.
    const shoreRoute = solveRoute(shore.geometry, shoreline.live, fromShore);
    assert.equal(shoreRoute.status, 'interrupted');
    assert.equal(shoreRoute.boundary, 2);
    assert.equal(shoreRoute.boundaryEvent, 94);

    const unlocked = load(113, { switches: [221] });
    unlocked.player.setPosition(46, 0);
    const closedDock = captureWorld(c).objects.filter(item => item.id === 94);
    assert.deepEqual(closedDock.map(item => item.category), ['events'], 'an active floor touch does not promise boarding');
    c.$dataCommonEvents = common;
    console.log('Verified all audited solid transfers, native approach directions, and the generic Cauldron and dock entries.');

    delete c.$gameSwitches.setValue;
    delete c.$gameSelfSwitches.setValue;
    delete c.$gameVariables.setValue;
    delete c.$gameMessage;
    c.$gameParty.inBattle = inBattle;
    console.log('Verified gated house stairs, both native cave entrances, Cauldron variants and pull handles, and native floor-event interruption.');
}

module.exports = { verifyLocalDestinations };
