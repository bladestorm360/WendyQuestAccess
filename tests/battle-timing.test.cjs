'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createBattleTiming } = require('../src/battle/timing');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'timing'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const renderer = new EventEmitter();
let pressed = false;
let cancel = false;
let cancellations = 0;
let warmups = 0;
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0,
    isActive: () => true, isBusy: () => false, updateBattleProcess() { c.BattleManager.isBusy(); } };
const battle = { _phase: 'ActionCommand', _targets: [{}], _spriteset: { isBusy: () => false }, _logWindow: { isBusy: () => false },
    ClearActionTarget() { this._targets = []; } };
const c = vm.createContext({
    Scene_Battle: function () {}, Scene_Message: function () {}, ActionCommand: function () {},
    ActionCommandResult: function () { this.Cancel = () => {}; },
    a2_0x990531() { throw Error('Unresolved battle property'); },
    a0_0x453a8f() { throw Error('Unresolved action property'); },
    Point: function () {}, Input: { isTriggered: key => key === 'ok' ? pressed : key === 'cancel' && cancel },
    TouchInput: { x: 0, y: 0, isTriggered: () => false, isCancelled: () => false },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer } }, BattleManager: battle,
    $gameTimer: { update() {} }, $gameScreen: { update() {} }, $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} }
});
c.Scene_Message.prototype.update = () => {};
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);

const observer = createBattleTiming(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, owner => { assert.equal(owner, scene); warmups++; });
let observations = 0;
c.WendyQuestAccessBattleTimingReady = (owner, action) => { observations++; observer.observe(owner, action); };
c.WendyQuestAccessBattleTimingLeaving = observer.retire;
function arm() {
    const action = battle._currentActionCommand = Object.assign(new c.ActionCommand(), { _cancelable: true,
        _spriteBase: { parent: scene }, PointInBounds: () => true, BarParams: () => ({}),
        _coroutineContainer: { coroutine: { Cancel() { cancellations++; } } } });
    action._backing = { parent: action._spriteBase, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } };
    return [action, action.nativeWait()];
}
function render() { renderer.emit('postrender'); }

const [first, waiting] = arm();
waiting.next();
scene.update();
render();
assert.equal(first._wqaTimingWaiting, undefined);
assert.equal(observations, 0, 'native entry remains silent');
scene._wqaBattleStarted = true;
waiting.next();
first._backing.worldAlpha = 0;
scene.update();
render();
assert.equal(warmups, 0, 'hidden radial artwork cannot start audio preparation');
first._backing.worldAlpha = 1;
scene.update();
assert.equal(warmups, 0, 'preparation waits for a rendered frame');
const start = performance.now();
render();
const firstFocus = performance.now() - start;
assert.equal(warmups, 1);
for (let frame = 0; frame < 250; frame++) { scene.update(); render(); }
assert.equal(observations, 2, 'stable radial readiness does not call the observer per frame');
pressed = true;
assert(waiting.next().done);
assert.equal(first._wqaTimingWaiting, false);
assert.equal(first._cancelable, false);
assert.equal(scene._wqaBattleTimingActive, false);

pressed = false;
battle._targets = [];
const [second, cancellable] = arm();
cancellable.next();
scene.update();
render();
assert.equal(warmups, 2, 'a targetless sweep can still prepare audio');
cancel = true;
assert(cancellable.next().done);
assert.equal(cancellations, 1);
assert.equal(second._wqaTimingWaiting, false);
assert.equal(scene._wqaBattleTimingActive, false);

cancel = false;
const [third, quick] = arm();
quick.next();
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1);
pressed = true;
assert(quick.next().done);
render();
assert.equal(third._wqaTimingPromptSeen, false);
assert.equal(warmups, 2, 'confirmation before rendering prevents late preparation');

console.log('Verified native radial waiting, silent audio preparation, cancel and early confirmation.');
console.log('Throttled timing audio readiness after synthetic postrender', firstFocus.toFixed(2), 'ms.');