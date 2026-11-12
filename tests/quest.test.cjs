'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const vm = require('node:vm');
const { createQuestTracker } = require('../src/menus/quest-tracker');
const { normalizeController } = require('../src/settings/controller-bindings');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const renderer = new EventEmitter();
const rows = [];
const records = [];
const nativeDraws = [];
let owner = 0;
let serial = 0;
let fieldReady = true;
let moving = false;
let rejectDraw = false;
let focused = true;
let reported = false;
let rootQuest = true;

const root = vm.createContext({
    Scene_Map: function () {}, Window_QuestMapNavigation: function () {}, Window_Base: function () {},
    _HighQualityQuestSystem_Scene_Map_prototype_update() { window.drawNavContents(); },
    a1_0x4e0759() {}, Utils: { RPGMAKER_NAME: 'MZ', containsArabic: () => false }, TextManager: { currencyUnit: 'G' },
    ColorManager: { textColor: () => '#abc' }, EaseFunction: { EaseInOut: value => value },
    Lerp: (from, to, amount) => from + amount * (to - from),
    Ayatam: { QUEST: { CustamizeSettings: { HeadingColor: '#def',
        NavData: { QuestNameX: 0, QuestNameY: 0, ObjectiveX: 0, ObjectiveY: 0 },
        NavWindow: { NavBackImg: { UsePicture: true } } } } },
    $gameQuest: { isAssented: () => !reported, isReported: () => reported, getAllObjectives: () => rows },
    $gameMap: { inactiveTime: 0, _interpreter: {} }, $gamePlayer: {}, $gameScreen: { _brightness: 255 }
});
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'quest-producers.py'), process.argv[2]], { encoding: 'utf8', timeout: 6000, maxBuffer: 22000 }));
for (const method of methods) vm.runInContext(method, root, { timeout: 100 });
Object.setPrototypeOf(root.Window_QuestMapNavigation.prototype, root.Window_Base.prototype);

const scene = Object.assign(new root.Scene_Map(), {
    _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0,
    _windowLayer: {}, checkNavigationKey() {}, checkMouseLeftPress() {}
});
const host = { manager: { _scene: scene }, graphics: { width: 480, height: 336, app: { stage: scene, renderer } },
    hasFocus: () => focused, screenFading: () => false };
const preferences = { autodetail: false, indexing: true };
const tracker = createQuestTracker(root, host, (_scene, allowMoving) => fieldReady && (!moving || allowMoving), {
    open(record, ready) { assert(ready()); records.push(record); return owner = ++serial; },
    focus(token, record) { assert.equal(token, owner); records.push(record); },
    close(token) { if (token === owner) owner = 0; }
}, () => preferences);
root.WendyQuestAccessQuestPaint = window => tracker.paint(window);
root.WendyQuestAccessQuestUpdate = scene => tracker.observe(scene);

const bitmap = Object.assign(Object.create({
    drawText(text) {
        if (rejectDraw) throw Error('Fixture paint failure');
        nativeDraws.push(text);
    }
}), { width: 240, height: 112, paintOpacity: 255, measureTextWidth: text => text.length * 5,
    isReady: () => true, clear() { nativeDraws.length = 0; },
    _context: { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {} }
});
const sprite = { bitmap, worldVisible: true, worldAlpha: 1, worldTransform: { a: 1, b: 0, c: 0, d: 1, tx: 8, ty: 8 } };
const window = scene._questNavWindow = Object.assign(new root.Window_QuestMapNavigation(), {
    _init: true, _questData: { _questName: 'Fixture quest', isRootQuest: () => rootQuest,
        _questClearContent: 'script:beginHide;Return to the guide' }, _questId: 'fixture',
    _bgMargin: 12, _transitionTime: 0.2, _transitionTimer: 0, _transitionState: 'small', _targetTransitionState: 'small',
    parent: scene._windowLayer, visible: true, worldVisible: true, worldAlpha: 1, offsetY: 0, openness: 255,
    contents: bitmap, contentsOpacity: 255, innerWidth: 240, innerHeight: 112, _contentsSprite: sprite,
    drawNavBackground() {}, drawQuestIcon: () => 12, drawIconWithSpacing: () => 12, lineHeight: () => 16,
    calcTextHeight: () => 16, changeTextColor() {}, resetTextColor() {},
    changePaintOpacity(enabled) { bitmap.paintOpacity = enabled ? 255 : 160; },
    needRefresh() { this._needContentRefresh = true; }
});
const add = (content, count, amount) => rows.push({ _content: content, _target: count, _finishAmount: amount,
    _objectiveIcons: {} });
const frame = () => { scene.update(); renderer.emit('postrender'); };
const spoken = () => formatSpeech(records.at(-1));

add('Find a token', 1, 1);
add('Bring a token', 1, 3);
add('Find the hidden seal', 0, 1);
window.needRefresh();
scene.update();
assert.equal(records.length, 0, 'only an actual render can confirm the tracker');
assert.equal(tracker.available(scene), false);
renderer.emit('postrender');
assert.equal(spoken(), 'Quest objective. Bring a token. 1 of 3');
assert.deepEqual(nativeDraws, ['Find a token', '1/1', 'Bring a token', '1/3']);
assert.equal(tracker.command(scene, 'details'), true);
assert.equal(spoken(), 'Find a token. 1 of 1. Bring a token. 1 of 3');
tracker.command(scene, 'reviewLast');
assert.equal(spoken(), 'Bring a token. 1 of 3, 2 of 2');
assert.equal(Object.hasOwn(bitmap, 'drawText'), false, 'temporary paint restores the inherited method');

