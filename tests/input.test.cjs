'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createController } = require('../src/settings/controller');
const { normalizeController, bindingAllowed } = require('../src/settings/controller-bindings');
const { normalizeNavigation, navigationGesture, navigationAction, nativeNavigationConflict } =
    require('../src/settings/navigation-keys');

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

const front = { kind: 'front' };
const modal = { kind: 'settings', group: 'controller', capture: null };
const dialogue = { kind: 'dialogue' };
let context = front;
let bindings = normalizeController();
const deferred = [];
const commands = [];
const nativeButton = button => Input.gamepadMapper[button];
const controller = createController({ context: () => context, bindings: () => bindings, nativeButton,
    schedule: work => deferred.push(work), dispatch: (owner, action, family, mask) => {
        commands.push({ action, family, mask });
        if (action === 'settings') {
            context = modal;
            SceneManager._scene._wqaSettingsActive = true;
        } else if (action === 'recovery') {
            bindings = { ...bindings, enabled: !bindings.enabled };
            controller.reset();
        }
    } });
pad.id = 'Xbox fixture';
c.WendyQuestAccessPadSample = controller.sample;
SceneManager._scene._wqaControllerReady = true;
function poll(...pressed) {
    for (let index = 0; index < pad.buttons.length; index++) pad.buttons[index].pressed = pressed.includes(index);
    Input.update();
}
function flush() { while (deferred.length) deferred.shift()(); }

poll();
poll(9);
assert.equal(Input._currentState.menu, true, 'Start outside mode remains native');
poll();
poll(8, 9);
assert.equal(Input._currentState.menu, false, 'mode entry consumes simultaneous native presses');
assert.deepEqual(commands, [], 'no mod action runs inside the native poll');
flush();
assert.deepEqual(commands.splice(0), [{ action: 'modeEntered', family: 'xbox', mask: undefined }]);
poll(9);
flush();
assert.deepEqual(commands, [], 'Start requires a fresh press after releasing View');
poll();
poll(9);
flush();
assert.equal(commands.pop().action, 'settings');
assert.equal(Input._currentState.menu, false, 'opening settings did not trigger the native menu');
poll();
poll(13);
flush();
assert.equal(commands.pop().action, 'next');
assert.equal(Input._currentState.down, false);
poll(0);
flush();
assert.equal(commands.pop().action, 'confirm');
modal.capture = { action: 'mode' };
poll();
poll(6);
flush();
assert.deepEqual(commands, [], 'capture waits for release and ignores the original confirm');
poll();
flush();
assert.deepEqual(commands.pop(), { action: 'capture', family: 'xbox', mask: 1 << 6 });
modal.capture = null;

context = dialogue;
SceneManager._scene._wqaSettingsActive = false;
poll();
poll(8);
flush();
assert.equal(commands.pop().action, 'modeEntered');
poll();
poll(8);
flush();
assert.equal(commands.pop().action, 'modeLeft');
poll();
poll(8);
poll();
poll(0);
assert.equal(Input._currentState.ok, false);
flush();
assert.deepEqual(commands.splice(0).map(value => value.action), ['modeEntered', 'repeat']);
poll(0);
assert.equal(Input._currentState.ok, false, 'repeat keeps native confirmation consumed through release');
poll();
poll(0);
assert.equal(Input._latestButton, 'ok');
poll();
poll(10);
flush();
assert.deepEqual(commands, []);
poll(10, 11);
flush();
assert.equal(commands.pop().action, 'recovery');
assert.equal(bindings.enabled, false);
poll();
poll(8, 0);
assert.equal(Input._latestButton, 'ok', 'support off returns actual native input');
flush();
assert.deepEqual(commands, []);
poll();
poll(10, 11);
flush();
assert.equal(commands.pop().action, 'recovery');
assert.equal(bindings.enabled, true);

assert.equal(bindingAllowed('mode', 0, bindings, nativeButton), false);
assert.equal(bindingAllowed('recovery', [6, 0], bindings, nativeButton), false);
assert.equal(bindingAllowed('mode', 6, bindings, nativeButton), false, 'LT has a field directions binding');
assert.equal(bindingAllowed('mode', 7, bindings, nativeButton), true);
bindings = normalizeController({ ...bindings, mode: 6, settings: 4, repeat: 2, recovery: [7, 11] });
assert.equal(bindings.mode, 6, 'old saved mode mapping survives introduction of field bindings');
assert.equal(bindings.directions, null, 'old mode and recovery choices keep both triggers reserved');
controller.reset();
poll();
poll(8, 10, 11);
flush();
assert.deepEqual(commands, [], 'old remapped inputs are released');
poll();
poll(6);
flush();
assert.equal(commands.pop().action, 'modeEntered');
poll();
poll(2);
controller.disconnect(0);
flush();
assert.deepEqual(commands, [], 'disconnect retires a pending controller command');
poll();
poll(6);
context = null;
flush();
assert.deepEqual(commands, [], 'native owner retirement invalidates a queued action');
context = front;
controller.reset();
poll();
for (let index = 0; index < 20; index++) { poll(6); poll(); }
assert.equal(deferred.length, 1, 'the controller schedules one deferred drain');
flush();
assert.equal(commands.length, 4, 'controller command backlog stays bounded');
commands.length = 0;

