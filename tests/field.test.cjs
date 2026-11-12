'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
const { bakeMap, MAX_CELLS } = require('../src/world/geometry.cjs');
const { solveRoute } = require('../src/world/routes.cjs');
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
    const reply = (request, result = solveRoute(base, request.live, request.request)) =>
        f.routeReply({ epoch: request.epoch, sequence: request.sequence, map: request.map, result });
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
    f.frame();
    assert.equal(formatSpeech(fieldSpeech()[0]), 'Wall clue, 1 south');
    key('j');
    key('l');
    assert.equal(f.renderer.listenerCount('postrender'), 1);
    f.frame();
    assert.equal(formatSpeech(fieldSpeech()[1]), 'Wall clue, 1 south');
    key('p');
    f.frame();
    assert.equal(routePackets.length, 1);
    const first = routePackets[0];
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
    f.frame();
    assert.match(formatSpeech(fieldSpeech()[3]), /^Exits, To Chilly North/);
    key('l', { shiftKey: true });
    f.frame();
    assert.match(formatSpeech(fieldSpeech()[4]), /^Treasure, Chest|^Treasure, Treasure/);
    assert.doesNotMatch(formatSpeech(fieldSpeech()[4]), /25 Gold/);
    key('l', { shiftKey: true });
    f.frame();
    assert.match(formatSpeech(fieldSpeech()[5]), /^Objects, Wall/);
    const delivered = fieldSpeech().length;

    key('p');
    f.frame();
    const pending = routePackets[1];
    assert.equal(f.routeEpoch(), pending.epoch);
    const cell = 12 * data.width + 26;
    map.setExactTileId(26, 12, 3, data.data[3 * data.width * data.height + cell]);
    assert.equal(f.routeEpoch(), 0, 'native tile publication retires the route immediately');
    reply(pending);
    assert.equal(fieldSpeech().length, delivered);
    key('p');
    f.frame();
    assert.equal(routePackets.length, 2, 'tilemap refresh owns the next request until settled');
    map._needsTilemapRefresh = false; // Native tilemap repaint is a stand-in.
    c.SceneManager.updateScene();
    key('p');
    f.frame();
    assert.equal(routePackets[2].live.terrain.length, 2);
    assert.equal(routePackets[2].live.terrain[1] & (MAX_CELLS - 1), cell);
    map._events[114].SetBlocker(0, 0, 1, 0);
    assert.equal(f.routeEpoch(), 0);
    reply(routePackets[2]);
    assert.equal(fieldSpeech().length, delivered);

    key('p');
    f.frame();
    const moves = routePackets[3];
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
    reply(routePackets[4]);
    key('p');
    f.frame();
    assert.equal(routePackets.length, 5, 'a queued native flood closes admission before its first ring');
    assert(flood.next().done);
    assert.equal(scene._wqaTerrainWork, 0);
    c.CoroutineManager.StartAnonymousCoroutine = () => { throw new Error('Synthetic flood scheduling failure'); };
    assert.throws(() => c.TileEditor.FloodFillRegion(0, 3, 1, 26, 12, 0), /Synthetic flood scheduling failure/);
    assert.equal(scene._wqaTerrainWork, 0, 'native scheduling failure releases the terrain mark');
    c.SceneManager.updateScene();
    key('p');
    f.frame();
    player.reserveTransfer(196, 11, 49, 2, 0);
    assert.equal(f.routeEpoch(), 0);
    reply(routePackets[5]);
    assert.equal(fieldSpeech().length, delivered, 'transfer rejects the old map result');
    for (const [mapId, id, category, name] of [[181, 5, 'merchants', 'Kathryn'], [14, 1, 'enemies', 'Enemy1']]) {
        const entry = mapData(mapId).events[id];
        assert.deepEqual(destination(entry, entry.pages[0], entry.pages[0].trigger), { category, name });
    }
    profileSnapshot(flags);
    await verifySurfaceField(flags);
    console.log('Verified native field admission, spoken object selection and route, restored tiles, and stale-route retirement.');
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
        const result = solveRoute(geometry, packet.live, packet.request);
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
    console.log('Verified field input and spoken sailing directions through native admission and getting-off retirement.');
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
