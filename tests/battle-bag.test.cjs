'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const { createMenuObserver } = require('../src/menus/observer');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const installed = process.argv[2];
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), installed, 'bag'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const items = JSON.parse(fs.readFileSync(path.join(installed, 'package.nw/data/Items.json'), 'utf8'))
    .filter(item => item?.description && item.occasion <= 1).slice(0, 2);
assert.equal(items.length, 2);
items[0] = { ...items[0], name: 'Internal fixture name' };
const spokenDescription = item => item.description.replace(/\s+/g, ' ').trim();

const renderer = new EventEmitter();
const scene = { _wqaBattleStarted: false, _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {},
    isActive: () => true, isBusy: () => false, updateBattleProcess() { c.BattleManager.isBusy(); }, onSelectAction() { accepted++; } };
let accepted = 0;
let cancelled = 0;
let errors = 0;
let ok = false;
let cancel = false;
let quantity = 3;
const receipts = [];
const painted = [];
const active = new Map();
let epoch = 0;
const c = vm.createContext({
    Scene_Battle: function () {}, Scene_Message: function () {}, Window_BattleItem: function () {}, Window_Selectable: function () {},
    a2_0x990531() { throw Error('Unresolved battle property'); },
    Rectangle: function (x, y, width, height) { Object.assign(this, { x, y, width, height }); },
    SceneManager: { _scene: scene }, Graphics: { width: 640, app: { stage: scene, renderer } },
    BattleManager: { _phase: 'input', _inputting: true, _spriteset: { isBusy: () => false }, _logWindow: { isBusy: () => false },
        inputtingAction: () => ({ setItem(id) { assert.equal(active.size, 0); assert.equal(id, items[0].id); } }) },
    $gameScreen: { update() {} }, $gameTimer: { update() {} }, $gameMessage: { isBusy: () => false },
    $gameTroop: { _interpreter: {} }, $gameParty: { numItems: () => quantity, setLastItem() {} }, $gameSystem: { mainFontSize: () => 16 },
    ImageManager: { iconHeight: 32, iconWidth: 32 }, EaseFunction: { None: value => value },
    SoundManager: { playCancel() {} }, BattleHelper: { GetActiveActorSprite: () => null },
    CoroutineManager: { StartAnonymousCoroutine() { assert.equal(active.size, 0); cancelled++; } }
});
c.Scene_Message.prototype.update = () => {};
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);
const bag = scene._itemWindow = Object.assign(new c.Window_BattleItem(), { parent: scene._windowLayer,
    _index: 0, _data: items, _openAmount: 1, active: true, width: 640, innerWidth: 640, innerHeight: 320, _scrollBaseY: 0, _scrollY: 0,
    worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255,
    contents: { isReady: () => true, drawText: text => painted.push(text) },
    itemAt(index) { return this._data[index]; }, item() { return this.itemAt(this._index); },
    itemLineRect(index) { return this.itemRect(index); },
    isEnabled: item => item === items[0], isCurrentItemEnabled() { return this.isEnabled(this.itemAt(this._index)); },
    lineHeight: () => 32, rowSpacing: () => 4, needsNumber: () => true, drawIcon() {}, textWidth: text => text.length,
    changePaintOpacity() {}, changeTextColor() {}, changeOutlineColor() {}, resetTextColor() {}, resetFontSettings() {},
    refreshCursor() {}, callUpdateHelp() {}, hideHelpWindow() {},
    isOpenAndActive() { return this.active; }, isOkEnabled: () => true, isCancelEnabled: () => true,
    isOkTriggered: () => ok, isCancelTriggered: () => cancel, isHandled: () => false, playOkSound() {},
    playBuzzerSound() { errors++; }, updateInputData() {}, deactivate() { this.active = false; },
    callOkHandler() { scene.onItemOk(); }, callCancelHandler() { this.hide(); },
    processOk: c.Window_Selectable.prototype.processOk, processCancel: c.Window_Selectable.prototype.processCancel
});
const observer = createMenuObserver(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { active.set(++epoch, live); receipts.push(formatSpeech(record)); return epoch; },
    focus(id, record) { assert(active.get(id)()); receipts.push(formatSpeech(record)); },
    close(id) { active.delete(id); }
}, () => ({ indexing: true, autodetail: false }));
let observations = 0;
c.WendyQuestAccessMenuReady = (scene, screen) => { observations++; observer.observe(scene, screen); };
c.WendyQuestAccessMenuLeaving = observer.retire;