const field = { kind: 'field' };
context = field;
bindings = normalizeController();
controller.reset();
SceneManager._scene._wqaControllerReady = false;
SceneManager._scene._wqaFieldReady = true;
poll();
poll(14);
assert.equal(Input._currentState.left, true, 'D-pad retains native movement');
poll();
pad.axes[2] = 0.7;
poll();
flush();
assert.equal(commands.pop().action, 'nextDestination');
assert.equal(Input._currentState.right, false);
pad.axes[2] = 0.48;
poll();
pad.axes[2] = 0.65;
poll();
flush();
assert.deepEqual(commands, [], 'held right-stick direction does not repeat near threshold');
pad.axes[2] = 0;
poll();
pad.axes[2] = -0.55;
pad.axes[3] = -0.83;
poll();
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['previousCategory']);
pad.axes[2] = pad.axes[3] = 0;
poll();
poll(6);
flush();
assert.equal(commands.pop().action, 'directions');
poll();
Input.gamepadMapper[6] = 'fixtureTrigger';
poll(6);
flush();
assert.deepEqual(commands, []);
assert.equal(Input._currentState.fixtureTrigger, true, 'native remap wins when it claims a field button');
poll();
delete Input.gamepadMapper[6];
poll(8);
poll();
poll(0);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'currentDestination']);
assert.equal(Input._currentState.ok, false);
poll();
Input.gamepadMapper[4] = 'pageup';
poll(4);
flush();
assert.deepEqual(commands, []);
assert.equal(Input._currentState.pageup, true, 'ordinary bumpers remain native');
poll();
poll(8);
poll();
poll(4);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered'], 'no guide outside its map');
poll();
poll(8);
flush();
assert.equal(commands.pop().action, 'modeLeft');
field.puzzle = true;
poll();
poll(8);
poll();
poll(4);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'puzzleGuide']);
assert.equal(Input._currentState.pageup, false);
poll();
field.puzzleActive = true;
poll(8);
poll();
poll(5);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'puzzleStop']);
poll();
poll(8);
poll();
poll(6);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'beaconToggle']);
poll();
field.beaconActive = true;
poll(8);
poll();
pad.axes[2] = -0.8;
poll();
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'beaconStop']);
pad.axes[2] = 0;
poll();
field.navigationOnly = field.autowalkActive = true;
poll(6);
poll();
flush();
assert.deepEqual(commands, [], 'a moving field reserves the mod mode for stopping navigation');
poll(12);
assert.equal(Input._currentState.up, true, 'ordinary physical movement keeps native priority');
poll();
poll(8);
poll();
pad.axes[2] = -0.8;
poll();
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'beaconStop']);
field.navigationOnly = field.autowalkActive = false;
pad.axes[2] = 0;
poll();
poll(8);
poll();
pad.axes[2] = 0.8;
poll();
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'wallToggle']);
pad.axes[2] = 0;
poll();
context = { kind: 'dialogue', puzzleActive: true };
bindings = normalizeController({ ...bindings, repeat: null });
poll();
poll(8);
poll();
poll(5);
flush();
assert.deepEqual(commands.splice(0).map(record => record.action), ['modeEntered', 'puzzleStop']);
assert.equal(normalizeController({ currentDestination: 4 }).currentDestination, 4);
assert.equal(normalizeController({ currentDestination: 4 }).puzzleGuide, null);
delete Input.gamepadMapper[4];
context = field;
bindings = normalizeController({ ...bindings, nextDestination: 7 });
controller.reset();
poll();
pad.axes[2] = 0.7;
poll();
flush();
assert.deepEqual(commands, [], 'old right-stick binding was freed');
pad.axes[2] = 0;
poll(7);
flush();
assert.equal(commands.pop().action, 'nextDestination');
const letters = normalizeNavigation();
const brackets = normalizeNavigation({ layout: 'brackets' });
assert(!letters.autowalk && !letters.speakAutowalkPath);
assert.equal(normalizeNavigation({ speakAutowalkPath: true }).autowalk, false);
assert.equal(normalizeNavigation({ autowalk: true }).speakAutowalkPath, false);
assert.equal(navigationAction(letters, 'P'), 'directions');
assert.equal(navigationAction(brackets, 'P'), 'currentDestination');
assert.equal(navigationAction(brackets, navigationGesture({ key: '{', shiftKey: true })), 'previousCategory');
assert.equal(navigationAction(brackets, navigationGesture({ key: '}', shiftKey: true })), 'nextCategory');
assert.equal(navigationAction(brackets, navigationGesture({ key: 'p', ctrlKey: true })), '');
assert.equal(nativeNavigationConflict(c, 'Shift+W', 87), true, 'Shift does not make a native movement key free');
assert.equal(nativeNavigationConflict(c, '\\'), false);
for (const [gesture, action] of [['Shift+B', 'beaconToggle'], ['Shift+H', 'wallToggle'], ['Shift+V', 'beaconStop']]) {
    assert.equal(nativeNavigationConflict(c, gesture), false);
    assert.equal(navigationAction(letters, gesture), action);
    assert.equal(navigationAction(brackets, gesture), action);
}
const preserved = normalizeNavigation({ bindings: { letters: { nextDestination: 'Shift+B' } } }, ['Shift+H']);
assert.equal(preserved.bindings.letters.nextDestination, 'Shift+B');
assert.equal(preserved.bindings.letters.beaconToggle, null);
assert.equal(preserved.bindings.letters.wallToggle, null);
console.log('Verified native controller mode, settings, remap, recovery, disconnect, and release-before-handback.');
