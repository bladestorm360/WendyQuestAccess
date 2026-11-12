'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
const { bake } = require('../tools/bake-world.cjs');
const { bakeMap, decodeMap, composeWorld, indexOf, DIRECTIONS, step, surface } = require('../src/world/geometry.cjs');
const { solveRoute } = require('../src/world/routes.cjs');
const { warningApproach, captureMotion } = require('../src/world/puzzles/cave');
const { verifyCaveProgression } = require('./cave-progression.cjs');
const { verifyLocalDestinations } = require('./local-destinations.cjs');
const { verifyVehicleNavigation } = require('./vehicle-navigation.cjs');
const { copyPatrol } = require('../src/world/puzzles/patrol-motion.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('../src/world/puzzles/motion-world.cjs');
const { previewCrossing } = require('../src/world/puzzles/crossing.cjs');
const { createAudio, CUE } = require('../src/runtime/audio');
const { createWallAudio } = require('../src/world/wall-audio');
const { createBeacon } = require('../src/world/beacon');
const { createCaveTiming } = require('../src/world/cave-timing');

const game = path.resolve(process.argv[2]);
const derived = path.resolve(process.argv[3]);
const data = path.join(game, 'package.nw', 'data');
const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
const tilesets = read('Tilesets.json');
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning', path.join(__dirname, 'world-producers.py'), game],
    { encoding: 'utf8', timeout: 7000, maxBuffer: 160000 }));
const c = vm.createContext({
    a15_0x363c12() { throw new Error('Unresolved movement property'); },
    _0x34cc1b() { throw new Error('Unresolved tile property'); },
    Game_Map: function () {}, Game_CharacterBase: function () {}, Game_Character: function () {},
    Game_Player: function () {}, Game_Event: function () {}, Game_Vehicle: function () {}, Tilemap: function () {},
    Game_Followers: function () {}, Game_Interpreter: function () {}, Scene_Map: function () {},
    TileEditor: {}, SceneManager: { _scene: { _spriteset: {} } }, Point: function (x, y) { this.x = x; this.y = y; },
    Time: { GetDeltaTime: () => 1 / 60 }, $dataTilesets: tilesets, $dataItems: read('Items.json'), $dataSystem: read('System.json'),
    Graphics: { width: 480, height: 336 },
    $gameSwitches: { value: () => false }, $gameSelfSwitches: { value: () => false },
    $gameVariables: { value: () => 0 }, $gameActors: { actor: id => id }, $gameParty: { hasItem: () => false, members: () => [] },
    $dataCommonEvents: [],
    $gameTileChanges: {}, Tyruswoo: { TileControl: { tileIdExists: (set, id) => Number.isInteger(tilesets[set].flags[id]) } }
});
Object.setPrototypeOf(c.Game_Character.prototype, c.Game_CharacterBase.prototype);
for (const cls of [c.Game_Player, c.Game_Event, c.Game_Vehicle]) Object.setPrototypeOf(cls.prototype, c.Game_Character.prototype);
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
c.Game_Player.prototype.isDebugThrough = () => false;
c.Game_Event.prototype.lock = () => {};
c.Game_CharacterBase.prototype.updateAnimation = () => {};
c.Game_CharacterBase.prototype.refreshBushDepth = () => {};
c.Game_Map.prototype.isEventRunning = () => false;
c.Game_Map.prototype.mapToEdit = () => c.$dataMap;
c.Game_Map.prototype.linkedTilesetId = () => c.$dataMap.tilesetId;
c.Game_Map.prototype.editingMapId = function () { return this._mapId; };
c.Game_Map.prototype.isTileEditingLocal = () => true;

function load(id, states = {}) {
    c.$gameTileChanges = {};
    c.$gameSwitches.value = key => states.switches?.includes(key) === true;
    c.$gameSelfSwitches.value = key => states.self?.includes(key.join(',')) === true;
    c.$gameVariables.value = key => states.variables?.[key] ?? 0;
    c.$dataMap = read(`Map${String(id).padStart(3, '0')}.json`);
    const map = c.$dataMap;
    const gameMap = c.$gameMap = Object.assign(new c.Game_Map(), { _mapId: id, _tilesetId: map.tilesetId });
    gameMap._events = map.events.map(entry => {
        if (!entry) return null;
        const event = Object.assign(new c.Game_Event(), { _mapId: id, _eventId: entry.id, _x: entry.x, _y: entry.y });
        event._pageIndex = event.findProperPageIndex();
        const page = event.page();
        Object.assign(event, { _through: page ? page.through : true, _priorityType: page?.priorityType ?? 0,
            _tileId: page?.image.tileId ?? 0, _trigger: page?.trigger, _erased: false, _starting: false });
        return event;
    });
    gameMap._vehicles = ['boat', 'ship', 'airship'].map(type => Object.assign(new c.Game_Vehicle(), {
        _type: type, _mapId: -1, _x: 0, _y: 0, _through: false
    }));
    const player = c.$gamePlayer = Object.assign(new c.Game_Player(), { _vehicleType: 'walk', _through: false });
    player.direction = () => player.facing;
    Object.defineProperties(player, { x: { get: () => player._x }, y: { get: () => player._y } });
    for (const event of gameMap.events()) {
        Object.defineProperties(event, { x: { get: () => event._x }, y: { get: () => event._y } });
    }
    gameMap.refreshTileEvents();
    const geometry = decodeMap(id, fs.readFileSync(path.join(derived, `${id}.wqg`)));
    assert.deepEqual(geometry, bakeMap(map, tilesets[map.tilesetId].flags));
    return { id, map, gameMap, player, geometry };
}

