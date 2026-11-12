'use strict';

const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { createTransferBookmarks } = require('../src/world/transfer-bookmarks');
const { solveRoute } = require('../src/world/routes.cjs');
const { PASSAGE } = require('../src/world/geometry.cjs');

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

async function verifyTransferBookmarks(c, load, verifyRoute, verifyWorker) {
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

    const scene = { _wqaFieldReady: true };
    const originalScene = c.SceneManager._scene;
    const originalApp = c.Graphics.app;
    const originalMessage = c.$gameMessage;
    const originalInBattle = c.$gameParty.inBattle;
    c.SceneManager._scene = scene;
    c.Graphics.app = { stage: scene };
    c.$gameParty.inBattle = () => false;
    c.$gameMessage = { isBusy: () => false };
    const transfers = createTransferBookmarks(c, { graphics: c.Graphics });
    c.WendyQuestAccessBookmarkEntranceAccepted = transfers.accepted;
    c.WendyQuestAccessBookmarkTransferReserved = transfers.reserved;
    c.WendyQuestAccessSceneLeaving = transfers.leave;
    try {
        const house = load(127);
        house.player.setPosition(3, 3);
        assert.deepEqual(transfers.candidates({ map: 195 }), []);
        assert.deepEqual(transfers.candidates({ map: 128 }), []);
        for (const [origin, destination, expectNormal] of [[19, 20, true], [17, 113, false]]) {
            const fixture = load(origin);
            const { gameMap, player } = fixture;
            player.setPosition(0, 0);
            const bookmark = { id: 1, revision: 1, map: destination, mode: 'walk' };
            const entrances = transfers.candidates(bookmark);
            assert(entrances.length > 0);
            if (!expectNormal) assert(entrances.length > 1);
            assert(entrances.every(edge => edge.normal === expectNormal));
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
            transfers.arm(scene, bookmark, selected);
            assert(gameMap.setupStartingMapEvent());
            assert(c.Graphics._wqaBookmarkTransferPending);
            const command = gameMap._interpreter._list.find(row => row.code === 201);
            assert(gameMap._interpreter.command201(command.parameters));
            assert.deepEqual([player._newMapId, player._newX, player._newY], [destination, selected.x, selected.y]);
            assert(c.Graphics._wqaBookmarkTransferPending);
            gameMap._mapId = destination;
            player.setPosition(selected.x + (expectNormal ? 0 : 1), selected.y);
            assert.deepEqual(transfers.settle({}), expectNormal ? bookmark : null);
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
    }
    console.log('Verified direct entrance priority, native event acceptance and reservation, and wrong landing retirement.');
}

module.exports = { verifyTransferBookmarks };
