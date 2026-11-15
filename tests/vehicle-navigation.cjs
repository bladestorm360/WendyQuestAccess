'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { composeWorld, LAND, DIRECTIONS } = require('../src/world/geometry.cjs');
const { travelMode, createVehicleNotice } = require('../src/world/vehicle-navigation');
const { worldBoundaryName } = require('../src/world/world-destinations');
const { createBeacon } = require('../src/world/beacon');
const { createField } = require('../src/world/field');
const { createTransferBookmarks } = require('../src/world/transfer-bookmarks');
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
            setupChild(commands, id) {
                const child = interpreter(commands, id);
                child.command355 = () => true; // The port common events' scripts only log.
                execute(child);
            }
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
    function follow(fixture, result, expectedEvent, eraseOnly = false) {
        const { source, player } = fixture;
        // Spoken directions are capped at eight turns. The beacon course
        // carries every step when the fixture follows a longer route.
        const legs = result.more && result.course
            ? Array.from(result.course, value => ({ direction: DIRECTIONS[value & 3], tiles: 1 })) : result.legs;
        for (const leg of legs) for (let tile = 0; tile < leg.tiles; tile++) {
            assert(!source._list, 'native event ' + source._eventId + ' must end the route at ' + player._x + ',' + player._y);
            player.moveStraight(leg.direction);
            assert(player.isMovementSucceeded());
            settle(player);
            player.updateNonmoving(true, false);
            if (eraseOnly && source._list?.map(command => command.code).join(',') === '214,0') {
                const consumed = fixture.gameMap._events[source._eventId];
                consumed.setupPage = () => { consumed._trigger = undefined; };
                execute(source);
                assert(consumed._erased);
                source._list = null;
                source._eventId = undefined;
            }
        }
        assert.deepEqual([player._x, player._y], [result.arrival.x, result.arrival.y]);
        assert.equal(source._eventId, expectedEvent);
    }
    function directions(fixture, id, status = 'ready') {
        const view = captureWorld(c, true, undefined, undefined, [], false, true);
        const target = view.objects.find(item => item.id === id);
        assert(target, `Missing native target ${id}`);
        const request = { x: view.x, y: view.y, event: target.nearestLanding ? undefined : target.id, field: true,
            surface: view.mode === 'ship' || view.mode === 'boat', landing: view.mode === 'airship',
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
    const previousQuests = c.$gameParty._quests;
    c.$gameParty._quests = {};
    c.$gameSelfSwitches.setValue([113, 107, 'A'], true);
    const revealed = captureWorld(c).objects;
    assert(revealed.some(target => target.id === 108 && target.shoreMap === 171));
    assert(!revealed.some(target => target.id === 110 || target.id === 51 || target.id === 71));
    c.$gameSwitches.setValue(509, true);
    assert(!captureWorld(c).objects.some(target => target.id === 51), 'an unlocated mention is insufficient');
    c.$gameSwitches.setValue(619, true);
    assert(captureWorld(c).objects.some(target => target.id === 51));
    c.$gameSwitches.setValue(619, false);
    c.$gameSelfSwitches.setValue([113, 107, 'A'], false);
    c.$gameParty._quests = previousQuests;
    const landing = directions(coast, 51);
    assert.deepEqual(landing.view.objects.filter(target => !target.shoreMap).map(target => target.id), [24, 30, 31, 51, 155, 156, 158]);
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
    assert.equal(worldBoundaryName(c, 90), 'Discovery marker');
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
    assert.equal(islandExit.target.name, 'South exit to world map');
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

    for (const event of [24, 158]) {
        const sailing = begin(113, [38, 221]);
        sailing.ship.setLocation(113, 18, 6);
        sailing.ship._driving = true;
        sailing.player._vehicleType = 'ship';
        sailing.player.setPosition(18, 6);
        const view = captureWorld(c);
        assert.equal(view.objects.find(item => item.id === event && item.category === 'events')?.name, 'Discovery marker');
        const request = { x: 18, y: 6, event, field: true, surface: true, stopBeforeEvent: true, autowalk: true };
        assert.equal(findReachable(sailing.geometry, view.live, { ...request, candidates: [request] }).available[0], 1);
        await verifyWorker(sailing, request, view.live, route => {
            assert.equal(route.status, 'interrupted');
            assert.equal(route.boundaryEvent, event);
            assert.equal(route.course.length, route.distance);
            follow(sailing, { ...route, legs: [...route.legs, { direction: route.boundary, tiles: 1 }],
                arrival: { x: sailing.gameMap.roundXWithDirection(route.arrival.x, route.boundary),
                    y: sailing.gameMap.roundYWithDirection(route.arrival.y, route.boundary) } }, event);
        });
    }

    await verifyFloatFort();
    verifyTravelNotices();
    await verifyPortBookmarks();
    await verifyLandingBookmarks();
    await verifyAirship();

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

    async function verifyFloatFort() {
        const oldScene = c.SceneManager._scene;
        const app = c.Graphics.app;
        const screen = c.$gameScreen;
        const listen = c.addEventListener;
        const members = c.$gameParty.members;
        const frames = new EventEmitter();
        c.addEventListener = () => {};
        c.$gameScreen = { _brightness: 255 };
        c.$gameParty.members = () => [4];
        const owner = { _wqaFieldReady: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
        c.SceneManager._scene = owner;
        c.Graphics.app = { stage: owner, renderer: frames };
        const packets = [];
        const records = [];
        const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: packet => packets.push(packet) });
        const field = createField(c, { graphics: c.Graphics, manager: c.SceneManager, hasFocus: () => true,
            screenFading: () => false, navigationPreferences: () => ({}),
            makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker },
        { open(record) { records.push(record); return records.length; }, close() {} });

        function site(id, x, y) {
            const current = begin(id, [33, 38, 250]);
            current.gameMap.inactiveTime = 0;
            current.player.setPosition(x, y);
            if (id === 113) {
                const gate = current.gameMap._events[145];
                gate.setupPage = () => { gate._trigger = undefined; };
                gate.erase();
            }
            return current;
        }
        function ask(action) {
            assert(field.command(action));
            frames.emit('postrender');
        }
        async function answer(fixture, event) {
            const packet = packets.shift();
            assert(packet);
            assert.equal(packet.request.event, event);
            let output;
            await verifyWorker(fixture, { ...packet.request, beacon: true }, packet.live, result => output = result);
            worker.emit('message', { ...packet, result: output });
            return output;
        }
        function enter(fixture, result) {
            follow(fixture, result, undefined, fixture.id === 25);
            fixture.player.moveStraight(result.boundary);
            assert(fixture.player.isMovementSucceeded());
            settle(fixture.player);
            fixture.player.updateNonmoving(true, false);
            assert.equal(fixture.source._eventId, result.boundaryEvent);
            return fixture.source._list;
        }
        const east = site(113, 14, 17);
        const world = captureWorld(c, true, undefined, owner);
        assert.equal(world.objects.find(item => item.id === 21)?.name, 'Float Fort');
        assert(!world.objects.some(item => [30, 31].includes(item.id)));
        for (let index = 0; index < 12 && records.at(-1)?.category !== 'Exits'; index++)
            ask('nextCategory');
        assert.equal(records.at(-1)?.category, 'Exits');
        for (let index = 0; index < world.objects.length && records.at(-1)?.name !== 'Float Fort'; index++)
            ask('nextDestination');
        assert.equal(records.at(-1)?.name, 'Float Fort');
        ask('directions');
        const first = await answer(east, 21);
        assert.equal(first.boundaryEvent, 19);
        assert.equal(first.boundary, 4);
        assert.match(formatSpeech(records.at(-1)), /take exit to Chillcrest.*west exit to the world map/i);
        assert(enter(east, first).some(row => row.code === 201 && row.parameters.slice(1, 4).join(',') === '25,47,27'));

        const town = site(25, 47, 27);
        // Native transfers keep the same player. Model that identity across
        // both scene handbacks while loading each map's stock event pages.
        const player = east.player;
        c.$gamePlayer = town.player = player;
        player.setPosition(47, 27);
        ask('directions');
        const townPacket = packets[0];
        assert([14, 18, 19].includes(townPacket?.request.event));
        const leaving = await answer(town, townPacket.request.event);
        assert([14, 18, 19].includes(leaving.boundaryEvent));
        assert(enter(town, leaving).some(row => row.code === 201 && row.parameters.slice(1, 4).join(',') === '113,12,17'));

        const west = site(113, 12, 17);
        c.$gamePlayer = west.player = player;
        player.setPosition(12, 17);
        ask('directions');
        const last = await answer(west, 21);
        assert.equal(last.boundaryEvent, 21);
        assert(enter(west, last).some(row => row.code === 201 && row.parameters.slice(1, 4).join(',') === '26,1,22'));

        const fort = site(26, 2, 22);
        const quay = directions(fort, 5);
        assert.equal(quay.target.name, 'Board the boat from the quay');
        assert.equal(quay.target.category, 'vehicles');
        follow(fort, quay.result, 5);
        assert(fort.source._list.some(row => row.code === 201 && row.parameters.slice(1, 5).join(',') === '113,17,6,6'));
        field.leave(owner);
        c.SceneManager._scene = oldScene;
        c.Graphics.app = app;
        c.$gameScreen = screen;
        c.addEventListener = listen;
        c.$gameParty.members = members;
        console.log('Verified Float Fort from both sides of Chillcrest, including the westward handback and quay.');
    }

    function verifyTravelNotices() {
        const frames = new EventEmitter();
        const host = { graphics: { app: { renderer: frames } } };
        const { player, gameMap, ship } = begin(113);
        const owner = {};
        const spoken = [];
        let valid;
        const notice = createVehicleNotice(c, host, () =>
            !player._vehicleGettingOn && !player._vehicleGettingOff && !player._transferring,
        { open(record, check) { valid = check; spoken.push(record.name); return spoken.length; }, close() {} });
        function render(scene = owner) {
            notice.observe(scene);
            notice.observe(scene);
            assert(frames.listenerCount('postrender') <= 1);
            frames.emit('postrender');
        }
        player.setPosition(17, 6);
        player.setDirection(6);
        ship.setLocation(113, 18, 6);
        render();
        assert(player.triggerButtonAction());
        render();
        assert.deepEqual(spoken, []);
        settle(player);
        render();
        render({});
        assert.deepEqual(spoken, ['On boat.']);
        assert.equal(typeof valid, 'function');
        ship._driving = false;
        player._vehicleType = '';
        render({});
        assert.deepEqual(spoken, ['On boat.', 'On foot.']);

        const airship = gameMap.airship();
        airship.setLocation(113, player._x, player._y);
        airship._driving = true;
        player._vehicleType = 'airship';
        player._through = true;
        render();
        assert.deepEqual(spoken, ['On boat.', 'On foot.']);
        airship._altitude = airship.maxAltitude();
        notice.observe(owner);
        notice.leave(owner);
        frames.emit('postrender');
        assert.equal(spoken.length, 2);
        render();
        assert.equal(spoken.at(-1), 'On airship.');
        notice.leave(owner);
        assert(!valid());
        console.log('Verified one travel notice after native boarding and handback, including the aircraft readiness gate.');
    }

    async function verifyPortBookmarks() {
        const leave = c.WendyQuestAccessSceneLeaving;
        const app = c.Graphics.app;
        const screen = c.$gameScreen;
        const listen = c.addEventListener;
        c.addEventListener = () => {};
        c.$gameScreen = { _brightness: 255 };
        for (const [id, start, map, x, y, portName] of [
            [30, [18, 6], 26, 29, 14, 'Float Fort port'],
            [31, [35, 9], 49, 2, 13, 'Breaded Bay port']
        ]) {
            const port = begin(113, [38, 221]);
            const { player, gameMap, ship, source } = port;
            player.setPosition(...start);
            player._vehicleType = 'ship';
            ship._driving = true;
            ship.setLocation(113, ...start);
            gameMap.inactiveTime = 0;
            const readiness = { _wqaFieldReady: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
            Object.assign(scene, readiness);
            c.SceneManager._scene = scene;
            c.Graphics.app = { stage: scene, renderer };

            const bookmark = { id: 1, revision: 1, kind: 'point', name: 'Town marker', mode: 'walk', map, x, y };
            const transfers = createTransferBookmarks(c, { graphics: c.Graphics });
            const edge = transfers.candidates().entrances.find(candidate => candidate.event === id);
            assert.equal(edge?.map, map);
            transfers.arm(scene, { id: 1, revision: 1, trail: [] }, edge);
            transfers.accepted(scene, gameMap._events[id]);
            source.setup(edge.list, id);
            assert(c.Graphics._wqaBookmarkTransferPending);
            transfers.reserved(scene, player, map, x, y, edge.direction);
            assert(!c.Graphics._wqaBookmarkTransferPending, 'reservation without native disembarkation is rejected');
            source._list = null;

            const packets = [];
            const records = [];
            const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: packet => packets.push(packet) });
            const field = createField(c, { graphics: c.Graphics, manager: c.SceneManager, hasFocus: () => true,
                screenFading: () => false, bookmarks: () => [bookmark], navigationPreferences: () => ({}),
                makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker },
            { open(record) { records.push(record); return records.length; }, close() {} });
            c.WendyQuestAccessSceneLeaving = owner => { leave(owner); field.leave(owner); };
            c.WendyQuestAccessBookmarkEntranceAccepted = field.bookmarkEntranceAccepted;
            c.WendyQuestAccessBookmarkTransferReserved = field.bookmarkTransferReserved;
            assert(field.bookmarkContext(scene).canSelect(bookmark));
            scene._wqaSettingsActive = true;
            assert(field.selectBookmark(scene, bookmark));
            scene._wqaSettingsActive = false;
            assert(field.command('directions'));
            renderer.emit('postrender');
            const packet = packets.pop();
            assert.equal(packet.live.mode, 'ship');
            assert.equal(packet.request.transfer.map, map);
            let course;
            await verifyWorker(port, packet.request, packet.live, result => {
                assert.equal(result.status, 'ready');
                assert.equal(result.entrance, id);
                course = result;
            });
            worker.emit('message', { ...packet, result: course });
            assert.equal(records.at(-1).name, `${portName} toward Town marker`);
            assert.match(formatSpeech(records.at(-1)), /^\d+ (?:north|south|east|west)/);
            assert.doesNotMatch(formatSpeech(records.at(-1)), /Town marker/);
            follow(port, course, id);
            assert(c.Graphics._wqaBookmarkTransferPending);
            source.command357 = () => true; // Keep quest presentation out of the movement fixture.
            for (let steps = 0; !player.isTransferring() && steps < 20; steps++) {
                assert(source.executeCommand());
                if (source._waitMode !== 'route') continue;
                for (let ticks = 0; player.isMoveRouteForcing() && ticks < 8; ticks++) {
                    player.updateRoutineMove();
                    settle(player);
                }
                assert(!player.isMoveRouteForcing());
                source._waitMode = '';
            }
            assert.deepEqual([player._newMapId, player._newX, player._newY], [map, x, y]);
            assert(player._vehicleGettingOff && !ship._driving && c.Graphics._wqaBookmarkTransferPending);
            assert(!field.command('directions'));

            // The engine reuses the map and player objects across the native reservation.
            const town = load(map);
            Object.assign(gameMap, town.gameMap, { _interpreter: source, inactiveTime: 0 });
            source._list = null;
            c.$gameMap = gameMap;
            c.$gamePlayer = player;
            player.setPosition(x, y);
            player._transferring = false;
            const arrival = { ...readiness };
            c.SceneManager._scene = c.Graphics.app.stage = arrival;
            field.observeReady(arrival);
            assert(c.Graphics._wqaBookmarkTransferPending, 'handback waits for native walking control');
            player._vehicleType = '';
            player._vehicleGettingOff = false;
            field.observeReady(arrival);
            assert(!c.Graphics._wqaBookmarkTransferPending);
            assert(field.command('directions'));
            renderer.emit('postrender');
            const walking = packets.pop();
            assert.equal(walking.live.mode, 'walk');
            assert.deepEqual([walking.request.targetX, walking.request.targetY], [x, y]);
            field.leave(arrival);
        }
        c.SceneManager._scene = scene;
        c.Graphics.app = app;
        c.$gameScreen = screen;
        c.addEventListener = listen;
        c.WendyQuestAccessSceneLeaving = leave;
        delete c.WendyQuestAccessBookmarkEntranceAccepted;
        delete c.WendyQuestAccessBookmarkTransferReserved;
        console.log('Verified both ship ports, native disembarkation, exact reservation, and restored walking bookmark selection.');
    }

    async function verifyLandingBookmarks() {
        const leave = c.WendyQuestAccessSceneLeaving;
        const app = c.Graphics.app;
        const screen = c.$gameScreen;
        const listen = c.addEventListener;
        c.addEventListener = () => {};
        c.$gameScreen = { _brightness: 255 };
        for (const [mode, start, target, area, entrance, reveal] of [
            ['ship', [43, 2], [46, 2], 113],
            ['airship', [44, 29], [43, 28], 113],
            ['ship', [43, 2], [9, 16], 206, 13],
            ['airship', [3, 29], [7, 2], 161, 76],
            ['ship', [43, 2], [9, 16], 206, 13, 90],
            ['airship', [43, 28], [1, 8], 176, 122, 124]
        ]) {
            const landing = begin(113, [221], reveal === 90 ? ['113,75,A'] : ['113,75,A', '113,90,A']);
            const { player, gameMap, source } = landing;
            const aircraft = mode === 'airship';
            const craft = gameMap.vehicle(mode);
            craft.setLocation(113, ...start);
            craft._driving = true;
            craft._altitude = aircraft ? craft.maxAltitude() : 0;
            player.setPosition(...start);
            player._vehicleType = mode;
            player._through = aircraft;
            if (reveal === 124) {
                const { width, height, data } = landing.map;
                const region = 5 * width * height + 28 * width + 43;
                data[region] = 253;
                c.$gameTileChanges[113] = { [region]: 253 };
            }
            gameMap.inactiveTime = 0;
            Object.assign(scene, { _wqaFieldReady: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 });
            const frames = new EventEmitter();
            c.Graphics.app = { stage: scene, renderer: frames };
            const bookmark = { id: 1, revision: 1, kind: 'point', name: 'Walking marker', mode: 'walk',
                map: area, x: target[0], y: target[1] };
            const beacon = { enabled: () => true, start() {}, stop() {} };
            const records = [];
            const packets = [];
            const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: packet => packets.push(packet) });
            const field = createField(c, { graphics: c.Graphics, manager: c.SceneManager, hasFocus: () => true,
                screenFading: () => false, bookmarks: () => [bookmark], navigationPreferences: () => ({ spoilers: true }), beacon,
                makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker },
            { open(record) { records.push(record); return records.length; }, close() {} });
            c.WendyQuestAccessSceneLeaving = owner => { leave(owner); field.leave(owner); };
            c.WendyQuestAccessBookmarkEntranceAccepted = field.bookmarkEntranceAccepted;
            c.WendyQuestAccessBookmarkLandingAccepted = field.bookmarkLandingAccepted;
            c.WendyQuestAccessBookmarkTransferReserved = field.bookmarkTransferReserved;
            assert(field.bookmarkContext(scene).canSelect(bookmark));
            scene._wqaSettingsActive = true;
            assert(field.selectBookmark(scene, bookmark));
            scene._wqaSettingsActive = false;
            const cpuStart = process.cpuUsage();
            const started = performance.now();
            assert(field.command('directions'));
            frames.emit('postrender');
            const submitMs = performance.now() - started;
            const cpu = process.cpuUsage(cpuStart);
            const submitCpuMs = (cpu.user + cpu.system) / 1000;
            const packet = packets.pop();
            assert.equal(packet.live.mode, mode);
            let result;
            await verifyWorker(landing, packet.request, packet.live, output => {
                assert.equal(output.status, 'ready');
                if (aircraft) {
                    assert(output.land);
                    assert.equal(output.entrance, entrance);
                    assert.equal(output.discovery, reveal);
                } else {
                    assert.equal(output.entrance, 51);
                    assert.equal(output.groundEntrance, entrance);
                }
                result = output;
            });
            worker.emit('message', { ...packet, result });
            assert.match(records.at(-1).name, aircraft ? /^Landing (?:for|toward) Walking marker/ :
                /^Secret Island boat landing toward Walking marker/);
            assert.match(formatSpeech(records.at(-1)), aircraft ? /action button to land/i :
                /^\d+ (?:north|south|east|west)/);
            assert.doesNotMatch(formatSpeech(records.at(-1)), /Walking marker/);
            follow(landing, result, aircraft ? undefined : 51);
            if (aircraft) assert(player.triggerButtonAction());
            else execute(source);
            assert(player._vehicleGettingOff && c.Graphics._wqaBookmarkTransferPending);
            scene._wqaFieldReady = true;
            field.observeReady(scene);
            assert(c.Graphics._wqaBookmarkTransferPending, 'landing cannot restore selection during native get-off');
            if (aircraft) {
                for (let update = 0; update < craft.maxAltitude(); update++) {
                    craft.updateAirship();
                    settle(player);
                }
            } else {
                settle(player);
                player.updateRoutineMove();
                settle(player);
                player.updateRoutineMove();
                assert.deepEqual([player._x, player._y], [46, 2]);
            }
            source._list = null;
            const readyAt = performance.now();
            field.observeReady(scene);
            const handbackMs = performance.now() - readyAt;
            console.log(mode, entrance ? 'area bookmark' : 'same-map bookmark', 'throttled renderer submission',
                submitMs.toFixed(2), 'ms elapsed,', submitCpuMs.toFixed(2), 'ms process CPU, settled handback',
                handbackMs.toFixed(2), 'ms.');
            assert(!c.Graphics._wqaBookmarkTransferPending);
            assert(field.command('directions'));
            frames.emit('postrender');
            let walking = packets.pop();
            assert.equal(walking.live.mode, 'walk');
            if (reveal) {
                await followEntrance(reveal, entrance);
                assert.match(records.at(-1).name, /Discovery marker toward Walking marker/);
                assert.match(formatSpeech(records.at(-1)), /^\d+ (?:north|south|east|west)/);
                assert.doesNotMatch(formatSpeech(records.at(-1)), /Walking marker/);
                source.command357 = ([plugin, name, , args]) => {
                    assert.equal(plugin, 'Tyruswoo_TileControl');
                    assert.equal(name, 'set_tile');
                    const { x, y, z } = JSON.parse(args.coordinates);
                    gameMap.setTileId(+x, +y, +z, args.tileId, args.clearUpperLayers, args.allowAutotiling);
                    return true;
                };
                execute(source);
                assert(c.$gameSelfSwitches.value([113, reveal, 'A']));
                const event = gameMap._events[reveal];
                event.setupPage = () => { event._trigger = event.page().trigger; };
                event.refresh();
                source._list = null;
                scene._wqaFieldReady = true;
                assert(gameMap._needsTilemapRefresh, 'native set-tile schedules a repaint');
                field.observeReady(scene);
                assert(c.Graphics._wqaBookmarkTransferPending, 'handback waits for the discovery tile repaint');
                gameMap._needsTilemapRefresh = false; // The native tilemap repaint is a fixture stand-in.
                field.observeReady(scene);
                assert(!c.Graphics._wqaBookmarkTransferPending);
                assert(field.command('directions'));
                frames.emit('postrender');
                walking = packets.pop();
            }
            if (entrance) {
                await followEntrance(entrance);
                for (let command = 0; !player.isTransferring() && command < 10; command++) assert(source.executeCommand());
                assert.deepEqual([player._newMapId, player._newX, player._newY], [area, ...target]);
                assert(c.Graphics._wqaBookmarkTransferPending);
            } else assert.deepEqual([walking.request.targetX, walking.request.targetY], target);

            async function followEntrance(event, discoveryFor) {
                assert.equal(walking.request.transfer.map, area);
                let onFoot;
                await verifyWorker(landing, walking.request, walking.live, output => {
                    assert.equal(output.status, 'ready');
                    assert.equal(output.entrance, event);
                    assert.equal(output.discoveryFor, discoveryFor);
                    onFoot = output;
                });
                worker.emit('message', { ...walking, result: onFoot });
                follow(landing, onFoot, event);
                assert(c.Graphics._wqaBookmarkTransferPending);
            }
            field.leave(scene);
            c.Graphics._wqaBookmarkTransferPending = false;
        }
        for (const id of [98, 190]) {
            const { gameMap, player, source } = begin(113);
            const event = gameMap._events[id];
            const transfers = createTransferBookmarks(c, { graphics: c.Graphics, navigationPreferences: () => ({ spoilers: true }) });
            const candidates = transfers.candidates().entrances;
            assert.equal(transfers.discoveries(candidates).length, 23);
            const edge = transfers.discovery(id, 100);
            assert.equal(edge?.completion.switchId, 159);
            const marker = { id: 1, revision: 1, trail: [] };
            c.WendyQuestAccessBookmarkEntranceAccepted = transfers.accepted;
            c.WendyQuestAccessSceneLeaving = transfers.leave;
            player.setPosition(event._x, event._y);
            transfers.arm(scene, marker, edge);
            player.updateNonmoving(true, false);
            assert.equal(source._eventId, id);
            assert(c.Graphics._wqaBookmarkTransferPending);
            source.command357 = () => true; // Other cases verify the actual tile paint and repaint gate.
            execute(source);
            assert(c.$gameSwitches.value(159));
            event.setupPage = () => { event._trigger = event.page()?.trigger; };
            event.refresh();
            assert.equal(event._pageIndex, 1);
            execute(interpreter(event.list(), id));
            assert(event._erased);
            assert.deepEqual(transfers.settle(scene), { ...marker, trail: ['113/' + player._x + '/' + player._y] });
        }
        c.Graphics.app = app;
        c.$gameScreen = screen;
        c.addEventListener = listen;
        c.WendyQuestAccessSceneLeaving = leave;
        delete c.WendyQuestAccessBookmarkEntranceAccepted;
        delete c.WendyQuestAccessBookmarkLandingAccepted;
        delete c.WendyQuestAccessBookmarkTransferReserved;
        console.log('Verified ship and airship landings preserve walking bookmarks through native discovery and area transfers.');
    }

    async function verifyAirship() {
        const flight = begin(113);
        const { gameMap, player, geometry } = flight;
        const aircraft = gameMap.airship();
        aircraft.setLocation(113, 43, 28);
        player.setPosition(43, 29);
        const boarding = directions(flight, 516);
        assert.equal(boarding.target.name, 'Airship');
        assert.equal(boarding.result.arrival.facing, null);
        assert.match(formatSpeech({ kind: 'routeDirections', name: boarding.target.name, legs: [], board: true }),
            /Press the action button to board/);
        follow(flight, boarding.result, undefined);
        scene._wqaRouteActive = true;
        assert(player.triggerButtonAction());
        assert.equal(leaving.at(-1), 'walk');
        assert.equal(travelMode(gameMap, player), null);
        settle(player);
        assert(player._through);
        for (let altitude = 1; altitude <= 48; altitude++) {
            aircraft.updateAirship();
            assert.equal(aircraft._altitude, altitude);
            assert.equal(aircraft.canMove(), altitude === 48);
            assert.equal(travelMode(gameMap, player), altitude === 48 ? 'airship' : null);
        }

        function compareLandings() {
            const view = captureWorld(c);
            const model = composeWorld(geometry, view.live);
            let count = 0;
            for (let y = 0; y < model.height; y++) for (let x = 0; x < model.width; x++) {
                const allowed = !!(model.cells[y * model.width + x] & LAND);
                assert.equal(allowed, aircraft.isLandOk(x, y, 2), `Map 113 landing at ${x},${y}`);
                count += allowed;
            }
            return count;
        }
        assert.equal(compareLandings(), 636);
        const event = gameMap._events[90];
        event.setPosition(43, 28);
        event.setupPage = () => {};
        event.erase();
        assert.equal(compareLandings(), 636);
        assert(!aircraft.isLandOk(43, 28, 2));
        assert(aircraft.isLandOk(49, 7, 2));
        event.setPosition(49, 7);
        assert.equal(compareLandings(), 636);
        const { width, height, data } = flight.map;
        const regionIndex = 5 * width * height + 28 * width + 43;
        data[regionIndex] = 253;
        c.$gameTileChanges[113] = { [regionIndex]: 253 };
        assert.equal(compareLandings(), 635);
        assert(!player.triggerButtonAction(), 'native OK rejects the changed water tile');
        assert.equal(travelMode(gameMap, player), 'airship');

        const nearest = directions(flight, 517);
        assert(nearest.result.land && nearest.result.distance > 0);
        assert(aircraft.isLandOk(nearest.result.arrival.x, nearest.result.arrival.y, 2));
        await verifyWorker(flight, nearest.request, nearest.view.live, result => {
            assert.deepEqual(result.arrival, nearest.result.arrival);
            assert.equal(result.course.length, nearest.result.distance);
        });
        const legacy = { ...geometry, hasLandings: false };
        assert.equal(solveRoute(legacy, nearest.view.live, nearest.request).status, 'unavailable');

        const linked = directions(flight, 122);
        assert.equal(linked.target.name, 'Lost Ruins 17');
        assert.equal(linked.result.discovery, 124);
        assert(linked.result.land);
        follow(flight, linked.result, undefined);
        assert(aircraft.isLandOk(player._x, player._y, 2));
        const renderer = new EventEmitter();
        c.Graphics.app = { renderer };
        c.Graphics.frameCount = 900;
        const cues = [];
        const reports = [];
        const audio = { cues: CUE, isPrepared: () => true, play(_scene, _hrtf, cue) { cues.push(cue); return true; }, retire() {} };
        const beacon = createBeacon(c, () => travelMode(gameMap, player) === 'airship', audio,
            () => ({ enabled: true, beacon: true, beaconVolume: 60 }), text => reports.push(text));
        const atLanding = { distance: 0, land: true, arrival: linked.result.arrival, course: new Uint8Array() };
        assert(beacon.start(scene, 517, player._x, player._y, atLanding));
        event.setPosition(player._x, player._y);
        beacon.update(scene);
        renderer.emit('postrender');
        assert.deepEqual(cues, []);
        assert.equal(reports.at(-1), 'Approach changed. Request directions again.');
        event.setPosition(49, 7);
        assert(beacon.start(scene, 517, player._x, player._y, atLanding));
        beacon.update(scene);
        renderer.emit('postrender');
        assert.deepEqual(cues, [CUE.beaconArrival]);
        beacon.stop(scene);
        scene._wqaRouteActive = true;
        assert(player.triggerButtonAction());
        assert.equal(leaving.at(-1), 'airship');
        assert(player._vehicleGettingOff && !player._through);
        for (let altitude = 47; altitude >= 0; altitude--) {
            aircraft.updateAirship();
            settle(player);
            assert.equal(aircraft._altitude, altitude);
            assert.equal(travelMode(gameMap, player), altitude === 0 ? 'walk' : null);
        }
        const ground = directions(flight, 124);
        assert(ground.result.distance > 0);
        follow(flight, ground.result, 124);
        const discovery = gameMap._events[124];
        const discovered = worldBoundaryName(c, 124);
        assert.equal(discovered, 'Discovery marker');
        assert.equal(ground.target.category, 'events');
        flight.source.command357 = ([plugin, name, , args]) => {
            assert.equal(plugin, 'Tyruswoo_TileControl');
            assert.equal(name, 'set_tile');
            const { x, y, z } = JSON.parse(args.coordinates);
            gameMap.setTileId(+x, +y, +z, args.tileId, args.clearUpperLayers, args.allowAutotiling);
            return true;
        };
        execute(flight.source);
        assert(c.$gameSelfSwitches.value([113, 124, 'A']));
        discovery.setupPage = () => { discovery._trigger = discovery.page().trigger; };
        discovery.refresh();
        flight.source._list = null;
        flight.source._eventId = undefined;
        const afterDiscovery = directions(flight, 122);
        follow(flight, afterDiscovery.result, 122);
        assert.match(formatSpeech({ kind: 'routeDirections', name: linked.target.name, legs: [], land: true, discovery: discovered }),
            /Press the action button to land. Then request walking directions to Discovery marker/);
        console.log('Verified native airship boarding, 48-update ascent and descent, 9,504 landing comparisons, and an actual walking approach after flight.');
    }
}

module.exports = { verifyVehicleNavigation };