function snapshot(fixture) {
    const { map, id, gameMap, player } = fixture;
    const flags = gameMap.tilesetFlags();
    const count = map.width * map.height;
    const terrain = [];
    const changed = new Set(Object.keys(c.$gameTileChanges[id] || {}).map(cell => Number(cell) % count));
    for (const cell of changed) {
        terrain.push([cell % map.width, Math.floor(cell / map.width), surface(flags[map.data[3 * count + cell]],
            flags[map.data[2 * count + cell]], flags[map.data[count + cell]], flags[map.data[cell]], map.data[5 * count + cell])]);
    }
    const events = gameMap.events().map(event => {
        const box = event.blockerProperties;
        return { id: event._eventId, x: event.x, y: event.y, normal: event.isNormalPriority(), through: event.isThrough(),
            erased: event._erased, tileFlag: event.isTile() ? flags[event.tileId()] : undefined,
            rectangle: box && [event.x + box.x1, event.y + box.y1, event.x + box.x2, event.y + box.y2],
            trigger: event._trigger, action: !!event.page() && event.list().length > 1 };
    });
    const vehicles = gameMap._vehicles.slice(0, 2).filter(vehicle => vehicle._mapId === id)
        .map(vehicle => ({ x: vehicle._x, y: vehicle._y, through: vehicle.isThrough() }));
    return { mode: player._vehicleType, through: player.isThrough(), terrain, events, vehicles };
}

let compared = 0;
function compare(fixture) {
    const { geometry, player } = fixture;
    const world = composeWorld(geometry, snapshot(fixture));
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
        const cell = indexOf(world, x, y);
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const actual = step(world, cell, heading) >= 0;
            const expected = player.canPass(x, y, DIRECTIONS[heading]);
            if (actual !== expected) throw new Error(`Movement differs on map ${fixture.id} at ${x},${y} heading ${DIRECTIONS[heading]}`);
            compared++;
        }
    }
    return world;
}

function verifyRoute(fixture, request, result) {
    const { gameMap, player } = fixture;
    assert.equal(result.status, 'ready');
    let { x, y } = request;
    let distance = 0;
    for (const leg of result.legs) for (let n = 0; n < leg.tiles; n++) {
        assert(player.canPass(x, y, leg.direction));
        x = gameMap.roundXWithDirection(x, leg.direction);
        y = gameMap.roundYWithDirection(y, leg.direction);
        if (request.area) {
            const [left, top, right, bottom] = request.area;
            assert(x >= left && x <= right && y >= top && y <= bottom);
        }
        distance++;
    }
    assert.equal(distance, result.distance);
    assert.equal(x, result.arrival.x);
    assert.equal(y, result.arrival.y);
    if (request.event) {
        Object.assign(player, { _x: x, _y: y, facing: result.arrival.facing });
        for (const event of gameMap.events()) event._starting = false;
        const trigger = gameMap._events[request.event]._trigger;
        if (player.facing === null) player.checkEventTriggerHere(trigger === 0 ? [0] : [1, 2]);
        else if (trigger === 0) player.checkEventTriggerThere([0, 1, 2]);
        else player.checkEventTriggerTouch(gameMap.roundXWithDirection(x, player.facing), gameMap.roundYWithDirection(y, player.facing));
        const first = gameMap.events().find(event => event.isStarting());
        assert.equal(first?._eventId, request.event);
    } else assert.deepEqual([x, y], [request.targetX, request.targetY]);
}

function verifyPatrolContact() {
    const { map, gameMap, player } = load(196);
    const patrol = gameMap._events[4];
    const checkpoint = gameMap._events[21];
    const firstStep = patrol.page().moveRoute.list[0];
    const direction = [0, 2, 4, 6, 8][firstStep.code];
    assert(direction);
    const x = gameMap.roundXWithDirection(patrol.x, direction);
    const y = gameMap.roundYWithDirection(patrol.y, direction);
    player._followers = new c.Game_Followers();
    Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y });
    patrol._jumpCount = 0;

    patrol.checkEventTriggerTouch(x, y + 1);
    assert(!patrol.isStarting(), 'looking at an adjacent tile does not trigger patrol contact');
    patrol.moveStraight(direction);
    assert(!patrol.isMovementSucceeded());
    assert(patrol.isStarting(), 'a blocked patrol step into the player triggers the encounter');
    assert.equal(patrol.list()[0].code, 117);
    assert.equal(patrol.list()[0].parameters[0], 102);

    patrol._starting = false;
    c.Game_CharacterBase.prototype.moveStraight.call(player, player.reverseDir(direction));
    assert(!player.isMovementSucceeded());
    assert(patrol.isStarting(), 'walking into a patrol triggers the same encounter from the player side');
    assert.equal(player._followers.isSomeoneCollided(x, y), false);

    patrol._starting = false;
    gameMap.isEventRunning = () => true;
    patrol.checkEventTriggerTouch(x, y);
    player.checkEventTriggerTouch(patrol.x, patrol.y);
    assert(!patrol.isStarting(), 'a running map interpreter already owns contact');
    gameMap.isEventRunning = () => false;

    Object.assign(player, { _x: checkpoint.x, _y: checkpoint.y });
    player.checkEventTriggerHere([1, 2]);
    assert(checkpoint.isStarting(), 'the checkpoint is a floor trigger');
    assert.equal(map.events[21].pages[0].trigger, 1);

    const disabled = load(196, { switches: [590] });
    const stopped = disabled.gameMap._events[4];
    Object.assign(disabled.player, { _x: x, _y: y });
    assert.equal(stopped._pageIndex, 1);
    stopped.checkEventTriggerTouch(x, y);
    disabled.player.checkEventTriggerTouch(stopped.x, stopped.y);
    assert(!stopped.isStarting(), 'the native caught page disables repeat contact');
}

