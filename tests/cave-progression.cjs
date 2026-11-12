'use strict';

const assert = require('node:assert/strict');
const { createCaveProgress } = require('../src/world/puzzles/cave-progression');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute } = require('../src/world/routes.cjs');


function verifyCaveProgression(c, load, snapshot, verifyRoute) {
    const originalScene = c.SceneManager._scene;
    const originalInBattle = c.$gameParty.inBattle;
    c.$gameParty.inBattle = () => false;
    c.$gameMessage = { isBusy: () => false };
    const progress = createCaveProgress(c, c.Graphics);
    c.WendyQuestAccessCaveEventAccepted = progress.accepted;
    const scene = { _wqaCaveGuideActive: true, _wqaFieldReady: true };
    c.Graphics.app = { stage: scene };
    c.SceneManager._scene = scene;

    function select(id, eventId, switches = []) {
        const fixture = load(id, { switches });
        const { gameMap, player } = fixture;
        gameMap.refreshIfNeeded = () => {};
        const event = gameMap._events[eventId];
        event.setupPage = () => {};
        const source = gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
            setup(list, id) {
                Object.assign(this, { _list: list, _eventId: id, _mapId: gameMap._mapId,
                    _index: 0, _waitMode: '', _branch: {} });
            }
        });
        if (event._trigger === 1 && !event.isNormalPriority()) {
            player.setPosition(event.x, event.y);
            player.checkEventTriggerHere([1, 2]);
        } else {
            const options = [[event.x, event.y + 1], [event.x - 1, event.y], [event.x + 1, event.y], [event.x, event.y - 1]];
            const live = snapshot(fixture);
            const request = options.map(([x, y]) => ({ x, y, event: eventId })).find(position =>
                solveRoute(fixture.geometry, live, position).status === 'ready');
            assert(request);
            verifyRoute(fixture, request, solveRoute(fixture.geometry, live, request));
        }
        assert(gameMap.setupStartingMapEvent());
        assert.equal(source._eventId, eventId);
        assert.equal(source._list, event.list());
        assert.equal(c.Graphics._wqaCaveProgressPending, true);
        return { ...fixture, source, event };
    }
    function run(source, index, code) {
        source._index = index;
        assert.equal(source.currentCommand().code, code);
        assert(source.executeCommand());
    }
    function expectLocal(outcome) {
        assert.deepEqual(progress.settle(scene), { outcome, arrived: false });
        assert.equal(progress.settle(scene), null);
    }

    for (const id of [22, 24]) {
        const { source, event, gameMap } = select(199, id);
        const other = id === 22 ? 24 : 22;
        assert.equal(captureWorld(c, false).objects.find(item => item.id === other).name, 'Patrol line floor trigger');
        run(source, 0, 203);
        assert.equal(gameMap._events[other].x, 0);
        assert.equal(gameMap._events[other].y, 0);
        for (let index = 0; index < 12; index++) run(source, 1 + 85 * index, 205);
        run(source, 1021, 214);
        assert.equal(event._pageIndex, -1);
        assert(!captureWorld(c, false).objects.some(item => item.id === other || item.id === id));
        expectLocal('The patrol line started moving.');
    }
    for (const id of [4, 9, 11, 13, 24, 26, 27, 28, 29]) {
        const { source, event, gameMap } = select(201, id);
        const index = source._list.findIndex(command => command.code === 205);
        const actor = gameMap._events[source._list[index].parameters[0]];
        run(source, index, 205);
        run(source, source._list.findIndex(command => command.code === 214), 214);
        assert(event._erased);
        if (id === 29) {
            const route = actor._moveRoute;
            actor._moveRoute = { ...route };
            assert.equal(progress.settle(scene), null, 'another forced route cannot report the original chase');
            select(201, id);
            run(c.$gameMap._interpreter, index, 205);
            run(c.$gameMap._interpreter, c.$gameMap._interpreter._list.findIndex(command => command.code === 214), 214);
        }
        expectLocal('A mech started chasing you.');
    }
    for (const [id, gate, routes] of [[5, 582, [25]], [10, 583, [6]], [19, 584, [8, 25, 45]]]) {
        const blocked = select(200, id, [gate]).source;
        run(blocked, 0, 111);
        assert.equal(blocked._index, 1);
        run(blocked, 1, 115);
        assert(blocked._index > blocked._list.length);
        expectLocal('The crystal did not activate.');

        const allowed = select(200, id).source;
        run(allowed, 0, 111);
        assert(allowed._index > 1);
        for (const index of routes) run(allowed, index, 205);
        expectLocal('The distraction crystal activated.');
    }
    const stairs = select(202, 5);
    c.$gameSwitches.setValue = (id, value) => { c.$gameSwitches.value = key => key === id && value; };
    run(stairs.source, 17, 121);
    expectLocal('The staircase scene finished.');

    function transfer(fixture, index, id, advance, offset = 0) {
        const { source, player, gameMap } = fixture;
        run(source, index, 201);
        assert(player.isTransferring());
        assert.equal(player._newMapId, id);
        gameMap._mapId = id;
        player.setPosition(player._newX + offset, player._newY - advance);
        return progress.settle({ _transfer: true });
    }
    const declined = select(206, 11).source;
    run(declined, 0, 111);
    assert(declined._index > 2);
    declined._branch[1] = 1;
    run(declined, 16, 402);
    assert.equal(declined._index, 35);
    run(declined, 35, 402);
    assert(!c.$gamePlayer.isTransferring());
    assert.equal(progress.settle(scene), null);

    const accepted = select(206, 11);
    accepted.source._branch[1] = 0;
    run(accepted.source, 16, 402);
    assert.equal(accepted.source._index, 17);
    assert.deepEqual(transfer(accepted, 32, 196, 0), { outcome: 'Entered the patrol rooms.', arrived: true });
    assert.equal(transfer(select(206, 11, [574]), 2, 196, 0, 1), null, 'an incorrect landing is ignored');
    assert.deepEqual(transfer(select(201, 2), 6, 202, 7), { outcome: 'Cleared the chase. Reached the staircase passage.', arrived: true });
    assert.deepEqual(transfer(select(202, 4), 12, 197, 5), { outcome: 'Reached the reward chamber.', arrived: true });
    assert.deepEqual(transfer(select(197, 10), 9, 206, 0), { outcome: 'Returned to the island.', arrived: true });

    for (const [id, x, y, event, name, category] of [[206, 17, 7, 11, 'Cave entrance', 'exits'],
        [202, 8, 7, 4, 'Chamber entrance', 'exits'], [197, 14, 16, 11, 'Statue', 'objects'],
        [197, 14, 21, 10, 'Exit to island', 'exits']]) {
        const fixture = load(id, { switches: [585] });
        fixture.player.setPosition(x, y);
        const view = captureWorld(c);
        const target = view.objects.find(item => item.id === event);
        assert.equal(target.name, name);
        assert.equal(target.category, category);
        const request = { x, y, event };
        verifyRoute(fixture, request, solveRoute(fixture.geometry, view.live, request));
    }
    delete c.Graphics.app;
    delete c.WendyQuestAccessCaveEventAccepted;
    delete c.$gameMessage;
    delete c.$gameSwitches.setValue;
    c.$gameParty.inBattle = originalInBattle;
    c.SceneManager._scene = originalScene;
    console.log('Verified both native patrol-line starts, nine chase triggers, all three crystal gates, the staircase, island choice and chamber routes.');
}

module.exports = { verifyCaveProgression };
