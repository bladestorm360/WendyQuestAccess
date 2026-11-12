'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createBattleLog } = require('../src/battle/action-log');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'log'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const renderer = new EventEmitter();
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0,
    _windowLayer: {}, isActive: () => true, isBusy: () => false, updateBattleProcess() { battle.isBusy(); } };
let spritesBusy = false;
let append = false;
let delta = 1 / 60;
let opened = 0;
let observations = 0;
const lines = [];
const painted = [];
const active = new Map();
const battle = { _phase: 'action', _spriteset: { isBusy: () => spritesBusy }, _logWindow: { isBusy: () => true } };
const c = vm.createContext({
    Scene_Battle: function () {}, Scene_Message: function () {}, Window_BattleActionLog: function () {},
    Window_Base: function () {}, Window_BattleLog: function () {},
    a2_0x990531() { throw Error('Unresolved battle property'); },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer } }, BattleManager: battle,
    $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} }, $gameTemp: { _animationQueue: [] },
    $gameTimer: { update() {} }, $gameScreen: { update() {} }, $gameVariables: { value: () => 23 },
    TextManager: { currencyUnit: 'gold' }, Utils: { containsArabic: () => false },
    ImageManager: { iconWidth: 32, iconHeight: 32, loadSystem: () => ({}) },
    ColorManager: { textColor: () => '#ffffff' },
    Rectangle: function (x, y, width, height) { Object.assign(this, { x, y, width, height }); },
    Time: { GetDeltaTime: () => delta },
    Clamp1: value => Math.min(1, Math.max(0, value)),
    InverseLerp: (start, end, value) => (value - start) / (end - start),
    Approach: (from, to, step) => from < to ? Math.min(from + step, to) : Math.max(from - step, to),
    Lerp: (start, end, amount) => start + (end - start) * amount
});
c.Window_Base.prototype.update = () => {};
Object.setPrototypeOf(c.Window_BattleActionLog.prototype, c.Window_Base.prototype);
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);
const log = scene._actionLogWindow = Object.assign(new c.Window_BattleActionLog(), {
    parent: scene._windowLayer, visible: true, worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255,
    width: 640, height: 200, items: [], itemQueue: [], cooldown: 0, contents: {
        width: 640, height: 176, isReady: () => true, clear() {}, drawText(text) { painted.push(text); }, blt() {}
    },
    resetFontSettings() {}, drawBackground() {}, changeTextColor() {},
    textWidth: text => text.length * 6, lineHeight: () => 24, calcTextHeight: () => 24
});
c.Scene_Message.prototype.update = () => log.update();

const observer = createBattleLog(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { active.set(++opened, live); lines.push(formatSpeech(record)); return opened; },
    focus(id, record) { assert(active.get(id)()); lines.push(formatSpeech(record)); },
    close(id) { active.delete(id); }
}, (_scene, record) => { if (append) lines.push(formatSpeech(record)); return append; });
c.WendyQuestAccessBattleLogReady = (scene, window) => { observations++; observer.observe(scene, window); };
c.WendyQuestAccessBattleLogLeaving = observer.retire;
function frame() { scene.update(); renderer.emit('postrender'); }

log.pushMessage('Synthetic damage, \\V[1].', 6);
frame();
assert.equal(observations, 0);
assert(painted.includes('Synthetic damage, 23.'), 'the installed text renderer resolved the native value');
scene._wqaBattleStarted = true;
spritesBusy = true;
frame();
assert.equal(observations, 0, 'the spriteset can own native work while a log row paints');
spritesBusy = false;
const start = performance.now();
scene.update();
assert.equal(lines.length, 0);
renderer.emit('postrender');
const first = performance.now() - start;
assert.equal(lines[0], 'Synthetic damage, 23.');
assert.equal(battle._wqaDialogueBusy, true, 'a native message wait alone does not suppress the visible action log');

for (let frameIndex = 0; frameIndex < 100; frameIndex++) frame();
assert.equal(observations, 1, 'stable native repaint does not invoke another observer');
const observedDraw = log.drawItem;
function measure(draw) {
    log.drawItem = draw;
    const start = performance.now();
    for (let index = 0; index < 250; index++) frame();
    return performance.now() - start;
}
delta = 0;
const baseline = measure(log.fixtureNativeDraw);
const stable = measure(observedDraw);
delta = 1 / 60;
assert.equal(observations, 1);
log.pushMessage('Synthetic damage, \\V[1].', 6);
frame();
assert.deepEqual(lines, ['Synthetic damage, 23.', 'Synthetic damage, 23.']);
assert.equal(opened, 1, 'two native events can share a speech context');
assert.equal(observer.latest(scene).lines.length, 2);

log.cooldown = 0;
log.pushMessage('After animation.', 6);
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1);
const legacyLog = battle._logWindow = Object.assign(new c.Window_BattleLog(), {
    isBusy: () => true, showNormalAnimation() {
        assert.equal(active.size, 0);
        c.$gameTemp._animationQueue.push({});
    }
});
scene._logWindow = legacyLog;
legacyLog.showAnimation({}, [], 5);
renderer.emit('postrender');
frame();
assert.equal(lines.length, 2, 'pending animation cancels queued action log paint');
c.$gameTemp._animationQueue.length = 0;
append = true;
battle._phase = 'input';
frame();
assert.equal(lines.at(-1), 'After animation.');
assert.equal(opened, 1, 'a settled command can append the result');
assert.equal(observer.latest(scene).lines.length, 3);
observer.retire(scene);
assert(observer.repeat(scene), 'the current battle history survives a presentation suspension');
assert.equal(lines.at(-1), 'Synthetic damage, 23. Synthetic damage, 23. After animation.');
observer.leave(scene);
assert.equal(observer.latest(scene), null);
assert.equal(active.size, 0);

console.log('Verified the installed battle log paint, visible value substitution, repeated native events, animation cancellation and review.');
console.log('Throttled battle log paint through synthetic postrender and formatted receipt', first.toFixed(2), 'ms.');
console.log('Throttled 250 stable paint frames', baseline.toFixed(2), 'ms native,', stable.toFixed(2), 'ms enabled.');