function verifyWallFeedback() {
    const scene = c.SceneManager._scene;
    const options = { enabled: true, wall: true, hrtf: true, wallVolume: 45 };
    const worker = new EventEmitter();
    const requests = [];
    const queue = [];
    const word = new Int32Array(new SharedArrayBuffer(4));
    worker.unref = () => {};
    worker.postMessage = request => requests.push(request);
    const audio = createAudio({ makeWord: () => word, createAudioWorker: () => worker, schedule: task => queue.push(task) });
    const wall = createWallAudio(c, (scene, moving) => moving && scene._wqaFieldReady &&
        !scene._wqaSettingsActive && c.$gamePlayer._vehicleType === 'walk', audio, () => options);
    c.WendyQuestAccessFieldMove = (scene, motion, success) => wall.move(scene, motion, success);
    c.WendyQuestAccessFieldEvent = scene => wall.interrupt(scene);
    c.Input = { dir4: 0 };
    c.$gameTemp = { clearDestination() {}, isDestinationValid: () => false };
    c.$gameMessage = { isBusy: () => false };
    c.Graphics.frameCount = 100;
    c.Graphics._wqaWallEnabled = true;
    scene._wqaFieldReady = true;
    const { gameMap, player } = load(19);
    const place = (x, y, dir = 2) => Object.assign(c.$gamePlayer, { _x: x, _y: y, _realX: x, _realY: y,
        _direction: dir, _followers: { areGathering: () => false, updateMove() {} } });
    const press = (direction, frame = c.Graphics.frameCount) => {
        c.Graphics.frameCount = frame;
        c.Input.dir4 = direction;
        c.$gamePlayer.moveByInput();
    };
    const send = () => {
        while (queue.length) queue.shift()();
        return requests.at(-1);
    };
    const ack = request => worker.emit('message', { epoch: request.epoch, status: 2 });
    const follow = (x, y, d) => [gameMap.roundXWithDirection(x, d), gameMap.roundYWithDirection(y, d)];
    const side = (x, y, d) => !gameMap.isValid(...follow(x, y, d)) || !player.isMapPassable(x, y, d);
    const still = () => [player._x, player._y];
    let corner;
    let edge;
    for (let y = 0; y < gameMap.height(); y++) {
        for (let x = 0; x < gameMap.width(); x++) {
            if (gameMap.eventsXyNt(x, y).length) continue;
            const [eastX, eastY] = follow(x, y, 6);
            if (!gameMap.isValid(eastX, eastY) || !player.canPass(x, y, 6)) continue;
            if (!corner && side(x, y, 8) && !gameMap.eventsXyNt(...follow(x, y, 8)).length) corner = [x, y];
            if (!edge && side(x, y, 8) && side(eastX, eastY, 8) && !side(x, y, 2)) edge = [x, y];
        }
    }
    assert(corner && edge);
    place(...corner);
    wall.arm(scene);
    const prepare = send();
    assert.equal(prepare.cue, CUE.prepare);
    press(8);
    assert.equal(send(), prepare, 'a cold step must not turn into a delayed sound');
    ack(prepare);
    assert.equal(Atomics.load(word, 0), 0);
    press(8, 101);
    const bump = send();
    assert.deepEqual(still(), corner);
    assert.equal(player.isMovementSucceeded(), false);
    assert.deepEqual([bump.cue, bump.right, bump.forward, bump.gain], [CUE.wallBump, 0, 1, 0.45]);
    ack(bump);
    press(8, 102);
    assert.equal(send(), bump);
    press(8, 119);
    const again = send();
    assert.notEqual(again.epoch, bump.epoch);
    ack(again);
    wall.expire(scene);
    assert.equal(Atomics.load(word, 0), 0);

    place(...edge);
    press(6, 140);
    assert.equal(player.isMovementSucceeded(), true);
    assert.deepEqual(still(), follow(...edge, 6));
    const brush = send();
    assert.deepEqual([brush.cue, brush.right, brush.forward], [CUE.wallBrush, -1, 0]);
    ack(brush);
    scene._wqaSettingsActive = true;
    place(...corner);
    press(8, 160);
    assert.equal(send(), brush);
    wall.leave(scene);
    assert.equal(Atomics.load(word, 0), 0);
    scene._wqaSettingsActive = false;

    press(8, 170);
    const beforeContact = send();
    assert.notEqual(beforeContact.epoch, brush.epoch);
    ack(beforeContact);
    assert.equal(Atomics.load(word, 0), beforeContact.epoch);
    const cave = load(196);
    const patrol = cave.gameMap._events[4];
    patrol.lock = () => assert.equal(Atomics.load(word, 0), 0, 'close before native event lock');
    const towardPlayer = [0, 2, 4, 6, 8][patrol.page().moveRoute.list[0].code];
    place(cave.gameMap.roundXWithDirection(patrol.x, towardPlayer), cave.gameMap.roundYWithDirection(patrol.y, towardPlayer));
    press(10 - towardPlayer, 180);
    assert(patrol.isStarting());
    assert.equal(cave.player.isMovementSucceeded(), false);
    assert.equal(send(), beforeContact, 'the native patrol encounter must preempt the wall tone');
    assert.equal(Atomics.load(word, 0), 0);

    load(19);
    place(...corner);
    function attempts(enabled, base) {
        c.Graphics._wqaWallEnabled = enabled;
        wall.leave(scene);
        const start = performance.now();
        for (let i = 0; i < 120; i++) {
            press(8, base + i);
            if (queue.length) ack(send());
            if (scene._wqaWallUntil && c.Graphics.frameCount >= scene._wqaWallUntil) wall.expire(scene);
        }
        return performance.now() - start;
    }
    const baseline = attempts(false, 300);
    const withCue = attempts(true, 600);
    wall.leave(scene);
    scene._wqaFieldReady = false;
    c.Graphics._wqaWallEnabled = false;
    console.log(`Throttled 120 native blocked attempts: ${baseline.toFixed(2)} ms baseline, ${withCue.toFixed(2)} ms with silent wall requests.`);
}

