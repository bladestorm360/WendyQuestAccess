'use strict';

const assert = require('node:assert/strict');
const { captureWorld } = require('../src/world/snapshot');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { BREAKFAST_HANDOFFS } = require('../src/world/local-destinations');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { mapDescription } = require('../src/world/map-descriptions');
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

    const cove = at(191, 33, 14);
    const guard = cove.fixture.gameMap._events[3];
    const guardPage = cove.fixture.map.events[3].pages[0];
    const jump = guardPage.list.find(row => row.code === 205 && row.indent === 1).parameters[1].list
        .find(step => step.code === 14);
    assert.deepEqual(jump.parameters, [0, 2]);
    const east = cove.view.objects.find(item => item.id === 1);
    const target = { x: 33, y: 14, event: 1, field: true, handoffs: east.handoffs, beacon: true, autowalk: true };
    const npcRoute = solveRoute(cove.fixture.geometry, cove.view.live, target);
    assert.deepEqual([npcRoute.status, npcRoute.npc, npcRoute.distance], ['npcBlocked', 3, 2]);
    verifyRoute(cove.fixture, { ...target, event: 3 }, { ...npcRoute, status: 'ready' });
    const words = { kind: 'routeDirections', name: east.name, directionsOnly: true,
        legs: npcRoute.legs, npcBlocker: cove.view.live.npcPassage.name };
    assert.equal(formatSpeech(words), '2 south. Blocked by Search and Rescue Officer.');
    assert.equal(formatSpeech({ ...words, beaconOnly: true }), 'Blocked by Search and Rescue Officer.');
    const available = findReachable(cove.fixture.geometry, cove.view.live, {
        x: 33, y: 14, candidates: [{ event: 1, handoffs: east.handoffs }, { event: 2 }, { event: 36 }]
    });
    assert.deepEqual([...available.available], [1, 0, 1]);
    await verifyWorker(cove.fixture, target, cove.view.live, result => {
        assert.equal(result.status, 'npcBlocked');
        assert.equal(result.npc, 3);
        assert.equal(result.course.length, 2);
        assert.deepEqual(result.arrival, { x: 33, y: 16, facing: 2 });
    });
    const fromLog = { ...target, y: 16, event: 36, handoffs: undefined, stopBeforeEvent: true };
    assert.equal(solveRoute(cove.fixture.geometry, cove.view.live, fromLog).npc, 3);
    assert.equal(solveRoute(cove.fixture.geometry, cove.view.live, { ...target, event: 2 }).status, 'unreachable');
    cove.fixture.player.setPosition(33, 16);
    guard.setPosition(guard._x + jump.parameters[0], guard._y + jump.parameters[1]);
    guard._pageIndex = 1;
    const openCove = captureWorld(c);
    assert.equal(openCove.live.npcPassage, null);
    assert.equal(solveRoute(cove.fixture.geometry, openCove.live, { ...target, y: 16 }).boundaryEvent, 36);
    const thawed = at(119, 2, 9);
    const crossing = { x: 2, y: 9, targetX: 4, targetY: 8, field: true };
    assert.equal(solveRoute(thawed.fixture.geometry, thawed.view.live, crossing).npc, 4);
    const joined = at(119, 2, 9, { switches: [33], self: ['119,4,A'] });
    verifyRoute(joined.fixture, crossing, solveRoute(joined.fixture.geometry, joined.view.live, crossing));

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
    const sunrise = at(76, 3, 17);
    assert(!sunrise.view.objects.some(item => item.id === 78));
    assert.equal(sunrise.view.objects.find(item => item.id === 79)?.category, 'events');
    const beforeScene = { x: 3, y: 17, event: 79, field: true, stopBeforeEvent: true };
    await verifyWorker(sunrise.fixture, beforeScene, sunrise.view.live, result => {
        assert.equal(result.status, 'interrupted');
        assert.equal(result.boundaryEvent, 79);
        verifyRoute(sunrise.fixture, { ...beforeScene, targetX: result.arrival.x, targetY: result.arrival.y, event: undefined },
            { ...result, status: 'ready' });
    });
    const savedScene = { id: 7, map: 76, mode: 'walk', kind: 'entity', category: 'events',
        event: 78, name: 'Sunrise Bay introduction' };
    assert.equal(captureWorld(c, false, undefined, undefined, [savedScene]).objects
        .find(item => item.id === 'bookmark-7')?.event, 79);
    const completed = at(76, 3, 17, { switches: [465] });
    assert(!completed.view.objects.some(item => item.id === 78 || item.id === 79));

    // Native counter prompts preserve the conversation behind the furniture.
    for (const [map, x, y, name] of [[150, 5, 7, 'Helly'], [151, 3, 8, 'Shelly']]) {
        const shop = at(map, x, y);
        assert.deepEqual(shop.fixture.map.events[5].pages[0].list, shop.fixture.map.events[6].pages[0].list);
        assert.deepEqual(shop.view.objects.filter(item => [5, 6].includes(item.id)).map(item =>
            [item.id, item.category, item.name]), [[6, 'people', name]]);
        const request = { x, y, event: 6, field: true };
        verifyRoute(shop.fixture, request, solveRoute(shop.fixture.geometry, shop.view.live, request));
    }

    const restaurant = at(186, 12, 15);
    const diners = restaurant.view.objects.filter(item => item.category === 'people' && [15, 16].includes(item.id));
    assert.deepEqual(diners.map(item => [item.id, item.name]), [[15, 'Jay'], [16, 'Kitty']]);
    for (const target of diners) {
        const request = { x: 12, y: 15, event: target.id, field: true };
        verifyRoute(restaurant.fixture, request, solveRoute(restaurant.fixture.geometry, restaurant.view.live, request));
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
        if (map === 55 && event === 1) {
            await verifyWorker(fixture, route, view.live, result => {
                assert.equal(result.status, 'enemyBlocked');
                assert.deepEqual(result.terrain, { status: 'controlRoute', event: control });
                verifyRoute(fixture, { x, y, targetX: result.arrival.x, targetY: result.arrival.y },
                    { ...result, status: 'ready' });
                const enemy = fixture.gameMap.event(result.enemy);
                Object.assign(enemy, { _erased: true, _through: true, _trigger: null, _pageIndex: -1 });
            });
            view.live = captureWorld(c, true, undefined, undefined, [], true).live;
        }
        await verifyWorker(fixture, route, view.live, result => {
            assert.equal(result.status, status, 'map ' + map);
            assert.equal(result.event, control);
            assert.equal(result.boundaryEvent, boundary);
            verifyRoute(fixture, { x, y, targetX: result.arrival.x, targetY: result.arrival.y },
                { ...result, status: 'ready', arrival: { ...result.arrival, facing: null } });
        });
    }

    function regionalTransfer(fixture, map, open = false, point) {
        const state = transferState(c);
        const common = read('CommonEvents.json');
        const { id: mapId } = fixture;
        const candidates = fixture.map.events.flatMap(entry => {
            if (!entry) return [];
            const page = entry.pages[fixture.gameMap._events[entry.id]._pageIndex];
            return transferOptions(mapId, entry, page, common).filter(edge => gateAllows(edge.gate, state))
                .map(edge => ({ ...edge, event: entry.id }));
        });
        return { map, state, breakfast: open, point, candidates,
            handoffs: Object.keys(BREAKFAST_HANDOFFS[mapId] || {}).map(Number) };
    }

    for (const [id, actor] of [[77, 28], [79, 12], [80, 27], [81, 20], [84, 17], [85, 29]]) {
        const { fixture } = at(id, 5, 5);
        assert.match(mapDescription(c), /Broken bacon bridges/);
        const source = fixture.map.events[actor].pages[0].list.find(row =>
            row.code === 357 && ['B5,1', 'B5,4'].includes(row.parameters[3]?.tileId));
        const { x, y, z } = JSON.parse(source.parameters[3].coordinates);
        const { width, height, data } = c.$dataMap;
        const cell = +z * width * height + +y * width + +x;
        const original = data[cell];
        data[cell] = source.parameters[3].tileId === 'B5,1' ? 13 : 37;
        assert.match(mapDescription(c), /strips of bacon bridge/);
        c.$gameMap._tilesetId = 7;
        assert.doesNotMatch(mapDescription(c), /bacon bridges|strips of bacon/);
        data[cell] = original;
    }

    const barrels = at(77, 44, 9, { switches: [93, 266], self: ['77,25,A', '77,33,A', '77,34,A'] });
    for (const id of [33, 34]) {
        const block = barrels.fixture.map.events[id].pages[0].list.find(row =>
            row.code === 357 && row.parameters[1] === 'SetBlocker').parameters[3];
        barrels.fixture.gameMap._events[id].SetBlocker(+block.minX, +block.minY, +block.maxX, +block.maxY);
    }
    const locked = captureWorld(c).live;
    for (const [event, afterIce] of [[35, undefined], [60, 34]]) {
        await verifyWorker(barrels.fixture, { x: 44, y: 9, event, field: true }, locked, result => {
            assert.equal(result.status, 'terrainGate');
            assert.equal(result.gate, 97);
            assert.equal(result.afterIce, afterIce);
        });
    }

    const startingPoints = [[77, 1, 8, 23, 113], [79, 9, 1, 6, 87], [80, 27, 4, 1, 113],
        [81, 18, 23, 1, 113], [84, 28, 12, 3, 87], [85, 1, 16, 32, 113]];
    for (const [mapId, x, y, event, destination] of startingPoints) {
        const { fixture, view } = at(mapId, x, y);
        const transfer = regionalTransfer(fixture, 86);
        const target = view.objects.find(item => item.id === event);
        const route = { x, y, event, field: true, terrainTransfer: transfer,
            bumpDirections: target?.eventAction === 'bump' ? 15 : undefined };
        await verifyWorker(fixture, route, view.live, result => {
            assert.equal(result.status, 'terrainExit', 'island ' + mapId);
            assert.equal(result.gate, 97);
            assert(transfer.candidates.some(edge => edge.event === result.entrance && edge.map === destination));
        });
    }

    for (const [id, x, y, state, status, entrance, boundary] of [
        [113, 37, 26, {}, 'ready', 68],
        [113, 41, 39, {}, 'interrupted', 61, 179],
        [113, 40, 33, { self: ['113,179,A','113,180,A'] }, 'ready', 61],
        [87, 103, 55, {}, 'enemyBlocked', 73],
        [87, 69, 75, {}, 'interrupted', 73, 102],
        [87, 69, 76, { switches: [96] }, 'ready', 73],
        [85, 7, 27, {}, 'interrupted', 37, 49],
        [85, 5, 27, { switches: [522] }, 'ready', 41],
        [113, 27, 41, {}, 'ready', 71]
    ]) {
        const { fixture, view } = at(id, x, y, state);
        const transfer = regionalTransfer(fixture, 86);
        let live = view.live;
        for (let cleared = 0; ; cleared++) {
            let blocker;
            await verifyWorker(fixture, { x, y, field: true, transfer }, live, result => {
                verifyRoute(fixture, { x, y, targetX: result.arrival.x, targetY: result.arrival.y },
                    { ...result, status: 'ready', arrival: { ...result.arrival, facing: null } });
                assert.equal(result.entrance, entrance);
                if (id === 87 && status !== 'enemyBlocked' && result.status === 'enemyBlocked') {
                    assert.equal(result.needsEncounter, true);
                    blocker = fixture.gameMap.event(result.enemy);
                    assert(live.events.some(event => event.id === result.enemy && event.movingEnemy));
                    return;
                }
                assert.equal(result.status, status, 'regional route on ' + id);
                if (boundary) assert.equal(result.boundaryEvent, boundary);
            });
            if (!blocker) break;
            assert(cleared < 8, 'verified handoff after bounded encounter removals');
            Object.assign(blocker, { _erased: true, _through: true, _trigger: null, _pageIndex: -1 });
            live = captureWorld(c, true, undefined, undefined, [], true).live;
        }
    }
    const returnSite = at(113, 26, 39, { switches: [97, 522] });
    for (const [id, x, y] of startingPoints) {
        const transfer = regionalTransfer(returnSite.fixture, id, true, { x, y });
        await verifyWorker(returnSite.fixture, { x: 26, y: 39, field: true, transfer }, returnSite.view.live, result => {
            assert.equal(result.status, 'ready', 'return path to ' + id);
            assert.equal(result.entrance, 70);
        });
    }

    const message = { kind: 'routeDirections', name: 'Salt Caverns', directionsOnly: true,
        legs: [{ direction: 6, tiles: 5 }, { direction: 8, tiles: 3 }, { direction: 6, tiles: 1 }],
        boundary: 6, exit: 'Salt Caverns', useExit: true };
    assert.equal(formatSpeech(message), '5 east, 3 north, 2 east, take exit to Salt Caverns.');
    assert.equal(formatSpeech({ ...message, beaconOnly: true }), 'Move east to take exit to Salt Caverns.');

    const opening = at(19, 24, 68);
    const saltScene = { _wqaMapRestored: true };
    const guide = createSaltGuide(c).review(saltScene, opening.view.objects);
    assert.equal(guide.target.id, 6);
    assert.match(guide.text, /0 of 4 chests collected/);assert(!guide.text.includes('yellow'));
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
