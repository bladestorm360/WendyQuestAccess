'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { EventEmitter } = require('node:events');
const { createRenderer } = require('../src/runtime/renderer');
const { createAutowalk } = require('../src/world/autowalk');
const { createField } = require('../src/world/field');
const { captureWorld } = require('../src/world/snapshot');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

function verifyArrivalQueue() {
    const word = new Int32Array(new SharedArrayBuffer(4));
    const tasks = [];
    const packets = [];
    const provider = new EventEmitter();
    provider.unref = () => {};
    provider.postMessage = packet => packets.push(packet);
    let now = 0;
    const { notifications } = createRenderer({ makeWord: () => word, schedule: task => tasks.push(task),
        now: () => now, createWorker: () => provider });
    const ready = () => true;
    const walking = notifications.open({ kind: 'fieldStatus', name: 'Walking.' }, ready);
    const arrival = notifications.arrive({ kind: 'fieldStatus', name: 'Arrived.' }, ready, walking);
    notifications.open({ kind: 'interactionPrompt' }, ready);
    notifications.open({ kind: 'mapBanner', name: 'Game saved' }, ready);
    tasks.shift()();
    const epoch = Atomics.load(word, 0);
    assert.deepEqual(packets.map(packet => [formatSpeech(packet), !!packet.append, packet.epoch]), [
        ['Walking.', false, epoch], ['Arrived.', true, epoch], ['Interact', true, epoch], ['Game saved', true, epoch]
    ]);
    for (let count = 0; count < 4; count++) provider.emit('message', 'ack');
    notifications.endArrival(arrival, true);
    assert.equal(Atomics.load(word, 0), 0, 'native load invalidates the old transport epoch');
    assert.equal(packets.at(-1).kind, 'cancel');
    notifications.open({ kind: 'mapBanner', name: 'World map', entering: true }, ready);
    assert.notEqual(packets.at(-1).epoch, epoch);
    assert.equal(packets.at(-1).append, true, 'the transition can follow an already admitted arrival');
    now = 2600;
    notifications.open({ kind: 'mapBanner', name: 'Other map', entering: true }, ready);
    assert(!packets.at(-1).append, 'unrelated later speech uses its original behavior');
    const second = notifications.arrive({ kind: 'fieldStatus', name: 'Arrived.' }, ready);
    notifications.endArrival(second, false);
    notifications.open({ kind: 'interactionPrompt' }, ready);
    assert(!packets.at(-1).append, 'focus loss clears arrival ordering');
    console.log('Verified arrival-first interaction and save speech, native gate retirement, and appended map entry.');
}

