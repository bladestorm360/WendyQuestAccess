'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
const { bakeMap, MAX_CELLS } = require('../src/world/geometry.cjs');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { captureWorld } = require('../src/world/snapshot');
const { destination } = require('../src/world/destinations');
const { formatSpeech } = require('../src/services/speech-text.cjs');

async function main() {
    const data = mapData(19);
    const f = fixture(data);
    const { c, routePackets } = f;
    const tileData = path.join(process.argv[2], 'package.nw', 'data', 'Tilesets.json');
    const flags = JSON.parse(fs.readFileSync(tileData, 'utf8'));
    const base = bakeMap(data, flags[data.tilesetId].flags);
    const key = (value, modifiers = {}) => f.dispatchWindowEvent('keydown',
        { key: value, keyCode: value.toUpperCase().charCodeAt(0), ...modifiers });
    const fieldSpeech = () => f.packets.filter(packet => ['fieldTarget', 'fieldStatus', 'routeDirections'].includes(packet.kind));
    const directionsPackets = () => routePackets.filter(packet => !packet.request.candidates);
    const reply = (request, result = request.request.candidates ?
        findReachable(base, request.live, request.request) : solveRoute(base, request.live, request.request)) =>
        f.routeReply({ epoch: request.epoch, sequence: request.sequence, map: request.map, result });
    function publishBrowse() {
        f.frame();
        const packet = routePackets.at(-1);
        assert(Array.isArray(packet.request.candidates));
        const result = findReachable(base, packet.live, packet.request);
        reply(packet, result);
        f.frame();
        return { packet, result };
    }
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    const restoredIndex = 3 * data.width * data.height;
    const restoredTile = data.data[restoredIndex] ? 0 : data.data.find(tile => tile > 0);
    c.$dataTilesets = flags;
    c.$gameTileChanges = { 19: { [restoredIndex]: restoredTile } };
    c.Tyruswoo.TileControl.tileIdExists = (_set, id) => Number.isInteger(flags[data.tilesetId].flags[id]);
    Object.assign(map, { _mapId: 19, _tilesetId: data.tilesetId, _events: [], _tileEvents: [], _vehicles: [], _nameDisplay: false,
        mapToEdit: () => data, linkedTilesetId: () => data.tilesetId, editingMapId: () => 19, isTileEditingLocal: () => true });
    for (const id of [114, 97, 2, 3]) {
        const entry = data.events[id];
        const page = entry.pages[0];
        const event = Object.assign(f.event(id, 0), { _x: entry.x, _y: entry.y, _pageIndex: 0,
            _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through });
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = 'walk';
    player.setPosition(26, 12);
    player.reserveTransfer(19, 26, 12, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    key('p');
    f.frame();
    assert.equal(routePackets.length, 0);
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    assert.equal(data.data[restoredIndex], restoredTile, 'the native loader applied the saved tile before field readiness');
    key('p');
    f.frame();
    assert.equal(routePackets.length, 0, 'fade and unready artwork retain native input');
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    c.SceneManager.updateScene();
    assert(scene._wqaFieldReady);
    f.frame();

    key('m', { shiftKey: true });
    f.frame();
    assert.match(formatSpeech(f.packets.find(record => record.kind === 'mapDescription')), /violet cavern/);
    assert.equal(routePackets.length, 0, 'reading a description does not post a route request');
    key('k');
    publishBrowse();
    assert.equal(formatSpeech(fieldSpeech()[0]), 'Wall clue, 1 south');
    key('j');
    key('l');
    assert.equal(f.renderer.listenerCount('postrender'), 1);
    publishBrowse();
    assert.equal(formatSpeech(fieldSpeech()[1]), 'Wall clue, 1 south');
    key('p');
    f.frame();
    assert.equal(directionsPackets().length, 1);
    const first = directionsPackets()[0];
    assert.equal(first.request.event, 114);
    assert.equal(first.live.terrain.length, 1);
    assert.equal(first.live.terrain[0] & (MAX_CELLS - 1), 0);
    reply(first);
    f.frame();
    assert.equal(formatSpeech(fieldSpeech()[2]), 'Face south.');
    assert.deepEqual([player._x, player._y], [26, 12]);
    assert.equal(formatSpeech({ kind: 'routeDirections', name: 'Example', directionsOnly: true,
        legs: [{ direction: 8, tiles: 1 }, { direction: 6, tiles: 3 }, { direction: 8, tiles: 4 }], facing: 2 }),
    '1 north, 3 east, 4 north. face south.');

    key('l', { shiftKey: true });
    const filtered = publishBrowse();
    assert.match(formatSpeech(fieldSpeech()[3]), /^All, Wall clue/);
    for (const id of [2, 3]) {
        const index = filtered.packet.request.candidates.findIndex(target => target.event === id);
        assert(index >= 0, 'the native destination still exists');
        assert.equal(filtered.result.available[index], 0, 'unreachable categories are skipped from the current side');
    }
    const delivered = fieldSpeech().length;

    key('p');
    f.frame();
    const pending = directionsPackets()[1];
    assert.equal(f.routeEpoch(), pending.epoch);
    const cell = 12 * data.width + 26;
    map.setExactTileId(26, 12, 3, data.data[3 * data.width * data.height + cell]);
    assert.equal(f.routeEpoch(), 0, 'native tile publication retires the route immediately');
    reply(pending);
    assert.equal(fieldSpeech().length, delivered);
    key('p');
    f.frame();
    assert.equal(directionsPackets().length, 2, 'tilemap refresh owns the next request until settled');
    map._needsTilemapRefresh = false; // Native tilemap repaint is a stand-in.
    c.SceneManager.updateScene();
    key('p');
    f.frame();
    const changedTerrain = directionsPackets()[2];
    assert.equal(changedTerrain.live.terrain.length, 2);
    assert.equal(changedTerrain.live.terrain[1] & (MAX_CELLS - 1), cell);
    map._events[114].SetBlocker(0, 0, 1, 0);
    assert.equal(f.routeEpoch(), 0);
    reply(changedTerrain);
    assert.equal(fieldSpeech().length, delivered);

    key('p');
    f.frame();
    const moves = directionsPackets()[3];
    let steps = 0;
    Object.assign(map, { roundXWithDirection: x => x + 1, roundYWithDirection: (_x, y) => y,
        xWithDirection: x => x - 1, yWithDirection: y => y });
    Object.assign(player, { canPass: () => true, setMovementSuccess(value) { this.success = value; },
        isMovementSucceeded() { return this.success; }, reverseDir: dir => 10 - dir, increaseSteps() { steps++; } });
    player.moveStraight(6);
    assert.equal(steps, 1);
    assert.equal(player._x, 27);
    assert.equal(f.routeEpoch(), 0, 'accepted native movement retires the old origin');
    reply(moves);
    assert.equal(fieldSpeech().length, delivered);

    player.setPosition(26, 12);
    key('p');
    f.frame();
    let flood;
    c.CoroutineManager = { StartAnonymousCoroutine: create => { flood = create(); } };
    scene._spriteset = { _tilemap: { _readMapData: () => 0 } };
    c.TileEditor.FloodFillRegion(0, 3, 1, 26, 12, 0);
    assert.equal(scene._wqaTerrainWork, 1);
    assert.equal(f.routeEpoch(), 0);
    reply(directionsPackets()[4]);
    key('p');
    f.frame();
    assert.equal(directionsPackets().length, 5, 'a queued native flood closes admission before its first ring');
    assert(flood.next().done);
    assert.equal(scene._wqaTerrainWork, 0);
    c.CoroutineManager.StartAnonymousCoroutine = () => { throw new Error('Synthetic flood scheduling failure'); };
    assert.throws(() => c.TileEditor.FloodFillRegion(0, 3, 1, 26, 12, 0), /Synthetic flood scheduling failure/);
    assert.equal(scene._wqaTerrainWork, 0, 'native scheduling failure releases the terrain mark');
    c.SceneManager.updateScene();

    key('j');
    f.frame();
    const oldFilter = routePackets.at(-1);
    assert(oldFilter.request.candidates);
    key('l');
    key('p');
    f.frame();
    assert.equal(routePackets.at(-1), oldFilter, 'the newest command waits for the one in-flight receipt');
    assert.equal(f.routeEpoch(), 0);
    reply(oldFilter, { status: 'cancelled' });
    f.frame();
    const latestFilter = routePackets.at(-1);
    assert(latestFilter.request.candidates && latestFilter.sequence !== oldFilter.sequence);
    reply(latestFilter);
    const combined = directionsPackets().at(-1);
    assert.equal(combined.request.event, 114, 'directions preserve queued browse changes and use the filtered snapshot');
    assert.equal(combined.sequence, latestFilter.sequence);
    c.WendyQuestAccessFieldEvent(scene);
    assert.equal(f.routeEpoch(), 0, 'accepted native event start retires field work before entry');
    reply(combined);
    assert.equal(fieldSpeech().length, delivered);

    key('p');
    f.frame();
    const transferred = directionsPackets().at(-1);
    player.reserveTransfer(196, 11, 49, 2, 0);
    assert.equal(f.routeEpoch(), 0);
    reply(transferred);
    assert.equal(fieldSpeech().length, delivered, 'transfer rejects the old map result');
    for (const [mapId, id, category, name] of [[181, 5, 'merchants', 'Kathryn'], [14, 1, 'enemies', 'Enemy1']]) {
        const entry = mapData(mapId).events[id];
        assert.deepEqual(destination(entry, entry.pages[0], entry.pages[0].trigger), { category, name });
    }
    profileSnapshot(flags);
    await verifyOpeningField(flags);
    await verifyRuinsHandback();
    await verifyBeachHandoffs(flags);
    await verifySurfaceField(flags);
    console.log('Verified native field admission, spoken object selection and route, restored tiles, and stale-route retirement.');
}

async function verifyRuinsHandback() {
    const data = mapData(16);
    const f = fixture(data);
    const { c, frame } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    const timer = data.events[40].pages[0];
    const decrement = timer.list.find(command => command.code === 122 && command.parameters[2] === 2);
    const conversation = data.events[24].pages[0];
    assert.equal(timer.trigger, 4);
    assert(conversation.list.some(command => command.code === 101));
    const variables = JSON.parse(execFileSync('python', ['-B', '-W', 'ignore::SyntaxWarning',
        path.join(__dirname, 'map-producers.py'), path.join(process.argv[2], 'package.nw'), 'variable-stack'],
        { encoding: 'utf8', timeout: 6000, maxBuffer: 10000 }));
    for (const method of variables) f.run(method);
    f.run('Math.randomInt = () => 0;');
    c.$gameQuest = { getAllAssentedQuests: () => null };
    const weather = Object.assign(new c.Game_Interpreter(), { _mapId: 16, _eventId: 40 });
    c.$gameVariables = new c.Game_Variables();
    c.$gameVariables.setValue(2, 100);
    player._vehicleType = 'walk';
    player.setPosition(13, 27);
    player.reserveTransfer(16, 13, 27, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    map._mapId = 16;
    map._nameDisplay = false;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    c.Scene_Map.prototype.updateMainMultiply = () => {
        map._needsRefresh = false;
        scene._wqaLightningRefreshOnly = false;
        weather.command122(decrement.parameters);
    };
    map._interpreter._list = conversation.list;
    map._interpreter._eventId = 24;
    c.SceneManager.updateScene();
    frame();
    assert.equal(scene._wqaFieldReady, false);
    map._interpreter.clear();
    c.SceneManager.updateScene();
    assert(map._needsRefresh);
    assert(scene._wqaFieldReady, 'Crispy Ruins returns mod control after the native conversation');
    frame();
    f.dispatchWindowEvent('keydown', { key: 'm', keyCode: 77 });
    frame();
    assert.equal(f.packets.filter(packet => packet.kind === 'fieldStatus').at(-1)?.name, 'Crispy Ruins');
    for (let n = 0; n < 36; n++) {
        c.SceneManager.updateScene();
        frame();
    }
    assert.deepEqual(f.speech(), ['Entering Crispy Ruins.'], 'entry remains accessible after the native banner has gone');
    map.requestRefresh();
    assert.equal(scene._wqaLightningRefreshOnly, false, 'an ordinary refresh still invalidates field admission');
    console.log('Verified the Crispy Ruins weather gate and map-name keys with the authored native conversation and timer.');
}

async function verifyOpeningField(tilesets) {
    const data = mapData(13);
    const f = fixture(data);
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    c.$gameSwitches = { value: id => id === 31 };
    const packageRoot = path.join(process.argv[2], 'package.nw');
    const variables = JSON.parse(execFileSync('python', ['-B', '-W', 'ignore::SyntaxWarning',
        path.join(__dirname, 'map-producers.py'), packageRoot, 'variable-stack'],
        { encoding: 'utf8', timeout: 6000, maxBuffer: 10000 }));
    for (const method of variables) f.run(method);
    let otherChange = '';
    c.$gameQuest = { getAllAssentedQuests() {
        if (otherChange === 'quest') map.requestRefresh();
        return null;
    } };
    c.$gameVariables = new c.Game_Variables();
    c.$gameVariables.setValue(2, 60.125);
    assert.equal(c.$gameVariables.value(2), 60.125, 'the active filter setter replaces integer rounding');
    Object.assign(map, { _mapId: 13, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false, updateInterpreter() {}, updateScroll() {},
        updateVehicles() {}, updateParallax() {}, refresh() { this._needsRefresh = false; } });
    delete map.refreshIfNeeded;
    const chest = data.events[14];
    const event = Object.assign(f.event(14, 0), { _x: chest.x, _y: chest.y, _pageIndex: 0,
        _trigger: chest.pages[0].trigger, _priorityType: chest.pages[0].priorityType });
    map._events[14] = event;
    map.fixtureEvents.push(event);
    f.run('Math.randomInt = () => 0;');
    const timer = data.events[9].pages[0];
    assert.equal(timer.trigger, 4);
    assert(data.events.every(entry => !entry || entry.pages.every(page =>
        !page.conditions.variableValid || page.conditions.variableId !== 2)));
    const decrement = timer.list.find(command => command.code === 122 && command.parameters[2] === 2);
    assert(decrement);
    const parallel = Object.assign(new c.Game_Interpreter(), { _mapId: 13, _eventId: 9 });
    map.updateEvents = function () {
        if (otherChange === 'before') c.$gameVariables.setValue(3, 1);
        parallel.command122(decrement.parameters);
        if (otherChange === 'after') this.requestRefresh();
    };
    c.Scene_Map.prototype.updateMainMultiply = () => map.update(true);
    player._vehicleType = 'walk';
    player.setPosition(17, 21);
    player.reserveTransfer(13, 17, 21, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    c.SceneManager.updateScene();
    f.frame();
    assert(map._needsRefresh, 'the actual parallel lightning timer asks for a native refresh every frame');
    assert(c.$gameVariables.value(2) < 60);
    assert(scene._wqaFieldReady, 'Crispy Beach admits field controls after the intro despite the lightning timer');
    const key = (value, keyCode, shiftKey = false) => {
        f.dispatchWindowEvent('keydown', { key: value, keyCode, shiftKey });
        f.dispatchWindowEvent('keyup', { key: value });
    };
    let settingsAttempts = 0;
    c.document.createElement = tag => { if (tag === 'dialog') settingsAttempts++; return {}; };
    key('F8', 119);
    assert.equal(settingsAttempts, 1, 'F8 reaches the settings dialog on Crispy Beach');

    const base = bakeMap(data, tilesets[data.tilesetId].flags);
    const submit = (packet, result) => f.routeReply({
        epoch: packet.epoch, sequence: packet.sequence, map: packet.map, result
    });
    key('l', 76);
    f.frame();
    const browse = routePackets.at(-1);
    assert(Array.isArray(browse.request.candidates), 'L submits a reachable destination request');
    submit(browse, findReachable(base, browse.live, browse.request));
    f.frame();
    key('p', 80);
    f.frame();
    const directions = routePackets.at(-1);
    assert.equal(directions.request.event, 14);
    submit(directions, solveRoute(base, directions.live, directions.request));
    f.frame();
    assert(f.packets.some(packet => packet.kind === 'routeDirections'));

    map.inactiveTime = 30;
    c.SceneManager.updateScene();
    assert.equal(scene._wqaFieldReady, false, 'native idle temporarily closes field admission');
    key('p', 80);
    f.frame();
    assert.equal(routePackets.at(-1), directions, 'idle input cannot start work until the native wake');
    c.SceneManager.updateScene();
    f.frame();
    const afterIdle = routePackets.at(-1);
    assert.notEqual(afterIdle.sequence, directions.sequence, 'a single directions press wakes the field and submits a route');
    assert.equal(afterIdle.request.event, 14);
    submit(afterIdle, solveRoute(base, afterIdle.live, afterIdle.request));
    f.frame();

    for (const phase of ['before', 'after', 'quest']) {
        otherChange = phase;
        c.SceneManager.updateScene();
        assert(map._needsRefresh);
        assert(!scene._wqaFieldReady, 'an unrelated refresh still wins in either order');
        key('F8', 119);
        key('p', 80);
        f.frame();
        assert.equal(settingsAttempts, 1);
        assert.equal(routePackets.at(-1), afterIdle);
    }
    otherChange = '';
    c.SceneManager.updateScene();
    assert(scene._wqaFieldReady, 'controls resume after the native refresh');
    map.requestRefresh();
    key('F8', 119);
    key('p', 80);
    f.frame();
    assert.equal(settingsAttempts, 1, 'a genuine refresh after the frame closes the immediate keyboard gate');
    assert.equal(routePackets.at(-1), afterIdle);

    const barrelData = data.events[20];
    map._events[20] = Object.assign(f.event(20, 0), {
        _x: barrelData.x, _y: barrelData.y, _pageIndex: 0,
        _trigger: barrelData.pages[0].trigger, _priorityType: barrelData.pages[0].priorityType
    });
    c.SceneManager.updateScene();
    c.WendyQuestAccessSceneLeaving(scene);
    c.SceneManager.updateScene();
    key('p', 80);
    f.frame();
    const resumed = routePackets.at(-1);
    assert.notEqual(resumed.sequence, afterIdle.sequence);
    assert.equal(resumed.request.event, 14, 'same-map retirement keeps Treasure selected instead of jumping to Objects');
    submit(resumed, solveRoute(base, resumed.live, resumed.request));
    f.frame();

    // Both native categories are reachable from this beach tile.
    player.setPosition(16, 20);
    const elderData = data.events[5];
    const elder = map._events[5] = Object.assign(f.event(5, 1), {
        _x: elderData.x, _y: elderData.y, _pageIndex: 1, _trigger: 4, _priorityType: 1,
        canPass: () => true, setMovementSuccess(value) { this.success = value; },
        isMovementSucceeded() { return this.success; }, setDirection() {}, reverseDir: direction => 10 - direction,
        increaseSteps() {}
    });
    Object.assign(map, { roundXWithDirection: x => x + 1, roundYWithDirection: (_x, y) => y,
        xWithDirection: x => x - 1, yWithDirection: y => y });
    key('l', 76, true);
    f.frame();
    const stale = routePackets.at(-1);
    assert(Array.isArray(stale.request.candidates));
    elder.moveStraight(6);
    assert.equal(f.routeEpoch(), 0, 'a native NPC step retires the original snapshot');
    submit(stale, { status: 'cancelled' });
    f.frame();
    const retry = routePackets.at(-1);
    assert.notEqual(retry.sequence, stale.sequence, 'the original category key still produces a fresh request');
    assert.equal(retry.live.events.find(entry => entry.id === 5).x, elder._x);
    submit(retry, findReachable(base, retry.live, retry.request));
    f.frame();
    assert.match(formatSpeech(f.packets.filter(packet => packet.kind === 'fieldTarget').at(-1)), /^All, /);

    key('l', 76, true);
    f.frame();
    const objects = routePackets.at(-1);
    submit(objects, findReachable(base, objects.live, objects.request));
    f.frame();
    assert.match(formatSpeech(f.packets.filter(packet => packet.kind === 'fieldTarget').at(-1)), /^Objects, /);

    player._realX = player._x - 0.5;
    key('p', 80);
    f.frame();
    assert.equal(routePackets.at(-1), objects, 'no directions snapshot is taken in the middle of a step');
    player._realX = player._x;
    c.SceneManager.updateScene();
    f.frame();
    const settled = routePackets.at(-1);
    assert.notEqual(settled.sequence, objects.sequence, 'a directions key during the step uses its settled landing');
    assert.equal(settled.request.event, 20);
    submit(settled, solveRoute(base, settled.live, settled.request));
    const directionEpoch = f.epoch();
    assert(directionEpoch);
    elder.moveStraight(6);
    assert.equal(f.epoch(), directionEpoch, 'an unrelated actor step cannot revoke completed directions before the helper reads them');
    f.frame();

    key('k', 75);
    f.frame();
    for (let turn = 0; turn < 3; turn++) {
        const outdated = routePackets.at(-1);
        elder.moveStraight(6);
        assert.equal(f.routeEpoch(), 0);
        submit(outdated, { status: 'cancelled' });
        f.frame();
    }
    assert.equal(f.packets.filter(packet => packet.kind === 'fieldStatus').at(-1).name,
        'The map is changing. Try the pathfinder again.');
    assert.equal(f.routeEpoch(), 0, 'the actor retry cap leaves no worker request');
    // The real Elder Tater parallel page loops after its dialogue branch.
    // Native setup still visits the cached faces on every restart.
    assert.equal(data.events[5].pages[1].list[0].code, 111);
    elder._interpreter = Object.assign(new c.Game_Interpreter(), { update() { this.clear(); } });
    c.ImageManager.loadFace('ElderTater');
    c.SceneManager.updateScene();
    const beforeWarmPreload = routePackets.length;
    key('p', 80);
    elder.updateParallel();
    f.frame();
    assert.equal(routePackets.length, beforeWarmPreload + 1,
        'a repeated warm Elder Tater portrait must not discard the accepted directions key');
    const warmRoute = routePackets.at(-1);
    elder.updateParallel();
    assert.equal(f.routeEpoch(), warmRoute.epoch, 'the repeated cache hit preserves in-flight directions');
    submit(warmRoute, solveRoute(base, warmRoute.live, warmRoute.request));
    f.frame();

    elder.setPosition(elderData.x, elderData.y);
    for (const [letter, code, shift] of [['j', 74], ['l', 76], ['k', 75], ['l', 76, true], ['p', 80], ['j', 74, true]]) {
        const before = routePackets.length;
        key(letter, code, shift);
        elder.updateParallel();
        f.frame();
        assert.equal(routePackets.length, before + 1, 'each pathfinder key survives a warm native update');
        const packet = routePackets.at(-1);
        elder.updateParallel();
        assert.equal(f.routeEpoch(), packet.epoch);
        const result = packet.request.candidates ? findReachable(base, packet.live, packet.request) :
            solveRoute(base, packet.live, packet.request);
        submit(packet, result);
        f.frame();
        if (letter === 'l' && shift)
            assert.match(formatSpeech(f.packets.filter(record => record.kind === 'fieldTarget').at(-1)), /^NPC, Elder Tater/);
        if (letter === 'p') {
            assert.equal(packet.request.event, 5);
            assert.equal(packet.request.waypoint, true);
            assert.equal(result.status, 'ready');
        }
    }

    const url = 'img/faces/ElderTater.png';
    delete c.ImageManager._cache[url];
    const loadBitmap = c.Bitmap.load;
    const callbacks = [];
    let portraitReady = false;
    c.Bitmap.load = path => {
        if (path !== url) return loadBitmap(path);
        assert.equal(f.routeEpoch(), 0, 'the route closes before native decoding begins');
        return { isReady: () => portraitReady, addLoadListener: callback => callbacks.push(callback) };
    };
    key('p', 80);
    f.frame();
    const waitingForPortrait = routePackets.at(-1);
    elder.updateParallel();
    elder.updateParallel();
    assert.equal(callbacks.length, 1, 'only one completion listener for two face lines and repeated setup');
    c.SceneManager.updateScene();
    assert.equal(scene._wqaFieldReady, false, 'the native field remains gated across asynchronous resource loading');
    key('p', 80);
    submit(waitingForPortrait, { status: 'cancelled' });
    f.frame();
    assert.equal(routePackets.at(-1), waitingForPortrait);
    portraitReady = true;
    callbacks.shift()();
    c.SceneManager.updateScene();
    assert.equal(scene._wqaFieldReady, true, 'native field readiness resumes after actual bitmap completion');
    key('p', 80);
    f.frame();
    const loaded = routePackets.at(-1);
    assert.notEqual(loaded.sequence, waitingForPortrait.sequence);
    submit(loaded, solveRoute(base, loaded.live, loaded.request));
    f.frame();

    const beforeBoundary = routePackets.length;
    player._realX = player._x - 0.5;
    key('p', 80);
    player.reserveTransfer(19, 8, 8, 2, 0);
    player._transferring = false;
    player._realX = player._x;
    c.SceneManager.updateScene();
    f.frame();
    assert.equal(routePackets.length, beforeBoundary, 'a native transfer cancels a pending step request');

    const samples = 240;
    function measurePreloads() {
        const started = performance.now();
        for (let frame = 0; frame < samples; frame++) elder.updateParallel();
        return performance.now() - started;
    }
    const packageScripts = path.join(packageRoot, 'js');
    function stockMethod(file, name) {
        const source = fs.readFileSync(path.join(packageScripts, file), 'utf8');
        const start = source.indexOf(name + ' = function(');
        assert(start >= 0);
        f.run(source.slice(start, source.indexOf('\n};', start) + 3));
    }
    const connected = measurePreloads();
    stockMethod('rmmz_managers.js', 'ImageManager.loadBitmapFromUrl');
    stockMethod('rmmz_objects.js', 'Game_Interpreter.prototype.loadImages');
    const native = measurePreloads();
    console.log('Throttled warm Elder face preload,', samples, 'native restarts:',
        native.toFixed(2), 'ms stock,', connected.toFixed(2), 'ms observed.');
    c.Time.GetDeltaTime = () => 1 / 60;
    function measureFrames() {
        map.inactiveTime = 0;
        c.$gameVariables._data[2] = samples + 1;
        const started = performance.now();
        for (let frame = 0; frame < samples; frame++) c.SceneManager.updateScene();
        return performance.now() - started;
    }
    const withMark = measureFrames();
    const originals = fs.readFileSync(path.join(process.argv[2], 'package.nw/js/rmmz_objects.js'), 'utf8');
    for (const name of ['Game_Variables.prototype.onChange', 'Game_Map.prototype.requestRefresh',
        'Game_Interpreter.prototype.operateVariable']) {
        const start = originals.indexOf(name + ' = function(');
        assert(start >= 0);
        f.run(originals.slice(start, originals.indexOf('\n};', start) + 3));
    }
    scene._wqaLightningRefreshOnly = false;
    const baseline = measureFrames();
    assert(!scene._wqaFieldReady);
    console.log('Verified the native Crispy Beach lightning timer, F8, destination cycling, directions and unrelated refresh retirement.');
    console.log('Throttled Crispy Beach update series,', samples, 'frames:', baseline.toFixed(2), 'ms before,',
        withMark.toFixed(2), 'ms with refresh qualification.');
}

async function verifyBeachHandoffs(tilesets) {
    const data = mapData(13);
    const f = fixture(data);
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    const pages = { 5: 1, 8: 1, 12: 1, 14: 1, 20: 1, 30: 1 };
    c.$dataTilesets = tilesets;
    Object.assign(map, { _mapId: 13, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false });
    for (const entry of data.events.filter(Boolean)) {
        const pageIndex = pages[entry.id] || 0;
        const page = entry.pages[pageIndex];
        const actor = f.event(entry.id, pageIndex);
        Object.assign(actor, { _x: entry.x, _y: entry.y, _pageIndex: pageIndex, _trigger: page.trigger,
            _priorityType: page.priorityType, _through: page.through });
        map._events[entry.id] = actor;
        map.fixtureEvents.push(actor);
    }
    const elder = map._events[5];
    elder.setPosition(map._events[21]._x + 2, elder._y);
    elder._through = true;
    map._events[8].SetBlocker(-1, -1, 1, 0);
    player._vehicleType = 'walk';
    player.setPosition(data.events[20].x, data.events[20].y + 1);
    player.reserveTransfer(13, player._x, player._y, 8, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    c.SceneManager.updateScene();
    f.frame();
    const geometry = bakeMap(data, tilesets[data.tilesetId].flags);
    const key = (letter, code, shiftKey) => {
        f.dispatchWindowEvent('keydown', { key: letter, keyCode: code, shiftKey });
        f.dispatchWindowEvent('keyup', { key: letter });
        f.frame();
        const packet = routePackets.at(-1);
        const solve = packet.request.candidates ? findReachable : solveRoute;
        f.routeReply({ epoch: packet.epoch, sequence: packet.sequence, map: packet.map,
            result: solve(geometry, packet.live, packet.request) });
        f.frame();
        return formatSpeech(f.packets.filter(record => ['fieldTarget', 'routeDirections', 'fieldStatus'].includes(record.kind)).at(-1));
    };
    assert.match(key('k', 75), /^Elder Tater, .*route stops at a floor event/);
    assert.match(key('l', 76, true), /^Exits, Elder Tater's house, .*route stops at a floor event/);
    assert.match(key('j', 74, true), /^NPC, Elder Tater, .*route stops at a floor event/);
    assert.equal(key('p', 80), '2 south, 2 east. Beach path one tile east. Move east to continue, then request directions again.');
    assert.match(key('l', 76, true), /^Exits, Elder Tater's house/);
    assert.match(key('l', 76, true), /^Events, Scene trigger,/);
    assert.equal(key('p', 80), '1 south, 2 east. Move east to activate.');
    const selected = map._events[routePackets.at(-1).request.event];
    assert.equal(selected._erased, false, 'reading directions leaves the selected floor event to the player');
    selected._erased = true;
    assert.equal(key('k', 75), 'Selected destination is unavailable');
    console.log('Verified Crispy Beach NPC, Exits and generic Events speech, manual activation and erased event retirement.');
}

async function verifySurfaceField(tilesets) {
    const data = mapData(113);
    const f = fixture(data);
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    c.$gameTileChanges = {};
    c.$gameSwitches = { value: () => false };
    const ship = { _type: 'ship', _mapId: 113, _x: 43, _y: 2, _driving: true, isLandOk: () => true };
    Object.assign(map, { _mapId: 113, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [null, ship], _nameDisplay: false });
    for (const id of [13, 30, 31, 51, 90]) {
        const entry = data.events[id];
        const page = entry.pages[0];
        const event = Object.assign(f.event(id, 0), { _x: entry.x, _y: entry.y, _pageIndex: 0,
            _trigger: page.trigger, _priorityType: page.priorityType });
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = 'ship';
    player.setPosition(43, 2);
    player.reserveTransfer(113, 43, 2, 6, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()?.();
    c.SceneManager.updateScene();
    f.frame();
    function request() {
        f.dispatchWindowEvent('keydown', { key: 'p', keyCode: 80 });
        f.dispatchWindowEvent('keyup', { key: 'p', keyCode: 80 });
        f.frame();
        return routePackets.at(-1);
    }
    const directions = () => f.packets.filter(packet => packet.kind === 'routeDirections');
    const first = request();
    assert.equal(first.request.event, 51);
    assert.equal(first.request.entryDirection, 6);
    assert.equal(first.live.mode, 'ship');
    const geometry = bakeMap(data, tilesets[data.tilesetId].flags);
    function reply(packet) {
        const result = packet.request.candidates ? findReachable(geometry, packet.live, packet.request) :
            solveRoute(geometry, packet.live, packet.request);
        f.routeReply({ sequence: packet.sequence, epoch: packet.epoch, map: packet.map, result });
        f.frame();
    }
    reply(first);
    assert.equal(formatSpeech(directions().at(-1)), '1 east.');
    const pending = request();
    player._vehicleGettingOff = true;
    c.SceneManager.updateScene();
    assert.equal(f.routeEpoch(), 0);
    reply(pending);
    assert.equal(directions().length, 1, 'the native getting-off state retires the old directions');

    player._vehicleGettingOff = false;
    player._vehicleType = 'airship';
    player._through = true;
    player.setPosition(43, 28);
    let atCruise = false;
    let landingAllowed = true;
    map._vehicles[2] = { _type: 'airship', _mapId: 113, _x: 43, _y: 28, _driving: true,
        isHighest: () => atCruise, isLandOk: () => landingAllowed };
    c.SceneManager.updateScene();
    const beforeTakeoff = routePackets.length;
    request();
    assert.equal(routePackets.length, beforeTakeoff, 'directions wait for native cruising altitude');
    atCruise = true;
    f.dispatchWindowEvent('keydown', { key: 'l', keyCode: 76, shiftKey: true });
    f.dispatchWindowEvent('keyup', { key: 'l', keyCode: 76, shiftKey: true });
    f.frame();
    assert(routePackets.at(-1).request.candidates);
    reply(routePackets.at(-1));
    const landing = request();
    assert.equal(landing.live.mode, 'airship');
    assert(landing.request.landing);
    assert.equal(landing.request.event, undefined);
    landingAllowed = false;
    reply(landing);
    const reports = f.packets.filter(packet => packet.kind === 'fieldStatus');
    assert.equal(formatSpeech(reports.at(-1)), 'Landing site changed. Request directions again.');
    landingAllowed = true;
    reply(request());
    assert.equal(formatSpeech(directions().at(-1)), 'Press the action button to land.');
    console.log('Verified spoken sailing and airship directions, native transition gates and landing-site recheck.');
}

function profileSnapshot(tilesets) {
    const map = mapData(87);
    const count = map.width * map.height;
    const root = { $dataMap: map, $dataTilesets: tilesets, $gamePlayer: { _x: 0, _y: 0, _vehicleType: 'walk' },
        $gameTileChanges: {}, $gameMap: { _mapId: 87, _tilesetId: map.tilesetId, _tileEvents: [], _vehicles: [],
            _events: map.events.map(event => event && { _eventId: event.id, _x: event.x, _y: event.y, _pageIndex: 0,
                _trigger: event.pages[0].trigger, _priorityType: event.pages[0].priorityType }) } };
    function measure() {
        const start = performance.now();
        const captured = captureWorld(root);
        const published = structuredClone(captured.live, { transfer: [captured.live.terrain.buffer] });
        return { elapsed: performance.now() - start, changes: published.terrain.length };
    }
    measure();
    const base = measure();
    const dense = root.$gameTileChanges[87] = {};
    for (let flat = 0; flat < count * 4; flat++) dense[flat] = map.data[flat];
    const changed = measure();
    assert.equal(base.changes, 0);
    assert.equal(changed.changes, count);
    const fullStart = performance.now();
    const full = captureWorld(root);
    const fullElapsed = performance.now() - fullStart;
    const browseStart = performance.now();
    const browse = captureWorld(root, false);
    const browseElapsed = performance.now() - browseStart;
    assert.deepEqual(browse.objects, full.objects);
    assert.equal(browse.live, undefined);
    console.log(`Throttled snapshot plus clone: ${base.elapsed.toFixed(1)} ms without deltas, ` +
        `${changed.elapsed.toFixed(1)} ms for ${count} changed cells.`);
    console.log(`Throttled dense map capture: ${fullElapsed.toFixed(1)} ms with terrain, ` +
        `${browseElapsed.toFixed(1)} ms for the same destination list.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
