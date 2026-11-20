'use strict';

const assert = require('node:assert/strict');
const { createCaveProgress } = require('../src/world/puzzles/cave-progression');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute } = require('../src/world/routes.cjs');


function verifyCaveProgression(c, load, snapshot, verifyRoute, read) {
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
        const target = captureWorld(c, false).objects.find(item => item.id === other);
        assert.equal(target?.category, 'events');
        assert.equal(target?.name, 'Patrol line trigger');
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
        const outcome = progress.settle(scene);
        assert.equal(outcome.arrived, false);
        assert.match(outcome.outcome, /^A mech started chasing you\. Walk /);
        assert.equal(progress.settle(scene), null);
    }
    for (const [id, gate, routes] of [[5, 582, [25]], [10, 583, [6]], [19, 584, [8, 25, 45]]]) {
        const blocked = select(200, id, [gate]).source;
        run(blocked, 0, 111);
        assert.equal(blocked._index, 1);
        run(blocked, 1, 115);
        assert(blocked._index > blocked._list.length);
        expectLocal(id === 19 ? 'The distraction crystal has already been used.' : 'The distraction is already active.');

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
    const chestIds = [2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17];
    const checkedChamber = load(197, { self: ['197,18,A'], variables: { 92: 0 } });
    checkedChamber.player.setPosition(14, 16);
    const treasure = captureWorld(c);
    const chests = treasure.objects.filter(item => item.category === 'treasure');
    assert.deepEqual(chests.map(item => item.id), chestIds);
    for (const chest of chests) {
        assert.equal(chest.name, 'Chest');
        const request = { x: 14, y: 16, event: chest.id };
        verifyRoute(checkedChamber, request, solveRoute(checkedChamber.geometry, treasure.live, request));
    }

    const alreadyOpened = load(197, { self: ['197,2,A', '197,18,A'], variables: { 92: 0 } });
    alreadyOpened.player.setPosition(14, 16);
    assert.equal(alreadyOpened.gameMap._events[2]._pageIndex, 2);
    assert(!captureWorld(c, false).objects.some(item => item.id === 2));
    const recheck = load(197, { switches: [644], self: ['197,18,A'], variables: { 92: 1 } });
    recheck.player.setPosition(14, 16);
    assert.equal(recheck.gameMap._events[2]._pageIndex, 1);
    assert(!captureWorld(c, false).objects.some(item => item.id === 2));

    for (const [count, latch, expected] of [[0, [], 0], [10, ['A'], 1], [11, ['A'], 2], [11, ['A', 'B'], 3]]) {
        const chamber = load(197, { self: ['197,18,A', ...latch.map(key => '197,11,' + key)],
            variables: { 92: 0, 195: count } });
        assert.equal(chamber.gameMap._events[11]._pageIndex, expected);
        chamber.player.setPosition(14, 16);
        assert.equal(captureWorld(c, false).objects.find(item => item.id === 11).name, 'Statue');
    }

    const common = read('CommonEvents.json');
    const variables = new Map();
    const opened = [];
    c.$gameVariables.value = key => variables.get(key) ?? 0;
    c.$gameVariables.setValue = (key, value) => variables.set(key, value);
    c.$gameSelfSwitches.setValue = (key, value) => opened.push([Array.from(key), value]);
    const requirements = Object.assign(new c.Game_Interpreter(), { _mapId: 197, _list: common[110].list, _branch: {} });
    for (let index = 0; index < requirements._list.length - 1; index++) run(requirements, index, 122);
    const check = Object.assign(new c.Game_Interpreter(), { _mapId: 197, _eventId: 2,
        _list: common[42].list, _branch: {} });
    variables.set(53, 43); // The selected chest supplies its own stat and requirement IDs.
    variables.set(54, variables.get(143));
    variables.set(43, variables.get(143) - 1);
    run(check, 0, 122);
    run(check, 1, 122);
    run(check, 11, 111);
    assert.equal(check._branch[0], false);
    assert(check._index > 15);
    assert.deepEqual(opened, []);
    variables.set(43, variables.get(143));
    run(check, 0, 122);
    run(check, 1, 122);
    run(check, 11, 111);
    assert.equal(check._branch[0], true);
    assert.equal(check._index, 12);
    run(check, 15, 123);
    assert.deepEqual(opened, [[[197, 2, 'A'], true]]);
    delete c.$gameVariables.setValue;
    delete c.$gameSelfSwitches.setValue;

    delete c.Graphics.app;
    delete c.WendyQuestAccessCaveEventAccepted;
    delete c.$gameMessage;
    delete c.$gameSwitches.setValue;
    c.$gameParty.inBattle = originalInBattle;
    c.SceneManager._scene = originalScene;
    console.log('Verified the patrols, staircase, island choice, eleven chamber chest approaches, native stat gate and four statue pages.');
}

module.exports = { verifyCaveProgression };
