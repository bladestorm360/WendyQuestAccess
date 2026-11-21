'use strict';
const assert = require('node:assert/strict');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');
async function main() {
    const data = mapData(197);
    const f = fixture(data);
    const { c, name, bitmapCallbacks, idleCallbacks, frame, speech, packets } = f;
    c.$gamePlayer.reserveTransfer(197, 5, 5, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    bitmapCallbacks.shift()();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    idleCallbacks.shift()();
    c.SceneManager.updateScene();
    frame();
    packets.length = 0;
    c.$gameMap._mapId = 197;
    Object.assign(c.$gameMap._interpreter, { _mapId: 197, _eventId: 18, _list: data.events[18].pages[0].list, _index: 128 });
    scene._wqaEntranceFallback = true;
    name.open();
    bitmapCallbacks.shift()();
    c.SceneManager.updateScene();
    assert.equal(speech().length, 0, 'native title must render first');
    frame();
    assert.deepEqual(speech(), ['Entering Shrine of the First Wendy.']);
    assert.equal(scene._prevCanMove, false, 'the title does not grant walking');
    assert.equal(scene._wqaFieldReady, false, 'the title does not grant field processing');
    name.close();
    c.SceneManager.updateScene(); frame();
    for (const index of [122, 135]) {
        c.$gameMap._interpreter._index = index;
        name.open(); bitmapCallbacks.shift()();
        c.SceneManager.updateScene(); frame();
        assert.equal(speech().length, 1, 'other cutscene steps do not bypass native movement ownership');
    }
    console.log('Verified rendered shrine title at its native cutscene wait with field controls closed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
