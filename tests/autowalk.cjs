'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { EventEmitter } = require('node:events');
const { createRenderer } = require('../src/runtime/renderer');
const { createAutowalk } = require('../src/world/autowalk');
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
    const walk = createAutowalk(c, ready, () => preferences, (_scene, record, failed, arrived) => reports.push({ record, failed, arrived }));
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
    c.Input.dir4 = 0;
    tick(player);
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
