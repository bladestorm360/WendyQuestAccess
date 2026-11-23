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
const { verifyCaveCrossings } = require('./cave-crossings.cjs');
const { verifyNavigationAuditFixes } = require('./navigation-regressions.cjs');
const { verifyLocalDestinations } = require('./local-destinations.cjs');
const { verifyVehicleNavigation } = require('./vehicle-navigation.cjs');
const { verifyAutowalk } = require('./autowalk.cjs');
const { verifySoundscape } = require('./soundscape.cjs');
const { verifyQuestDestinations } = require('./quest-destinations.cjs');
const { verifyReachability } = require('./reachability.cjs');
const { verifyBookmarks } = require('./bookmarks.cjs');
const { verifyTransferBookmarks } = require('./transfer-bookmarks.cjs');
const { verifyWorldDetours } = require('./world-detours.cjs');
const { copyPatrol } = require('../src/world/puzzles/patrol-motion.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('../src/world/puzzles/motion-world.cjs');
const { previewCrossing } = require('../src/world/puzzles/crossing.cjs');
const { createAudio, CUE } = require('../src/runtime/audio');
const { createWallAudio } = require('../src/world/wall-audio');
const { createFootsteps } = require('../src/world/footsteps');
const { captureWorld } = require('../src/world/snapshot');
const { createBeacon } = require('../src/world/beacon');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { mapDescription } = require('../src/world/map-descriptions');
const { bearing } = require('../src/world/spatial-direction');
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
    $dataMapInfos: read('MapInfos.json'),
    Graphics: { width: 480, height: 336 },
    $gameSwitches: { value: () => false }, $gameSelfSwitches: { value: () => false },
    $gameVariables: { value: () => 0 }, $gameActors: { actor: id => id }, $gameParty: { hasItem: () => false, members: () => [] },
    $dataCommonEvents: [], window: { $testEvent: null },
    $gameTileChanges: {}, Tyruswoo: { TileControl: { tileIdExists: (set, id) => Number.isInteger(tilesets[set].flags[id]) } }
});
Object.setPrototypeOf(c.Game_Character.prototype, c.Game_CharacterBase.prototype);
for (const cls of [c.Game_Player, c.Game_Event, c.Game_Vehicle]) Object.setPrototypeOf(cls.prototype, c.Game_Character.prototype);
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
// Only the cave pickup fixture supplies a complete native message stand-in.
// Other map fixtures retain their established presentation-only handling.
c.caveMessageProducer = c.Game_Interpreter.prototype.command101;
delete c.Game_Interpreter.prototype.command101;
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
            _tileId: page?.image.tileId ?? 0, _characterName: page?.image.characterName || '',
            _trigger: page?.trigger, _erased: false, _starting: false });
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
    const options = { enabled: true, wall: true, hrtf: true, wallVolume: 45, footsteps: true, footstepVolume: 50 };
    let now = 1000;
    const output = new Map();
    const calls = [];
    const audio = {
        cues: CUE, isPrepared: () => true,
        extendWall(_scene, until) {
            for (const record of output.values()) record.until = until;
            return output.size > 0;
        },
        play(_scene, _hrtf, cue, gain, bearing, ready, _complete, source, pitch = 1, until) {
            assert(ready());
            const record = { cue, gain, bearing, source, pitch, until, ready };
            calls.push(record);
            if (source === 'wall') output.set(cue, record);
            return true;
        },
        retire(_scene, source, cue) {
            if (source !== 'wall') return;
            if (cue === undefined) output.clear();
            else output.delete(cue);
        }
    };
    const fieldReady = owner => owner === scene && scene._wqaFieldReady && !scene._wqaSettingsActive;
    const wall = createWallAudio(c, fieldReady, audio, () => options, () => now);
    const footsteps = createFootsteps(c, fieldReady, audio, () => options, () => now);
    c.WendyQuestAccessFieldMove = (scene, motion, success) => wall.move(scene, motion, success);
    c.WendyQuestAccessFootstep = (owner, player) => footsteps.landed(owner, player);
    c.WendyQuestAccessFieldEvent = owner => { wall.interrupt(owner); footsteps.leave(owner); };
    let shift = false;
    c.Input = { dir4: 0, isPressed: key => key === 'shift' && shift };
    c.ConfigManager = { alwaysDash: false };
    c.$gameTemp = { clearDestination() {}, isDestinationValid: () => false };
    c.$gameMessage = { isBusy: () => false };
    c.Graphics.frameCount = 100;
    c.Graphics._wqaWallEnabled = true;
    c.Graphics._wqaFootstepsEnabled = true;
    scene._wqaFieldReady = true;
    const { gameMap, player } = load(19);
    const place = (x, y, dir = 2) => Object.assign(player, { _x: x, _y: y, _realX: x, _realY: y,
        _direction: dir, _moveSpeed: 4, _followers: { areGathering: () => false, updateMove() {} } });
    const press = (direction, duringTile) => {
        c.Graphics.frameCount++;
        c.Input.dir4 = direction;
        const before = calls.filter(call => call.source === 'footstep').length;
        player.updateDashing();
        player.moveByInput();
        const stepped = player.isMoving();
        assert.equal(calls.filter(call => call.source === 'footstep').length, before);
        let updates = 0;
        while (updates < 64 && player.isMoving()) {
            if (!updates) duringTile?.();
            player.updateDashing();
            player.updateMove();
            updates++;
            if (player.isMoving()) assert.equal(calls.filter(call => call.source === 'footstep').length, before);
        }
        assert(!player.isMoving(), 'native step settles within the fixture bound');
        assert.equal(calls.filter(call => call.source === 'footstep').length,
            before + (stepped && options.footsteps ? 1 : 0));
        return updates;
    };
    const next = (x, y, d) => [gameMap.roundXWithDirection(x, d), gameMap.roundYWithDirection(y, d)];
    let edge;
    for (let y = 0; y < gameMap.height() && !edge; y++) {
        for (let x = 0; x < gameMap.width(); x++) {
            const east = next(x, y, 6);
            const east2 = next(...east, 6);
            if (player.canPass(x, y, 6) && player.canPass(...east, 6) &&
                !player.canPass(...east, 8) && !player.canPass(...east2, 8) &&
                !gameMap.eventsXyNt(...east).length && !gameMap.eventsXyNt(...east2).length &&
                !gameMap.eventsXyNt(...next(...east2, 8)).length) { edge = [x, y]; break; }
        }
    }
    assert(edge);
    place(...edge, 6);
    assert.equal(press(6, () => { shift = true; }), 16);
    const north = output.get(CUE.wallNorth);
    assert.deepEqual(north.bearing, [0, 0, 1]);
    assert.equal(north.until, 4500);
    now = 1850;
    assert.equal(press(6, () => { shift = false; }), 16);
    assert.equal(output.get(CUE.wallNorth), north, 'same wall extends without restarting');
    assert.equal(north.until, 5350);
    const contacts = calls.filter(call => call.source === 'footstep');
    assert.deepEqual(contacts.map(call => [call.bearing[0], call.pitch]), [[-0.25, 1], [0.25, 1]]);
    assert(contacts[1].ready(), 'a completed pip remains admitted on the following movement update');
    now = 1950;
    assert(!contacts[1].ready(), 'do not play a step late after an audio stall');
    now = 3500;
    press(8);
    assert.equal(north.until, 5350, 'blocked movement does not extend wall playback');
    assert.equal(output.get(CUE.wallNorth), north, 'facing the same wall does not restart its loop');
    assert.equal(calls.filter(call => call.source === 'footstep').length, 2);
    now = 5349;
    wall.expire(scene);
    assert(output.size > 0);
    now = 5350;
    wall.expire(scene);
    assert.equal(output.size, 0);
    press(8);
    assert.equal(output.size, 0, 'held blocked movement cannot restart an expired tone');
    wall.leave(scene);
    place(...edge, 6);
    press(6);
    assert(output.size > 0);
    scene._wqaSettingsActive = true;
    wall.expire(scene);
    assert.equal(output.size, 0);
    scene._wqaSettingsActive = false;
    options.footsteps = false;
    const count = calls.filter(call => call.source === 'footstep').length;
    place(...edge, 6);
    press(6);
    assert.equal(calls.filter(call => call.source === 'footstep').length, count);
    for (const [direction, cue, bearing] of [
        [6, CUE.wallEast, [1, 0, 0]], [4, CUE.wallWest, [-1, 0, 0]], [2, CUE.wallSouth, [0, 0, -1]]
    ]) {
        wall.leave(scene);
        const cells = Array.from({ length: gameMap.width() * gameMap.height() }, (_, index) =>
            [index % gameMap.width(), Math.floor(index / gameMap.width())]);
        const blocked = cells.find(([x, y]) => !gameMap.eventsXyNt(x, y).length &&
            !gameMap.eventsXyNt(...next(x, y, direction)).length && !player.canPass(x, y, direction));
        assert(blocked);
        place(...blocked);
        press(direction);
        assert.deepEqual(output.get(cue).bearing, bearing);
    }
    wall.leave(scene);
    const corner = Array.from({ length: gameMap.width() * gameMap.height() }, (_, index) =>
        [index % gameMap.width(), Math.floor(index / gameMap.width())]).find(([x, y]) => {
        const south = next(x, y, 2);
        return !gameMap.eventsXyNt(x, y).length && !gameMap.eventsXyNt(...south).length &&
            !gameMap.eventsXyNt(...next(x, y, 8)).length && !gameMap.eventsXyNt(...next(x, y, 6)).length &&
            !player.canPass(x, y, 8) && !player.canPass(x, y, 6) && player.canPass(x, y, 2) &&
            player.canPass(...south, 6);
    });
    assert(corner);
    place(...corner, 4);
    press(8);
    const northAtCorner = output.get(CUE.wallNorth);
    const eastAtCorner = output.get(CUE.wallEast);
    assert(northAtCorner && eastAtCorner, 'north and east sound together on a native corner');
    player.setDirection(2);
    wall.expire(scene);
    assert.equal(output.get(CUE.wallNorth), northAtCorner);
    assert.equal(output.get(CUE.wallEast), eastAtCorner);
    press(2);
    assert(!output.has(CUE.wallEast), 'walking away from the east wall retires its voice');
    wall.interrupt(scene);
    assert.equal(output.size, 0);
    options.wall = false;
    options.wallBump = true;
    options.wallBumpVolume = 50;
    const impact = () => calls.filter(call => call.source === 'bump');
    place(...next(...edge, 6));
    for (now of [6000, 6040]) press(8);
    assert.equal(impact().length, 0, 'a single or briefly blocked attempt is silent');
    now = 6080;
    press(8);
    assert.equal(impact().length, 1);
    assert.deepEqual(impact()[0].bearing, [0, 0, 1]);
    assert.equal(impact()[0].cue, CUE.wallBump);
    for (now of [6160, 6280, 6379]) press(8);
    assert.equal(impact().length, 1, 'held input respects the impact cooldown');
    now = 6380;
    press(8);
    assert.equal(impact().length, 2);
    now = 6410;
    press(4);
    assert.deepEqual([player._x, player._y], edge, 'walking clear ends the obstruction');
    assert.equal(output.size, 0, 'wall bump works with wall tones off');
    place(...next(...edge, 6));
    const eventStarting = gameMap.isAnyEventStarting;
    gameMap.isAnyEventStarting = () => true;
    for (now of [7000, 7040, 7080]) press(8);
    assert.equal(impact().length, 2, 'a pending native event cannot produce a bump');
    gameMap.isAnyEventStarting = eventStarting;
    wall.leave(scene);
    footsteps.leave(scene);
    scene._wqaFieldReady = false;
    c.Graphics._wqaWallEnabled = false;
    c.Graphics._wqaFootstepsEnabled = false;
    console.log('Verified native walking and consistent footstep cadence with either Shift state, wall fade and confirmed wall bumps.');
}

