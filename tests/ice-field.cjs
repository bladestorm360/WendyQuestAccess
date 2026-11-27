'use strict';
const assert = require('node:assert/strict');
const { bakeMap } = require('../src/world/geometry.cjs');
const { solveRoute } = require('../src/world/routes.cjs');
const { routeThroughTerrain } = require('../src/world/terrain-controls.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

module.exports = async function verifyIceField(fixture, mapData, tilesets) {
    const data = mapData(16), f = fixture(data), { c, frame } = f;
    const map = c.$gameMap, player = c.$gamePlayer;
    c.$dataTilesets = tilesets;
    Object.assign(map, { _mapId: 16, _tilesetId: data.tilesetId, _events: [], _tileEvents: [],
        _vehicles: [], _nameDisplay: false });
    for (const [id, index] of [[22, 0], [27, 0], [51, 1]]) {
        const entry = data.events[id], page = entry.pages[index];
        const event = Object.assign(f.event(id, index), { _x: entry.x, _y: entry.y, _pageIndex: index,
            _trigger: page.trigger, _priorityType: page.priorityType, _through: page.through,
            _characterName: page.image.characterName });
        if (id === 51) event.blockerProperties = { x1: -1, y1: -1, x2: 1, y2: 0 };
        map._events[id] = event;
        map.fixtureEvents.push(event);
    }
    player._vehicleType = 'walk';
    player.setPosition(22, 9);
    player.reserveTransfer(16, 22, 9, 2, 0);
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
    for (let n = 0; n < 12 && f.packets.at(-1)?.category !== 'Enemies'; n++) key('l', true);
    assert.equal(f.packets.at(-1)?.category, 'Enemies');
    const geometry = bakeMap(data, tilesets[data.tilesetId].flags);
    function directions(expected) {
        key('p');
        const job = f.routePackets.at(-1);
        assert.equal(job.request.event, 22);
        assert.equal(solveRoute(geometry, job.live, job.request).status, 'unreachable');
        const result = routeThroughTerrain(geometry, job.live, job.request, undefined, () => false);
        assert.equal(result.status, expected);
        f.routeReply({ epoch: job.epoch, sequence: job.sequence, map: job.map,
            result: { ...result, legs: result.legs.slice(0, 8), more: result.legs.length > 8 } });
        frame();
        return formatSpeech(f.packets.at(-1));
    }
    const first = directions('interrupted');
    assert.match(first, /^\d+ (?:north|south|east|west)/);
    if(!f.packets.at(-1).more)assert.match(first,/scene trigger/i);
    assert.doesNotMatch(first, /unreachable|Mech Double|heal/i);
    map._events[27]._erased = true;
    player.setPosition(25, 16);
    const second = directions('iceRoute');
    if(!f.packets.at(-1).more)assert.match(second,/ice block/i);
    else assert.doesNotMatch(second,/action button/,'an early chunk cannot announce the distant melt action');
    assert(scene._wqaIceRoute, 'native melt handback retains the selected enemy destination');
    console.log('Verified spoken event-before-ice directions and retained original destination without story spoilers.');
};
