'use strict';

const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { createTransferBookmarks } = require('../src/world/transfer-bookmarks');
const { solveRoute } = require('../src/world/routes.cjs');
const { PASSAGE } = require('../src/world/geometry.cjs');
const { readCatalog, rankEntrances } = require('../src/world/walking-catalog.cjs');

function reachableStart(fixture, live, entrances) {
    const { width, height } = fixture.geometry;
    for (const { sourceX, sourceY } of entrances) {
        for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, 0], [0, -1], [1, 0], [0, 1]]) {
            const x = sourceX + dx;
            const y = sourceY + dy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const request = { x, y, field: true, entrances: entrances.map(edge => edge.event) };
            const result = solveRoute(fixture.geometry, live, request);
            if (result.status === 'ready' && result.distance > 0) return { request, result };
        }
    }
    throw Error('The installed fixture has no reachable entrance near its transfer');
}

function verifyCatalog() {
    const maps = Object.fromEntries([1, 2, 3, 4].map(id => [id, { width: 4, height: 1 }]));
    const mask = byte => Buffer.from([byte]).toString('base64');
    const data = { version: 1, landings: [
        [2, 0, 0, mask(15), [1, 1]],
        [3, 0, 0, mask(3), []],
        [3, 3, 0, mask(8), []],
        [4, 0, 0, mask(15), [2, 0, 0, 0]]
    ] };
    const catalog = readCatalog(data, maps);
    const request = { map: 3, point: { x: 0, y: 0 }, state: [true, null],
        candidates: [{ event: 1, map: 2, x: 0, y: 0 }, { event: 2, map: 3, x: 3, y: 0 },
            { event: 3, map: 4, x: 0, y: 0 }] };
    const ranks = values => rankEntrances(catalog, 1, { ...request, ...values }, maps, () => false);
    assert.deepEqual(ranks({}), [{ event: 1, rank: 2 }, { event: 3, rank: 3 }]);
    assert.deepEqual(ranks({ state: [false, null] }), []);
    assert.deepEqual(ranks({ trail: ['2/0/0'] }), []);
    assert.deepEqual(ranks({ point: { x: 3, y: 0 } }), [{ event: 2, rank: 1 }, { event: 3, rank: 2 }]);
    assert.throws(() => readCatalog({ version: 1, landings: [...data.landings, data.landings[0]] }, maps), /Invalid walking landing/);
}

