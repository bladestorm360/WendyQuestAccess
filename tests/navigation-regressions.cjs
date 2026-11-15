'use strict';

const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute } = require('../src/world/routes.cjs');
const { createCaveGuide } = require('../src/world/puzzles/cave');
const { createSaltGuide } = require('../src/world/puzzles/salt-caverns');
const { createTerrainJourney } = require('../src/world/terrain-journey');
const { transferOptions } = require('../src/world/transfer-events.cjs');
const { gateAllows, transferState } = require('../src/world/transfer-gates.cjs');

async function verifyNavigationAuditFixes(c, load, verifyRoute, verifyWorker, read) {
    function at(map, x, y, state) {
        const fixture = load(map, state);
        fixture.player.setPosition(x, y);
        return { fixture, view: captureWorld(c) };
    }

    const cave = at(87, 69, 75);
    const exit = cave.view.objects.find(({ id }) => id === 73);
    assert.deepEqual(exit.handoffs, [102]);
    const request = { x: 69, y: 75, event: 73, field: true, bumpDirections: 15, handoffs: exit.handoffs };
    await verifyWorker(cave.fixture, request, cave.view.live, result => {
        assert.equal(result.status, 'interrupted');
        assert.equal(result.boundary, 2);
        assert.equal(result.boundaryEvent, 102);
        assert.equal(result.distance, 0);
    });
    const settled = at(87, 69, 76, { switches: [96] });
    const through = { ...request, y: 76 };
    verifyRoute(settled.fixture, through, solveRoute(settled.fixture.geometry, settled.view.live, through));
    const exits = new Map(cave.view.objects.filter(item => item.category === 'exits').map(item => [item.id, item.name]));
    for (const [id, name] of [[74, 'Devilled Nook'], [75, 'Poached Pool'], [76, 'Quiche Coast'],
        [77, 'Bacon Beach, west cave exit'], [78, 'Bacon Beach, east cave exit'], [79, 'Cracked Cove, east cave exit'],
        [80, 'Cracked Cove, west cave exit'], [81, 'Scrambled Shores, east cave exit'],
        [82, 'Scrambled Shores, west cave exit'], [83, "Benedict's Bight"], [84, 'Shellside']])
        assert.equal(exits.get(id), name);
    for (const [map, id, label] of [[193, 3, 'Elevator to the lower landing'], [98, 16, 'Elevator to the upper landing']]) {
        const { view } = at(map, 10, 13);
        const target = view.objects.find(item => item.id === id);
        assert.deepEqual([target.name, target.category, target.eventAction], [label, 'exits', 'step']);
    }
    const office = at(103, 7, 13);
    for (const id of [2, 3, 4, 16, 17, 18, 19])
        assert.equal(office.view.objects.find(item => item.id === id)?.category, 'events');

    for (const [map, x, y, event, state, status, control, boundary] of [
        [204, 3, 11, 1, {}, 'terrainExit', 3, 3],
        [53, 5, 10, 7, { variables: { 4: 1 } }, 'controlRoute', 3],
        [55, 8, 11, 1, { variables: { 4: 2 } }, 'controlRoute', 4],
        [55, 17, 10, 3, { variables: { 4: 2 } }, 'terrainExit', 2, 8],
        [97, 4, 21, 18, {}, 'controlRoute', 7, 7],
        [105, 9, 10, 11, {}, 'controlRoute', 5],
        [106, 3, 18, 12, {}, 'controlRoute', 7, 7]
    ]) {
        const { fixture, view } = at(map, x, y, state);
        const target = view.objects.find(item => item.id === event);
        const route = { x, y, event, field: true, bumpDirections: target?.eventAction === 'bump' ? 15 : undefined,
            stopBeforeEvent: target?.eventAction === 'step' };
        assert(['unreachable', 'approachBlocked'].includes(solveRoute(fixture.geometry, view.live, route).status));
        await verifyWorker(fixture, route, view.live, result => {
            assert.equal(result.status, status, 'map ' + map);
            assert.equal(result.event, control);
            assert.equal(result.boundaryEvent, boundary);
            verifyRoute(fixture, { x, y, targetX: result.arrival.x, targetY: result.arrival.y },
                { ...result, status: 'ready', arrival: { ...result.arrival, facing: null } });
        });
    }

    for (const [mapId, x, y, event] of [[77, 1, 8, 23], [79, 9, 1, 6], [80, 27, 4, 1],
        [81, 18, 23, 1], [84, 28, 12, 3], [85, 1, 16, 32]]) {
        const { fixture, view } = at(mapId, x, y);
        const state = transferState(c);
        const common = read('CommonEvents.json');
        const candidates = fixture.map.events.flatMap(entry => {
            if (!entry) return [];
            const page = entry.pages[fixture.gameMap._events[entry.id]._pageIndex];
            return transferOptions(mapId, entry, page, common).filter(edge => gateAllows(edge.gate, state))
                .map(edge => ({ ...edge, event: entry.id }));
        });
        const target = view.objects.find(item => item.id === event);
        const route = { x, y, event, field: true, terrainTransfer: { map: 86, state, candidates },
            bumpDirections: target?.eventAction === 'bump' ? 15 : undefined };
        await verifyWorker(fixture, route, view.live, result => {
            assert.equal(result.status, 'terrainExit', 'island ' + mapId);
            assert.equal(result.gate, 97);
            assert(candidates.some(edge => edge.event === result.entrance));
            if (mapId === 85) assert(!result.onwardUnavailable);
        });
    }

    const opening = at(19, 24, 68);
    const saltScene = { _wqaMapRestored: true };
    const guide = createSaltGuide(c).review(saltScene, opening.view.objects);
    assert.equal(guide.target.id, 19);
    assert.match(guide.text, /0 of 4 colors complete/);
    await verifyWorker(opening.fixture, { x: 24, y: 68, event: guide.target.id, field: true }, opening.view.live, result => {
        assert.equal(result.status, 'saltRoute');
        assert(result.actions.length > 0 && result.actions[0] !== guide.target.id);
    });

    const patrol = at(199, 1, 33);
    const scene = c.SceneManager._scene;
    scene._wqaMapRestored = true;
    const plan = createCaveGuide(c, c.Graphics).review(scene, patrol.view.objects, 1, 33);
    assert.equal(plan.target.id, 24);
    assert(plan.options.some(item => item.target.id === 26));
    for (const id of [22, 24]) patrol.fixture.gameMap._events[id]._erased = true;
    const consumed = createCaveGuide(c, c.Graphics).review(scene, captureWorld(c).objects, 1, 33);
    assert.equal(consumed.target.id, 26);
    const guards = at(200, 9, 33, { switches: [582, 583, 584], variables: { 90: 2 } });
    const blocked = createCaveGuide(c, c.Graphics).review(scene, guards.view.objects, 9, 33);
    assert(!blocked.options.some(item => [5, 10, 19].includes(item.target.id)));
    const allowed = at(200, 9, 33, { switches: [583, 584], variables: { 90: 2 } });
    const usable = createCaveGuide(c, c.Graphics).review(scene, allowed.view.objects, 9, 33);
    assert.equal(usable.target.id, 5);

    const party = { $gamePlayer: {}, $gameSwitches: { value: () => false } };
    const journey = createTerrainJourney(party);
    const original = { id: 1, category: 'treasure' };
    const location = (map, ...ids) => ({ map, mode: 'walk', objects: ids.map(id => ({ id, category: 'exits' })) });
    journey.begin(145, 204, original, 27);
    assert.equal(journey.next(location(27, 17, 44)).target.id, 17);
    journey.advance(27, 37);
    assert.equal(journey.next(location(37, 3, 4)).target.id, 4);
    party.$gameSwitches.value = () => true;
    assert.equal(journey.next(location(37, 3, 4)).target.id, 3);
    journey.advance(37, 27);
    assert.equal(journey.next(location(27, 17, 44)).target.id, 44);
    journey.advance(27, 204);
    assert.deepEqual(journey.next({ map: 204, mode: 'walk', objects: [original] }), { target: original, restore: true });
    console.log('Verified the audited terrain gates, reachable exits, guide phases and Frosty Peak return selection.');
}

module.exports = { verifyNavigationAuditFixes };