async function verifyNativeBeacon() {
    const fixture = load(196);
    const { player, gameMap, geometry } = fixture;
    for (const event of gameMap.events()) event._moveRoute = event.page()?.moveRoute;
    const live = snapshot(fixture);
    const sign = 2;
    const area = warningApproach(gameMap, 11, 49, sign);
    assert(area);
    const connected = [[11, 49]];
    const seen = new Set(['11,49']);
    for (let i = 0; i < Math.min(connected.length, 30); i++) {
        const [x, y] = connected[i];
        for (const direction of DIRECTIONS) {
            const next = [gameMap.roundXWithDirection(x, direction), gameMap.roundYWithDirection(y, direction)];
            const key = next.join(',');
            if (seen.has(key) || !gameMap.isValid(...next) || !player.canPass(...next, 10 - direction)) continue;
            seen.add(key);
            connected.push(next);
        }
    }
    const point = connected.find(([x, y]) => {
        const candidate = solveRoute(geometry, live, { x, y, event: sign, area });
        return candidate.status === 'ready' && candidate.legs.length > 1 &&
            DIRECTIONS.some(direction => direction !== candidate.legs[0].direction && player.canPass(x, y, direction));
    });
    assert(point, 'a real two-leg route to the warning sign');
    const request = { x: point[0], y: point[1], event: sign, area, limit: 1, beacon: true };
    await verifyWorker(fixture, request, live, result => {
        assert.equal(result.status, 'ready');
        assert.equal(result.more, true);
        assert.equal(result.legs.length, 1);
        assert.equal(result.course.length, result.distance);
        const scene = c.SceneManager._scene;
        const renderer = new EventEmitter();
        const sounds = [];
        const reports = [];
        let sounding = null;
        let prepare = null;
        let prepared = false;
        const audio = { cues: CUE, isPrepared: () => prepared,
            prepare(_scene, _hrtf, ready, done) { prepare = { ready, done }; return true; },
            play(_scene, _hrtf, cue, gain, bearing, ready) {
                assert(ready());
                sounding = { cue, gain, bearing, ready };
                sounds.push(sounding);
                return true;
            },
            retire(_scene, source) { assert.equal(source, 'beacon'); sounding = prepare = null; }
        };
        c.Graphics.app = { renderer };
        c.Graphics.frameCount = 1000;
        scene._wqaFieldReady = true;
        const ready = (current, moving) => current === scene && scene._wqaFieldReady && (moving || !player.isMoving());
        const beacon = createBeacon(c, ready, audio, () => ({ enabled: true, beacon: true, beaconVolume: 70, hrtf: true }),
            text => reports.push(text));
        c.WendyQuestAccessFieldMove = (owner, direction, success) => beacon.moved(owner, direction, success);
        c.WendyQuestAccessFieldEvent = owner => beacon.stop(owner);
        c.WendyQuestAccessBeaconActor = (owner, actor, direction) => beacon.actor(owner, actor, direction);
        const first = DIRECTIONS[result.course[0] & 3];
        function place(x, y, facing) {
            Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y, _direction: facing, _moveSpeed: 4,
                _followers: { areGathering: () => false, updateMove() {} } });
        }
        function tick() {
            if (scene._wqaBeaconUntil && c.Graphics.frameCount >= scene._wqaBeaconUntil) beacon.expire(scene);
            if (scene._wqaBeaconDue && c.Graphics.frameCount >= scene._wqaBeaconDue) beacon.update(scene);
            renderer.emit('postrender');
        }
        place(...point, 10 - first);
        const start = () => assert(beacon.start(scene, sign, ...point, result, () =>
            warningApproach(gameMap, player._x, player._y, sign)));
        start();
        tick();
        assert(prepare?.ready() && sounds.length === 0);
        prepared = true;
        prepare.done(2);
        c.Graphics.frameCount++;
        tick();
        assert.deepEqual(sounding.bearing, [0, 0, -1]);
        assert.equal(sounding.cue, CUE.beaconTurn);
        assert(sounding.ready());
        function walk() {
            const start = performance.now();
            for (const encoded of result.course) {
                const direction = DIRECTIONS[encoded & 3];
                c.Input.dir4 = direction;
                player.moveByInput();
                assert(player.isMovementSucceeded());
                assert.equal(sounding, null, 'accepted movement revokes the old pulse');
                while (player.isMoving()) {
                    player.updateMove();
                    c.Graphics.frameCount++;
                }
                tick();
            }
            return performance.now() - start;
        }
        const enabledMs = walk();
        assert.deepEqual([player._x, player._y], [result.arrival.x, result.arrival.y]);
        if (result.arrival.facing !== null && player._direction !== result.arrival.facing) {
            assert.equal(sounding.cue, CUE.beaconTurn);
            player.setDirection(result.arrival.facing);
            tick();
        }
        assert.equal(sounding.cue, CUE.beaconArrival);
        c.Graphics.frameCount = scene._wqaBeaconUntil;
        tick();
        assert.equal(sounding, null);
        assert(!beacon.active(scene));
        assert.deepEqual(reports, []);
        place(...point, 10 - first);
        const baselineMs = walk();
        console.log(`Throttled ${result.distance}-step beacon traversal: ${baselineMs.toFixed(2)} ms baseline, ` +
            `${enabledMs.toFixed(2)} ms with silent beacon requests.`);
        verifyRoute(fixture, request, solveRoute(geometry, live, request));
        for (const event of gameMap.events()) event._starting = false;

        place(...point, first);
        start();
        tick();
        const firstPulse = sounding;
        assert(firstPulse?.ready());
        const other = DIRECTIONS.find(direction => direction !== first && player.canPass(...point, direction));
        assert(other);
        c.Input.dir4 = other;
        player.moveByInput();
        assert.equal(sounding, null);
        assert.equal(firstPulse.ready(), false);
        place(player._x, player._y, player._direction);
        tick();
        assert.equal(reports.at(-1), 'Off route. Request directions again.');

        place(...point, first);
        start();
        tick();
        const blocker = gameMap._events[sign];
        const savedX = blocker._x;
        beacon.actor(scene, blocker, 6);
        blocker._x++;
        assert.equal(sounding, null);
        tick();
        assert.equal(reports.at(-1), 'Destination changed. Request directions again.');
        blocker._x = savedX;

        start();
        tick();
        assert(sounding);
        const [blockedX, blockedY] = [gameMap.roundXWithDirection(point[0], first), gameMap.roundYWithDirection(point[1], first)];
        const added = Object.assign(new c.Game_Event(), { _eventId: gameMap._events.length, _x: blockedX, _y: blockedY,
            _priorityType: 1, _through: false, _erased: false, _tileId: 0 });
        beacon.actor(scene, added, 0);
        gameMap._events.push(added);
        tick();
        assert.equal(reports.at(-1), 'Route blocked. Request directions again.');
        gameMap._events.pop();

        start();
        beacon.update(scene);
        scene._wqaFieldReady = false;
        renderer.emit('postrender');
        assert.equal(sounding, null);
        assert(!beacon.active(scene));
        console.log(`Verified beacon pulse, turn, exact approach, deviation and phase cancellation on ${result.distance} native steps.`);
    });
}

