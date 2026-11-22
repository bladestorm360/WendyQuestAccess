'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createField } = require('../src/world/field');

async function verifyCleanupField(c, load, verifyWorker) {
    const keys = ['addEventListener', '$gameScreen', '$gameMessage', 'WendyQuestAccessAutowalkInput',
        'WendyQuestAccessFieldMove', 'WendyQuestAccessFieldChanged', 'WendyQuestAccessFieldEvent', 'WendyQuestAccessSceneLeaving'];
    const saved = Object.fromEntries(keys.map(key => [key, c[key]]));
    const previousScene = c.SceneManager._scene, app = c.Graphics.app;
    const switchState = { value: c.$gameSwitches.value, setValue: c.$gameSwitches.setValue };
    for (const [id, cancel] of [[94, false], [94, true], [16, false]]) {
        const run = load(id, { switches: id === 94 ? [405] : [] });
        let start = id === 94 ? [24, 13] : [25, 17];
        let finish = id === 94 ? [18, 6] : [25, 15];
        if (id === 16) {
            const event = run.gameMap._events[50];
            finish = [event._x, event._y];
            const direction = [2, 4, 6, 8].find(heading => {
                start = [run.gameMap.roundXWithDirection(event._x, 10 - heading),
                    run.gameMap.roundYWithDirection(event._y, 10 - heading)];
                run.player.setPosition(...start);
                return run.player.canPass(...start, heading);
            });
            assert(direction, 'the authored floor trigger has a native walking approach');
        }
        run.player.setPosition(...start); run.gameMap.inactiveTime = 0;
        const beforeValue = c.$gameSwitches.value, changes = new Map();
        c.$gameSwitches.value = key => changes.has(key) ? changes.get(key) : beforeValue(key);
        c.$gameSwitches.setValue = (key, value) => { changes.set(key, value); run.gameMap._needsRefresh = true; };
        run.player._followers = { areGathering: () => false, updateMove() {} };
        const scene = { _wqaFieldReady: true, _wqaMapRestored: true, _mapLoaded: true, _started: true,
            _prevCanMove: true, srcWendy: {}, srcStones: {}, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
        const renderer = new EventEmitter(), packets = [], records = [], cleanups = [];
        const bookmark = { id: 'cleanup', revision: 1, kind: 'point', map: id, mode: 'walk',
            name: 'North approach', x: finish[0], y: finish[1] };
        const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: p => packets.push(p) });
        c.SceneManager._scene = scene; c.Graphics.app = { stage: scene, renderer };
        c.addEventListener = () => {}; c.$gameScreen = { _brightness: 255 }; c.$gameMessage = { isBusy: () => false };
        const field = createField(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
            screenFading: () => false, navigationPreferences: () => ({ autowalk: true }), bookmarks: () => [bookmark],
            makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker }, {
            open(record) { records.push(record); return records.length; }, close() {},
            arrive(record) { records.push(record); return records.length; }, endArrival() {}
        });
        c.WendyQuestAccessAutowalkInput = field.autowalk.input;
        c.WendyQuestAccessFieldMove = field.autowalk.moved;
        c.WendyQuestAccessFieldChanged = field.changed;
        c.WendyQuestAccessFieldEvent = current => { field.autowalk.stop(current); field.changed(current); };
        c.WendyQuestAccessSceneLeaving = field.leave;
        const interpreter = run.gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
            loadImages() {}, _depth: 0, _list: null, _index: 0, _branch: {}, _waitMode: '', _waitCount: 0, _childInterpreter: null });
        for (const event of run.gameMap.events()) event.setupPage = () => {}; // Native erasure; sprite setup is outside this fixture.
        const frame = () => renderer.emit('postrender');
        let handled = 0;
        async function reply() {
            const packet = packets.at(-1); handled = packets.length;
            await verifyWorker(run, packet.request, packet.live, result => worker.emit('message', {
                epoch: packet.epoch, sequence: packet.sequence, map: packet.map, result }));
            frame();
        }
        scene._wqaSettingsActive = true; assert(field.selectBookmark(scene, bookmark)); scene._wqaSettingsActive = false;
        assert(field.command('directions')); frame(); await reply();
        for (let count = 0; count < 100; count++) {
            run.player.moveByInput(); run.player._realX = run.player._x; run.player._realY = run.player._y;
            field.observeReady(scene); // Native readiness can publish once before floor acceptance.
            run.player.checkEventTriggerHere([1, 2]);
            const event = run.gameMap.events().find(actor => actor.isStarting());
            if (event) {
                assert((id === 94 ? [50, 52, 53, 54, 55, 57] : [50]).includes(event._eventId));
                cleanups.push(event._eventId);
                assert.deepEqual(event.list().map(row => row.code), id === 94 ? [214, 0] : [121, 0]);
                assert(run.gameMap.setupStartingMapEvent());
                assert.equal(scene._wqaFieldReady, false);
                if (cancel) field.cancelAutowalk(scene);
                const command = interpreter._list[0];
                assert(c.Game_Interpreter.prototype['command' + command.code].call(interpreter, command.parameters));
                if (id === 94) assert(event._erased);
                else assert.equal(c.$gameSwitches.value(543), true);
                interpreter._list = null; run.gameMap._needsRefresh = false;
                scene._wqaFieldReady = true; field.observeReady(scene); frame();
                if (cancel) { assert(!field.autowalk.active(scene)); assert.equal(packets.length, handled); break; }
            }
            if (packets.length > handled) await reply();
            frame();
            if (records.at(-1)?.name === 'Arrived.') break;
        }
        assert(cleanups.includes(id === 94 ? 55 : 50), JSON.stringify({pos:[run.player._x,run.player._y], records, cleanups}));
        if (!cancel) {
            if (id === 94) { assert(cleanups.includes(52)); assert(cleanups.includes(54)); }
            assert.deepEqual([run.player._x, run.player._y], finish);
            assert.equal(records.filter(row => row.name === 'Walking.').length, 1);
            assert.equal(records.filter(row => row.name === 'Arrived.').length, 1);
            assert(!records.some(row => /cleanup|Route changed|Autowalk paused/i.test(row.name || '')));
        }
    }
    Object.assign(c.$gameSwitches, switchState);
    Object.assign(c, saved); c.SceneManager._scene = previousScene; c.Graphics.app = app;
    console.log('Verified native Burgenburg cleanup erasure and Crispy Ruins flag-only trigger, silent resumed worker routes, retained destination, single arrival and cancellation.');
}
module.exports = { verifyCleanupField };