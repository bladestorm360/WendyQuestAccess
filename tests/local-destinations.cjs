'use strict';

const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

async function verifyLocalDestinations(c, load, verifyRoute, verifyWorker) {
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

    const beach = load(13, { switches: [31, 321], self: ['13,5,C', '13,8,A', '13,14,A', '13,20,A'] });
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
    assert(!beachView.objects.some(item => item.id === 16), 'the current Russetwood dialogue page is not an exit');
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
    const pathEvent = beachMap.event(30);
    pathEvent.setupPage = () => {}; // Only the erased flag affects the next route.
    const interpreter = Object.assign(new c.Game_Interpreter(), { _mapId: 13, _eventId: 30, _list: pathEvent.list(), _index: 0 });
    assert(interpreter.executeCommand());
    assert.equal(pathEvent._erased, true);
    const nextView = captureWorld(c);
    const next = solveRoute(beach.geometry, nextView.live, { ...elderRequest, x: nextView.x, y: nextView.y });
    assert.equal(next.status, 'interrupted');
    assert.equal(next.boundaryEvent, 35);
    beach.player.setPosition(beachMap.event(21).x + 1, beachMap.event(21).y);
    const eastern = captureWorld(c);
    const reached = findReachable(beach.geometry, eastern.live, { x: eastern.x, y: eastern.y, candidates });
    assert.deepEqual([...reached.available], [0, 1, 1]);
    const road = load(13, { switches: [11] });
    const roadEvent = road.gameMap.event(16);
    road.player.setPosition(roadEvent.x - 1, roadEvent.y);
    assert(captureWorld(c).objects.some(item => item.id === roadEvent.eventId() && item.name === 'Road to Russetwood'));
    console.log('Verified native Crispy Beach gate activation, next checkpoint, and direct access on the far side.');

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
        const source = select(load(id), event, [x, y], 'Hidden passage button', 'objects');
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

    delete c.$gameSwitches.setValue;
    delete c.$gameSelfSwitches.setValue;
    delete c.$gameVariables.setValue;
    delete c.$gameMessage;
    c.$gameParty.inBattle = inBattle;
    console.log('Verified gated house stairs, both native cave entrances, Cauldron variants and pull handles, and native floor-event interruption.');
}

module.exports = { verifyLocalDestinations };