async function verifyTransferBookmarks(c, load, verifyRoute, verifyWorker, common) {
    verifyCatalog();
    const small = { width: 5, height: 1, scrollType: 0, cells: new Uint8Array(5).fill(PASSAGE) };
    const event = (id, x, normal = false) => ({ id, x, y: 0, normal, trigger: 1, action: true });
    const simple = { mode: 'walk', terrain: [], vehicles: [], events: [event(1, 4), event(2, 2)] };
    assert.equal(solveRoute(small, simple, { x: 0, y: 0, entrances: [1, 2] }).entrance, 2);
    assert.equal(solveRoute(small, simple, { x: 0, y: 0, entrances: [1] }).status, 'unreachable');
    assert.equal(solveRoute(small, simple, { x: 2, y: 0, entrances: [2] }).reenter, true);
    simple.events = [event(1, 4, true), event(2, 2)];
    assert.equal(solveRoute(small, simple, { x: 0, y: 0, entrances: [1] }).status, 'unreachable');
    simple.events = [event(1, 4, true), event(2, 3)];
    assert.equal(solveRoute(small, simple, { x: 0, y: 0, entrances: [1] }).status, 'unreachable');
    simple.events = [event(1, 4, true), event(2, 2)];
    assert.equal(solveRoute(small, simple, { x: 0, y: 0,
        entrances: [{ event: 1, rank: 1 }, { event: 2, rank: 2 }] }).entrance, 2);
    simple.events = [event(1, 4, true), event(2, 2, true)];
    const open = { ...small, width: 5, height: 2, cells: new Uint8Array(10).fill(PASSAGE) };
    assert.equal(solveRoute(open, simple, { x: 0, y: 0,
        entrances: [{ event: 1, rank: 1 }, { event: 2, rank: 2 }] }).entrance, 1);

    const scene = { _wqaFieldReady: true };
    const originalScene = c.SceneManager._scene;
    const originalApp = c.Graphics.app;
    const originalMessage = c.$gameMessage;
    const originalInBattle = c.$gameParty.inBattle;
    const originalCommon = c.$dataCommonEvents;
    const originalSetSelfSwitch = c.$gameSelfSwitches.setValue;
    c.SceneManager._scene = scene;
    c.Graphics.app = { stage: scene };
    c.$gameParty.inBattle = () => false;
    c.$gameMessage = { isBusy: () => false };
    c.$dataCommonEvents = common;
    const transfers = createTransferBookmarks(c, { graphics: c.Graphics });
    c.WendyQuestAccessBookmarkEntranceAccepted = transfers.accepted;
    c.WendyQuestAccessBookmarkTransferReserved = transfers.reserved;
    c.WendyQuestAccessSceneLeaving = transfers.leave;
    const marker = { id: 1, revision: 1, trail: [] };

    function reserveSpecial(fixture, event, start, expected, commonId = 38) {
        const { gameMap, player } = fixture;
        player.setPosition(...start);
        const edge = transfers.candidates().entrances.find(candidate => candidate.event === event);
        assert.equal(edge?.map, expected);
        const request = { x: start[0], y: start[1], event, field: true };
        const result = solveRoute(fixture.geometry, captureWorld(c).live, request);
        verifyRoute(fixture, request, result);
        const interpreter = gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
            setup(list, id) {
                Object.assign(this, { _list: list, _eventId: id, _mapId: gameMap._mapId,
                    _index: 0, _waitMode: '', _branch: {} });
                transfers.leave(scene);
            },
            setupChild(rows) { assert.equal(rows, common[commonId].list); },
            command101() { return true; }
        });
        transfers.arm(scene, marker, edge);
        assert(gameMap.setupStartingMapEvent());
        assert(c.Graphics._wqaBookmarkTransferPending);
        for (let count = 0; !player.isTransferring() && count < 32; count++) assert(interpreter.executeCommand());
        assert(player.isTransferring());
        assert.deepEqual([player._newMapId, player._newX, player._newY, player._newDirection],
            [edge.map, edge.x, edge.y, edge.direction]);
        assert(c.Graphics._wqaBookmarkTransferPending);
        return edge;
    }

    try {
        const house = load(127);
        house.player.setPosition(3, 3);
        const closed = transfers.candidates().entrances.find(edge => edge.event === 2);
        assert.equal(closed.map, 128);
        load(127, { switches: [503] }).player.setPosition(3, 3);
        const opened = transfers.candidates().entrances.find(edge => edge.event === 2);
        assert.equal(opened.map, 195);
        assert(!transfers.current(closed));
        assert(transfers.current(opened));
        load(132, { switches: [525] }).player.setPosition(3, 3);
        assert.equal(transfers.candidates().entrances.find(edge => edge.event === 2).map, 203);
        for (const self of [[], ['87,91,A']]) {
            const cave = load(87, { self });
            const edge = reserveSpecial(cave, 91, [12, 64], 205);
            cave.gameMap._mapId = edge.map;
            cave.player.setPosition(edge.x, edge.y);
            assert.deepEqual(transfers.settle({}), { ...marker, trail: ['205/14/4'] });
        }
        c.$gameSelfSwitches.setValue = (key, value) => {
            const before = c.$gameSelfSwitches.value;
            c.$gameSelfSwitches.value = check => check.join(',') === key.join(',') ? value : before(check);
        };
        for (const [progress, expected] of [[-1, 50], [0, 50], [1, 32], [2, 28], [3, 44], [4, 44]]) {
            reserveSpecial(load(57, { variables: { 4: progress } }), 13, [7, 4], expected);
            transfers.clear();
        }
        for (const [map, id, start, progress, expected] of [[51, 1, [5, 10], 4, 44],
            [53, 2, [7, 10], 4, 50], [55, 3, [8, 11], 2, 28]]) {
            reserveSpecial(load(map, { variables: { 4: progress } }), id, start, expected);
            transfers.clear();
        }
        const returnRoom = load(51, { variables: { 4: 1 } });
        returnRoom.player._direction = 2;
        const walk = reserveSpecial(returnRoom, 1, [5, 10], 32);
        const destination = load(32, { variables: { 4: 1 } });
        c.$gameMap = returnRoom.gameMap;
        c.$gamePlayer = returnRoom.player;
        Object.assign(c.$gameMap, { _mapId: 32, _events: destination.gameMap._events, _tileEvents: destination.gameMap._tileEvents,
            _tilesetId: destination.map.tilesetId, refreshIfNeeded() {} });
        const player = c.$gamePlayer;
        player._transferring = false;
        player._followers = { updateMove() {} };
        player.setPosition(walk.x, walk.y);
        player.facing = 2;
        const intro = c.$gameMap._events[5];
        const script = Object.assign(new c.Game_Interpreter(), {
            _list: intro.list(), _eventId: 5, _mapId: 32, _index: 3, _waitMode: '', _branch: {}
        });
        assert(script.executeCommand());
        assert(script.executeCommand());
        assert.equal(script._waitMode, 'route');
        for (let tick = 0; tick < 4; tick++) player.updateRoutineMove();
        assert.deepEqual([player._x, player._y], [walk.x, walk.y + 3]);
        script._index = 20;
        assert(script.executeCommand());
        intro._pageIndex = intro.findProperPageIndex();
        assert.deepEqual(transfers.settle({}), { ...marker, trail: ['32/17/10', '32/17/13'] });

        const originalLayout = load(50, { variables: { 4: 1 } });
        originalLayout.player.setPosition(3, 16);
        const layoutLive = captureWorld(c).live;
        const candidates = transfers.candidates().entrances.filter(edge => edge.event === 6);
        const origin = reachableStart(originalLayout, layoutLive, candidates).request;
        const layoutRequest = { x: origin.x, y: origin.y, field: true, transfer: { map: 32, point: { x: 3, y: 16 },
            state: [false, false, 1], candidates: candidates.map(({ event, map, x, y }) => ({ event, map, x, y })) } };
        await verifyWorker(originalLayout, layoutRequest, layoutLive, result => assert.equal(result.entrance, 6));
        await verifyWorker(originalLayout, { ...layoutRequest, transfer: { ...layoutRequest.transfer, state: [false, false, 0] } },
            layoutLive, result => assert.equal(result.status, 'unavailable'));
        const lower = load(128, { switches: [503] });
        lower.player.setPosition(1, 6);
        const lowerEntrances = transfers.candidates().entrances;
        const lowerLive = captureWorld(c).live;
        const lowerStart = reachableStart(lower, lowerLive, lowerEntrances).request;
        const toSecret = { x: lowerStart.x, y: lowerStart.y, field: true,
            transfer: { map: 195, point: { x: 6, y: 11 }, state: [true, false],
                candidates: lowerEntrances.map(({ event, map, x, y }) => ({ event, map, x, y })) } };
        await verifyWorker(lower, toSecret, lowerLive, output => {
            assert.equal(output.status, 'ready');
            assert.equal(output.entrance, 1, 'the route to the secret room first takes the lower-floor return');
        });
        await verifyWorker(lower, { ...toSecret, transfer: { ...toSecret.transfer, state: [false, false] } },
            lowerLive, output => assert.equal(output.status, 'unavailable'));
        const ruinsMaps = new Set([161, 162, ...Array.from({ length: 17 }, (_, index) => index + 164), 207, 208]);
        const world = load(113, { self: ['113,75,A', '113,90,A'] });
        world.player.setPosition(1, 1);
        const worldEntrances = transfers.candidates().entrances;
        assert.equal(worldEntrances.filter(edge => ruinsMaps.has(edge.map)).length, 21);
        assert(worldEntrances.some(edge => edge.event === 1 && edge.map === 13));
        assert(!worldEntrances.some(edge => [30, 31].includes(edge.event)), 'ship ports stay out of walking plans');
        for (const [event, destination] of [[76, 161], [13, 206]]) {
            const origin = load(113, { self: ['113,75,A', '113,90,A'] });
            origin.player.setPosition(1, 1);
            const options = transfers.candidates().entrances;
            const target = options.find(edge => edge.event === event);
            assert.equal(target?.map, destination);
            const live = captureWorld(c).live;
            const { request: { x, y } } = reachableStart(origin, live, [target]);
            await verifyWorker(origin, { x, y, field: true, transfer: { map: destination,
                point: { x: target.x, y: target.y }, candidates: options.map(({ event, map, x, y }) => ({ event, map, x, y })) } },
            live, result => assert.equal(result.entrance, event));
            const edge = reserveSpecial(origin, event, [x, y], destination, 138);
            origin.gameMap._mapId = edge.map;
            origin.player.setPosition(edge.x, edge.y);
            assert.deepEqual(transfers.settle({}), { ...marker, trail: [edge.map + '/' + edge.x + '/' + edge.y] });
        }
        const island = load(206);
        const variableWriter = c.$gameVariables.setValue;
        const written = [];
        try {
            c.$gameVariables.setValue = (id, value) => written.push([id, value]);
            const back = reserveSpecial(island, 4, [9, 16], 113);
            assert.deepEqual(written, [[81, 2]]);
            island.gameMap._mapId = back.map;
            island.player.setPosition(back.x, back.y);
            assert.deepEqual(transfers.settle({}), { ...marker, trail: ['113/48/7'] });
        } finally {
            c.$gameVariables.setValue = variableWriter;
        }
        console.log('Verified 21 Lost Ruins entrances, native world reservations, and Secret Island entry and return.');

        for (const [origin, destination, expectNormal] of [[19, 20, true], [17, 113, false]]) {
            const fixture = load(origin);
            const { gameMap, player } = fixture;
            player.setPosition(0, 0);
            const bookmark = { id: 1, revision: 1, trail: [] };
            const entrances = transfers.candidates().entrances.filter(edge => edge.map === destination);
            assert(entrances.length > 0);
            if (!expectNormal) assert(entrances.length > 1);
            assert(entrances.every(edge => edge.action === expectNormal));
            const live = captureWorld(c).live;
            const { request, result } = reachableStart(fixture, live, entrances);
            const { x, y } = request;
            const options = entrances.map(({ event, x, y }) => ({ event, x, y }));
            await verifyWorker(fixture, { x, y, field: true, autowalk: true, limit: 8,
                transfer: { map: destination, candidates: options } }, live, output => {
                assert.equal(output.entrance, result.entrance);
                assert.equal(output.course.length, result.distance);
                assert.equal(output.autowalkStop, expectNormal ? undefined : result.legs.at(-1).direction);
            });
            if (expectNormal) await verifyWorker(fixture, { x, y,
                transfer: { map: destination, candidates: options.map(candidate => ({ ...candidate, x: 16383 })) } },
            live, output => assert.equal(output.status, 'unavailable'));
            const selected = entrances.find(edge => edge.event === result.entrance);
            player.setPosition(x, y);
            const trigger = gameMap._events[selected.event];
            trigger._erased = true;
            assert(!transfers.current(selected));
            trigger._erased = false;
            assert(transfers.current(selected));
            verifyRoute(fixture, { ...request, event: selected.event }, result);
            assert(trigger.isStarting());
            gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
                setup(list, eventId) {
                    this._list = list;
                    this._eventId = eventId;
                    c.WendyQuestAccessSceneLeaving(scene);
                }
            });
            if (expectNormal) {
                const other = gameMap._events[1];
                assert.notEqual(other, trigger);
                trigger.clearStartingFlag();
                other._starting = true;
                transfers.arm(scene, bookmark, selected);
                assert(gameMap.setupStartingMapEvent());
                assert.equal(gameMap._interpreter._eventId, 1);
                assert(!scene._wqaBookmarkEntrance && !c.Graphics._wqaBookmarkTransferPending);
                verifyRoute(fixture, { ...request, event: selected.event }, result);
            }
            transfers.arm(scene, bookmark, selected);
            assert(gameMap.setupStartingMapEvent());
            assert(c.Graphics._wqaBookmarkTransferPending);
            const command = gameMap._interpreter._list.find(row => row.code === 201);
            assert(gameMap._interpreter.command201(command.parameters));
            assert.deepEqual([player._newMapId, player._newX, player._newY], [destination, selected.x, selected.y]);
            assert(c.Graphics._wqaBookmarkTransferPending);
            gameMap._mapId = destination;
            player.setPosition(selected.x + (expectNormal ? 0 : 1), selected.y);
            assert.deepEqual(transfers.settle({}), expectNormal ?
                { ...bookmark, trail: [`${destination}/${selected.x}/${selected.y}`] } : null);
            assert(!c.Graphics._wqaBookmarkTransferPending);
        }
    } finally {
        transfers.clear();
        delete c.WendyQuestAccessBookmarkEntranceAccepted;
        delete c.WendyQuestAccessBookmarkTransferReserved;
        delete c.WendyQuestAccessSceneLeaving;
        c.Graphics.app = originalApp;
        c.SceneManager._scene = originalScene;
        c.$gameMessage = originalMessage;
        c.$gameParty.inBattle = originalInBattle;
        c.$dataCommonEvents = originalCommon;
        c.$gameSelfSwitches.setValue = originalSetSelfSwitch;
    }
    console.log('Verified ranked walking chains, both house gates, Caffeine discovery, Cauldron branches and intro movement.');
}

module.exports = { verifyTransferBookmarks };