async function verifyAutowalk(c, load, verifyWorker) {
    verifyArrivalQueue();
    const { Input, $gameTemp, $gameMessage } = c;
    const scene = c.SceneManager._scene;
    scene._wqaFieldReady = true;
    c.Input = { dir4: 0 };
    const pointer = { valid: false, x: 0, y: 0 };
    c.$gameTemp = { isDestinationValid: () => pointer.valid, clearDestination() { pointer.valid = false; },
        destinationX: () => pointer.x, destinationY: () => pointer.y };
    c.$gameMessage = { isBusy: () => false };
    const preferences = { autowalk: false, speakAutowalkPath: false };
    const reports = [];
    const ready = () => scene._wqaFieldReady && !c.$gamePlayer.isMoving() && !c.$gamePlayer._transferring;
    let reroute;
    const walk = createAutowalk(c, ready, () => preferences, (_scene, record, failed, arrived) => reports.push({ record, failed, arrived }),
        undefined, job => reroute?.(job) === true);
    c.WendyQuestAccessAutowalkInput = walk.input;
    c.WendyQuestAccessFieldMove = walk.moved;
    c.WendyQuestAccessFieldEvent = current => { walk.stop(current); };
    c.WendyQuestAccessSceneLeaving = current => { walk.stop(current); };

    function begin(id, x, y) {
        const fixture = load(id);
        delete fixture.player.direction;
        fixture.player.setPosition(x, y);
        fixture.player._followers = { areGathering: () => false, updateMove() {} };
        return fixture;
    }

    async function route(fixture, id) {
        const view = captureWorld(c);
        const target = view.objects.find(item => item.id === id);
        assert(target);
        const request = { x: view.x, y: view.y, event: target.nearestLanding ? undefined : id, limit: 8, field: true,
            autowalk: true, surface: view.mode === 'ship' || view.mode === 'boat', landing: view.mode === 'airship',
            entryDirection: target.entryDirection };
        let result;
        await verifyWorker(fixture, request, view.live, packet => { result = packet; });
        assert.equal(result.status, 'ready');
        assert.equal(result.course.length, result.distance);
        return { job: { scene, mode: view.mode, target: id, x: view.x, y: view.y },
            result, record: { kind: 'routeDirections', name: target.name, facing: result.arrival.facing,
                legs: result.legs, land: result.land === true } };
    }

    function tick(player) {
        player.moveByInput();
        player._realX = player._x;
        player._realY = player._y;
        player.vehicle()?.syncWithPlayer();
    }
    function position(player) { return [player._x, player._y]; }
    const chamber = begin(197, 14, 16);
    const statue = await route(chamber, 11);
    assert(statue.result.distance > 0);
    const { player, gameMap } = chamber;
    const [x, y] = position(player);
    const first = DIRECTIONS[statue.result.course[0] & 3];
    const expected = [gameMap.roundXWithDirection(x, first), gameMap.roundYWithDirection(y, first)];
    const arm = () => assert(walk.start(statue.job, statue.result, statue.record));
    assert(!walk.start(statue.job, statue.result, statue.record), 'default-off autowalk cannot claim native movement');
    tick(player);
    assert.deepEqual(position(player), [x, y]);
    preferences.autowalk = true;
    arm();
    for (let count = 0; walk.active(scene) && count <= statue.result.distance; count++) tick(player);
    assert.deepEqual(position(player), [statue.result.arrival.x, statue.result.arrival.y]);
    assert.equal(reports.at(-1).arrived, true);
    assert(!reports.at(-1).record?.legs.length, 'arrival never repeats the route');
    assert(!walk.active(scene));

    player.setPosition(x, y);
    arm();
    const manual = DIRECTIONS.find(direction => direction !== first && player.canPass(x, y, direction));
    assert(manual);
    c.Input.dir4 = manual;
    tick(player);
    const overridden = [gameMap.roundXWithDirection(x, manual), gameMap.roundYWithDirection(y, manual)];
    assert.deepEqual(position(player), overridden);
    assert(!walk.active(scene));
    assert.equal(reports.at(-1).record.name, 'Autowalk stopped.', 'manual takeover announces the stop');
    assert.equal(reports.at(-1).arrived, false, 'manual takeover never announces arrival');
    const stoppedReports = reports.length;
    c.Input.dir4 = 0;
    tick(player);
    assert.equal(reports.length, stoppedReports, 'the stopped announcement fires only once');
    assert.deepEqual(position(player), overridden);

    player.setPosition(x, y);
    arm();
    Object.assign(pointer, { x, y, valid: true });
    tick(player);
    assert.deepEqual(position(player), [x, y], 'a pointer destination with zero movement takes priority');
    assert(!walk.active(scene));
    pointer.valid = false;

    const exit = gameMap._events[10];
    const previous = [exit._x, exit._y];
    arm();
    exit.setPosition(...expected);
    tick(player);
    assert.deepEqual(position(player), [x, y]);
    assert.match(formatSpeech(reports.at(-1).record), /next tile is blocked/);
    assert(!exit.isStarting(), 'the blocked step did not bump into the event');
    exit._priorityType = 0;
    arm();
    tick(player);
    assert.deepEqual(position(player), [x, y]);
    assert.match(formatSpeech(reports.at(-1).record), /Floor event one tile/);
    assert(!exit.isStarting());
    exit.setPosition(...previous);

    arm();
    walk.dirty(scene);
    tick(player);
    assert.deepEqual(position(player), [x, y]);
    assert.match(formatSpeech(reports.at(-1).record), /Route changed/);
    arm();
    player.reserveTransfer(206, 9, 16, 2, 0);
    assert(!walk.active(scene));
    tick(player);
    assert.deepEqual(position(player), [x, y]);
    player._transferring = false;

    // A real native actor moves into the next cell. The fresh production
    // worker must route around it, with no stale step, stop speech or arrival.
    const resumes = [];
    reroute = job => { resumes.push(job); return true; };
    player.setPosition(x, y);
    exit._priorityType = 1;
    arm();
    exit.setPosition(...expected);
    const before = reports.length;
    tick(player);
    assert.equal(resumes.length, 1);
    assert.equal(resumes[0], statue.job);
    assert.equal(reports.length, before, 'a continuation is silent and is not an arrival');
    assert.deepEqual(position(player), [x, y], 'never enter the newly blocked cell');
    let refreshed = await route(chamber, 11);
    assert.notEqual(DIRECTIONS[refreshed.result.course[0] & 3], first, 'fresh native collision changes the route');
    assert(walk.start(refreshed.job, refreshed.result, refreshed.record));
    for (let count = 0; walk.active(scene) && count <= refreshed.result.distance; count++) tick(player);
    assert.equal(reports.at(-1).arrived, true);
    exit.setPosition(...previous);

    // Repeated changes have no arbitrary two-refresh stop budget. Each one
    // gets a new bounded worker result from the current accepted position.
    for (let count = 0; count < 4; count++) {
        player.setPosition(x, y);
        refreshed = await route(chamber, 11);
        assert(walk.start(refreshed.job, refreshed.result, refreshed.record));
        walk.dirty(scene);
        tick(player);
        assert.equal(resumes.length, count + 2);
    }
    const target = gameMap._events[11];
    const targetPosition = position(target);
    refreshed = await route(chamber, 11);
    assert(walk.start(refreshed.job, refreshed.result, refreshed.record));
    target.setPosition(target._x + 1, target._y);
    tick(player);
    assert.equal(resumes.length, 6, 'a moving destination also requests a fresh approach');
    target.setPosition(...targetPosition);
    refreshed = await route(chamber, 11);
    assert(walk.start(refreshed.job, refreshed.result, refreshed.record));
    walk.dirty(scene);
    c.Input.dir4 = manual;
    tick(player);
    assert.equal(resumes.length, 6, 'manual movement cancels instead of restarting');
    c.Input.dir4 = 0;
    reroute = null;
    console.log('Verified native moving blockers/targets, fresh worker detour, four silent refreshes and manual cancellation.');

    await verifyFieldRefresh(c, load, verifyWorker, statue.result.arrival);
    await require('./autowalk-cleanup.cjs').verifyCleanupField(c, load, verifyWorker);

    // The reported prop is already one tile away. Arrival has to turn
    // without another step or an automatic action-button event.
    const kitchen = begin(136, 8, 4);
    const pot = await route(kitchen, 9);
    assert.equal(pot.record.name, 'Cooking pot');
    assert.equal(pot.result.distance, 0);
    assert.equal(pot.result.arrival.facing, 8);
    kitchen.player.setDirection(2);
    assert(walk.start(pot.job, pot.result, pot.record));
    tick(kitchen.player);
    assert.deepEqual(position(kitchen.player), [8, 4]);
    assert.equal(kitchen.player.direction(), 8);
    assert.equal(reports.at(-1).arrived, true);
    assert.equal(reports.at(-1).record, null, 'the verified turn replaces manual facing directions');
    const potEvent = kitchen.gameMap._events[9];
    assert(!potEvent.isStarting());
    kitchen.player.checkEventTriggerThere([0, 1, 2]);
    assert(potEvent.isStarting(), 'native confirm targets the cooking pot after the turn');
    potEvent._starting = false;
    // A stale/forged cave continuation must never auto-confirm ordinary maps.
    let outsideActions = 0;
    const outsideCave = { ...pot.job, caveLoot: true, caveWalk: { destination: { id: 9 } },
        caveAction: () => { outsideActions++; return true; } };
    assert(walk.start(outsideCave, pot.result, pot.record));
    tick(kitchen.player);
    assert.equal(outsideActions, 0);
    assert(!potEvent.isStarting(), 'outside-cave props retain player Confirm');

    kitchen.player.setDirection(2);
    assert(walk.start(pot.job, pot.result, pot.record));
    const competingEvent = kitchen.gameMap._events[5];
    competingEvent.setPosition(8, 4);
    competingEvent._priorityType = 0;
    tick(kitchen.player);
    assert.equal(kitchen.player.direction(), 2, 'a new current-tile action invalidates the saved approach');
    assert.equal(reports.at(-1).failed, true);
    assert(!competingEvent.isStarting());

    const point = { ...pot.job, target: undefined, point: true };
    const noFacing = { ...pot.result, arrival: { x: 8, y: 4, facing: null } };
    assert(walk.start(point, noFacing, { ...pot.record, facing: null }));
    tick(kitchen.player);
    assert.equal(kitchen.player.direction(), 2, 'point arrival retains current facing');

    const origin = begin(206, 9, 16);
    const door = await route(origin, 4);
    assert.equal(door.result.autowalkStop, 2);
    assert(walk.start(door.job, door.result, door.record));
    tick(origin.player);
    assert.deepEqual(position(origin.player), [9, 16]);
    assert(!origin.gameMap._events[4].isStarting());
    assert.equal(reports.at(-1).arrived, true);
    assert.match(formatSpeech(reports.at(-1).record), /Move south to activate/);
    let outsideTouches = 0;
    const outsideFloor = { ...door.job, caveWalk: { destination: { id: 4 } }, caveFloor: 4,
        caveAction: () => { outsideTouches++; return true; } };
    assert(walk.start(outsideFloor, door.result, door.record));
    tick(origin.player);
    assert.deepEqual(position(origin.player), [9, 16]);
    assert.equal(outsideTouches, 0);
    assert(!origin.gameMap._events[4].isStarting(), 'outdoor island event remains player-owned');
    c.Input.dir4 = 2;
    tick(origin.player);
    c.Input.dir4 = 0;
    origin.player.checkEventTriggerHere([1, 2]);
    assert(origin.gameMap._events[4].isStarting(), 'manual movement retains the native floor interaction');

    const sailing = begin(113, 35, 9);
    sailing.player._vehicleType = 'ship';
    const ship = sailing.gameMap.ship();
    Object.assign(ship, { _mapId: 113, _x: 35, _y: 9, _driving: true });
    const originalSwitches = c.$gameSwitches.value;
    c.$gameSwitches.value = id => id === 619 || originalSwitches(id);
    const dock = await route(sailing, 51);
    c.$gameSwitches.value = originalSwitches;
    assert.equal(dock.result.autowalkStop, 6);
    assert(walk.start(dock.job, dock.result, dock.record));
    for (let count = 0; walk.active(scene) && count <= dock.result.distance; count++) tick(sailing.player);
    assert.deepEqual(position(sailing.player), [43, 2]);
    assert.equal(sailing.player._vehicleType, 'ship');
    assert.equal(reports.at(-1).arrived, true);
    assert.match(formatSpeech(reports.at(-1).record), /Move east to activate/);

    const flight = begin(113, 48, 6);
    Object.assign(flight.player, { _vehicleType: 'airship', _through: true });
    const aircraft = flight.gameMap.airship();
    Object.assign(aircraft, { _mapId: 113, _x: 48, _y: 6, _driving: true, _altitude: 48 });
    const landing = await route(flight, 517);
    landing.job.nearestLanding = true;
    assert(landing.result.land && landing.result.distance > 0);
    assert(walk.start(landing.job, landing.result, landing.record));
    for (let count = 0; walk.active(scene) && count <= landing.result.distance; count++) tick(flight.player);
    assert.deepEqual(position(flight.player), [landing.result.arrival.x, landing.result.arrival.y]);
    assert.equal(flight.player._vehicleType, 'airship');
    assert.match(formatSpeech(reports.at(-1).record), /Press the action button to land/);

    // Compare repeated equivalent input episodes without narration or devices.
    function measure(enabled) {
        let duration = 0;
        let steps = 0;
        for (let trial = 0; trial < 24; trial++) {
            c.$gameMap = gameMap;
            c.$gamePlayer = player;
            c.$dataMap = chamber.map;
            player.setPosition(x, y);
            if (enabled) arm();
            const time = performance.now();
            for (const encoded of statue.result.course) {
                c.Input.dir4 = enabled ? 0 : DIRECTIONS[encoded & 3];
                tick(player);
                steps++;
            }
            duration += performance.now() - time;
            walk.stop(scene);
            assert.deepEqual(position(player), [statue.result.arrival.x, statue.result.arrival.y]);
        }
        return { duration, steps };
    }
    const base = measure(false);
    const modded = measure(true);
    assert.equal(base.steps, modded.steps);
    console.log(`Throttled ${base.steps} matched native steps: ${base.duration.toFixed(2)} ms manual, ${modded.duration.toFixed(2)} ms autowalk.`);
    c.Input = Input;
    c.$gameTemp = $gameTemp;
    c.$gameMessage = $gameMessage;
    delete c.WendyQuestAccessAutowalkInput;
    delete c.WendyQuestAccessFieldMove;
    delete c.WendyQuestAccessFieldEvent;
    delete c.WendyQuestAccessSceneLeaving;
    console.log('Verified native walking, sailing and flight, manual and pointer priority, floor and collision stops, and transfer retirement.');
}