function configureMotion(fixture, x, y, displayX = 0, displayY = 0) {
    const { gameMap, player } = fixture;
    Object.assign(gameMap, { _displayX: displayX, _displayY: displayY, _parallaxX: 0, _parallaxY: 0, _commonEvents: [] });
    Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y, _moveSpeed: 4, _jumpCount: 0, _stopCount: 0,
        _followers: new c.Game_Followers(), _dashing: false, _direction: 6 });
    const actors = [];
    for (const event of gameMap.events()) {
        if (event._trigger !== 2) {
            Object.assign(event, { _realX: event.x, _realY: event.y, _moveType: event.page()?.moveType || 0 });
            event.update = () => {};
            continue;
        }
        const page = event.page();
        Object.assign(event, { _realX: event.x, _realY: event.y, _moveType: page.moveType, _moveSpeed: page.moveSpeed,
            _moveFrequency: page.moveFrequency, _direction: page.image.direction, _directionFix: page.directionFix,
            _stopCount: 0, _waitCount: 0, _jumpCount: 0, _moveRoute: page.moveRoute, _moveRouteIndex: 0 });
        actors.push(event);
    }
    return actors;
}

function verifyMotion(fixture, actors, frames, directions = [], startAt = 0, dashMask = 0) {
    const { geometry, gameMap, player } = fixture;
    const patrols = actors.map(copyPatrol);
    assert(patrols.every(Boolean));
    const world = motionWorld(geometry, snapshot(fixture), patrols);
    const view = { x: gameMap._displayX, y: gameMap._displayY,
        width: c.Graphics.width / gameMap.tileWidth(), height: c.Graphics.height / gameMap.tileHeight() };
    const state = startMotion(world, patrols, { x: player.x, y: player.y, rx: player._realX, ry: player._realY,
        speed: player._moveSpeed, jump: 0 }, view);
    let next = 0;
    for (let tick = 0; tick < frames; tick++) {
        const heading = tick >= startAt && !player.isMoving() && next < directions.length ? directions[next++] : null;
        const result = advancePatrols(state);
        assert.notEqual(result, 'boundary', `unsupported route in Map ${fixture.id}, tick ${tick}`);
        gameMap.updateEvents();
        assert.equal(result, actors.some(event => event.isStarting()) ? 'contact' : 'settled',
            `native patrol contact differs in Map ${fixture.id}, tick ${tick}`);
        if (result === 'contact') return tick + 1;
        for (let index = 0; index < actors.length; index++) {
            assert.deepEqual(state.patrols[index], copyPatrol(actors[index]), `Map ${fixture.id}, patrol ${actors[index]._eventId}, tick ${tick}`);
        }
        const fromX = player.scrolledX();
        const fromY = player.scrolledY();
        if (heading !== null) {
            player._dashing = !!((dashMask >> (next - 1)) & 1);
            state.player.speed = player.realMoveSpeed();
            c.Game_CharacterBase.prototype.moveStraight.call(player, DIRECTIONS[heading]);
        }
        c.Game_CharacterBase.prototype.update.call(player);
        player.updateScroll(fromX, fromY);
        assert.equal(advancePlayer(state, heading), 'settled');
        assert.deepEqual([state.player.x, state.player.y, state.player.rx, state.player.ry, state.view.x, state.view.y],
            [player.x, player.y, player._realX, player._realY, gameMap._displayX, gameMap._displayY]);
    }
    return frames;
}

function verifyNativePatrolMotion() {
    const first = load(196);
    const actors = configureMotion(first, 11, 49, 4, 40);
    const approach = solveRoute(first.geometry, snapshot(first), { x: 11, y: 49, event: 2 });
    assert.equal(approach.status, 'ready');
    let frames = verifyMotion(first, actors, 400,
        approach.legs.flatMap(leg => new Array(leg.tiles).fill(DIRECTIONS.indexOf(leg.direction))));

    const contact = load(196);
    frames += verifyMotion(contact, configureMotion(contact, 4, 25, 0, 20), 1);
    assert(contact.gameMap._events[4].isStarting());
    const blocked = load(196);
    const blockedActors = configureMotion(blocked, 11, 33, 0, 21);
    Object.assign(blocked.gameMap._events[2], { _x: 4, _y: 25, _priorityType: 0 });
    Object.assign(blocked.gameMap._events[10], { _x: 15, _y: 15, _priorityType: 0 });
    frames += verifyMotion(blocked, blockedActors, 1);
    assert.equal(blocked.gameMap._events[4]._moveRouteIndex, 1);
    assert.equal(blocked.gameMap._events[6]._moveRouteIndex, 0);

    for (const [mapId, sourceId, actorId, count] of [[199, 24, 9, 180], [200, 5, 4, 90], [201, 4, 3, 240]]) {
        const forced = load(mapId);
        const current = configureMotion(forced, 0, 0);
        const route = forced.map.events[sourceId].pages[0].list.find(command =>
            command.code === 205 && command.parameters[0] === actorId).parameters[1];
        if (mapId === 200) forced.gameMap._events[actorId]._moveRouteIndex = 1;
        forced.gameMap._events[actorId].forceMoveRoute(route);
        frames += verifyMotion(forced, current, count);
    }
    const distraction = load(200);
    const changing = configureMotion(distraction, 0, 0);
    const commands = distraction.map.events[5].pages[0].list;
    const route = commands.findLast(command => command.code === 205 && command.parameters[0] === 4).parameters[1];
    const mech = distraction.gameMap._events[4];
    mech.forceMoveRoute(route);
    mech._moveRouteIndex = route.list.findIndex(command => command.code === 27 || command.code === 28);
    assert(mech._moveRouteIndex >= 0);
    const patrols = changing.map(copyPatrol);
    const physics = motionWorld(distraction.geometry, snapshot(distraction), patrols);
    const state = startMotion(physics, patrols, { x: 0, y: 0 }, { x: 0, y: 0, width: 20, height: 11.25 });
    assert.equal(advancePatrols(state), 'boundary', 'switch mutations must be observed after native settlement');
    console.log(`Compared ${frames} native patrol updates, including screen range, blocked moves, forced routes and jumps.`);
}