async function verifyEnemyBlockedBeacon() {
    const fixture = load(14);
    Object.assign(fixture.player, { _x: 0, _y: 0 });
    const live = captureWorld(c, true, undefined, undefined, [], true).live;
    const enemy = live.events.find(event => event.movingEnemy);
    assert(enemy, 'an authored moving encounter from Fry Fields');
    const geometry = { width: 5, height: 2, scrollType: 0, cells: new Uint8Array(10), hasLandings: false };
    geometry.cells.fill(15, 0, 5);
    const request = { x: 0, y: 0, targetX: 4, targetY: 0, field: true };
    const blocked = { ...enemy, x: 2, y: 0 };
    const world = { ...live, terrain: [], events: [blocked], vehicles: [] };
    const result = solveRoute(geometry, world, request);
    assert.deepEqual(result, { status: 'enemyBlocked', enemy: enemy.id, boundary: 6,
        legs: [{ direction: 6, tiles: 1 }], distance: 1, arrival: { x: 1, y: 0, facing: null } });
    const adjacent = solveRoute(geometry, world, { ...request, x: 1 });
    assert.equal(adjacent.distance, 0);
    assert.equal(solveRoute(geometry, { ...world, events: [{ ...blocked, movingEnemy: false }] }, request).status, 'unreachable');
    geometry.cells.fill(15);
    assert.equal(solveRoute(geometry, world, request).status, 'ready', 'an open detour remains available outside dungeons');
    const dungeon = { ...world, stableEncounters: true };
    assert.deepEqual(solveRoute(geometry, dungeon, request), result, 'a dungeon route stops at the enemy despite the open detour');
    const encounterCleared = solveRoute(geometry, { ...dungeon, events: [] }, { ...request, x: 1 });
    assert.deepEqual(encounterCleared.legs, [{ direction: 6, tiles: 3 }], 'the original direction continues after combat');
    const exit = { id: 480, x: 4, y: 0, normal: false, trigger: 1, action: true };
    const remote = solveRoute(geometry, { ...dungeon, events: [blocked, exit] },
        { x: 0, y: 0, field: true, entrances: [{ event: exit.id, rank: 1 }] });
    assert.equal(remote.entrance, exit.id);
    assert.equal(remote.needsEncounter, true);
    assert.deepEqual(remote.legs, result.legs);
    geometry.cells.fill(0, 5);

    const map = c.$gameMap;
    const player = c.$gamePlayer;
    const scene = c.SceneManager._scene;
    const renderer = new EventEmitter();
    const pulses = [];
    const reports = [];
    let present = true;
    let pending;
    Object.assign(player, { _x: 0, _y: 0, _direction: 4, canPass: (x, y, dir) => !(present && x === 1 && dir === 6) });
    Object.assign(c.Graphics, { app: { renderer }, frameCount: 1 });
    const beacon = createBeacon(c, () => true, {
        cues: CUE, isPrepared: () => true, retire() {},
        play(_scene, _hrtf, cue, _gain, bearing, ready) { assert(ready()); pulses.push({ cue, bearing }); return true; }
    }, () => ({ enabled: true, beacon: true, beaconVolume: 70 }), text => reports.push(text), {
        submit(state) { state.waiting = true; pending = { state, revision: state.revision }; return true; },
        cancel(state) { state.waiting = false; }
    });
    function tick(frame = c.Graphics.frameCount) {
        c.Graphics.frameCount = frame;
        if (scene._wqaBeaconUntil && frame >= scene._wqaBeaconUntil) beacon.expire(scene);
        if (scene._wqaBeaconDue && frame >= scene._wqaBeaconDue) beacon.update(scene);
        renderer.emit('postrender');
    }
    const east = tiles => Uint8Array.from({ length: tiles }, (_, i) => ((tiles - i) << 2) | 2);
    assert(beacon.start(scene, 0, 0, 0, { status: 'ready', course: east(4), distance: 4,
        arrival: { x: 4, y: 0, facing: null } }, null, undefined,
    { point: true, request, enemyCurrent: () => present }));
    tick();
    assert.deepEqual(pulses.at(-1), { cue: CUE.beaconPulse, bearing: [1, 0, 0] });
    player._x = 1;
    beacon.moved(scene, 6, true);
    tick(3);
    assert.equal(pulses.length, 1, 'taking a step does not restart the cadence');
    const reply = { ...adjacent, course: east(0) };
    beacon.refreshResult(pending.state, pending.revision, 1, 0, reply);
    tick(30);
    assert.equal(pulses.length, 1, 'the blocked tile never plays arrival');
    assert.match(reports[0], /Blocked by an enemy/);
    assert(beacon.active(scene));
    present = false;
    beacon.actor(scene, { _eventId: enemy.id }, 4);
    tick();
    beacon.refreshResult(pending.state, pending.revision, 1, 0, {
        status: 'ready', course: east(3), distance: 3, arrival: { x: 4, y: 0, facing: null }
    });
    tick(67);
    assert.equal(pulses.length, 2, 'the same beacon resumes after the enemy clears');
    for (const [x, frame] of [[2, 72], [3, 73]]) {
        player._x = x;
        beacon.moved(scene, 6, true);
        tick(frame + 1);
    }
    tick(89);
    assert.equal(scene._wqaBeaconDue, 107, 'one tile remaining uses an 18-frame pulse interval');
    player._x = 4;
    beacon.moved(scene, 6, true);
    tick(108);
    if (pending.state.waiting) beacon.refreshResult(pending.state, pending.revision, 4, 0, {
        status: 'ready', course: east(0), distance: 0, arrival: { x: 4, y: 0, facing: null }
    });
    tick(109);
    assert.equal(pulses.at(-1).cue, CUE.beaconArrival);
    tick(122);
    assert(!beacon.active(scene));
    assert.equal(c.$gameMap, map);
    console.log('Verified moving-enemy safe prefix and beacon handback, absolute right, cadence and arrival.');
}