if (require.main === module) verifyArrivalQueue();
module.exports = { verifyAutowalk };

// Integrate the automatic continuation with the real field worker dispatcher:
// selection, native collision, silent re-entry and stale-response cancellation.
async function verifyFieldRefresh(c, load, verifyWorker, arrival) {
    const saved = Object.fromEntries(['addEventListener', '$gameScreen', '$gameMessage', 'WendyQuestAccessAutowalkInput',
        'WendyQuestAccessFieldMove', 'WendyQuestAccessFieldChanged'].map(key => [key, c[key]]));
    const previousScene = c.SceneManager._scene, app = c.Graphics.app;
    const run = load(197); run.player.setPosition(14, 16); run.gameMap.inactiveTime = 0;
    run.player._followers = { areGathering: () => false, updateMove() {} };
    const renderer = new EventEmitter(), packets = [], records = [];
    const scene = { _wqaFieldReady: true, _wqaMapRestored: true, _mapLoaded: true, _started: true,
        _prevCanMove: true, srcWendy: {}, srcStones: {}, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
    const bookmark = { id: 'refresh', revision: 1, kind: 'point', map: 197, mode: 'walk', name: 'Test approach',
        x: arrival.x, y: arrival.y };
    const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: packet => packets.push(packet) });
    c.SceneManager._scene = scene; c.Graphics.app = { stage: scene, renderer };
    c.addEventListener = () => {}; c.$gameScreen = { _brightness: 255 }; c.$gameMessage = { isBusy: () => false };
    const field = createField(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
        screenFading: () => false, navigationPreferences: () => ({ autowalk: true }), bookmarks: () => [bookmark],
        makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker }, {
        open(record) { records.push(record); return records.length; }, close() {},
        arrive(record) { records.push(record); return records.length; }, endArrival() {}
    });
    c.WendyQuestAccessAutowalkInput = field.autowalk.input;
    c.WendyQuestAccessFieldMove = field.autowalk.moved;
    c.WendyQuestAccessFieldChanged = field.changed;
    const frame = () => renderer.emit('postrender');
    const tick = () => { run.player.moveByInput(); run.player._realX = run.player._x; run.player._realY = run.player._y; };
    async function reply() {
        const packet = packets.at(-1); assert(packet);
        await verifyWorker(run, packet.request, packet.live, result => worker.emit('message', {
            epoch: packet.epoch, sequence: packet.sequence, map: packet.map, result }));
        frame(); return packet;
    }
    scene._wqaSettingsActive = true; assert(field.selectBookmark(scene, bookmark)); scene._wqaSettingsActive = false;
    assert(field.command('directions')); frame();
    // Moving enemies may invalidate more than two worker prefixes. Keep one
    // request in flight, recapture silently, and speak Walking only at start.
    for (let count = 0; count < 4; count++) {
        const packet = packets.at(-1);
        worker.emit('message', { epoch: packet.epoch, sequence: packet.sequence, map: packet.map,
            result: { status: 'enemyBlocked', enemy: 0, arrival: { x: 14, y: 16 }, boundary: 6 } });
        frame(); assert.notEqual(packets.at(-1), packet);
        assert.equal(records.length, 0, 'stale enemy prefixes never ask for another directions key');
    }
    await reply();
    assert(field.autowalk.active(scene));
    const blocker = run.gameMap._events[10], original = [blocker._x, blocker._y];
    // Find the accepted first step, then restore only the fixture player to
    // place an actor there before a fresh copy of the same course executes.
    tick(); const occupied = [run.player._x, run.player._y];
    field.autowalk.stop(scene); run.player.setPosition(14, 16);
    assert(field.command('directions')); frame(); await reply();
    const startingSpeech = records.length;
    blocker._priorityType = 1; blocker.setPosition(...occupied); field.changed(scene, blocker);
    tick(); frame(); const refreshed = packets.at(-1);
    assert(!field.autowalk.active(scene));
    assert(field.controlOwner(scene).autowalkActive, 'pending reroute still owns navigation');
    assert.deepEqual([run.player._x, run.player._y], [14, 16]);
    await reply(); assert(field.autowalk.active(scene));
    assert.equal(records.length, startingSpeech, 'production continuation repeats neither Walking nor the route');
    for (let limit = 0; field.autowalk.active(scene) && limit < 80; limit++) { tick(); frame(); }
    assert.equal(records.at(-1).name, 'Arrived.');
    assert.deepEqual([run.player._x, run.player._y], [arrival.x, arrival.y]);
    blocker.setPosition(...original); run.player.setPosition(14, 16);
    assert(field.command('directions')); frame(); await reply();
    blocker.setPosition(...occupied); tick(); frame();
    const stale = packets.at(-1); assert.notEqual(stale, refreshed);
    field.cancelAutowalk(scene); await reply();
    assert(!field.autowalk.active(scene), 'cancelled pending work cannot restart autowalk');
    blocker.setPosition(...original);
    Object.assign(c, saved); c.SceneManager._scene = previousScene; c.Graphics.app = app;
    console.log('Verified production field silent reroute, retained destination, one final arrival and cancelled-worker rejection.');
}