function motionRequest(fixture, actors) {
    const { gameMap, player } = fixture;
    return { x: player.x, y: player.y, motion: { speed: player._moveSpeed,
        view: { x: gameMap._displayX, y: gameMap._displayY,
            width: c.Graphics.width / gameMap.tileWidth(), height: c.Graphics.height / gameMap.tileHeight() },
        patrols: actors.map(copyPatrol) } };
}

async function verifyCrossingPreview() {
    const cave = load(196);
    // The fourth and fifth patrols both move south along this crossing.
    const actors = configureMotion(cave, 4, 30, 0, 20);
    const request = { ...motionRequest(cave, actors), targetX: 7, targetY: 30 };
    const live = snapshot(cave);
    const expected = previewCrossing(cave.geometry, live, request);
    assert.equal(expected.status, 'timed');
    assert.equal(expected.direction, 6);
    assert.equal(expected.tiles, 3);
    assert(expected.startWindow >= 45);
    await verifyWorker(cave, request, live, result => assert.deepEqual(result, expected));
    for (const delay of [0, 15, 45, expected.startWindow]) {
        const run = load(196);
        const current = configureMotion(run, request.x, request.y, 0, 20);
        const heading = DIRECTIONS.indexOf(expected.direction);
        const directions = new Array(expected.tiles).fill(heading);
        const frames = delay + (expected.tiles + 1) * 16;
        assert.equal(verifyMotion(run, current, frames, directions, delay), frames);
        const { player } = run;
        assert.equal(Math.abs(player.x - request.x) + Math.abs(player.y - request.y), expected.tiles);
    }
    const later = load(196);
    const laterActors = configureMotion(later, request.x, request.y, 0, 20);
    for (let tick = 0; tick < 35; tick++) later.gameMap.updateEvents();
    assert(laterActors.every(event => !event.isStarting()));
    assert.equal(previewCrossing(later.geometry, snapshot(later),
        { ...motionRequest(later, laterActors), targetX: request.targetX, targetY: request.targetY }).status,
    'timedWait', 'the same crossing loses its preview as the patrol approaches');

    const contact = load(196);
    const patrolling = configureMotion(contact, 4, 25, 0, 20);
    assert.equal(previewCrossing(contact.geometry, snapshot(contact),
        { ...motionRequest(contact, patrolling), targetX: 4, targetY: 26 }).status, 'timedWait');

    const checkpoint = load(196);
    const target = checkpoint.gameMap._events[21];
    const prior = configureMotion(checkpoint, target.x, target.y + 1, 4, 0);
    const at = previewCrossing(checkpoint.geometry, snapshot(checkpoint), { ...motionRequest(checkpoint, prior), event: 21 });
    assert.deepEqual([at.status, at.direction, at.tiles, at.terminal], ['timed', 8, 1, true]);
}