async function verifyColdBrewProgress() {
    const trail = load(36, { switches: [33, 38], self: [21, 23, 42].map(id => '36,' + id + ',A') });
    const { gameMap, player, geometry } = trail;
    for (const id of [21, 23, 42]) {
        const block = trail.map.events[id].pages[0].list.find(command =>
            command.code === 357 && command.parameters[1] === 'SetBlocker').parameters[3];
        gameMap.event(id).SetBlocker(+block.minX, +block.minY, +block.maxX, +block.maxY);
    }
    const live = () => captureWorld(c, true, undefined, undefined, [], true).live;
    player.setPosition(22, 23);
    const first = { x: 22, y: 23, event: 10, field: true };
    assert.deepEqual(solveRoute(geometry, { ...live(), stableEncounters: false }, first).legs[0],
        { direction: 2, tiles: 1 }, 'the original route took the south detour');
    const initial = solveRoute(geometry, live(), first);
    assert.equal(initial.status, 'enemyBlocked');
    assert.equal(initial.boundary, 4, 'the dungeon route heads west to the encounter instead');
    assert(player.canPass(22, 23, 2));
    player.setPosition(22, 24);
    const enemy = gameMap.event(14);
    player._followers = { isSomeoneCollided: () => false };
    assert(enemy.canPass(21, 23, 2));
    enemy._y = 24;
    const after = { ...first, y: 24 };
    assert.equal(solveRoute(geometry, { ...live(), stableEncounters: false }, after).legs[0].direction, 8,
        'the old enemy detour would have reversed the reported direction');
    assert.equal(solveRoute(geometry, live(), after).status, 'enemyBlocked',
        'a fresh request stops at the encounter without needing movement history');
    const continued = { ...after, followedDirection: 2 };
    const blocked = solveRoute(geometry, live(), continued);
    assert.deepEqual(blocked, { status: 'enemyBlocked', enemy: 14, boundary: 4, legs: [], distance: 0,
        arrival: { x: 22, y: 24, facing: null } });
    await verifyWorker(trail, continued, live(), result => assert.deepEqual(result, blocked));
    enemy._y = 23;
    assert.equal(solveRoute(geometry, live(), continued).legs[0].direction, 4, 'continue west after the enemy moves');
    console.log('Verified Cold Brew Trail: follow the existing route to a moving encounter and continue when it clears.');
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
        let latestRefresh = null;
        const refresh = {
            submit(state) {
                const snapshot = captureWorld(c, true, undefined, undefined, [], true);
                latestRefresh = { state, revision: state.revision, snapshot };
                state.waiting = true;
                return true;
            },
            cancel(state) { state.waiting = false; }
        };
        const beacon = createBeacon(c, ready, audio, () => ({ enabled: true, beacon: true, beaconVolume: 70, hrtf: true }),
            text => reports.push(text), refresh);
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
        const start = (refresh = false) => assert(beacon.start(scene, sign, ...point, result, () =>
            warningApproach(gameMap, player._x, player._y, sign), undefined,
            refresh ? { request } : undefined));
        start();
        tick();
        assert(prepare?.ready() && sounds.length === 0);
        prepared = true;
        prepare.done(2);
        c.Graphics.frameCount++;
        tick();
        assert.deepEqual(sounding.bearing, bearing(8, first));
        assert.equal(sounding.cue, CUE.beaconPulse);
        assert.equal(scene._wqaBeaconDue - c.Graphics.frameCount, 90);
        assert(sounding.ready());
        function walk() {
            const start = performance.now();
            for (const encoded of result.course) {
                const direction = DIRECTIONS[encoded & 3];
                c.Input.dir4 = direction;
                player.moveByInput();
                assert(player.isMovementSucceeded());
                const emitted = sounds.length;
                c.Graphics.frameCount++;
                tick();
                assert(sounds.length <= emitted + 1, 'there is at most one scheduled cue during a moving update');
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
        start(true);
        tick();
        c.Input.dir4 = other;
        player.moveByInput();
        assert.equal(sounding, null);
        place(player._x, player._y, player._direction);
        tick();
        assert(beacon.active(scene));
        assert(latestRefresh);
        const { state, snapshot, revision } = latestRefresh;
        const reroute = solveRoute(geometry, snapshot.live, { ...request, x: snapshot.x, y: snapshot.y, limit: undefined });
        assert.equal(reroute.status, 'ready');
        reroute.course = Uint8Array.from(reroute.legs.flatMap(leg =>
            Array.from({ length: leg.tiles }, (_, i) => (Math.min(63, leg.tiles - i) << 2) | DIRECTIONS.indexOf(leg.direction))));
        beacon.refreshResult(state, revision - 1, snapshot.x, snapshot.y, reroute);
        assert.equal(sounding, null);
        beacon.refreshResult(state, revision, snapshot.x, snapshot.y, reroute);
        tick();
        c.Graphics.frameCount += 90;
        tick();
        assert(sounding?.ready(), 'the same selected beacon resumes after a detour');
        assert.equal(reports.length, 1, 'refresh does not repeat the directions or the old off-route message');
        beacon.stop(scene);

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

function verifyMotion(fixture, actors, frames, directions = [], startAt = 0, dashMask = 0, turnPause = 0) {
    const { geometry, gameMap, player } = fixture;
    const patrols = actors.map(copyPatrol);
    assert(patrols.every(Boolean));
    const world = motionWorld(geometry, snapshot(fixture), patrols);
    const view = { x: gameMap._displayX, y: gameMap._displayY,
        width: c.Graphics.width / gameMap.tileWidth(), height: c.Graphics.height / gameMap.tileHeight() };
    const state = startMotion(world, patrols, { x: player.x, y: player.y, rx: player._realX, ry: player._realY,
        speed: player._moveSpeed, jump: 0 }, view);
    let next = 0;
    let turnAt = -1;
    for (let tick = 0; tick < frames; tick++) {
        let heading = null;
        if (tick >= startAt && !player.isMoving() && next < directions.length) {
            if (turnAt < 0) turnAt = tick + (next > 0 && directions[next] !== directions[next - 1] ? turnPause : 0);
            if (tick >= turnAt) {
                heading = directions[next++];
                turnAt = -1;
            }
        }
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
    const switchWrites = [];
    const savedSwitchWriter = c.$gameSwitches.setValue;
    c.$gameSwitches.setValue = (id, value) => switchWrites.push([id, value]);
    assert.equal(advancePatrols(state), 'settled', 'the qualified crystal busy flag has no movement effect');
    assert.deepEqual(switchWrites, [], 'a forecast never writes a native switch');
    distraction.gameMap.updateEvents();
    assert.deepEqual(switchWrites, [[582, true]]);
    for (let index = 0; index < changing.length; index++) assert.deepEqual(state.patrols[index], copyPatrol(changing[index]));
    c.$gameSwitches.setValue = savedSwitchWriter;
    const changingRoom = load(200);
    const roomGuards = configureMotion(changingRoom, 0, 0);
    const returnEvent = changingRoom.gameMap._events[18];
    const returnRoute = changingRoom.map.events[19].pages[0].list[45].parameters[1];
    returnEvent.forceMoveRoute(returnRoute);
    returnEvent._moveRouteIndex = returnRoute.list.findIndex(command => command.code === 27);
    const returnActors = roomGuards.map(copyPatrol);
    const returnPhysics = motionWorld(changingRoom.geometry, snapshot(changingRoom), returnActors);
    assert.equal(advancePatrols(startMotion(returnPhysics, returnActors, { x: 0, y: 0 },
        { x: 0, y: 0, width: 20, height: 11.25 })), 'boundary', 'the parallel-return switch still requires native settlement');
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

async function verifyPatrolGuidance() {
    for (const [id, count] of [[196, 10], [199, 17], [200, 5], [201, 9]]) {
        const cave = load(id);
        const actors = configureMotion(cave, 9, 38, 0, 28);
        const entries = captureWorld(c, false).objects.filter(item => item.patrol);
        assert.equal(entries.length, count);
        assert(entries.every(item => item.category === 'enemies' && item.name === 'Mech Guard'));
        actors[0]._x++;
        assert.equal(captureWorld(c, false).objects.find(item => item.id === actors[0]._eventId)?.x, actors[0]._x);
        actors[0]._erased = true;
        assert(!captureWorld(c, false).objects.some(item => item.id === actors[0]._eventId && item.patrol));
    }
    for (const y of [38, 36]) {
        const cave = load(196);
        const actors = configureMotion(cave, 9, y, 0, 28);
        const request = { ...motionRequest(cave, actors), event: 9, field: true, patrolGuidance: true };
        const plan = previewCrossing(cave.geometry, snapshot(cave), request);
        assert(['ready', 'patrolApproach', 'timedWait'].includes(plan.status), JSON.stringify(plan));
        assert.notEqual(plan.status, 'timed', 'do not speak a short-lived preview as a command');
        await verifyWorker(cave, request, snapshot(cave), result => assert.deepEqual(result, plan));
        assert.deepEqual([plan.status, plan.direction, plan.tiles], ['patrolApproach', 8, 3]);
        let arrived = false;
        for (let check = 0; check < 90; check++) {
            const origin = [cave.player.x, cave.player.y];
            const current = { ...request, ...motionRequest(cave, actors), timingCue: true };
            const next = previewCrossing(cave.geometry, snapshot(cave), current);
            let directions = [];
            let wait = 0;
            if (next.status === 'ready') {
                if (!next.distance) {
                    assert(cave.player.isMoving() === false);
                    assert.equal(Math.abs(cave.player.x - 2) + Math.abs(cave.player.y - 38), 1);
                    arrived = true;
                    break;
                }
                directions = next.legs.flatMap(leg => Array(leg.tiles).fill(DIRECTIONS.indexOf(leg.direction)));
            } else if (next.status === 'patrolApproach') {
                directions = Array(next.tiles).fill(DIRECTIONS.indexOf(next.direction));
            } else if (next.status === 'timedCue') {
                directions = next.opening.headings || Array(next.opening.tiles).fill(DIRECTIONS.indexOf(next.opening.direction));
                wait = next.opening.from;
            } else {
                assert.equal(next.status, 'timedWait', JSON.stringify(next));
                wait = 18;
            }
            const frames = wait + 16 * directions.length;
            assert.equal(verifyMotion(cave, actors, frames, directions, wait), frames,
                'barrel route contacts a guard from ' + origin + ' on ' + next.status + ' at check ' + check);
        }
        assert(arrived, 'the verified step-by-step route reaches the barrel from row ' + y);
    }
    console.log('Verified complete barrel approaches from both reported tiles without guard contact.');

    const initial = load(196);
    const initialActors = configureMotion(initial, 6, 30, 0, 24);
    const roomRequest = { ...motionRequest(initial, initialActors), event: 20, field: true, patrolGuidance: true, timingCue: true };
    const roomPlan = previewCrossing(initial.geometry, snapshot(initial), roomRequest);
    assert.equal(roomPlan.status, 'timedCue');
    assert.deepEqual(roomPlan.opening.headings, [1, 3, 3, 3, 3, 3, 2]);
    await verifyWorker(initial, roomRequest, snapshot(initial), result => assert.deepEqual(result, roomPlan));
    assert.equal(formatSpeech({ kind: 'timedCue', direction: 4, headings: roomPlan.opening.headings, waiting: true }),
        'Wait on this tile. On the ping, go 1 west, then 5 north, then 1 east. Stop there and request directions again.');
    for (const delay of [roomPlan.opening.from, roomPlan.opening.through - 30]) {
        for (const mask of [0, 127]) {
            for (const pause of [0, 18]) {
                const replay = load(196);
                const guards = configureMotion(replay, 6, 30, 0, 24);
                const frames = delay + 7 * 16 + 2 * pause + 45;
                assert.equal(verifyMotion(replay, guards, frames, roomPlan.opening.headings, delay, mask, pause), frames);
                assert.deepEqual([replay.player.x, replay.player.y], [6, 25]);
            }
        }
    }
    const fromLane = load(196);
    const nearby = configureMotion(fromLane, 5, 30, 0, 24);
    for (let n = 0; n < 68; n++) fromLane.gameMap.updateEvents();
    const lanePlan = previewCrossing(fromLane.geometry, snapshot(fromLane),
        { ...motionRequest(fromLane, nearby), event: 20, field: true, patrolGuidance: true, timingCue: true });
    assert.notEqual(lanePlan.status, 'timedWait', 'an exposed starting tile is never offered as a waiting point');

    const north = load(196);
    const northGuards = configureMotion(north, 15, 24, 7.75, 19.25);
    let refuge;
    let refugeRequest;
    for (let n = 0; n < 25; n++) {
        refugeRequest = { ...motionRequest(north, northGuards), event: 20, field: true, patrolGuidance: true, timingCue: true };
        refuge = previewCrossing(north.geometry, snapshot(north), refugeRequest);
        assert.equal(refuge.opening?.tiles ?? refuge.tiles, 4, 'cross to the side refuge in four tiles');
        if (refuge.status === 'timedCue') break;
        for (let i = 0; i < 18; i++) north.gameMap.updateEvents();
    }
    assert.equal(refuge.status, 'timedCue', 'the northbound corridor produces a cue within a patrol cycle');
    assert.deepEqual(refuge.opening.headings, [3, 3, 3, 2]);
    await verifyWorker(north, refugeRequest, snapshot(north), result => assert.deepEqual(result, refuge));
    const refugeFrames = refuge.opening.from + 4 * 16 + 18 + 120;
    assert.equal(verifyMotion(north, northGuards, refugeFrames, refuge.opening.headings, refuge.opening.from, 0, 18), refugeFrames);
    assert.deepEqual([north.player.x, north.player.y], [16, 21]);
    const onward = { ...refugeRequest, ...motionRequest(north, northGuards) };
    const next = previewCrossing(north.geometry, snapshot(north), onward);
    assert.deepEqual(next, { status: 'patrolApproach', direction: 8, tiles: 5, terminal: false });
    assert.equal(formatSpeech({ ...next, kind: 'patrolApproach' }), '5 north.');
    await verifyWorker(north, onward, snapshot(north), result => assert.deepEqual(result, next));
    const northSteps = Array(5).fill(DIRECTIONS.indexOf(8));
    const onwardFrames = 5 * 16 + 240;
    assert.equal(verifyMotion(north, northGuards, onwardFrames, northSteps), onwardFrames);
    assert.deepEqual([north.player.x, north.player.y], [16, 16]);
    const nextCrossing = previewCrossing(north.geometry, snapshot(north), { ...onward, ...motionRequest(north, northGuards) });
    assert(['timedCue', 'timedWait'].includes(nextCrossing.status), 'the next guarded stretch still requires timing');
    assert.deepEqual(nextCrossing.opening?.headings ?? nextCrossing.headings, [1, 3, 3, 3]);
    console.log('Verified five safe north tiles from the side refuge and the next timed crossing.');

    const cave = load(196);
    const actors = configureMotion(cave, 6, 30, 0, 20);
    for (let n = 0; n < 15; n++) cave.gameMap.updateEvents();
    const request = { ...motionRequest(cave, actors), targetX: 5, targetY: 30, area: [5, 30, 6, 30],
        patrolGuidance: true, timingCue: true, timingDirection: 4 };
    const waiting = previewCrossing(cave.geometry, snapshot(cave), request);
    assert.deepEqual([waiting.status, waiting.direction], ['timedWait', 4]);
}

async function verifyLiveCrossing() {
    const cave = load(196);
    const actors = configureMotion(cave, 5, 30, 0, 20);
    const scene = c.SceneManager._scene;
    c.Graphics.frameCount = 200;
    assert.equal(captureMotion(c, c.Graphics), null, 'native entry and lighting pages keep timing closed');
    for (const id of [1, 3, 23, 24]) cave.gameMap._events[id]._erased = true;
    const motion = captureMotion(c, c.Graphics);
    assert(motion?.dash === false && motion.patrols.length === actors.length);
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
    let lastCueFrame = -1;
    let lastCuePitch = 1;
    const timing = createCaveTiming(c, value => value === scene && scene._wqaFieldReady, {
        cues: CUE, isPrepared: () => true,
        play(_scene, _hrtf, cue, gain, bearing, ready, _complete, _source, pitch = 1) {
            assert(ready());
            sounds.push({ cue, gain, bearing: bearing.map(value => value || 0) });
            lastCueFrame = c.Graphics.frameCount;
            lastCuePitch = pitch;
            sounding = true;
            return true;
        },
        retire(_scene, source) {
            assert(['cave', 'caveStop'].includes(source));
            if (source === 'cave') sounding = false;
        }
    }, () => ({ enabled: true, caveTiming: true, caveVolume: 55, hrtf: true }), text => reports.push(text));
    c.WendyQuestAccessCaveTimingStop = owner => timing.stop(owner);
    c.WendyQuestAccessCaveTimingMoved = (owner, direction) => timing.moved(owner, direction);
    c.WendyQuestAccessCaveTimingPose = owner => timing.pose(owner);
    c.WendyQuestAccessFieldEvent = owner => timing.stop(owner);
    scene._wqaFieldReady = true;

    function sampleDelayed(repeat) {
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
        assert(timing.start(captured, 6, 30, result.opening, repeat));
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
    assert.equal(delayed.current.player._direction, 6);
    assert.deepEqual(sounds[0], { cue: CUE.caveGo, gain: 0.55, bearing: [-1, 0, 0] });
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
    assert.equal(reports.length, 0, 'a retired cue never speaks a timing failure');
    const expired = sampleDelayed();
    c.Graphics.frameCount = expired.deadline + 1;
    advanceToCue(expired.current);
    assert.equal(sounds.length, 1);
    assert(!timing.active(scene));
    let refreshing;
    const repeated = sampleDelayed({ direction: 4, tiles: 1, refresh(state) { refreshing = state; return true; } });
    const first = scene._wqaCaveCueDue;
    advanceToCue(repeated.current);
    assert.equal(scene._wqaCaveCueDue, first + 16);
    repeated.current.player.setDirection(2);
    advanceToCue(repeated.current);
    assert.equal(sounds.length, 3, 'two separately verified pulses on the same opening');
    assert.deepEqual(sounds.slice(1).map(sound => sound.bearing), [[-1, 0, 0], [-1, 0, 0]]);
    assert.equal(scene._wqaCaveCueDue, first + 32);
    advanceToCue(repeated.current);
    assert.equal(sounds.length, 3, 'expired openings stop the pulse');
    assert(refreshing, 'keep tracking the crossing without another directions key');
    timing.refreshResult(refreshing, null, null);
    assert.equal(scene._wqaCaveCueDue, first + 48);
    timing.stop(scene);

    // Replay the painted guide as the player follows all seven accepted
    // steps, including the handoff from field speech to traversal cues.
    function replayCrossing(miss) {
        const crossing = load(196);
        const guards = configureMotion(crossing, 6, 30, 0, 24);
        for (const id of [1, 3, 23, 24]) crossing.gameMap._events[id]._erased = true;
        c.Graphics.frameCount = 900;
        const traversalMotion = captureMotion(c, c.Graphics);
        const captured = timing.capture(scene, traversalMotion, { id: 20 });
        const plan = previewCrossing(crossing.geometry, snapshot(crossing),
            { x: 6, y: 30, event: 20, motion: traversalMotion, field: true, patrolGuidance: true, timingCue: true });
        assert.deepEqual(plan.opening.headings, [1, 3, 3, 3, 3, 3, 2]);
        assert(timing.start(captured, 6, 30, plan.opening, { direction: 4, tiles: 7, refresh: () => false }));
        const before = sounds.length;
        advanceToCue(crossing);
        for (const [index, heading] of plan.opening.headings.entries()) {
            if (miss && index === 1) {
                const spoken = reports.length;
                c.Graphics.frameCount += 60;
                advanceToCue(crossing);
                assert.equal(reports.length, spoken, 'an expired crossing in the lane is silent');
                assert(!timing.active(scene) && !sounding);
                return;
            }
            const pulses = sounds.length;
            c.Graphics.frameCount++;
            const stepFrame = c.Graphics.frameCount;
            crossing.gameMap.updateEvents();
            c.Game_CharacterBase.prototype.moveStraight.call(crossing.player, DIRECTIONS[heading]);
            timing.cancelPlan(scene, true);
            for (let n = 0; n < 16; n++) {
                if (n) {
                    c.Graphics.frameCount++;
                    crossing.gameMap.updateEvents();
                }
                c.Game_CharacterBase.prototype.update.call(crossing.player);
                if (scene._wqaCaveCueDue && c.Graphics.frameCount >= scene._wqaCaveCueDue) {
                    timing.update(scene);
                    renderer.emit('postrender');
                }
            }
            if (index + 1 < plan.opening.headings.length) {
                assert.equal(sounds.length, pulses + 1, 'every native step refreshes the next heading');
                assert.equal(lastCueFrame, stepFrame);
            } else {
                assert.equal(sounds.length, pulses + 1, 'a planned stop emits its own cue on the last step');
                assert.equal(lastCueFrame, stepFrame);
                assert.equal(lastCuePitch, 0.8);
                assert.deepEqual(sounds.at(-1), { cue: CUE.wallBump, gain: 0.88, bearing: [0, 0, 1] });
            }
        }
        const cues = sounds.slice(before).filter(sound => sound.cue === CUE.caveGo).map(sound => sound.bearing.join(','));
        const changes = cues.filter((cue, index) => index === 0 || cues[index - 1] !== cue);
        assert.deepEqual(changes, ['-1,0,0', '0,0,1', '1,0,0']);
        assert.deepEqual([crossing.player.x, crossing.player.y], [6, 25]);
        assert(guards.every(event => !event.isStarting()));
        assert(!timing.active(scene) && !sounding);
    }
    replayCrossing(false);
    replayCrossing(true);
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
    if(process.argv.includes('--connection-pages-only')){await require('./connection-pages.cjs')(c,load,read);return;}
    if (process.argv.includes('--crossmap-prerequisite-only')) {
        await require('./crossmap-prerequisite-field.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--prerequisite-continuation-only')) {
        await require('./prerequisite-continuation.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--entrance-prerequisites-only')) {
        await require('./entrance-prerequisites.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--connections-only')) {
        await require('./connection-gates.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--doors-only')) {
        await require('./door-connections.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--vehicles-only')) {
        await verifyVehicleNavigation(c, load, read, verifyWorker);
        return;
    }
    if (process.argv.includes('--transit-only')) {
        await require('./transit-boundaries.cjs')(c,load,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--encounters-only')) {
        await require('./encounter-triggers.cjs')(c,load,verifyWorker,read);
        return;
    }
    if (process.argv.includes('--russetwood-bridge-only')) {
        await require('./russetwood-bridge.cjs')(c,load,snapshot,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--event-regressions-only')) {
        await require('./event-approaches.cjs').verify(c,load,snapshot,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--event-audit-only')) {
        await require('./event-approaches.cjs').audit(c,load,snapshot,read);
        return;
    }
    if (process.argv.includes('--elder-door-only')) {
        await require('./elder-door.cjs').verifyNative(c,load,snapshot,verifyWorker);
        return;
    }
    if (process.argv.includes('--controls-only')) {
        await require('./control-autowalk.cjs')(c,load,verifyWorker,read,snapshot);
        return;
    }
    if (process.argv.includes('--ice-only')) {
        await require('./ice-routes.cjs')(c,load,snapshot,read,verifyWorker);
        return;
    }
    if (process.argv.includes('--autowalk-only')) {
        await verifyAutowalk(c, load, verifyWorker);
        return;
    }
    // Focused fixes may reuse the installed, input-verified geometry. Native
    // loads below and the all-map audit still compare the exact authored data.
    const reused = process.argv.includes('--reuse-geometry') && JSON.parse(fs.readFileSync(path.join(derived,'manifest.json'),'utf8'));
    const catalog = reused ? {maps:Object.keys(reused.maps).length,
        cells:Object.values(reused.maps).reduce((sum,map)=>sum+map.width*map.height,0)} : bake(game, derived);
    if (process.argv.includes('--airship-foot')) {
        await require('./airship-foot.cjs').verifyAirshipFoot(c, load, read, verifyWorker);
        return;
    }
    if (process.argv.includes('--cave-field')) {
        require('./cave-field.cjs').verifyCaveField(c, load, configureMotion);
        return;
    }
    if (process.argv.includes('--breakfast-field')) {
        await require('./breakfast-quest-field.cjs').verifyBreakfastQuestField(c, load, verifyWorker, read('CommonEvents.json'), read('MapInfos.json'));
        return;
    }
    assert.deepEqual(catalog, { maps: 239, cells: 191235 });
    const manifest = JSON.parse(fs.readFileSync(path.join(derived, 'manifest.json'), 'utf8'));
    const weatherMaps = [12, 13, 14, 15, 16, 17, 161, 162, 164, 165, 166, 207, 208];
    assert.deepEqual(Object.keys(manifest.maps).map(Number).filter(id => manifest.maps[id].variants), weatherMaps);
    const rainChecks = compared;
    for (const id of weatherMaps) {
        const fixture = load(id);
        const { map, gameMap, player } = fixture;
        const entry = manifest.maps[id];
        const native = map.events.flatMap(event => event?.pages || []).flatMap(page => page.list)
            .find(command => command.code === 282);
        assert.deepEqual(native.parameters, [11]);
        assert.equal(entry.tileset, 7);
        gameMap.refresh = () => {};
        c.SceneManager._scene._wqaRouteActive = true;
        let invalidations = 0;
        c.WendyQuestAccessFieldChanged = () => invalidations++;
        c.ImageManager = { loadTileset: () => ({ isReady: () => true }) };
        const weather = new c.Game_Interpreter();
        assert(weather.command282(native.parameters));
        assert(weather.command282(native.parameters));
        assert.equal(invalidations, 1, 'reapplying the active weather tileset leaves route admission alone');
        const describeWeather = (tileset, weather) => mapDescription({
            $dataMap: map,
            $gameMap: { _mapId: id, _tilesetId: tileset },
            $gameScreen: { weatherType: () => weather }
        });
        assert.match(describeWeather(7, 'rain'), /Rain darkens the ground/);
        assert.match(describeWeather(11, 'none'), /Sunlight brightens/);
        assert.doesNotMatch(describeWeather(7, 'none'), /Rain darkens|Sunlight brightens/);
        c.SceneManager._scene._wqaRouteActive = false;
        const expected = bakeMap(map, tilesets[11].flags);
        const derived = fixture.geometry.cells.slice();
        for (const cell of entry.variants[11]) derived[cell & 16383] = cell >>> 14;
        assert.deepEqual(derived, expected.cells);
        compare({ ...fixture, geometry: expected });
        if (id === 12 || id === 15) {
            const [x, y] = id === 12 ? [37, 19] : [25, 24];
            player.setPosition(x, y);
            const { live } = captureWorld(c);
            assert.equal(live.tileset, 11);
            const request = { x, y, targetX: x, targetY: y, field: true };
            await verifyWorker(fixture, request, live, result => assert.equal(result.status, 'ready'));
        }
    }
    console.log(`Checked ${compared - rainChecks} dry-weather collision edges across ${weatherMaps.length} maps.`);
    const worldMap = read('Map113.json');
    const describe = (x, y) => mapDescription({ $gameMap: { _mapId: 113 }, $gamePlayer: { _x: x, _y: y }, $dataMap: worldMap });
    for (const [x, y, region] of [[16, 30, 'Fryshire'], [13, 17, 'The Chilly North'], [35, 16, 'Nugget Sands'],
        [34, 35, 'The Breakfast Isles'], [26, 21, 'The Beef Bluffs'], [0, 0, 'Turquoise water']]) {
        assert(describe(x, y).startsWith(region));
    }
    for (let map = 1; map <= 239; map++) {
        const description = mapDescription({ $gameMap: { _mapId: map } });
        assert(description.length <= 512 && formatSpeech({ kind: 'mapDescription', description }) === description);
    }
    assert.match(mapDescription({ $gameMap: { _mapId: 19 } }), /Lighting the torches gradually/);
    const chillcrestDescription = mapDescription({ $gameMap: { _mapId: 25 } });
    assert.match(chillcrestDescription, /ice-cream terraces/);
    assert.match(chillcrestDescription, /Frostyna’s large blue house/);
    assert.match(chillcrestDescription, /red-roofed Wendy’s/);
    assert.equal(formatSpeech({ kind: 'mapDescription', description: chillcrestDescription }), chillcrestDescription);
    const trailDescription = mapDescription({ $gameMap: { _mapId: 36 } });
    assert.match(trailDescription, /snow-white ground.*Oversized fries.*soft serve/);
    assert.match(mapDescription({ $gameMap: { _mapId: 26 } }), /lavender beach/);

    const salt = load(19);
    compare(salt);
    const saltPlan = require('../src/world/puzzles/salt-route.cjs').solveSaltRoute;
    const atEntrance = { x: 24, y: 68 };
    const liveSalt = { ...snapshot(salt), salt: { mask: 0, order: 0, hits: 0, eastOpen: false, finalOpen: false } };
    const saltModel = manifest.maps[19].salt;
    // Use the same packed surface format as captureWorld and the worker.
    liveSalt.terrain = new Uint32Array();
    for (const event of [3, 4, 5, 6, 2]) {
        const request = { ...atEntrance, event, field: true, limit: 8 };
        assert.equal(solveRoute(salt.geometry, liveSalt, request).status, 'unreachable');
        const plan = saltPlan(salt.geometry, liveSalt, request, saltModel, () => false);
        assert.equal(plan.status, 'saltRoute');
        assert.equal(plan.prerequisiteKind, 'floor');
        assert.equal(plan.actions[0], 105);
        assert(plan.actions.includes(36), 'the southern crossing requires its terrain crystal');
        if (event === 2) assert.deepEqual(plan.actions.slice(-4), [19, 20, 21, 22]);
        if (event === 5) assert(plan.actions.includes(120), 'the second flood opens the chest approach');
        const nativeFirst = solveRoute(salt.geometry, liveSalt, { ...atEntrance,
            event: plan.boundaryEvent, field: true, stopBeforeEvent: true });
        assert.deepEqual(plan.arrival, nativeFirst.arrival);
        assert.equal(plan.boundary, nativeFirst.boundary);
        await verifyWorker(salt, request, liveSalt, result => {
            assert.equal(result.status, 'saltRoute');
            assert.deepEqual(result.actions, plan.actions);
        });
    }
    // Resume in the northern chamber after the cave conversation and
    // battles have already retired, with the authored east flood applied.
    const northern = { ...liveSalt, salt: { ...liveSalt.salt, mask: 236, eastOpen: true, order: 2, hits: 3 },
        terrain: Uint32Array.from(saltModel.floods.filter(([bit]) => bit === 8 || bit < 8 && (236 & (1 << bit)))
            .flatMap(([, open]) => open)),
        events: liveSalt.events.map(event => {
            if ([18, 48, 101, 105, 113, 116, 117, 118, 119, 127, 133, 134, 135, 136, 137].includes(event.id))
                return { ...event, erased: true };
            const bit = saltModel.blockers[event.id];
            return bit !== undefined && (236 & (1 << bit)) || event.id === 71
                ? { ...event, normal: false } : event;
        }) };
    const green = northern.events.find(event => event.id === 21);
    const approach = solveRoute(salt.geometry, northern, { x: green.x, y: green.y + 1, event: 21, field: true });
    assert.equal(approach.status, 'ready');
    const continuation = saltPlan(salt.geometry, northern, { x: approach.arrival.x, y: approach.arrival.y,
        event: 2, field: true }, saltModel, () => false);
    assert.equal(continuation?.actions[0], 21);
    assert(!continuation.actions.includes(19) && !continuation.actions.includes(20));
    console.log('Verified four Salt Caverns chest plans, the exit order, and resuming after two colors.');
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
    const routeThroughControl = require('../src/world/terrain-controls.cjs').routeThroughControl;
    for (const [mapId, event, x, y, target] of [
        [12, 56, 43, 15, 7], [27, 43, 7, 41, 4], [36, 37, 29, 19, 6],
        [62, 18, 13, 29, 10], [93, 58, 3, 40, 2], [103, 5, 7, 2, 3], [104, 6, 21, 5, 68]
    ]) {
        const fixture = load(mapId);
        const live = { ...snapshot(fixture), terrain: new Uint32Array(0) };
        const controls = manifest.maps[mapId].controls;
        const request = { x, y, event: target, field: true, limit: 8 };
        assert.equal(solveRoute(fixture.geometry, live, request).status, 'unreachable');
        const route = routeThroughControl(fixture.geometry, live, request, controls, () => false);
        assert.equal(route?.status, 'controlRoute', 'native control on map ' + mapId);
        assert.equal(route.event, event);
        assert.deepEqual(route.arrival, solveRoute(fixture.geometry, live, { ...request, event }).arrival);
        const opened = { ...live, events: live.events.map(row => row.id === event ? { ...row, action: false } : row) };
        assert.equal(routeThroughControl(fixture.geometry, opened, request, controls, () => false), null);
        await verifyWorker(fixture, request, live, output => {
            assert.equal(output.status, 'controlRoute');
            assert.equal(output.event, event);
        });
    }
    console.log('Verified seven ordinary terrain-control prerequisite routes through the packaged worker.');
    const { routeThroughIce } = require('../src/world/terrain-controls.cjs');
    const { iceOpensPassage } = require('../src/world/local-destinations');
    let verifiedIce = 0;
    for (const info of read('MapInfos.json').filter(Boolean)) {
        const data = read(`Map${String(info.id).padStart(3, '0')}.json`);
        for (const entry of data.events.filter(Boolean))
            for (const page of entry.pages)
                if (iceOpensPassage(entry, page)) verifiedIce++;
    }
    assert.equal(verifiedIce, 46);
    const chillcrest = load(25, { self: [26, 27, 28].map(id => '25,' + id + ',A') });
    const { gameMap, player, geometry } = chillcrest;
    player.setPosition(28, 34);
    for (const id of [26, 27, 28]) {
        const event = gameMap.event(id);
        const block = chillcrest.map.events[id].pages[0].list.find(command =>
            command.code === 357 && command.parameters[1] === 'SetBlocker').parameters[3];
        event.SetBlocker(+block.minX, +block.minY, +block.maxX, +block.maxY);
    }
    const house = { x: 28, y: 34, event: 13, field: true, bumpDirections: 15 };
    let view = captureWorld(c);
    assert.equal(solveRoute(geometry, view.live, house).status, 'unreachable');
    const frozen = routeThroughIce(geometry, view.live, house, () => false);
    assert.equal(frozen?.status, 'iceRoute');
    assert.equal(frozen.event, 27);
    assert.equal(routeThroughIce(geometry, view.live, house, () => true).status, 'cancelled');
    await verifyWorker(chillcrest, house, view.live, output => assert.deepEqual(output, frozen));
    verifyRoute(chillcrest, { ...house, event: frozen.event, bumpDirections: undefined }, { ...frozen, status: 'ready' });
    assert.equal(player._x, frozen.arrival.x);
    assert.equal(player._y, frozen.arrival.y);
    const event = gameMap.event(frozen.event);
    assert.equal(event.list().find(command => command.code === 123).parameters[0], 'C');
    const old = c.$gameSelfSwitches.value;
    c.$gameSelfSwitches.value = key => key.join(',') === '25,27,C' || old(key);
    const erasePage = event.findProperPageIndex();
    assert.equal(event.event().pages[erasePage].list[0].code, 214);
    event._erased = true;
    view = captureWorld(c);
    const onward = { ...house, x: player._x, y: player._y };
    assert.equal(solveRoute(geometry, view.live, onward).status, 'ready');
    await verifyWorker(chillcrest, onward, view.live, output => assert.equal(output.status, 'ready'));
    console.log(`Audited ${verifiedIce} ordinary melting pages and verified the route from Chillcrest to Frostyna's house.`);

    const peak = load(27, { self: ['27,41,A'] });
    const icicle = peak.gameMap.event(41);
    const rectangle = peak.map.events[41].pages[0].list.find(command =>
        command.code === 357 && command.parameters[1] === 'SetBlocker').parameters[3];
    icicle.SetBlocker(+rectangle.minX, +rectangle.minY, +rectangle.maxX, +rectangle.maxY);
    // Mirror the stock empty-page state after an erase. The renderer
    // normally runs the remaining setup methods outside this fixture.
    const consumed = event => Object.assign(event, { _erased: true, _through: true, _trigger: null, _pageIndex: -1 });
    const enemy = peak.gameMap.event(13);
    for (const placed of peak.gameMap.events()) {
        if (placed === enemy) placed.setPosition(41, 40);
        else if ([39, 40].includes(placed._eventId) || placed._trigger === 2) consumed(placed);
    }
    peak.player.setPosition(43, 32);
    const marker = { x: 43, y: 32, event: 33, waypoint: true, field: true };
    const blockedPeak = captureWorld(c);
    assert.equal(solveRoute(peak.geometry, blockedPeak.live, marker).status, 'unreachable');
    assert.equal(blockedPeak.objects.find(item => item.id === 22)?.name, 'West exit to world map');
    assert.equal(blockedPeak.objects.find(item => item.id === 27)?.name, 'Peak approach');
    let nextIce;
    await verifyWorker(peak, marker, blockedPeak.live, result => {
        assert.equal(result.status, 'enemyBlocked');
        assert.equal(result.enemy, 13);
        assert.deepEqual(result.terrain, { status: 'iceRoute', event: 41 });
        assert.equal(formatSpeech({ kind: 'routeDirections', name: 'Quest marker', directionsOnly: true,
            legs: result.legs, enemyBlocked: true, boundary: result.boundary, afterEnemy: 'the ice block' }).includes(
            'Once clear, approach the ice block and press the action button'), true);
        verifyRoute(peak, { x: marker.x, y: marker.y, targetX: result.arrival.x, targetY: result.arrival.y },
            { ...result, status: 'ready' });
    });
    consumed(enemy);
    await verifyWorker(peak, marker, captureWorld(c).live, result => {
        assert.equal(result.status, 'iceRoute');
        assert.equal(result.event, 41);
        nextIce = result.arrival;
        verifyRoute(peak, { x: marker.x, y: marker.y, event: 41 }, { ...result, status: 'ready' });
    });
    consumed(icicle);
    await verifyWorker(peak, { ...marker, x: nextIce.x, y: nextIce.y }, captureWorld(c).live, result => {
        assert.equal(result.status, 'interrupted');
        assert([27, 32].includes(result.boundaryEvent));
    });
    console.log('Verified the Frosty Peak enemy, ice and story approach as three safe route prefixes.');

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
    await verifyEnemyBlockedBeacon();
    await verifyColdBrewProgress();
    verifyNativePatrolMotion();
    verifyCaveProgression(c, load, snapshot, verifyRoute, read);
    await verifyLocalDestinations(c, load, verifyRoute, verifyWorker, read);
    await verifyNavigationAuditFixes(c, load, verifyRoute, verifyWorker, read);
    await verifyVehicleNavigation(c, load, read, verifyWorker);
    await require('./airship-foot.cjs').verifyAirshipFoot(c, load, read, verifyWorker);
    await verifyAutowalk(c, load, verifyWorker);
    verifySoundscape(c, load);
    await verifyCrossingPreview();
    await verifyPatrolGuidance();
    await verifyCaveCrossings(c, load, configureMotion, motionRequest, verifyMotion, verifyWorker);
    await verifyLiveCrossing();
    await verifyWarningApproach();
    const entry = read('Map199.json').events[26].pages.flatMap(page => page.list).find(command =>
        command.code === 201 && command.parameters[1] === 200).parameters;
    const secret = load(200);
    const distraction = { x: entry[2], y: entry[3], event: 5 };
    verifyRoute(secret, distraction, solveRoute(secret.geometry, snapshot(secret), distraction));
    await verifyReachability(c, load, verifyWorker);
    await verifyQuestDestinations(c, game, read, load, verifyRoute, verifyWorker);
    await verifyBookmarks(c, load, verifyRoute, verifyWorker);
    await verifyTransferBookmarks(c, load, verifyRoute, verifyWorker, read('CommonEvents.json'));
    await verifyWorldDetours(c, load, verifyWorker, read('CommonEvents.json'), read('MapInfos.json'));
    await require('./world-detour-field.cjs').verifyWorldDetourField(c, load, verifyWorker, read('CommonEvents.json'), read('MapInfos.json'));
    await require('./breakfast-quest-field.cjs').verifyBreakfastQuestField(c, load, verifyWorker, read('CommonEvents.json'), read('MapInfos.json'));
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
