'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMenuObserver } = require('../src/menus/observer');
const { nativeTextHost } = require('./native-text-host.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const installed = process.argv[2];
const items = JSON.parse(fs.readFileSync(path.join(installed, 'package.nw/data/Items.json'), 'utf8'));
const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning', path.join(__dirname, 'coupon-producers.py'), installed],
    { encoding: 'utf8', timeout: 6000, maxBuffer: 64 * 1024 }));
const host = nativeTextHost();
const { Sprite, Sprite_Text } = host;
const renderer = new EventEmitter();
const layer = new Sprite();
const stones = { isReady: () => true };
const padlock = { isReady: () => true };
let load;
let reply;
let requestCount = 0;
let buzzes = 0;
let cached = false;
let active = 0;
let epoch = 0;
const spoken = [];

function Scene_Coupons() {}
function Window_Command() {}
Window_Command.prototype = Object.create(Sprite.prototype);
Window_Command.prototype.initialize = function () {
    Sprite.prototype.initialize.call(this);
    Object.assign(this, { active: true, openness: 255, contentsOpacity: 255, innerWidth: 640, innerHeight: 200,
        _clientArea: new Sprite(), contents: { width: 640, isReady: () => true }, innerRect: { x: 0 },
        _list: [], _index: 0 });
    this.addChild(this._clientArea);
    this.makeCommandList();
};
function Window_CouponList(...args) { this.initialize(...args); }
Window_CouponList.prototype = Object.create(Window_Command.prototype);
Object.assign(Window_CouponList.prototype, {
    addCommand(name, symbol) { this._list.push({ name, symbol }); },
    setHandler() {}, index() { return this._index; }, forceSelect(index) { this._index = index; },
    itemRect(index) { return { x: 20 + 90 * index, y: 60, width: 80, height: 80 }; },
    itemLineRect(index) { return this.itemRect(index); },
    addInnerChild(sprite) { this._clientArea.addChild(sprite); },
    refresh() {}, updateInputData() {}, callOkHandler() {}, playOkSound() {},
    isCurrentItemEnabled: () => true,
    deactivate() { this.active = false; },
    invalidSelection() { buzzes++; this.active = true; }
});
for (const name of ['setBitmapFont', 'setDrawColour', 'setOutline', 'setAlignment'])
    Sprite_Text.prototype[name] = function () { return this; };

const c = vm.createContext({
    ...host, Window_Command, Window_CouponList, Scene_Coupons, Scene_MenuBase: function () {}, SceneManager: {},
    Graphics: { app: { renderer }, startLoading() { assert.equal(active, 0); },
        endLoading() { assert(scene._wqaCouponBusy); } },
    Input: { GetLastInputDeviceIsTouchScreen: () => true },
    DataManager: { getGlobalStoneInfo: () => [true, false, true, false, false] },
    WendyQuest: { t: { u: { successpopup: {} }, v: index => cached && index === 2, I: () => 'fixture',
        R(index) { assert.equal(index, 2); requestCount++; return new Promise(resolve => { reply = resolve; }); } } },
    ImageLoader: function (_paths, callback) { load = () => callback({ GetImage: name => name.includes('lock') ? padlock : stones }); },
    a16_0x55d438() { throw Error('Unresolved coupon property'); }
});
c.Scene_MenuBase.prototype.update = function () { this._windowLayer.update(); };
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
const scene = c.SceneManager._scene = c.Graphics.app.stage = Object.assign(new Scene_Coupons(), {
    _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: layer,
    addWindow(window) { layer.addChild(window); }, couponWindowRect: () => ({}), popScene() {},
    onRedeemSuccess() {}, onRedeemFailure() {}, createCouponResponseWindow() { assert.equal(active, 0); }
});
const observer = createMenuObserver(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true }, {
    open(record, live) { assert(live()); spoken.push(formatSpeech(record)); return active = ++epoch; },
    focus(id, record) { assert.equal(id, active); spoken.push(formatSpeech(record)); },
    close(id) { if (id === active) active = 0; }
}, () => ({ indexing: true }));
c.WendyQuestAccessMenuReady = observer.observe;
c.WendyQuestAccessMenuLeaving = observer.retire;

function frame() { scene.update(); renderer.emit('postrender'); }
async function main() {
    scene.createCouponsWindow();
    frame();
    assert.deepEqual(spoken, [], 'title paint alone does not identify the still loading reward cells');
    load();
    const list = scene._couponsWindow;
    const start = performance.now();
    scene.update();
    assert.deepEqual(spoken, [], 'focus waits for postrender');
    renderer.emit('postrender');
    const receipt = performance.now() - start;
    assert.equal(spoken[0], 'Available rewards, No reward selected');
    list.forceSelect(0);
    frame();
    assert.equal(spoken[1], items[31].name + ', 1 of 5');
    list.forceSelect(1);
    frame();
    assert.equal(spoken[2], 'Locked reward, unavailable, 2 of 5');
    list.processOk();
    assert.equal(buzzes, 1);
    assert.equal(requestCount, 0, 'a displayed lock retains native unavailable behavior');

    list.forceSelect(2);
    frame();
    assert.equal(spoken[3], items[33].name + ', 3 of 5');
    const pending = scene.onCouponSelected(2);
    assert.equal(scene._wqaCouponBusy, true);
    assert.equal(observer.controlOwner(scene), null);
    frame();
    assert.equal(spoken.length, 4);
    assert.equal(requestCount, 1);
    reply();
    await pending;
    assert.equal(scene._wqaCouponBusy, false);

    scene.createCouponsWindow();
    load();
    scene._couponsWindow.forceSelect(2);
    frame();
    cached = true;
    await scene.onCouponSelected(2);
    assert.equal(requestCount, 1, 'a cached response retains the native local path');
    assert.equal(active, 0);
    console.log('Verified the installed coupon list, visible locked and unlocked art, native rejection and request retirement.');
    console.log('Throttled presented coupon focus through formatted receipt', receipt.toFixed(2), 'ms.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