async function verifyLiveCrossing() {
    const cave = load(196);
    const actors = configureMotion(cave, 5, 30, 0, 20);
    const scene = c.SceneManager._scene;
    c.Graphics.frameCount = 200;
    assert.equal(captureMotion(c, c.Graphics), null, 'native entry and lighting pages keep timing closed');
    for (const id of [1, 3, 23, 24]) cave.gameMap._events[id]._erased = true;
    const motion = captureMotion(c, c.Graphics);
    assert(motion?.dash && motion.patrols.length === actors.length);
    const request = { x: 5, y: 30, event: 21, motion };
    const data = snapshot(cave);
    const detour = previewCrossing(cave.geometry, data, request);
    assert.deepEqual([detour.status, detour.direction, detour.tiles, detour.alternate], ['timed', 4, 1, true]);
    assert.equal(previewCrossing(cave.geometry, data, request, () => true).status, 'cancelled');
    await verifyWorker(cave, { ...request, timingCue: true }, data, result => {
        assert.equal(result.status, 'timedCue');
        assert.deepEqual([result.opening.direction, result.opening.from, result.opening.alternate], [4, 0, true]);
    });
    for (const dashMask of [0, 1]) {
        const replay = load(196);
        const current = configureMotion(replay, 5, 30, 0, 20);
        const frames = detour.startWindow + 32;
        assert.equal(verifyMotion(replay, current, frames, [DIRECTIONS.indexOf(4)], detour.startWindow, dashMask), frames);
        assert.deepEqual([replay.player.x, replay.player.y], [4, 30]);
    }

    const renderer = new EventEmitter();
    c.Graphics.app = { renderer };
    const sounds = [];
    const reports = [];
    let sounding = false;
    const timing = createCaveTiming(c, value => value === scene && scene._wqaFieldReady, {
        cues: CUE, isPrepared: () => true,
        play(_scene, _hrtf, cue, gain, bearing, ready) {
            assert(ready());
            sounds.push({ cue, gain, bearing });
            sounding = true;
            return true;
        },
        retire(_scene, source) { assert.equal(source, 'cave'); sounding = false; }
    }, () => ({ enabled: true, caveTiming: true, caveVolume: 55, hrtf: true }), text => reports.push(text));
    c.WendyQuestAccessCaveTimingStop = owner => timing.stop(owner);
    c.WendyQuestAccessCaveTimingPose = owner => timing.pose(owner);
    c.WendyQuestAccessFieldEvent = owner => timing.stop(owner);
    scene._wqaFieldReady = true;

    function sampleDelayed() {
        const current = load(196);
        configureMotion(current, 6, 30, 0, 20);
        for (const id of [1, 3, 23, 24]) current.gameMap._events[id]._erased = true;
        for (let n = 0; n < 15; n++) current.gameMap.updateEvents();
        c.Graphics.frameCount = 400;
        const start = performance.now();
        const motion = captureMotion(c, c.Graphics);
        const captured = timing.capture(scene, motion, { id: 21 });
        const captureMs = performance.now() - start;
        const result = previewCrossing(current.geometry, snapshot(current),
            { x: 6, y: 30, targetX: 5, targetY: 30, area: [5, 30, 6, 30], motion, timingCue: true });
        assert.equal(result.status, 'timedCue');
        assert.deepEqual([result.opening.direction, result.opening.from], [4, 81]);
        assert(result.opening.through >= 126 && result.opening.through <= 141);
        assert(timing.start(captured, 6, 30, result.opening));
        return { current, captureMs, deadline: motion.frame + result.opening.through - 30 };
    }

    function advanceToCue(current) {
        while (c.Graphics.frameCount < scene._wqaCaveCueDue) {
            current.gameMap.updateEvents();
            c.Graphics.frameCount++;
            assert(!current.gameMap.isAnyEventStarting());
        }
        timing.update(scene);
        const start = performance.now();
        renderer.emit('postrender');
        return performance.now() - start;
    }

    const delayed = sampleDelayed();
    assert.equal(scene._wqaCaveCueDue, 481);
    assert.equal(sounds.length, 0);
    const issueMs = advanceToCue(delayed.current);
    assert.deepEqual(sounds[0], { cue: CUE.caveGo, gain: 0.55, bearing: [0, 0, -1] });
    assert.equal(scene._wqaCaveCueUntil, 489);
    const checkpoint = delayed.current.gameMap._events[21];
    checkpoint.lock = () => assert.equal(sounding, false, 'event acceptance revokes timing audio before locking');
    checkpoint.start();
    assert(checkpoint.isStarting());
    assert(!timing.active(scene) && !sounding);

    const changed = sampleDelayed();
    changed.current.gameMap._events[4]._moveRoute = { ...changed.current.gameMap._events[4]._moveRoute };
    advanceToCue(changed.current);
    assert.equal(sounds.length, 1);
    assert.match(reports.at(-1), /Patrol timing changed/);
    const expired = sampleDelayed();
    c.Graphics.frameCount = expired.deadline + 1;
    advanceToCue(expired.current);
    assert.equal(sounds.length, 1);
    assert(!timing.active(scene));
    scene._wqaFieldReady = false;

    const distraction = load(200, { switches: [581] });
    configureMotion(distraction, 1, 1);
    for (const id of [1, 13, 43, 44]) distraction.gameMap._events[id]._erased = true;
    assert.equal(captureMotion(c, c.Graphics), null, 'parallel route issuance is a protected boundary');
    const issuer = distraction.gameMap._events[19];
    const nativeActor = distraction.gameMap._events[18];
    distraction.gameMap.refreshIfNeeded = () => {};
    const interpreter = issuer._interpreter = Object.assign(new c.Game_Interpreter(), {
        _list: issuer.page().list, _index: 45, _waitMode: '', character: id => distraction.gameMap._events[id]
    });
    assert(interpreter.executeCommand());
    assert(interpreter.updateWaitMode());
    const waiting = captureMotion(c, c.Graphics);
    assert.equal(waiting?.barrier, 18);
    nativeActor._moveRouteIndex = nativeActor._moveRoute.list.length - 1;
    const done = captureMotion(c, c.Graphics);
    const physics = motionWorld(distraction.geometry, snapshot(distraction), done.patrols, () => false, done.barrier);
    const state = startMotion(physics, done.patrols, { x: 1, y: 1 }, done.view);
    assert.equal(advancePatrols(state), 'boundary');
    nativeActor.update();
    assert.equal(interpreter.updateWaitMode(), false);
    assert.equal(captureMotion(c, c.Graphics), null);
    console.log(`Verified cave detour and delayed cue on native patrol updates. Throttled capture ${delayed.captureMs.toFixed(2)} ms, recheck and enqueue ${issueMs.toFixed(2)} ms.`);
}

async function verifyWarningApproach() {
    const cave = load(196);
    const { gameMap, geometry } = cave;
    const entrance = read('Map206.json').events[11].pages.flatMap(page => page.list)
        .find(command => command.code === 201 && command.parameters[1] === 196);
    const [, , x, y] = entrance.parameters;
    assert.equal(geometry.scrollType, 0);
    for (const event of gameMap.events()) event._moveRoute = event.page()?.moveRoute;
    const sign = 2;
    const area = warningApproach(gameMap, x, y, sign);
    assert(area);
    assert.equal(warningApproach(gameMap, x, y, 21), null, 'the checkpoint requires a timed route');
    assert.equal(warningApproach(gameMap, x, area[1] - 1, sign), null);
    const state = snapshot(cave);
    const request = { x, y, event: sign, area };
    const result = solveRoute(geometry, state, request);
    verifyRoute(cave, request, result);
    assert.equal(solveRoute(geometry, state, { ...request, area: [x, y, x, y] }).status, 'unreachable');
    const patrol = gameMap._events[4];
    patrol._moveRouteForcing = true;
    assert.equal(warningApproach(gameMap, x, y, sign), null);
    patrol._moveRouteForcing = false;
    const oldX = patrol._x;
    patrol._x = area[0];
    assert.equal(warningApproach(gameMap, x, y, sign), null, 'a skippable patrol can drift along its entire column');
    patrol._x = oldX;
    await verifyWorker(cave, request, state);
}

