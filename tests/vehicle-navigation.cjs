'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute } = require('../src/world/routes.cjs');
const { travelMode } = require('../src/world/vehicle-navigation');
const { worldBoundaryName } = require('../src/world/world-destinations');
const { createBeacon } = require('../src/world/beacon');
const { CUE } = require('../src/runtime/audio');
const { formatSpeech } = require('../src/services/speech-text.cjs');

async function verifyVehicleNavigation(c, load, read, verifyWorker) {
    const scene = c.SceneManager._scene;
    const { inBattle, onPlayerWalk } = c.$gameParty;
    const common = c.$dataCommonEvents;
    const input = c.Input;
    const leaving = [];
    c.$gameParty.inBattle = () => false;
    c.$gameParty.onPlayerWalk = () => {};
    c.$gameMessage = { isBusy: () => false };
    c.$gameSystem = { saveWalkingBgm() {}, replayWalkingBgm() {} };
    c.$dataCommonEvents = read('CommonEvents.json');
    c.Tyruswoo.TileControl.param = {};
    c.Input = { isTriggered: key => key === 'ok' };
    c.WendyQuestAccessSceneLeaving = () => {
        leaving.push(c.$gamePlayer._vehicleType);
        scene._wqaRouteActive = false;
    };

    function begin(id, switches = [], self = []) {
        const fixture = load(id, { switches, self });
        const { gameMap, player } = fixture;
        delete player.direction;
        player._followers = { areGathering: () => false, gather() {}, synchronize() {}, updateMove() {} };
        player.updateEncounterCount = () => {};
        player._waitCount = 0;
        gameMap.refreshIfNeeded = () => {};
        gameMap.setupTestEvent = gameMap.setupAutorunCommonEvent = () => false;
        for (const craft of gameMap.vehicles()) {
            Object.defineProperties(craft, { x: { get: () => craft._x }, y: { get: () => craft._y } });
            Object.assign(craft, { _altitude: 0, _driving: false, _moveSpeed: 5, playBgm() {} });
        }
        const enabled = new Set(switches);
        const variables = new Map();
        c.$gameSwitches.value = key => enabled.has(key);
        c.$gameSwitches.setValue = (key, value) => value ? enabled.add(key) : enabled.delete(key);
        c.$gameVariables.value = key => variables.get(key) ?? 0;
        c.$gameVariables.setValue = (key, value) => variables.set(key, value);
        const keys = new Set(self);
        c.$gameSelfSwitches.value = key => keys.has(key.join(','));
        c.$gameSelfSwitches.setValue = (key, value) => value ? keys.add(key.join(',')) : keys.delete(key.join(','));
        const source = gameMap._interpreter = interpreter();
        return { ...fixture, source, ship: gameMap.ship() };
    }

    function interpreter(list, eventId) {
        return Object.assign(new c.Game_Interpreter(), {
            setupReservedCommonEvent: () => false,
            setup(commands, id) {
                Object.assign(this, { _list: commands, _eventId: id, _mapId: c.$gameMap._mapId, _index: 0, _branch: {} });
            },
            setupChild(commands, id) { execute(interpreter(commands, id)); }
        }, { _list: list, _eventId: eventId, _mapId: c.$gameMap._mapId, _index: 0, _branch: {} });
    }
    function execute(source) {
        let count = 0;
        while (source.currentCommand()) {
            assert(count++ < 60);
            assert(source.executeCommand());
        }
    }
    function settle(player) {
        player._realX = player._x;
        player._realY = player._y;
        player.updateVehicle();
    }
    function follow(fixture, result, expectedEvent) {
        const { source, player } = fixture;
        for (const leg of result.legs) for (let tile = 0; tile < leg.tiles; tile++) {
            assert(!source._list, 'a native event must end the route');
            player.moveStraight(leg.direction);
            assert(player.isMovementSucceeded());
            settle(player);
            player.updateNonmoving(true, false);
        }
        assert.deepEqual([player._x, player._y], [result.arrival.x, result.arrival.y]);
        assert.equal(source._eventId, expectedEvent);
    }
    function directions(fixture, id, status = 'ready') {
        const view = captureWorld(c);
        const target = view.objects.find(item => item.id === id);
        assert(target, `Missing native target ${id}`);
        const request = { x: view.x, y: view.y, event: target.id, field: true, surface: view.mode !== 'walk',
            entryDirection: target.entryDirection, vehicle: target.vehicle, limit: 8, beacon: true };
        const result = solveRoute(fixture.geometry, view.live, request);
        const boundary = result.boundary && [
            fixture.gameMap.roundXWithDirection(result.arrival.x, result.boundary),
            fixture.gameMap.roundYWithDirection(result.arrival.y, result.boundary)];
        assert.equal(result.status, status, target.name + (boundary ? ` at ${boundary}` : ''));
        return { view, target, request, result };
    }

    const coast = begin(113, [221]);
    const { player, gameMap, ship } = coast;
    player.setPosition(35, 9);
    player._vehicleType = 'ship';
    ship._driving = true;
    ship.setLocation(113, 35, 9);
    assert.equal(travelMode(gameMap, player), 'ship');
    const landing = directions(coast, 51);
    assert.deepEqual(landing.view.objects.map(target => target.id), [30, 31, 51]);
    assert.equal(landing.result.legs.at(-1).direction, 6);
    await verifyWorker(coast, landing.request, landing.view.live, result => {
        assert.deepEqual(result.arrival, landing.result.arrival);
        assert.equal(result.course.length, landing.result.distance);
    });
    assert(!player.triggerButtonAction(), 'native OK skips surface disembarkation');
    assert.equal(travelMode(gameMap, player), 'ship');
    follow(coast, landing.result, 51);
    assert.equal(player.direction(), 6);
    assert(ship.isLandOk(44, 2, 6));
    scene._wqaRouteActive = true;
    execute(coast.source);
    assert.equal(leaving.at(-1), 'ship', 'the accepted landing retires the old route before mode changes');
    assert(player._vehicleGettingOff);
    assert.equal(travelMode(gameMap, player), null);
    assert.deepEqual([player._x, player._y], [45, 2]);
    settle(player);
    assert.equal(travelMode(gameMap, player), 'walk');
    player.updateRoutineMove();
    assert.deepEqual([player._x, player._y], [46, 2]);
    settle(player);
    player.updateRoutineMove();
    assert(!player.isMoveRouteForcing());
    coast.source._list = null;
    coast.source._eventId = undefined;
    assert.equal(c.$gameSwitches.value(221), false);
    const discovery = directions(coast, 13, 'interrupted');
    const ruins = discovery.view.objects.filter(item => /^Lost Ruins \d+$/.test(item.name));
    assert.equal(ruins.length, 21);
    assert.equal(new Set(ruins.map(item => item.name)).size, 21);
    assert.equal(discovery.result.boundaryEvent, 90);
    assert.equal(worldBoundaryName(c, 90), 'Secret Island discovery');
    follow(coast, discovery.result, undefined);
    player.moveStraight(discovery.result.boundary);
    settle(player);
    player.updateNonmoving(true, false);
    assert.equal(coast.source._eventId, 90);
    execute(coast.source);
    assert(c.$gameSelfSwitches.value([113, 90, 'A']));
    const visited = gameMap._events[90];
    visited.setupPage = () => { visited._trigger = visited.page().trigger; };
    visited.refresh();
    assert.equal(visited._pageIndex, 1);
    assert.equal(worldBoundaryName(c, 90), '');
    coast.source._list = null;
    coast.source._eventId = undefined;
    const island = directions(coast, 13);
    follow(coast, island.result, 13);
    execute(coast.source);
    assert(player.isTransferring());
    assert.deepEqual([player._newMapId, player._newX, player._newY], [206, 9, 16]);

    const shore = begin(206);
    shore.player.setPosition(9, 16);
    const islandExit = directions(shore, 4);
    assert.equal(islandExit.target.name, 'Return to world map');
    follow(shore, islandExit.result, 4);
    execute(shore.source);
    assert.deepEqual([shore.player._newMapId, shore.player._newX, shore.player._newY], [113, 48, 7]);

    const wrongSide = begin(113);
    wrongSide.player.setPosition(45, 2);
    wrongSide.player.setDirection(8);
    wrongSide.player.updateNonmoving(true, false);
    execute(wrongSide.source);
    assert(!wrongSide.player._vehicleGettingOn);
    assert(!wrongSide.ship._driving);
    assert.deepEqual([wrongSide.ship._x, wrongSide.ship._y], [44, 2]);

    const dock = begin(113, [], ['113,90,A']);
    dock.player.setPosition(48, 7);
    const boarding = directions(dock, 94);
    assert.equal(boarding.result.legs.at(-1).direction, 4);
    follow(dock, boarding.result, 94);
    scene._wqaRouteActive = true;
    execute(dock.source);
    assert.equal(leaving.at(-1), 'walk', 'boarding retires the walking route before assigning the vehicle');
    assert(dock.player._vehicleGettingOn);
    assert.equal(travelMode(dock.gameMap, dock.player), null);
    settle(dock.player);
    assert.equal(travelMode(dock.gameMap, dock.player), 'ship');
    assert(dock.ship._driving);
    assert(dock.player._transparent);

    const parked = begin(113, [221]);
    parked.player.setPosition(45, 2);
    parked.player.setDirection(4);
    parked.ship.setLocation(113, 44, 2);
    const boat = directions(parked, 514);
    assert.equal(boat.result.distance, 0);
    assert.equal(boat.result.arrival.facing, 4);
    assert.match(formatSpeech({ kind: 'routeDirections', name: boat.target.name, legs: [], facing: 4, board: true }),
        /face west and press the action button/);
    const renderer = new EventEmitter();
    c.Graphics.app = { renderer };
    c.Graphics.frameCount = 700;
    const cues = [];
    const audio = { cues: CUE, isPrepared: () => true, play(_scene, _hrtf, cue) { cues.push(cue); return true; }, retire() {} };
    const beacon = createBeacon(c, () => true, audio, () => ({ enabled: true, beacon: true, beaconVolume: 60 }), () => {});
    assert(beacon.start(scene, 514, 45, 2, { ...boat.result, course: new Uint8Array() }, null, 'ship'));
    beacon.update(scene);
    renderer.emit('postrender');
    assert.deepEqual(cues, [CUE.beaconArrival]);
    beacon.stop(scene);
    assert(parked.player.triggerButtonAction());
    settle(parked.player);
    assert.equal(travelMode(parked.gameMap, parked.player), 'ship');

    const forced = begin(206);
    forced.player.setPosition(9, 16);
    forced.player._vehicleType = 'ship';
    forced.ship._driving = true;
    forced.ship._mapId = 206;
    new c.Scene_Map().forceLeaveVehicle();
    assert.equal(forced.player._vehicleType, '');
    assert.equal(captureWorld(c).mode, 'walk');
    assert.equal(forced.ship._mapId, 113);

    for (const [id, start, destination] of [[30, [18, 6], 26], [31, [35, 9], 49]]) {
        const port = begin(113, [38, 221]);
        port.player.setPosition(...start);
        port.player._vehicleType = 'ship';
        port.ship._driving = true;
        port.ship.setLocation(113, ...start);
        const course = directions(port, id);
        follow(port, course.result, id);
        port.source._index = port.source._list.findIndex(command => command.code === 201);
        assert(port.source.executeCommand());
        assert.equal(port.player._newMapId, destination);
    }

    c.$gameParty.inBattle = inBattle;
    c.$gameParty.onPlayerWalk = onPlayerWalk;
    c.$dataCommonEvents = common;
    c.Input = input;
    delete c.Graphics.app;
    delete c.$gameMessage;
    delete c.$gameSystem;
    delete c.$gameSwitches.setValue;
    delete c.$gameSelfSwitches.setValue;
    delete c.$gameVariables.setValue;
    delete c.WendyQuestAccessSceneLeaving;
    delete c.Tyruswoo.TileControl.param;
    console.log('Verified native ship landing, island transfer and return, exact reboarding direction, parked boat and forced handback.');
}

module.exports = { verifyVehicleNavigation };
