'use strict';

const assert = require('node:assert/strict');
const { captureWorld, includeSavedBookmarks } = require('../src/world/snapshot');
const { readBookmarks, changeBookmarks, bookmarkName } = require('../src/world/bookmark-records');
const { findReachable, solveRoute } = require('../src/world/routes.cjs');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { browse, createDestinationBrowser } = require('../src/world/destinations');

function walkingPair(fixture, live) {
    const { map, gameMap, player, geometry } = fixture;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            for (const direction of DIRECTIONS) {
                if (!player.canPass(x, y, direction)) continue;
                const targetX = gameMap.roundXWithDirection(x, direction);
                const targetY = gameMap.roundYWithDirection(y, direction);
                const request = { x, y, targetX, targetY, field: true, autowalk: true, beacon: true };
                if (solveRoute(geometry, live, request).distance === 1) return request;
            }
        }
    }
    throw Error('Salt Caverns has no ordinary one-tile approach for the bookmark fixture');
}

async function verifyBookmarks(c, load, verifyRoute, verifyWorker) {
    const salt = load(19);
    salt.player.setPosition(26, 12);
    const request = walkingPair(salt, captureWorld(c).live);
    const { x, y, targetX, targetY } = request;
    salt.player.setPosition(x, y);
    const point = { kind: 'point', map: 19, mode: 'walk', x: targetX, y: targetY };
    const entity = { kind: 'entity', map: 19, mode: 'walk', event: 114, category: 'objects' };
    assert.deepEqual(readBookmarks(undefined).entries, []);
    assert.equal(bookmarkName('  Way back  '), 'Way back');
    assert.equal(bookmarkName('one\ntwo'), '');
    const first = changeBookmarks(undefined, { type: 'add', place: point });
    const second = changeBookmarks(first, { type: 'add', place: entity });
    assert.equal(first.entries.length, 1, 'editing a transaction copy preserves the earlier model');
    const renamed = changeBookmarks(second, { type: 'rename', entry: first.entries[0], name: 'Safe approach' });
    assert.throws(() => changeBookmarks(renamed, { type: 'remove', entry: first.entries[0] }), error => {
        assert.match(error.message, /changed in another session/);
        assert.deepEqual(error.current, renamed);
        return true;
    });
    const removed = changeBookmarks(renamed, { type: 'remove', entry: renamed.entries[1] });
    assert.equal(changeBookmarks(removed, { type: 'add', place: entity }).entries[1].id, 3, 'deleted IDs stay retired');
    assert.equal(readBookmarks({ ...second, build: 'different' }), null);
    assert.equal(readBookmarks({ ...second, entries: [first.entries[0], first.entries[0]] }), null);
    assert.throws(() => changeBookmarks({ ...second, version: 2 }, { type: 'add', place: point }), /could not be read/);
    let limit = second;
    while (limit.entries.length < 64) limit = changeBookmarks(limit, { type: 'add', place: point });
    assert.throws(() => changeBookmarks(limit, { type: 'add', place: point }), /list is full/);

    const other = changeBookmarks(renamed, { type: 'add', place: { ...point, map: 13 } });
    const view = () => captureWorld(c, true, undefined, undefined, other.entries);
    const snapshot = view();
    const targets = snapshot.objects.filter(item => item.category === 'bookmarks');
    assert.deepEqual(targets.map(item => item.name), ['Safe approach', 'Bookmark 2']);
    assert.deepEqual([targets[0].x, targets[0].y], [targetX, targetY]);
    assert(targets[0].point);
    assert.equal(targets[1].event, 114);
    const event = salt.gameMap._events[114];
    event._erased = true;
    assert.deepEqual(view().objects.filter(item => item.category === 'bookmarks').map(item => item.name), ['Safe approach']);
    const everyMode = changeBookmarks(other, { type: 'add', place: { ...point, mode: 'airship' } });
    const observed = view();
    const currentPoint = observed.objects.find(item => item.id === 'bookmark-1');
    observed.eligibleObjects = observed.objects;
    observed.objects = observed.objects.filter(item => item !== currentPoint);
    observed.objects = includeSavedBookmarks(observed, everyMode.entries, () => false);
    const listed = observed.objects.filter(item => item.category === 'bookmarks');
    assert.deepEqual(listed.map(item => item.id), ['bookmark-1', 'bookmark-2', 'bookmark-3', 'bookmark-4']);
    assert(listed[0].outOfReach && listed[0].point);
    assert.deepEqual(listed.slice(1).map(item => [item.saved.kind, item.saved.map, item.saved.mode]),
        [['entity', 19, 'walk'], ['point', 13, 'walk'], ['point', 19, 'airship']]);
    const browser = createDestinationBrowser();
    assert.equal(browse(browser, observed, ['previousCategory']).target.id, 'bookmark-1');
    for (const id of ['bookmark-2', 'bookmark-3', 'bookmark-4', 'bookmark-1'])
        assert.equal(browse(browser, observed, ['nextDestination']).target.id, id);
    event._erased = false;
    const availability = { x, y, candidates: [request] };
    assert.equal(findReachable(salt.geometry, snapshot.live, availability).available[0], 1);
    const result = solveRoute(salt.geometry, snapshot.live, request);
    assert.equal(result.arrival.facing, null);
    verifyRoute(salt, request, result);
    await verifyWorker(salt, request, snapshot.live, output => {
        assert.equal(output.autowalkStop, undefined);
        assert.equal(output.course.length, output.distance);
        verifyRoute(salt, request, output);
    });
    const blocked = { ...snapshot.live, events: [...snapshot.live.events,
        { id: 512, x: targetX, y: targetY, normal: true, through: false, trigger: 0, action: true }] };
    assert.equal(findReachable(salt.geometry, blocked, availability).available[0], 0);
    assert.equal(solveRoute(salt.geometry, blocked, request).status, 'unreachable');

    const flight = load(113);
    flight.player._vehicleType = 'airship';
    flight.player._through = true;
    flight.player.setPosition(43, 28);
    Object.assign(flight.gameMap.airship(), { _mapId: 113, _x: 43, _y: 28, _driving: true, _altitude: 48 });
    const saved = changeBookmarks(undefined, { type: 'add', place: { kind: 'point', map: 113, mode: 'airship', x: 44, y: 28 } });
    const air = captureWorld(c, true, undefined, undefined, saved.entries);
    assert(air.objects.some(item => item.category === 'bookmarks' && item.x === 44));
    const above = { x: 43, y: 28, targetX: 44, targetY: 28, field: true };
    const noLandings = { ...flight.geometry, hasLandings: false };
    assert.equal(findReachable(noLandings, air.live, { ...above, candidates: [above, { nearestLanding: true }] }).available[0], 1);
    assert.equal(solveRoute(noLandings, air.live, above).land, undefined);
    assert.equal(air.mode, 'airship');
    console.log('Verified bookmark records, current event resolution, exact tile routes, changed collision and airship points.');
}

module.exports = { verifyBookmarks };