async function verifyWorker(fixture, request, live, verify = result => verifyRoute(fixture, request, result)) {
    const admission = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(path.join(__dirname, '..', '.build', 'payload', 'wendyquest-access', 'route-worker.cjs'),
        { workerData: { geometryDirectory: derived, admission: admission.buffer } });
    const deliver = (sequence, map = fixture.id) => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('Route worker timed out')), 3000);
        worker.once('message', message => { clearTimeout(timeout); resolve(message); });
        worker.postMessage({ epoch: 1, sequence, map, live, request });
    });
    try {
        Atomics.store(admission, 0, 1);
        const start = performance.now();
        const result = await deliver(1);
        const cold = performance.now() - start;
        assert.equal(result.sequence, 1);
        verify(result.result);
        const warmStart = performance.now();
        const warm = await deliver(2);
        assert.deepEqual(warm.result, result.result);
        const warmTime = performance.now() - warmStart;
        Atomics.store(admission, 0, 0);
        assert.equal((await deliver(3)).result.status, 'cancelled');
        Atomics.store(admission, 0, 1);
        assert.equal((await deliver(4, 999)).result.status, 'unavailable');
        console.log(`Map ${fixture.id}, throttled worker round trip: ${cold.toFixed(1)} ms cold, ${warmTime.toFixed(1)} ms warm.`);
    } finally {
        await worker.terminate();
    }
}

async function main() {
    const catalog = bake(game, derived);
    assert.deepEqual(catalog, { maps: 239, cells: 191235 });
    const salt = load(19);
    compare(salt);
    const request = { x: 26, y: 12, event: 114 };
    const current = snapshot(salt);
    await verifyWorker(salt, request, current);
    const reset = { x: 26, y: 12, event: 97 };
    assert.equal(solveRoute(salt.geometry, current, reset).status, 'unreachable');
    const tilemap = Object.assign(new c.Tilemap(), { _mapWidth: salt.map.width, _mapHeight: salt.map.height, _mapData: salt.map.data });
    c.SceneManager._scene._spriteset._tilemap = tilemap;
    let routine;
    c.CoroutineManager = { StartAnonymousCoroutine: create => { routine = create(); } };
    const floods = salt.map.events[36].pages.flatMap(page => page.list).filter(command =>
        command.code === 357 && command.parameters[1] === 'FloodFill');
    assert.equal(floods.length, 2);
    for (const command of floods) {
        const flood = command.parameters[3];
        c.TileEditor.FloodFillRegion(flood.tileID, +flood.layer, +flood.regionID, +flood.x, +flood.y, +flood.delay / 60);
        let ticks = 0;
        while (!routine.next().done) assert(++ticks < 1800);
        assert(ticks > 0 && snapshot(salt).terrain.length > 0);
        compare(salt);
    }
    assert.equal(solveRoute(salt.geometry, snapshot(salt), request, () => true).status, 'cancelled');

    const crystal = load(19, { self: ['19,19,D'] });
    assert.equal(crystal.gameMap._events[19]._pageIndex, 1);
    compare(crystal);
    const lava = load(62);
    const block = lava.map.events[22].pages.flatMap(page => page.list).find(command =>
        command.code === 357 && command.parameters[1] === 'SetBlocker').parameters[3];
    const blocker = lava.gameMap._events[22];
    blocker._through = false;
    blocker.SetBlocker(+block.minX, +block.minY, +block.maxX, +block.maxY);
    const blocked = composeWorld(lava.geometry, snapshot(lava));
    assert.equal(blocked.blocked[indexOf(blocked, blocker.x - 1, blocker.y - 1)], 1);
    compare(lava);
    blocker._through = true;
    const beforeBridge = compare(lava);
    const beforeState = snapshot(lava);
    const edits = lava.map.events[17].pages.flatMap(page => page.list).filter(command =>
        command.code === 357 && command.parameters[1] === 'set_tile');
    assert(edits.length > 0);
    for (const command of edits) {
        const args = command.parameters[3];
        const { x, y, z } = JSON.parse(args.coordinates);
        const relative = JSON.parse(args.relativity);
        assert.equal(relative.mode, 'Absolute');
        lava.gameMap.setTileId(+x, +y, +z, args.tileId, relative.clearUpperLayers, relative.allowAutotiling);
    }
    const afterBridge = compare(lava);
    const crossing = changedCrossing(beforeBridge, afterBridge);
    const beforeRoute = solveRoute(lava.geometry, beforeState, crossing);
    assert(beforeRoute.status !== 'ready' || beforeRoute.distance > 1);
    const afterRoute = solveRoute(lava.geometry, snapshot(lava), crossing);
    assert.equal(afterRoute.distance, 1);
    verifyRoute(lava, crossing, afterRoute);
    await verifyWorker(lava, crossing, snapshot(lava));

    const world = load(113);
    for (const mode of ['boat', 'ship']) {
        world.player._vehicleType = mode;
        compare(world);
    }
    world.player._vehicleType = 'walk';
    Object.assign(world.gameMap.boat(), { _mapId: world.id, _x: 3, _y: 3 });
    compare(world);
    for (const id of [195, 196, 199, 200, 201, 202, 206]) compare(load(id));
    verifyPatrolContact();
    verifyWallFeedback();
    await verifyNativeBeacon();
    verifyNativePatrolMotion();
    verifyCaveProgression(c, load, snapshot, verifyRoute);
    await verifyLocalDestinations(c, load, verifyRoute, verifyWorker);
    await verifyVehicleNavigation(c, load, read, verifyWorker);
    await verifyCrossingPreview();
    await verifyLiveCrossing();
    await verifyWarningApproach();
    const entry = read('Map199.json').events[26].pages.flatMap(page => page.list).find(command =>
        command.code === 201 && command.parameters[1] === 200).parameters;
    const secret = load(200);
    const distraction = { x: entry[2], y: entry[3], event: 5 };
    verifyRoute(secret, distraction, solveRoute(secret.geometry, snapshot(secret), distraction));
    console.log(`Verified ${compared} directed movement comparisons across authored maps and dynamic cases.`);
    console.log('Verified native Map 196 patrol contact, catch-page handback, checkpoint floor trigger and bounded warning sign route.');
}

function changedCrossing(before, after) {
    for (let cell = 0; cell < after.cells.length; cell++) {
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const next = step(after, cell, heading);
            if (next >= 0 && step(before, cell, heading) < 0) return {
                x: cell % after.width, y: Math.floor(cell / after.width),
                targetX: next % after.width, targetY: Math.floor(next / after.width)
            };
        }
    }
    assert.fail('Authored bridge edits did not open a crossing');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
