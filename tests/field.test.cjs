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
    const f = fixture(data, false, { reachableOnly: true });
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
    await new Promise(setImmediate);

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
    const beaconOnly = { kind: 'routeDirections', beaconOnly: true, name: 'Stone', directionsOnly: true, more: true,
        legs: [{ direction: 8, tiles: 3 }], facing: 8 };
    assert.equal(formatSpeech(beaconOnly), '');
    assert.equal(formatSpeech({ ...beaconOnly, directionsOnly: false }), 'Stone');
    assert.match(formatSpeech({ ...beaconOnly, beaconOnly: false }), /^3 north/);
    assert.match(formatSpeech({ ...beaconOnly, prerequisite: 'an ice block' }), /Route to an ice block.*press the action button/i);
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
    for (const [mapId, id, category, name] of [[181, 5, 'merchants', 'Kathryn'], [14, 1, 'enemies', 'Lil Salty']]) {
        const entry = mapData(mapId).events[id];
        assert.deepEqual(destination(entry, entry.pages[0], entry.pages[0].trigger), { category, name });
    }
    const patrol = mapData(14).events[1];
    const patrolPage = patrol.pages[0];
    assert.deepEqual(destination(patrol, patrolPage, patrolPage.trigger, 14, '~LILSALTYVAR1WORLD'),
        { category: 'enemies', name: 'Lil Pink Salty' });
    assert.deepEqual(destination(patrol, patrolPage, patrolPage.trigger, 14, '~unidentified'),
        { category: 'enemies', name: 'Enemy' });
    profileSnapshot(flags);
    await verifyOpeningField(flags);
    await require('./elder-door.cjs').verifyField(fixture,mapData,flags);
    await verifyIceHandback(flags);
    await verifyVisibleChestBarriers(flags);
    await verifyClosedRuinsDoor(flags);
    await require('./ice-field.cjs')(fixture,mapData,flags);
    await require('./frozen-elder.cjs')(fixture,mapData,flags);
    await verifyRuinsHandback();
    await verifyChompsHandback(flags);
    await verifyBeachHandoffs(flags);
    await verifySurfaceField(flags);
    console.log('Verified native field admission, spoken object selection and route, restored tiles, and stale-route retirement.');
}