function paintAll() { for (let index = 0; index < bag.maxItems(); index++) bag.drawItem(index); }
function render() { renderer.emit('postrender'); }

paintAll();
scene.update();
render();
assert.equal(bag._wqaBattleBagRows, undefined, 'native startup paint stays outside the observer');
assert.equal(observations, 0);
scene._wqaBattleStarted = true;
bag._openAmount = 0.4;
paintAll();
scene.update();
render();
assert.equal(observations, 0, 'native open animation keeps focus closed');
bag._openAmount = 1;
quantity = 9;
const start = performance.now();
scene.update();
assert.equal(receipts.length, 0, 'painted rows wait for postrender');
render();
const first = performance.now() - start;
assert.equal(receipts[0], 'Battle Bag, ' + spokenDescription(items[0]) + ', 3, 1 of 7');
assert(painted.includes(items[0].description) && painted.includes('x3'));
assert(!receipts[0].includes(items[0].name + ','));
assert(observer.command(observer.controlOwner(scene), 'details'));
assert.equal(receipts.at(-1), items[0].description.split(/\r?\n/).join('. '));
for (let frame = 0; frame < 250; frame++) { scene.update(); render(); }
assert.equal(observations, 1, 'stable native bag focus does not call the observer per frame');

bag.select(1);
scene.update();
render();
assert.equal(receipts.at(-1), spokenDescription(items[1]) + ', 3, unavailable, 2 of 7');
ok = true;
bag.processHandling();
assert.equal(errors, 1);
assert(observer.controlOwner(scene));
ok = false;
bag.select(2);
scene.update();
render();
assert.equal(receipts.at(-1), 'Empty, unavailable, 3 of 7');
cancel = true;
bag.processHandling();
assert.equal(cancelled, 1);
assert.equal(active.size, 0);
assert.equal(observer.controlOwner(scene), null);

cancel = false;
bag.active = true;
bag.select(0);
bag.drawItem(0);
scene.update();
render();
assert.equal(receipts.at(-1), 'Battle Bag, ' + spokenDescription(items[0]) + ', 9, 1 of 7');
ok = true;
bag.processHandling();
assert.equal(accepted, 1);
assert.equal(active.size, 0);
assert.equal(observer.controlOwner(scene), null);
console.log('Verified native battle Bag paint, quantity, empty and unavailable rows, cancellation and accepted item use.');
console.log('Throttled Bag focus through synthetic render and formatted receipt', first.toFixed(2), 'ms.');

{
    const actual=JSON.parse(fs.readFileSync(path.join(installed,'package.nw/data/Items.json'),'utf8'));
    const medium=actual[16],breakfast=actual[25];
    assert.match(medium.description,/Medium Soda/);assert.match(breakfast.description,/Breakfast Baconator/);
    bag._data=[medium,breakfast];bag.active=true;bag.isEnabled=()=>true;quantity=3;
    bag.select(0);paintAll();scene.update();render();
    bag.select(1);scene.update();render();assert(receipts.at(-1).includes('Breakfast Baconator'));
    const page=observer.controlOwner(scene),before=receipts.length;
    for(let i=0;i<3;i++){
        bag._scrollBaseY=8*(i+1);paintAll();
        assert.equal(observer.controlOwner(scene),null,'unpainted row revisions cannot own Details');
        scene.update();render();assert.equal(observer.controlOwner(scene),page);
    }
    assert.equal(receipts.length,before,'native scrolling/redraw must not repeat battle Bag focus');
    assert(observer.command(page,'details'));assert.equal(receipts.at(-1),breakfast.description.split(/\r?\n/).join('. '));
    const settled=observations;for(let i=0;i<20;i++){scene.update();render();}
    assert.equal(observations,settled,'new painted row identity is acknowledged without a frame poll');
    quantity=4;bag.drawItem(1);scene.update();render();assert(receipts.at(-1).includes(', 4,'));
    bag.select(0);scene.update();render();bag.select(1);scene.update();render();
    assert(receipts.at(-1).includes('Breakfast Baconator'),'genuine return selection still speaks');
    console.log('Original Medium Soda-to-Breakfast Baconator native selection, scroll redraw, retained source epoch, fresh Details and quantity/return changes pass.');
}
