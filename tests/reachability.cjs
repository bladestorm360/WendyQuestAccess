'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { captureWorld } = require('../src/world/snapshot');
const { browse, createDestinationBrowser } = require('../src/world/destinations');
const { COUNTER, PASSAGE } = require('../src/world/geometry.cjs');
const { findReachable, solveRoute } = require('../src/world/routes.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

async function verifyReachability(c, load, verifyWorker) {
    const salt = load(19);
    salt.player.setPosition(26, 12);
    const view = captureWorld(c);
    const request = { x: 26, y: 12, candidates: [{ event: 114 }, { event: 97 }, { event: 2 }] };
    const result = findReachable(salt.geometry, view.live, request);
    assert.deepEqual([...result.available], [1, 0, 0]);
    await verifyWorker(salt, request, view.live, output => assert.deepEqual(output, result));
    assert.equal(findReachable(salt.geometry, view.live, request, () => true).status, 'cancelled');

    const guard = load(58);
    guard.player.setPosition(20, 23);
    const guardView = captureWorld(c);
    const destination = { x: 20, y: 23, event: 16, field: true };
    const blocked = solveRoute(guard.geometry, guardView.live, destination);
    assert.equal(blocked.status, 'interrupted');
    const blockedTargets = { ...destination, candidates: [{ event: 16 }, { event: blocked.boundaryEvent }] };
    assert.deepEqual([...findReachable(guard.geometry, guardView.live, blockedTargets).available], [0, 1]);
    assert(!view.objects.some(item => item.id === 17 || item.id === 93),
        'the broad cave list excludes weather setup and the playtest conversation');
    const speechMap = load(183);
    const actor = speechMap.gameMap.event(8);
    speechMap.player.setPosition(actor.x, actor.y + 1);
    const dialogueView = captureWorld(c);
    const matching = dialogueView.objects.filter(item => item.id === actor.eventId());
    assert.equal(matching.length, 1);
    const [conversation] = matching;
    assert.equal(conversation.category, 'people');
    assert.equal(conversation.name, 'Chomps');
    assert.equal(conversation.eventAction, 'talk');
    const talk = { x: dialogueView.x, y: dialogueView.y, field: true, event: actor.eventId() };
    assert.equal(findReachable(speechMap.geometry, dialogueView.live, { ...talk, candidates: [talk] }).available[0], 1);
    const talkRoute = solveRoute(speechMap.geometry, dialogueView.live, talk);
    assert.equal(talkRoute.status, 'ready');
    assert(talkRoute.arrival.facing);
    assert.match(formatSpeech({ kind: 'routeDirections', name: conversation.name, legs: talkRoute.legs,
        facing: talkRoute.arrival.facing, conversation: true }), /^Chomps\. .*press the action button to talk\.$/);
    const opened = load(57, { switches: [81] });
    opened.player.setPosition(20, 23);
    assert.equal(findReachable(opened.geometry, captureWorld(c).live,
        { x: 20, y: 23, candidates: [{ event: 14 }] }).available[0], 1);

    const coast = load(113);
    coast.player._vehicleType = 'ship';
    coast.player.setPosition(43, 2);
    Object.assign(coast.gameMap.ship(), { _mapId: 113, _x: 43, _y: 2, _driving: true });
    const shipView = captureWorld(c);
    const docks = { x: 43, y: 2, candidates: [{ event: 51, entryDirection: 6 }, { event: 51, entryDirection: 4 },
        { event: 30 }, { event: 31 }] };
    const boatMask = findReachable(coast.geometry, shipView.live, docks).available;
    assert.equal(boatMask[0], 1);
    assert.equal(boatMask[1], 0);
    for (let index = 0; index < docks.candidates.length; index++) {
        assert.equal(!!boatMask[index], solveRoute(coast.geometry, shipView.live, { x: docks.x, y: docks.y,
            ...docks.candidates[index], field: true, surface: true }).status === 'ready');
    }
    coast.player._vehicleType = 'airship';
    coast.player._through = true;
    coast.player.setPosition(43, 28);
    Object.assign(coast.gameMap.airship(), { _mapId: 113, _x: 43, _y: 28, _driving: true, _altitude: 48 });
    const airView = captureWorld(c);
    const flight = { x: 43, y: 28, candidates: airView.objects.map(item => item.nearestLanding ?
        { nearestLanding: true } : { event: item.id }) };
    const airStart = performance.now();
    const flightMask = findReachable(coast.geometry, airView.live, flight).available;
    const airElapsed = performance.now() - airStart;
    assert(flight.candidates.length > 20);
    for (let index = 0; index < flight.candidates.length; index++) {
        assert.equal(!!flightMask[index], solveRoute(coast.geometry, airView.live, { x: flight.x, y: flight.y,
            ...flight.candidates[index], field: true, landing: true }).status === 'ready');
    }

    const stacked = load(19);
    const [here, wall] = [stacked.gameMap._events[97], stacked.gameMap._events[114]];
    Object.assign(here, { _x: 1, _y: 0, _priorityType: 0, _trigger: 0, _through: true, _starting: false });
    Object.assign(wall, { _x: 2, _y: 0, _priorityType: 1, _trigger: 0, _through: false, _starting: false });
    stacked.gameMap._events = [here, wall];
    stacked.player.setPosition(1, 0);
    stacked.player.facing = 6;
    c.Input = { isTriggered: key => key === 'ok' };
    c.Tyruswoo.TileControl.param = {};
    let native;
    stacked.gameMap._interpreter = { setup(_list, id) { native = id; } };
    stacked.gameMap.setupStartingEvent = stacked.gameMap.setupStartingMapEvent;
    assert(stacked.player.triggerButtonAction());
    assert.equal(native, here._eventId, 'the installed OK path accepts the current tile before the facing event');

    const small = { width: 3, height: 1, scrollType: 0, cells: new Uint8Array(3).fill(PASSAGE) };
    const approach = { mode: 'walk', terrain: [], vehicles: [], events: [
        { id: 97, x: 1, y: 0, normal: false, through: true, trigger: 0, action: true },
        { id: 114, x: 2, y: 0, normal: true, through: false, trigger: 0, action: true }
    ] };
    const origin = { x: 0, y: 0, field: true };
    const candidates = [{ event: 97 }, { event: 114 }];
    assert.deepEqual([...findReachable(small, approach, { ...origin, candidates }).available], [1, 0]);
    assert.equal(solveRoute(small, approach, { ...origin, event: 114 }).status, 'unreachable');
    small.cells[1] |= COUNTER;
    assert.equal(findReachable(small, approach, { ...origin, candidates }).available[1], 1);
    assert.deepEqual(solveRoute(small, approach, { ...origin, event: 114 }).arrival, { x: 0, y: 0, facing: 6 });

    const browser = createDestinationBrowser();
    const selected = { id: 114, category: 'objects', name: 'Wall clue', x: 2, y: 0 };
    assert.equal(browse(browser, { ...origin, objects: [selected] }, []).target, selected);
    assert.equal(browse(browser, { ...origin, objects: [], eligibleObjects: [selected] }, []).status,
        'Selected destination is out of reach');
    assert.equal(browse(browser, { ...origin, objects: [selected] }, []).target, selected,
        'the independent directions request can still explain the selected approach');

    const elder = { id: 5, category: 'people', name: 'Elder Tater', x: 0, y: 1, waypoint: true };
    const marker = { ...elder, category: 'quests', name: 'Quest marker near Elder Tater' };
    const bookmark = { id: 'bookmark-1', category: 'bookmarks', name: 'Beach stop', saved: true };
    const all = createDestinationBrowser();
    all.category = 'all';
    const mixed = { ...origin, objects: [marker, elder, bookmark] };
    assert.equal(browse(all, mixed, []).target, elder, 'All prefers the ordinary identity for the same event');
    assert.equal(browse(all, mixed, ['nextDestination']).target, bookmark, 'All keeps the separate saved bookmark');
    assert.equal(browse(all, mixed, ['nextDestination']).target, elder, 'All has no duplicate aliases');
    assert.equal(browse(all, { ...mixed, objects: [], eligibleObjects: [elder, marker] }, []).status,
        'Selected destination is out of reach');

    const dense = { width: 44, height: 32, scrollType: 0, cells: new Uint8Array(44 * 32).fill(PASSAGE) };
    const events = Array.from({ length: 48 }, (_, index) => ({ id: index + 1, x: 2 + (index % 12) * 3,
        y: 2 + Math.floor(index / 12) * 5, normal: true, trigger: 0, action: true }));
    const live = { mode: 'walk', terrain: [], vehicles: [], events };
    const input = { x: 1, y: 1, candidates: events.map(event => ({ event: event.id })) };
    const start = performance.now();
    const batch = findReachable(dense, live, input);
    const elapsed = performance.now() - start;
    assert.equal(batch.available.reduce((total, flag) => total + flag, 0), 48);
    console.log('Verified installed floor-event boundaries, native OK priority, counter approaches and restored eligibility.');
    console.log('48-target synthetic availability request: %s ms under the bounded runner.', elapsed.toFixed(2));
    console.log('%s actual world-map flight destinations: %s ms for the full availability batch.', flight.candidates.length,
        airElapsed.toFixed(2));
}

module.exports = { verifyReachability };