async function verifyClosedRuinsDoor(tilesets) {
    const { closedRuinsDoorReason } = require('../src/world/local-destinations');
    const data = mapData(16), f = fixture(data), { c, frame } = f;
    const map = c.$gameMap, player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    Object.assign(map, { _mapId: 16, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false });
    for (const [id, index] of [[1, 0], [19, 0], [37, 2]]) {
        const entry = data.events[id], page = entry.pages[index];
        const event = Object.assign(f.event(id, index), { _x: entry.x, _y: entry.y, _pageIndex: index,
            _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through,
            _characterName: page.image.characterName });
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = 'walk';
    player.setPosition(13, 17);
    player.reserveTransfer(16, 13, 17, 2, 0);
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
    frame();
    await new Promise(setImmediate);
    const key = (value, shiftKey = false) => {
        f.dispatchWindowEvent('keydown', { key: value, keyCode: value.toUpperCase().charCodeAt(0), shiftKey });
        f.dispatchWindowEvent('keyup', { key: value });
        frame();
    };
    for (let n = 0; n < 12 && f.packets.at(-1)?.category !== 'Exits'; n++) key('l', true);
    key('p');
    const request = f.routePackets.at(-1);
    assert.equal(request.request.event, 1);
    const result = solveRoute(bakeMap(data, tilesets[data.tilesetId].flags), request.live, request.request);
    assert.equal(result.status, 'unreachable', 'the actual native closed door separates the beach');
    f.routeReply({ epoch: request.epoch, sequence: request.sequence, map: request.map, result });
    frame();
    assert.equal(formatSpeech(f.packets.at(-1)), 'Blocked by the closed ruins door.');
    assert.equal(closedRuinsDoorReason(c, 19), 'Blocked by the closed ruins door.', 'the southern chest shares the actual door barrier');
    assert.equal(closedRuinsDoorReason(c, 37), '', 'a different target gets no beach-specific claim');
    player._y = 19;
    assert.equal(closedRuinsDoorReason(c, 1), '', 'the beach side of the door is not blocked');
    player._y = 17;
    for (const property of ['_through', '_erased']) {
        map._events[37][property] = true;
        assert.equal(closedRuinsDoorReason(c, 1), '');
        map._events[37][property] = false;
    }
    map._events[37]._pageIndex = 1;
    assert.equal(closedRuinsDoorReason(c, 1), '', 'the earlier prophecy reminder is a different page');
    console.log('Verified the closed ruins door explains the blocked beach route without opening native collision.');
}

async function verifyVisibleChestBarriers(tilesets) {
    const { bakeControls } = require('../tools/bake-controls.cjs');
    for (const [id, chest, gate, x, y, spoilers, message] of [
        [204, 1, 145, 3, 11, false, 'Chest is unreachable beyond a gap in the floor.'],
        [204, 1, 145, 3, 11, true, 'Chest is unreachable beyond a gap in the floor.'],
        [79, 6, 97, 9, 1, false, 'Chest is unreachable across the water.']
    ]) {
        const data = mapData(id);
        const f = fixture(data, false, { spoilers });
        const { c, routePackets, frame } = f;
        const map = c.$gameMap;
        const player = c.$gamePlayer;
        c.$dataTilesets = tilesets;
        let open = false;
        c.$gameSwitches = { value: key => key === gate && open };
        const flags = tilesets[data.tilesetId].flags;
        const geometry = bakeMap(data, flags);
        const controls = bakeControls(id, data, flags);
        Object.assign(map, { _mapId: id, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
            _vehicles: [], _nameDisplay: false });
        for (const entry of data.events.filter(Boolean)) {
            const page = entry.pages[0];
            const event = Object.assign(f.event(entry.id, 0), { _x: entry.x, _y: entry.y, _pageIndex: 0,
                _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through });
            map._events[entry.id] = event;
            map.fixtureEvents.push(event);
        }
        player._vehicleType = 'walk';
        player.setPosition(x, y);
        player.reserveTransfer(id, x, y, 2, 0);
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
        frame();
        await new Promise(setImmediate);
        const key = (value, shiftKey = false) => {
            f.dispatchWindowEvent('keydown', { key: value, keyCode: value.toUpperCase().charCodeAt(0), shiftKey });
            f.dispatchWindowEvent('keyup', { key: value });
            frame();
        };
        const reply = (packet, result) => {
            f.routeReply({ epoch: packet.epoch, sequence: packet.sequence, map: packet.map, result });
            frame();
        };
        assert(scene._wqaFieldReady);
        for (let index = 0; index < 12 && f.packets.at(-1)?.category !== 'Treasure'; index++) key('l', true);
        assert.match(formatSpeech(f.packets.at(-1)), /^Treasure, Chest,/);
        key('p');
        const blocked = routePackets.at(-1);
        assert.equal(blocked.request.event, chest);
        assert.equal(solveRoute(geometry, blocked.live, blocked.request).status, 'unreachable');
        reply(blocked, { status: 'terrainExit', gate });
        assert.equal(formatSpeech(f.packets.at(-1)), message);
        key('p');
        const retries = routePackets.at(-1);
        assert.equal(retries.request.event, chest, 'the status does not start an onward journey');
        reply(retries, { status: 'unreachable' });
        assert.equal(formatSpeech(f.packets.at(-1)), message);

        open = true;
        // The same native switch also retires Devilled Nook's bridge scene.
        if (id === 79) map._events[14]._pageIndex = 2;
        key('p');
        const after = routePackets.at(-1);
        assert.equal(after.live.terrainGate, true);
        const cells = geometry.cells.slice();
        for (const [, changes] of controls) for (const [cell, flags] of changes) cells[cell] = (cells[cell] & 240) | flags;
        const result = solveRoute({ ...geometry, cells }, after.live, after.request);
        assert.equal(result.status, 'ready', JSON.stringify({ id, result }));
        reply(after, result);
        assert.equal(f.packets.at(-1).kind, 'routeDirections');
    }
    console.log('Verified visible chest labels, spoiler-safe gap and water messages, and normal routes after opening.');
}

async function verifyIceHandback(flags) {
    const data = mapData(25);
    const f = fixture(data);
    const { c, routePackets, frame } = f;
    const { routeThroughIce } = require('../src/world/terrain-controls.cjs');
    const geometry = bakeMap(data, flags[data.tilesetId].flags);
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    c.$dataTilesets = flags;
    Object.assign(map, { _mapId: 25, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false });
    for (const id of [13, 26, 27, 28]) {
        const entry = data.events[id];
        const index = id === 13 ? 0 : 1;
        const page = entry.pages[index];
        const event = f.event(id, index);
        Object.assign(event, { _x: entry.x, _y: entry.y, _pageIndex: index,
            _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through,
            clearStartingFlag() { this._starting = false; } });
        if (index) {
            const args = entry.pages[0].list.find(cmd => cmd.code === 357 && cmd.parameters[1] === 'SetBlocker').parameters[3];
            event.blockerProperties = { x1: +args.minX, y1: +args.minY, x2: +args.maxX, y2: +args.maxY };
        }
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = 'walk';
    player.setPosition(28, 34);
    player.reserveTransfer(25, 28, 34, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    c.SceneManager.updateScene();
    frame();
    await new Promise(setImmediate);
    const key = (value, shiftKey = false) => {
        const ev = { key: value, keyCode: value.toUpperCase().charCodeAt(0), shiftKey };
        f.dispatchWindowEvent('keydown', ev);
        f.dispatchWindowEvent('keyup', ev);
        frame();
    };
    const directions = () => f.packets.filter(record => record.kind === 'routeDirections');
    c.SceneManager.updateScene();
    frame();
    assert(scene._wqaFieldReady, 'Chillcrest fixture is ready for keys');
    key('l', true);
    assert.match(formatSpeech(f.packets.at(-1)), /Exits.*Frostyna/);
    key('p');
    const request = routePackets.at(-1);
    assert.equal(request.request.event, 13);
    const result = routeThroughIce(geometry, request.live, request.request, () => false);
    assert.equal(result?.event, 27);
    f.routeReply({ epoch: request.epoch, sequence: request.sequence, map: request.map,
        result: { ...result, legs: result.legs.slice(0, 8), more: true } });
    frame();
    assert.match(formatSpeech(directions().at(-1)), /Route to the ice block.*More directions available/);
    player.setPosition(result.arrival.x, result.arrival.y);
    key('p');
    const near = routePackets.at(-1);
    const approach = routeThroughIce(geometry, near.live, near.request, () => false);
    f.routeReply({ epoch: near.epoch, sequence: near.sequence, map: near.map, result: approach });
    frame();
    assert.match(formatSpeech(directions().at(-1)), /Route to the ice block.*Face north and press the action button/);
    assert.match(formatSpeech(directions().at(-1)), /Directions resume after the ice melts/);
    const ice = map._events[27];
    const before = routePackets.length;
    ice.start();
    assert.equal(f.epoch(), 0, 'starting the ice event retires speech before native setup');
    assert(map.setupStartingMapEvent());
    assert.equal(map._interpreter._eventId, 27);
    assert(scene._wqaIceRoute, 'the matching native interpreter retains the route intent');
    c.SceneManager.updateScene();
    frame();
    assert.equal(routePackets.length, before, 'no work while the melt interpreter is active');
    map._interpreter.clear();
    c.SceneManager.updateScene();
    frame();
    assert.equal(routePackets.length, before, 'the blocker must actually be erased');
    ice._erased = true;
    c.SceneManager.updateScene();
    frame();
    assert.equal(routePackets.length, before + 1, 'resumes once without another key');
    const onward = routePackets.at(-1);
    assert.equal(onward.request.event, 13);
    assert.equal(solveRoute(geometry, onward.live, onward.request).status, 'ready');
    assert.equal(scene._wqaIceRoute, false);
    console.log('Verified the native ice event closes admission and resumes directions to the original destination.');
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
        scene._wqaNonPageRefreshOnly = false;
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
    assert.equal(scene._wqaNonPageRefreshOnly, false, 'an ordinary refresh still invalidates field admission');
    console.log('Verified the Crispy Ruins weather gate and map-name keys with the authored native conversation and timer.');
}

async function verifyChompsHandback(tilesets) {
    const data = mapData(59);
    const f = fixture(data);
    const { c, frame } = f;
    const { $gameMap: map, $gamePlayer: player } = c;
    const packageRoot = path.join(process.argv[2], 'package.nw');
    const common = JSON.parse(fs.readFileSync(path.join(packageRoot, 'data/CommonEvents.json'), 'utf8'));
    const source = fs.readFileSync(path.join(packageRoot, 'js/rmmz_objects.js'), 'utf8');
    function useOriginalMethod(name) {
        const start = source.indexOf('Game_Interpreter.prototype.' + name + ' = function(');
        assert(start >= 0);
        f.run(source.slice(start, source.indexOf('\n};', start) + 3));
    }
    for (const name of ['command117', 'setupChild', 'isOnCurrentMap']) useOriginalMethod(name);
    const variableStack = JSON.parse(execFileSync('python', ['-B', '-W', 'ignore::SyntaxWarning',
        path.join(__dirname, 'map-producers.py'), packageRoot, 'variable-stack'],
        { encoding: 'utf8', timeout: 6000, maxBuffer: 10000 }));
    for (const method of variableStack) f.run(method);
    f.run('Math.randomInt = () => 0;');
    c.$dataCommonEvents = common;
    c.$dataTilesets = tilesets;
    c.$gameQuest = { getAllAssentedQuests: () => null };
    c.$gameVariables = new c.Game_Variables();
    Object.assign(map, { _mapId: 59, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false });
    for (const id of [3, 26]) {
        const entry = data.events[id];
        const event = f.event(id, 0);
        Object.assign(event, { _x: entry.x, _y: entry.y, _pageIndex: 0,
            _trigger: entry.pages[0].trigger, _priorityType: entry.pages[0].priorityType });
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = '';
    player.setPosition(57, 6);
    player.reserveTransfer(59, 57, 6, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();

    const chomps = map._events[26];
    const guard = chomps._interpreter = new c.Game_Interpreter();
    guard.setup(chomps.list(), 26);
    assert.equal(chomps._trigger, 4);
    assert(guard.command117(chomps.list()[0].parameters));
    const child = guard._childInterpreter;
    assert.equal(child._list, common[47].list);
    const duplicate = Object.assign(new c.Game_Interpreter(), { _mapId: 59, _eventId: 26, _list: child._list });
    const setVariable = child._list[0].parameters;
    let writer = child;
    let extraRefresh = '';
    c.Scene_Map.prototype.updateMainMultiply = () => {
        map._needsRefresh = false;
        if (extraRefresh === 'before') map.requestRefresh();
        writer.command122(setVariable);
        if (extraRefresh === 'after') map.requestRefresh();
    };
    c.SceneManager.updateScene();
    assert(map._needsRefresh);
    assert.equal(c.$gameVariables.value(12), 1);
    assert(!scene._wqaFieldReady, 'changing the variable keeps the first refresh protected');
    c.SceneManager.updateScene();
    assert(scene._wqaFieldReady, 'the parallel repeat must hand back navigation');
    frame();
    await new Promise(setImmediate);
    f.dispatchWindowEvent('keydown', { key: 'p', keyCode: 80 });
    frame();
    const directions = f.routePackets.at(-1);
    assert.equal(directions.request.event, 3);
    const geometry = bakeMap(data, tilesets[data.tilesetId].flags);
    const result = solveRoute(geometry, directions.live, directions.request);
    f.routeReply({ epoch: directions.epoch, sequence: directions.sequence, map: 59, result });
    frame();
    assert(f.packets.some(packet => packet.kind === 'routeDirections'));

    for (const phase of ['before', 'after']) {
        extraRefresh = phase;
        c.SceneManager.updateScene();
        assert(!scene._wqaFieldReady);
    }
    extraRefresh = '';
    writer = duplicate;
    c.SceneManager.updateScene();
    assert(!scene._wqaFieldReady, 'the same event and list need the real child interpreter');
    writer = child;
    c.SceneManager.updateScene();
    assert(scene._wqaFieldReady);

    c.Time.GetDeltaTime = () => 1 / 60;
    function measure() {
        map.inactiveTime = 0;
        const start = performance.now();
        for (let frame = 0; frame < 240; frame++) c.SceneManager.updateScene();
        return performance.now() - start;
    }
    const qualified = measure();
    useOriginalMethod('operateVariable');
    const stock = measure();
    assert(!scene._wqaFieldReady, 'stock variable writes keep the old guard closed');
    console.log('Verified Nuggedor handback, real refresh rejection, and the first change to Saltcaster state.');
    console.log('Throttled 240 Nuggedor frames:', stock.toFixed(2), 'ms stock writer,', qualified.toFixed(2), 'ms qualified.');
}

async function verifyOpeningField(tilesets) {
    const data = mapData(13);
    const f = fixture(data, false, { reachableOnly: true });
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
    await new Promise(setImmediate);
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
    scene._wqaNonPageRefreshOnly = false;
    const baseline = measureFrames();
    assert(!scene._wqaFieldReady);
    console.log('Verified the native Crispy Beach lightning timer, F8, destination cycling, directions and unrelated refresh retirement.');
    console.log('Throttled Crispy Beach update series,', samples, 'frames:', baseline.toFixed(2), 'ms before,',
        withMark.toFixed(2), 'ms with refresh qualification.');
}

async function verifyBeachHandoffs(tilesets) {
    const data = mapData(13);
    const f = fixture(data, false, { reachableOnly: true });
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    const pages = { 5: 1, 8: 1, 14: 1, 20: 1 };
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
    await new Promise(setImmediate);
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
    const f = fixture(data, false, { reachableOnly: true });
    const { c, routePackets } = f;
    const map = c.$gameMap;
    const player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    c.$gameTileChanges = {};
    c.$gameSwitches = { value: id => id === 619 };
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
    await new Promise(setImmediate);
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
    assert.equal(formatSpeech(directions().at(-1)), '1 east, take exit to Secret Island boat landing.');
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
