'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRenderer } = require('../src/runtime/renderer');
const { createTitleObserver } = require('../src/frontend/title');

// Installed functions are the test input. Their source is not copied into the
// repo. PIXI rendering and the custom intro's final state are represented by
// fixture values taken from the inspected activation path.
const root = path.join(process.argv[2], 'package.nw', 'js');
const managers = fs.readFileSync(path.join(root, 'rmmz_managers.js'), 'utf8');
const windows = fs.readFileSync(path.join(root, 'rmmz_windows.js'), 'utf8');
const scenes = fs.readFileSync(path.join(root, 'rmmz_scenes.js'), 'utf8');
const sandbox = vm.createContext({
    SceneManager: { isGameActive: () => true },
    Scene_Base: function () {},
    Scene_Title: function () {},
    Window_Command: function () {},
    Window_Selectable: function () {}
});
function load(source, name) {
    const head = name + ' = function(';
    const index = source.indexOf(head);
    assert(index >= 0 && source.indexOf(head, index + head.length) < 0, name);
    const end = source.indexOf('\n};', index);
    assert(end > index, name);
    vm.runInContext(source.slice(index, end + 3), sandbox, { timeout: 100 });
}
for (const name of ['Scene_Base.prototype.isStarted', 'Scene_Title.prototype.update']) load(scenes, name);
load(managers, 'SceneManager.updateScene');
for (const name of ['isHandled', 'callHandler', 'processOk']) load(windows, `Window_Selectable.prototype.${name}`);
load(windows, 'Window_Command.prototype.callOkHandler');

const manager = sandbox.SceneManager;
const scene = new sandbox.Scene_Title();
const originalLabel = 'Synthetic action';
const window = new sandbox.Window_Selectable();
let nativeAccepted = 0;
let timers = [];
const messages = [];
let admission;
Object.assign(window, {
    _index: 0,
    _list: [{ name: originalLabel, enabled: true }],
    visible: false,
    active: false,
    openness: 255,
    select(index) { this._index = index; },
    _handlers: { continue() { nativeAccepted++; assert.equal(Atomics.load(admission, 0), 0); } },
    currentSymbol() { return 'continue'; },
    callOkHandler: sandbox.Window_Command.prototype.callOkHandler,
    isCurrentItemEnabled: () => true,
    playOkSound() {},
    updateInputData() {},
    deactivate() { this.active = false; },
    open() {}
});
Object.assign(scene, {
    _commandWindow: window,
    _started: true,
    _active: true,
    _fadeDuration: 3,
    isStarted: sandbox.Scene_Base.prototype.isStarted,
    isBusy: () => false,
    spr_ui_start: { alpha: 0 },
    spr_black_rect: { alpha: 1 }
});
let acceptThisFrame = false;
sandbox.Scene_Base.prototype.update = function () {
    if (acceptThisFrame) window.processOk();
};
manager._scene = scene;
const graphics = { app: { stage: scene } };

const host = {
    manager, graphics, hasFocus: () => true,
    schedule(task) { timers.push(task); },
    titleStillReady: () => window.active,
    makeWord() { admission = new Int32Array(new SharedArrayBuffer(4)); return admission; },
    createWorker(shared) {
        assert.equal(shared, admission.buffer);
        return { postMessage: message => messages.push(message), on() {}, unref() {} };
    }
};
const observeTitle = createTitleObserver(host, createRenderer(host).notifications);

manager.updateScene();
assert.equal(observeTitle(scene), false);
assert.equal(timers.length, 0);
scene._fadeDuration = 0;
window.visible = true;
window.active = true;
manager.updateScene();
assert.equal(observeTitle(scene), false);
assert.equal(timers.length, 0);
scene.spr_ui_start.alpha = 1;
scene.spr_black_rect.alpha = 0;
manager.updateScene();
assert.equal(observeTitle(scene), true);
assert.equal(timers.length, 1);
timers.shift()();
assert.equal(messages.length, 1);
assert.equal(messages[0].name, originalLabel);
assert.equal(messages[0].epoch, Atomics.load(admission, 0));
acceptThisFrame = true;
manager.updateScene();
assert.equal(nativeAccepted, 1);
assert.equal(Atomics.load(admission, 0), 0);
assert.deepEqual(messages.map(message => message.kind), ['title', 'cancel']);
assert.equal(timers.length, 0);
console.log('Native title update and OK handler preserved. Presentation opened the epoch; accepted transition closed it before native continuation.');
