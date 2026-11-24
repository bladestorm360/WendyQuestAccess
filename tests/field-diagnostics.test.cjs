/* Source-free diagnostic fixture; optional argument is a locally transformed native managers file. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { createFieldDiagnostics } = require('../src/world/field-diagnostics');

async function main() {
    const tasks = [], writes = [];
    let text = '', now = 0;
    const scene = { _wqaMapRestored: true, _started: true, _active: true, _wqaFieldReady: true,
        _prevCanMove: true, _wqaAutowalkActive: true };
    const player = { _x: 10, _y: 14, _realX: 10, _realY: 14, _direction: 8 };
    const events = [];
    for (let id = 1; id < 32; id++) events[id] = { _trigger: 2, _x: id, _y: 1, _realX: id, _realY: 1,
        _direction: 4, _moveRouteIndex: 3, _waitCount: 10, _stopCount: 2, _pageIndex: 0 };
    const root = { $gameMap: { _mapId: 196, _events: events,
        _interpreter: { _eventId: 21, _index: 4, _waitMode: 'message', _waitCount: 0,
            _list: Array.from({ length: 5 }, () => ({ code: 101, parameters: ['not copied'] })) } },
        $gamePlayer: player, $gameMessage: { isBusy: () => true } };
    const host = { manager: { _scene: scene }, graphics: { app: { stage: scene }, frameCount: 100,
        _wqaFootstepsEnabled: false, _wqaCaveTimingEnabled: true },
        now: () => now, schedule: task => tasks.push(task), hasFocus: () => true, screenFading: () => false };
    const nodeRequire = name => name === 'fs' ? { promises: {
        lstat: async () => ({ isFile: () => true, size: Buffer.byteLength(text) }),
        writeFile: async (_file, line, options) => {
            writes.push(JSON.parse(line)); text = options.flag === 'w' ? line : text + line;
        }
    } } : require(name);
    const diag = createFieldDiagnostics(root, host, nodeRequire, { mainModule: { filename: 'C:/game/package.nw/index.html' } });
    const flush = async () => { while (tasks.length) await tasks.shift()(); };
    diag.capture(scene);
    assert.equal(tasks.length, 0, 'actual steps copy scalars without scheduling disk work');
    player._x = 11; events[1]._x = 99; // Copy ownership survives subsequent native mutation.
    const error = new Error('diagnostic failure');
    diag.fault('catchException', error);
    assert.equal(writes.length, 0, 'fatal observation never performs synchronous I/O');
    for (let i = 0; i < 50; i++) diag.fault('onError', new Error(`repeat ${i}`));
    assert.equal(tasks.length, 1, 'only the existing serialized writer is scheduled');
    await flush();
    assert.equal(writes.length, 4, 'repeating error receipts have a finite four-record budget');
    assert.equal(writes[0].state.player[0], 10);
    assert.equal(writes[0].state.guards[0][1], 1);
    assert.equal(writes[0].state.guards.length, 24);
    assert.equal(writes[0].state.footsteps, false);
    assert.deepEqual(writes[0].state.interpreters, [[21, 4, 'message', 0, 101]]);
    assert(!text.includes('not copied'));
    assert.equal(writes[0].error.message, 'diagnostic failure');
    assert(writes[0].error.stack.includes('field-diagnostics.test.cjs'));

    // Each negative has a fresh owner/budget, so a passed cap cannot hide admission bugs.
    for (const map of [13, 113, 197, 206]) {
        root.$gameMap._mapId = map;
        const other = createFieldDiagnostics(root, host, nodeRequire, { mainModule: { filename: 'C:/game/package.nw/index.html' } });
        other.capture(scene); other.fault('onError', error); other.controlLost(scene);
        assert.equal(tasks.length, 0, `no added diagnostics outside cave ${map}`);
    }
    for (const map of [196, 198, 199, 200, 201, 202]) {
        root.$gameMap._mapId = map;
        const cave = createFieldDiagnostics(root, host, nodeRequire, { mainModule: { filename: 'C:/game/package.nw/index.html' } });
        cave.capture(scene);
        host.manager._nextScene = {};
        cave.fault('onError', error); cave.controlLost(scene);
        assert.equal(tasks.length, 0, 'transition entry stays silent');
        delete host.manager._nextScene;
        scene._wqaPreloads = new Set([{}]);
        cave.fault('onError', error); cave.capture(scene);
        assert.equal(tasks.length, 0, 'resource work stays silent');
        delete scene._wqaPreloads;
        cave.controlLost(scene); cave.fault('onError', error);
        await flush();
        assert.equal(writes.at(-1).state.map, map);
        const oldCount = writes.length;
        for (let i = 0; i < 1000; i++) cave.controlLost(scene);
        await flush();
        assert.equal(writes.length, oldCount, 'one receipt per control-loss episode');
    }
    root.$gameMap._mapId = 196;
    const bounded = createFieldDiagnostics(root, host, nodeRequire, { mainModule: { filename: 'C:/game/package.nw/index.html' } });
    bounded.capture(scene);
    bounded.fault('onError', { message: '😀'.repeat(10000), stack: '😀'.repeat(10000) });
    await flush();
    assert(Buffer.byteLength(text) <= 32768);
    const before = writes.length;
    bounded.capture(scene); host.manager._nextScene = {};
    bounded.controlLost(scene); await flush();
    assert.equal(writes.length, before);
    delete host.manager._nextScene;
    const start = performance.now();
    for (let i = 0; i < 10000; i++) bounded.capture(scene);
    const elapsed = performance.now() - start;
    console.log(`Cave diagnostics: scope/copy/error/busy/phase/byte bounds pass; 10000 max-24-guard snapshots ${elapsed.toFixed(2)} ms (fixture only).`);

    if (process.argv[2]) {
        const source = fs.readFileSync(process.argv[2], 'utf8');
        for (const name of ['catchException', 'onError']) {
            const native = source.match(new RegExp(`SceneManager\\.${name} = function\\([^]*?\\n};`));
            assert(native, `qualified native ${name}`);
            let stopped = 0, printed = 0;
            const receipts = [], logged = [];
            const context = { SceneManager: { stop: () => stopped++ }, Error,
                $gameTemp: { isPlaytest: () => false }, console: { error: value => logged.push(value) },
                Graphics: { printError: () => printed++ }, AudioManager: { stopAll() {} },
                WendyQuestAccessNativeError: (producer, value) => receipts.push([producer, value]) };
            vm.runInNewContext(native[0], context);
            context.SceneManager[name](error);
            assert.equal(receipts.length, 1);
            assert.equal(receipts[0][0], name);
            assert.equal(receipts[0][1], error);
            assert.equal(stopped, name === 'onError' ? 1 : 0, 'preserve retail console-only early return');
            assert.equal(printed, name === 'onError' ? 1 : 0);
            assert(logged.length >= 1);
            context.WendyQuestAccessNativeError = () => { throw new Error('observer failed'); };
            context.SceneManager[name](error);
            assert.equal(stopped, name === 'onError' ? 2 : 0, 'observer failure preserves native behavior');
        }
        console.log('Exact transformed native catchException/onError handlers preserve return, logging, stop and observer-failure handback.');
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
