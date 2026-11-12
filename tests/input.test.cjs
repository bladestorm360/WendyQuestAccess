'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'input-producers.py'), process.argv[2]], { encoding: 'utf8', timeout: 6000, maxBuffer: 32000 }));

const trace = [];
const pad = { index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
const c = vm.createContext({
    a14_0x1f92c6() { throw Error('Unresolved input property'); },
    a18_0x52f0af() { throw Error('Unresolved scene property'); },
    Input: { deviceType: { GAMEPAD: 2 }, _updateDirection() {}, _shouldPreventDefault: () => false,
        SetLastInputDeviceType: device => trace.push(device) },
    Utils: { isNwjs: () => true }, location: { search: '' }, ConfigManager: { developerMode: true },
    nw: { App: { argv: [] }, Window: { get: () => ({ showDevTools: () => trace.push('devtools') }) } },
    Graphics: {}, navigator: { getGamepads: () => [pad, null] },
    SceneManager: { isGameActive: () => true, onBeforeSceneStart: () => trace.push('before start'),
        onSceneStart: () => trace.push('scene stage'), _smoothDeltaTime: 1 / 60 },
    Time: { Update: () => trace.push('time') }, CoroutineManager: { UpdateCoroutines: () => trace.push('coroutines') }
});
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

const { Input, SceneManager } = c;
const settingsKey = { keyCode: 119, preventDefault: () => trace.push('prevented') };
Input.clear();
for (const [owner, native] of [[c.Graphics, c.Graphics._onKeyDown], [SceneManager, SceneManager.onKeyDown],
    [Input, Input._onKeyDown]]) {
    native.call(owner, settingsKey);
}
assert.deepEqual(trace, [], 'retail F8 has no native effect even with game developer mode enabled');
assert.deepEqual(Object.keys(Input._currentState), []);
c.nw.App.argv.push('test');
SceneManager.onKeyDown(settingsKey);
assert.equal(trace.pop(), 'devtools', 'explicit engine test mode retains native F8');
c.nw.App.argv.length = 0;

SceneManager._scene = { _started: true, isStarted: () => true, update: () => trace.push('scene update') };
SceneManager.updateScene();
assert.deepEqual(trace.splice(0), ['time', 'scene update', 'coroutines']);
SceneManager._scene._wqaSettingsActive = true;
SceneManager.updateScene();
assert.deepEqual(trace.splice(0), [], 'settings hold an already-started scene and its clock/coroutines');
SceneManager._nextScene = {};
SceneManager.updateScene();
assert.deepEqual(trace.splice(0), ['time', 'scene update', 'coroutines'], 'settings cannot block a native scene change');
SceneManager._nextScene = null;
SceneManager._scene = { _wqaSettingsActive: true, isStarted: () => false, isReady: () => true,
    start: () => trace.push('scene start') };
SceneManager.updateScene();
assert.deepEqual(trace.splice(0), ['before start', 'scene start', 'scene stage']);
SceneManager._scene._wqaSettingsActive = false;

function press(index, pressed) {
    pad.buttons[index].pressed = pressed;
    Input.update();
}

Input.update(); // Establish the native first-poll baseline for the connected pad.
trace.length = 0;
press(8, true);
assert.equal(Input._gamepadStates[0][8], true, 'View is present in normalized physical state');
assert.deepEqual(trace, [], 'View is unmapped and cannot be recovered from action or device state');
press(9, true);
assert.equal(Input._latestButton, 'menu');
press(3, true);
assert.equal(Input._currentState.menu, true);
press(9, false);
assert.equal(Input._currentState.menu, false, 'Start and Y are conflated by the native action map');
assert.equal(Input._gamepadStates[0][3], true);

pad.axes[1] = -0.6;
Input.update();
assert.equal(Input._gamepadStates[0][12], true, 'left stick up shares normalized D-pad up');
assert.equal(Input._currentState.up, true);
pad.axes[1] = 0;
press(12, true);
assert.equal(Input._currentState.up, true);
press(12, false);
assert.equal(Input._currentState.up, false);
press(0, true);
assert.equal(Input._latestButton, 'ok');
pad.connected = false;
Input.update();
assert.equal(Input._gamepadStates[0][0], true, 'native polling skips disconnected pads without retiring their state');

pad.connected = true;
SceneManager._scene._wqaSettingsActive = true;
Input.update();
assert.equal(Input._currentState.ok, false, 'a pad press held on entry is released from the game action');
assert.equal(Input._gamepadStates[0][0], false);
SceneManager._scene._wqaSettingsActive = false;
Input.update();
assert.equal(Input._currentState.ok, false, 'a held press cannot be replayed into the game');
press(0, false);
press(0, true);
assert.equal(Input._latestButton, 'ok', 'the next physical press is native after release');

press(0, false);
SceneManager._scene._wqaSettingsActive = true;
pad.buttons[0].pressed = true;
Input._pollGamepads(); // The close sample runs even if no regular frame polled during the modal.
SceneManager._scene._wqaSettingsActive = false;
Input.update();
assert.equal(Input._currentState.ok, false, 'rapid settings close still captures the current physical press');
console.log('Verified retail/test F8, modal scene hold, controller action boundaries, and release-before-handback.');
