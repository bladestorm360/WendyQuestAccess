"use strict";
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { createField } = require('../src/world/field');
const { formatSpeech } = require('../src/services/speech-text.cjs');

async function verifyBreakfastQuestField(c, load, verifyWorker, common, infos) {
    const saved = { scene: c.SceneManager._scene, app: c.Graphics.app, screen: c.$gameScreen, message: c.$gameMessage,
        listen: c.addEventListener, members: c.$gameParty.members, inBattle: c.$gameParty.inBattle,
        nav: c.$gameParty.getNav, common: c.$dataCommonEvents, infos: c.$dataMapInfos };
    let peak = 0, episodePeak = 0;
    try {
        c.$dataCommonEvents = common;c.$dataMapInfos = infos;c.addEventListener = () => {};
        c.$gameScreen = { _brightness: 255 };c.$gameMessage = { isBusy: () => false };
        c.$gameParty.members = () => [4];c.$gameParty.inBattle = () => false;
        for (const mode of ['stationary', 'moving', 'changedExit', 'unavailable', 'retired', 'changedQuest', 'superseded']) {
            c.$gameParty.getNav = () => 'quest27';
            const f = load(85);f.player.setPosition(1, 16);f.gameMap.inactiveTime = 0;
            const scene = { _wqaFieldReady: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
            const renderer = new EventEmitter();c.SceneManager._scene = scene;c.Graphics.app = { stage: scene, renderer };
            const records = [], valid = [], packets = [];
            const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage(packet, buffers) {
                packets.push(structuredClone(packet, { transfer: buffers || [] }));
            } });
            const field = createField(c, { graphics: c.Graphics, manager: c.SceneManager, hasFocus: () => true,
                screenFading: () => false, navigationPreferences: () => ({ autowalk: true }),
                makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker: () => worker },
                { open(record, current) { records.push(record);valid.push(current);return records.length; }, close() {} });
            let submitCost = 0;
            const ask = action => { const at = performance.now();assert(field.command(action));renderer.emit('postrender');
                const elapsed = performance.now() - at;peak = Math.max(peak, elapsed);
                if (packets.length) submitCost = elapsed; };
            for (let i = 0; i < 12 && !packets.length; i++) ask('nextCategory');
            assert.equal(packets.length, 1, 'only the regional quest selection asks for a route');
            const packet = packets.shift();assert.equal(packet.request.transfer.map, 86);
            assert.equal(packet.request.beacon, undefined);
            let result;await verifyWorker(f, packet.request, packet.live, reply => result = reply);
            assert(Number.isInteger(result.entrance), JSON.stringify(result));
            const exit = f.gameMap._events[result.entrance];
            if (mode === 'moving') { f.player.setPosition(2, 16);f.player._realX = 1.5; }
            const before = records.length;
            if (mode === 'changedExit') exit._erased = true;
            if (mode === 'unavailable') result = { status: 'unavailable' };
            if (mode === 'retired') field.leave(scene);
            if (mode === 'changedQuest') c.$gameParty.getNav = () => 'quest28';
            if (mode === 'superseded') ask('currentDestination');
            const at = performance.now();worker.emit('message', { ...packet, result });renderer.emit('postrender');
            const responseCost = performance.now() - at;peak = Math.max(peak, responseCost);
            episodePeak = Math.max(episodePeak, submitCost + responseCost);
            if (mode === 'superseded') {
                assert.equal(records.length, before, 'old browse cannot announce over a replacement');
                assert.equal(packets.length, 1, 'the queued replacement must resume after the stale reply');
                const replacement = packets.shift();worker.emit('message', { ...replacement, result });renderer.emit('postrender');
                assert.match(formatSpeech(records.at(-1)), /^Breakfast Stone Island via /);
                assert.equal(records.at(-1).category, '', 'repeating a destination does not repeat its category');
                field.leave(scene);continue;
            }
            if (mode === 'retired' || mode === 'changedQuest') {
                assert.equal(records.length, before, 'no stale regional announcement');field.leave(scene);continue;
            }
            if (mode === 'changedExit' || mode === 'unavailable') {
                assert.equal(formatSpeech(records.at(-1)), 'Quests, Breakfast Stone Island, on another map');
                field.leave(scene);continue;
            }
            const record = records.at(-1), speech = formatSpeech(record);
            assert.equal(record.kind, 'fieldTarget');assert.equal(record.category, 'Quests');
            assert.match(speech, /^Quests, Breakfast Stone Island via .+/);
            assert.equal(record.dx, exit._x - f.player._x);assert.equal(record.dy, exit._y - f.player._y);
            assert(Number.isInteger(record.dx) && Number.isInteger(record.dy));
            assert.match(speech, /(?:west|east|north|south)/);
            assert(!records.some(row => row.kind === 'routeDirections' || /Walking/.test(row.name || '')),
                'selection never starts autowalk, speaks a route or starts a beacon');
            assert(valid.at(-1)());c.$gameParty.getNav = () => 'quest28';assert.equal(valid.at(-1)(), false);
            field.leave(scene);
        }
        console.log('Verified Bacon Beach regional Quests category, named next-exit bearing, movement while pending, quest retirement and no browse autowalk.');
        console.log('Throttled regional browse callback peak', peak.toFixed(2), 'ms; combined submission/response peak', episodePeak.toFixed(2), 'ms.');
    } finally {
        c.SceneManager._scene = saved.scene;c.Graphics.app = saved.app;c.$gameScreen = saved.screen;c.$gameMessage = saved.message;
        c.addEventListener = saved.listen;c.$gameParty.members = saved.members;c.$gameParty.inBattle = saved.inBattle;
        c.$gameParty.getNav = saved.nav;c.$dataCommonEvents = saved.common;c.$dataMapInfos = saved.infos;
    }
}
module.exports = { verifyBreakfastQuestField };