window.needRefresh();
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1);
window.needRefresh();
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1, 'a superseded draft removes its pending listener');
tracker.suspend(scene);
assert.equal(renderer.listenerCount('postrender'), 0);
frame();

preferences.autodetail = true;
window._targetTransitionState = 'full';
window._transitionTimer = 0.1;
window.needRefresh();
const beforeFold = records.length;
frame();
assert.equal(tracker.available(scene), false);
assert.equal(owner, 0);
assert.equal(records.length, beforeFold, 'an intermediate title paint remains unavailable');
window._transitionState = 'full';
window._transitionTimer = 0.2;
frame();
assert.equal(formatSpeech(records.at(-2)), 'Fixture quest. Bring a token. 1 of 3');
assert.equal(spoken(), 'Find a token. 1 of 1. Bring a token. 1 of 3');
assert.equal(records.at(-1).append, true);
tracker.command(scene, 'reviewLast');
window._targetTransitionState = 'small';
window.needRefresh();
frame();
window._transitionState = 'small';
window._transitionTimer = 0;
const afterFull = records.length;
frame();
assert.equal(records.length, afterFull, 'the same publication stays quiet after collapse');
tracker.command(scene, 'reviewNext');
assert.equal(spoken(), 'Bring a token. 1 of 3, 3 of 3', 'fold keeps the review cursor');
tracker.command(scene, 'details');
assert.match(spoken(), /^Fixture quest\. Find a token/);

rows[1]._target = 3;
scene.QuestNavNeedRefresh();
assert.equal(owner, 0);
assert.equal(tracker.available(scene), false, 'a revision retires the previous paint before the next frame');
frame();
assert.match(formatSpeech(records.at(-2)), /Find the hidden seal. 0 of 1/);
assert(!nativeDraws.includes('Return to the guide'));
rows[2]._target = 1;
scene.QuestNavNeedRefresh();
frame();
assert.match(spoken(), /Return to the guide$/);

rootQuest = false;
rows.length = 0;
add('A clue\nA second line', 0, 1);
add('A clue\nA second line', 0, 1);
scene.QuestNavNeedRefresh();
frame();
tracker.command(scene, 'details');
assert.match(spoken(), /A clue A second line\. 0 of 1\. A clue A second line\. 0 of 1/);
moving = true;
assert.equal(tracker.command(scene, 'details'), false);
moving = false;

const beforeGate = records.length;
root.$gameMap._interpreter._list = [{}];
root.$gameMap._interpreter._waitMode = 'message';
scene._wqaDialogue = true;
scene._messageWindow = { openness: 255 };
fieldReady = false;
scene.QuestNavNeedRefresh();
frame();
assert.equal(records.length, beforeGate, 'settled dialogue can paint but cannot speak field output');
assert(window._wqaQuestDraft);
delete root.$gameMap._interpreter._list;
fieldReady = true;
frame();
assert(records.length > beforeGate);

sprite.worldTransform.tx = 480;
scene.QuestNavNeedRefresh();
frame();
assert.equal(tracker.available(scene), false, 'a clipped tracker cannot republish a retained title');
sprite.worldTransform.tx = 8;
reported = true;
scene.QuestNavNeedRefresh();
frame();
assert.equal(window._wqaQuestDraft, null);
reported = false;
focused = false;
window.needRefresh();
frame();
assert.equal(window._wqaQuestDraft, null, 'never wrap native drawing during lost focus');
focused = true;
root.$gamePlayer._transferring = true;
window.needRefresh();
frame();
assert.equal(window._wqaQuestDraft, null, 'never wrap native drawing during a transfer');
root.$gamePlayer._transferring = false;
window.needRefresh();
rejectDraw = true;
assert.throws(() => scene.update(), /Fixture paint failure/);
assert.equal(Object.hasOwn(bitmap, 'drawText'), false, 'a native throw still restores the bitmap');
assert.equal(window._wqaQuestCapture, null);
rejectDraw = false;
window.needRefresh();
frame();
assert(tracker.available(scene));
window.offsetY = -1;
frame();
assert.equal(tracker.available(scene), false, 'the native hidden offset revokes the tracker');
window.offsetY = 0;
frame();
assert(tracker.available(scene));

const observe = root.WendyQuestAccessQuestUpdate;
function sample(update) {
    root.WendyQuestAccessQuestUpdate = update;
    const start = performance.now();
    for (let index = 0; index < 400; index++) frame();
    return performance.now() - start;
}
const baseline = sample(null);
const connected = sample(observe);
const bindings = normalizeController({ currentDestination: 3, beaconToggle: 12 });
assert.equal(bindings.currentDestination, 3);
assert.equal(bindings.beaconToggle, 12);
assert.equal(bindings.questDetails, 2, 'new field defaults respect existing controller bindings');
assert.equal(bindings.questPrevious, null);
console.log('Installed quest paint, native reveal, review, ownership and phase gates passed.');
console.log('400 stable synthetic frames, bypassed %s ms, connected %s ms.', baseline.toFixed(2), connected.toFixed(2));
