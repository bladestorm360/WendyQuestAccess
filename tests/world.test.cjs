'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');
const { bake } = require('../tools/bake-world.cjs');
const { bakeMap, decodeMap, composeWorld, indexOf, DIRECTIONS, step, surface } = require('../src/world/geometry.cjs');
const { solveRoute } = require('../src/world/routes.cjs');

const game = path.resolve(process.argv[2]);
const derived = path.resolve(process.argv[3]);
const data = path.join(game, 'package.nw', 'data');
const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
const tilesets = read('Tilesets.json');
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning', path.join(__dirname, 'world-producers.py'), game],
    { encoding: 'utf8', timeout: 7000, maxBuffer: 64000 }));
const c = vm.createContext({
    a15_0x363c12() { throw new Error('Unresolved movement property'); },
    _0x34cc1b() { throw new Error('Unresolved tile property'); },
    Game_Map: function () {}, Game_CharacterBase: function () {}, Game_Character: function () {},
    Game_Player: function () {}, Game_Event: function () {}, Game_Vehicle: function () {}, Tilemap: function () {},
    Game_Followers: function () {},
    TileEditor: {}, SceneManager: { _scene: { _spriteset: {} } }, Point: function (x, y) { this.x = x; this.y = y; },
    Time: { GetDeltaTime: () => 1 / 60 }, $dataTilesets: tilesets, $dataItems: read('Items.json'),
    $gameSwitches: { value: () => false }, $gameSelfSwitches: { value: () => false },
    $gameVariables: { value: () => 0 }, $gameActors: { actor: id => id }, $gameParty: { hasItem: () => false, members: () => [] },
    $gameTileChanges: {}, Tyruswoo: { TileControl: { tileIdExists: (set, id) => Number.isInteger(tilesets[set].flags[id]) } }
});
Object.setPrototypeOf(c.Game_Character.prototype, c.Game_CharacterBase.prototype);
for (const cls of [c.Game_Player, c.Game_Event, c.Game_Vehicle]) Object.setPrototypeOf(cls.prototype, c.Game_Character.prototype);
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
c.Game_Player.prototype.isDebugThrough = () => false;
c.Game_Event.prototype.lock = () => {};
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
        distance++;
    }
    assert.equal(distance, result.distance);
    assert.equal(x, result.arrival.x);
    assert.equal(y, result.arrival.y);
    if (request.event) {
        Object.assign(player, { _x: x, _y: y, facing: result.arrival.facing });
        for (const event of gameMap.events()) event._starting = false;
        if (player.facing === null) player.checkEventTriggerHere([0]);
        else player.checkEventTriggerThere([0, 1, 2]);
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

async function verifyWorker(fixture, request, live) {
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
        verifyRoute(fixture, request, result.result);
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
    const entry = read('Map199.json').events[26].pages.flatMap(page => page.list).find(command =>
        command.code === 201 && command.parameters[1] === 200).parameters;
    const secret = load(200);
    const distraction = { x: entry[2], y: entry[3], event: 5 };
    verifyRoute(secret, distraction, solveRoute(secret.geometry, snapshot(secret), distraction));
    console.log(`Verified ${compared} directed movement comparisons across authored maps and dynamic cases.`);
    console.log('Verified native Map 196 patrol contact, catch-page handback and checkpoint floor trigger.');
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
