'use strict';

const assert = require('node:assert/strict');
const { createFieldDiagnostics } = require('../src/world/field-diagnostics');

async function main() {
    const scene = { _wqaFieldReady: true };
    const player = { _vehicleType: 'walk', _moveSpeed: 4, _x: 0, _y: 0 };
    const root = { $gameMap: { _mapId: 199 }, $gamePlayer: player,
        Input: { keyMapper: { 16: 'shift', 39: 'right' }, _currentState: {} } };
    let now = 0;
    let ready = true;
    const tasks = [];
    const rows = [];
    const graphics = { app: { stage: scene }, frameCount: 30 };
    const host = { graphics, manager: { _scene: scene }, hasFocus: () => true, screenFading: () => false,
        schedule: task => tasks.push(task), now: () => now };
    const fs = { promises: { async lstat() { return { isFile: () => true, size: 0 }; },
        async writeFile(_path, line) { rows.push(JSON.parse(line)); } } };
    const nodeRequire = name => name === 'fs' ? fs : require(name);
    const diagnostic = createFieldDiagnostics(root, host, nodeRequire, { pid: 42,
        mainModule: { filename: 'fixture/game/package.nw/index.html' } }, () => ready);
    const flush = async () => { while (tasks.length) await tasks.shift()(); };
    const move = (frames, ms, { native = false, dash = false } = {}) => {
        root.Input._currentState.shift = native;
        player._dashing = dash;
        player._x++;
        diagnostic.dashStarted(scene);
        graphics.frameCount += frames - 1;
        now += ms;
        diagnostic.dashLanded(scene);
    };

    root.$gameMap._mapId = 200;
    diagnostic.dashReady(scene);
    assert.equal(tasks.length, 0);
    root.$gameMap._mapId = 199;
    diagnostic.dashReady(scene);
    await flush();
    assert.equal(rows[0].action, 'dashTraceReady');
    assert.equal(rows[0].pid, 42);

    diagnostic.dashKey(scene, { code: 'ArrowRight', keyCode: 39, shiftKey: false }, true);
    move(16, 250);
    await flush();
    assert.deepEqual([rows[1].domShift, rows[1].nativeShift, rows[1].dashing, rows[1].frames, rows[1].ms],
        [false, false, false, 16, 250]);

    now += 250;
    diagnostic.dashKey(scene, { code: 'ArrowRight', keyCode: 39, shiftKey: true }, true);
    move(16, 251);
    await flush();
    assert.deepEqual([rows[2].domShift, rows[2].nativeShift, rows[2].dashing, rows[2].frames],
        [true, false, false, 16]);
    assert.equal(rows[2].shiftKey, undefined);
    assert.equal(rows[2].directionKey.direction, 'right');

    now += 250;
    diagnostic.dashKey(scene, { code: 'ShiftRight', keyCode: 16, shiftKey: true }, true);
    move(8, 117, { native: true, dash: true });
    await flush();
    assert.deepEqual([rows[3].shiftKey.side, rows[3].domShift, rows[3].nativeShift, rows[3].dashing, rows[3].frames],
        ['right', true, true, true, 8]);
    now += 250;
    move(8, 125, { native: true, dash: true });
    await flush();
    assert.equal(rows.length, 4, 'steady steps are sampled at a bounded rate');

    ready = false;
    diagnostic.dashKey(scene, { code: 'ShiftRight', keyCode: 16, shiftKey: false }, false);
    now += 2500;
    move(8, 120, { native: true, dash: true });
    await flush();
    assert.equal(rows.length, 4, 'the native scene gate closes observation');
    console.log('Verified bounded dash diagnostics, missing native Shift, completed-step timing and native phase retirement.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
