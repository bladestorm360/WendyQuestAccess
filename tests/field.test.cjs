'use strict';

const assert = require('node:assert/strict');
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
    assert.equal(formatSpeech(fieldSpeech()[2]), 'Wall clue. face south.');
    assert.deepEqual([player._x, player._y], [26, 12]);
    assert.equal(formatSpeech({ kind: 'routeDirections', name: 'Example', legs: [{ direction: 8, tiles: 1 },
        { direction: 6, tiles: 3 }, { direction: 8, tiles: 4 }], facing: 2 }), 'Example. 1 north, 3 east, 4 north. face south.');

    key('l', { shiftKey: true });
    const filtered = publishBrowse();
    assert.match(formatSpeech(fieldSpeech()[3]), /^Objects, Wall clue/);
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
    await verifySurfaceField(flags);
    console.log('Verified native field admission, spoken object selection and route, restored tiles, and stale-route retirement.');
}

async function verifyOpeningField(tilesets) {
    const data = mapData(13);
    const f = fixture(data);
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    c.$gameSwitches = { value: id => id === 31 };
    c.$gameVariables = new c.Game_Variables();
    c.$gameVariables.setValue(2, 60);
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
    const parallel = new c.Game_Interpreter();
    let otherChange = '';
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
    const key = (value, keyCode) => {
        f.dispatchWindowEvent('keydown', { key: value, keyCode });
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

    for (const phase of ['before', 'after']) {
        otherChange = phase;
        c.SceneManager.updateScene();
        assert(map._needsRefresh);
        assert(!scene._wqaFieldReady, 'an unrelated refresh still wins in either order');
        key('F8', 119);
        key('p', 80);
        f.frame();
        assert.equal(settingsAttempts, 1);
        assert.equal(routePackets.at(-1), directions);
    }
    otherChange = '';
    c.SceneManager.updateScene();
    assert(scene._wqaFieldReady, 'controls resume after the native refresh');
    map.requestRefresh();
    key('F8', 119);
    key('p', 80);
    f.frame();
    assert.equal(settingsAttempts, 1, 'a genuine refresh after the frame closes the immediate keyboard gate');
    assert.equal(routePackets.at(-1), directions);

    const samples = 240;
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
    for (const name of ['Game_Variables.prototype.setValue', 'Game_Map.prototype.requestRefresh']) {
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
    assert.equal(formatSpeech(directions().at(-1)), 'Secret Island boat landing. 1 east.');
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
    assert.equal(formatSpeech(directions().at(-1)), 'Nearest landing site. Press the action button to land.');
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
