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
const imageLoads = [];
const copied = [];
let links = 0;
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
    Object.assign(this, { active: true, openness: 255, contentsOpacity: 255, innerWidth: 640, innerHeight: 390,
        _clientArea: new Sprite(), contents: { width: 640, context: {}, isReady: () => true }, innerRect: { x: 0 },
        _list: [], _index: 0, _handlers: {} });
    this.addChild(this._clientArea);
    this.makeCommandList();
};
Object.assign(Window_Command.prototype, {
    addCommand(name, symbol) { this._list.push({ name, symbol }); },
    setHandler(symbol, handler) { this._handlers[symbol] = handler; },
    isHandled(symbol) { return !!this._handlers[symbol]; },
    callOkHandler() { this.callHandler?.(this._list[this._index]?.symbol); },
    index() { return this._index; }, forceSelect(index) { this._index = index; },
    maxItems() { return this._list.length; }, refreshCursor() {}, callUpdateHelp() {},
    isCurrentItemEnabled: () => true, updateInputData() {}, playOkSound() {},
    addInnerChild(sprite) { this._clientArea.addChild(sprite); }
});
function Window_CouponList(...args) { this.initialize(...args); }
Window_CouponList.prototype = Object.create(Window_Command.prototype);
Object.assign(Window_CouponList.prototype, {
    itemRect(index) { return { x: 20 + 90 * index, y: 60, width: 80, height: 80 }; },
    itemLineRect(index) { return this.itemRect(index); },
    refresh() {},
    deactivate() { this.active = false; },
    invalidSelection() { buzzes++; this.active = true; }
});
function Window_CouponResponse(...args) { this.initialize(...args); }
Window_CouponResponse.prototype = Object.create(Window_Command.prototype);
Window_CouponResponse.prototype.createDoodle2 = Window_CouponResponse.prototype.createDoodle3 = () => {};

function Sprite_Sliced() { Sprite.call(this); }
Sprite_Sliced.prototype = Object.create(Sprite.prototype);
Object.assign(Sprite_Sliced.prototype, {
    setRect() { return this; }, initSlices() {},
    setSourceBitmap(bitmap) { this._bitmap = this.bitmap = bitmap; }
});
for (const name of ['setBitmapFont', 'setDrawColour', 'setOutline', 'setAlignment', 'setCharSpacing2'])
    Sprite_Text.prototype[name] = function () { return this; };
Sprite_Text.prototype.StartTextAnimation = () => {};

const c = vm.createContext({
    ...host, Window_Command, Window_CouponList, Window_CouponResponse, Scene_Coupons,
    Sprite_Sliced, Sprite_UIButton: Sprite, Sprite_UI: Sprite, Scene_MenuBase: function () {}, SceneManager: {},
    console: { log() {} }, SpriteTextAnimation: {}, SoundManager: { playCancel() {} },
    Utils: { copyToClipboard(code) { copied.push(code); }, OpenURLDeepLink() { assert.equal(active, 0); links++; } },
    Graphics: { app: { renderer }, startLoading() { assert.equal(active, 0); },
        endLoading() { assert(scene._wqaCouponBusy); } },
    Input: { GetLastInputDeviceIsTouchScreen: () => true },
    DataManager: { getGlobalStoneInfo: () => [true, false, true, false, false] },
    WendyQuest: { t: { u: { successpopup: {} }, v: index => cached && index === 2, I: () => 'fixture', M: () => 'fixture link',
        R(index) { assert.equal(index, 2); requestCount++; return new Promise(resolve => { reply = resolve; }); } } },
    ImageLoader: function (_paths, callback) {
        imageLoads.push(() => callback({ GetImage: name => name.includes('lock') ? padlock :
            name.includes('AllStones') ? stones : { isReady: () => true, fillRect() {} } }));
    },
    a16_0x55d438() { throw Error('Unresolved coupon property'); }
});
c.Scene_MenuBase.prototype.update = function () { this._windowLayer.update(); };
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
const scene = c.SceneManager._scene = c.Graphics.app.stage = Object.assign(new Scene_Coupons(), {
    _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: layer,
    addWindow(window) { layer.addChild(window); }, couponWindowRect: () => ({}), couponResponseWindowRect: () => ({}),
    popScene() { observer.retire(scene); },
    onRedeemSuccess() {}, onRedeemFailure() {}, createCouponResponseWindow() { assert.equal(active, 0); }
});
const observer = createMenuObserver(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true }, {
    open(record, live) { assert(live()); spoken.push(formatSpeech(record)); return active = ++epoch; },
    focus(id, record) { assert.equal(id, active); spoken.push(formatSpeech(record)); },
    close(id) { if (id === active) active = 0; }
}, () => ({ indexing: true, autodetail: true }));
c.WendyQuestAccessMenuReady = observer.observe;
c.WendyQuestAccessMenuLeaving = observer.retire;

function load() { imageLoads.shift()(); }
function frame() {
    scene.update();
    const clipboard = scene._couponResponseWindow?.clipboardText;
    if (clipboard) clipboard.worldAlpha = clipboard.alpha;
    renderer.emit('postrender');
}
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

    delete scene.createCouponResponseWindow;
    scene.createCouponResponseWindow({ Title: 'Fixture error', Body1: 'The reward is unavailable.', Button1: 'Close' });
    const failure = scene._couponResponseWindow;
    const beforeResponse = spoken.length;
    load();
    frame();
    assert.equal(spoken.length, beforeResponse, 'the back artwork still has to load');
    load();
    frame();
    assert.equal(spoken[beforeResponse], 'Coupon response, FIXTURE ERROR');
    assert.match(spoken.at(-1), /The reward is unavailable/);
    failure.select(1);
    frame();
    assert.equal(spoken.at(-1), 'Close, 2 of 2');
    failure.processOk();
    assert.equal(active, 0);
    layer.removeChild(failure);

    const response = { 1: { title: 'Fixture reward' }, subtitle1: 'Coupon', subtitle2: 'App',
        body1: 'Use the displayed code.', body2: 'Read the local offer instructions.', button2: 'Open in app' };
    scene.createCouponResponseWindow(response, 0, 'A1-B2');
    const result = scene._couponResponseWindow;
    while (imageLoads.length) load();
    scene._wqaCouponBusy = true;
    const beforeReady = spoken.length;
    frame();
    assert.equal(spoken.length, beforeReady);
    scene._wqaCouponBusy = false;
    frame();
    assert.equal(spoken[beforeReady], 'Coupon response, FIXTURE REWARD');
    assert.match(spoken.at(-1), /Use the displayed code/);
    assert.doesNotMatch(spoken.at(-1), /A 1 dash B 2/);
    result.select(1);
    frame();
    assert.equal(spoken.at(-1), 'Copy coupon code, 2 of 3');
    assert(observer.command(observer.controlOwner(scene), 'details'));
    assert.match(spoken.at(-1), /Coupon code, A 1 dash B 2/);
    for (let attempt = 0; attempt < 2; attempt++) {
        result.processOk();
        frame();
        assert.equal(spoken.at(-1), 'Copied to Clipboard');
    }
    assert.deepEqual(copied, ['A1-B2', 'A1-B2']);
    result.bodyText1.y = result.innerHeight + 20;
    result.select(2);
    frame();
    assert.equal(spoken.at(-1), 'Open in app, 3 of 3');
    assert(observer.command(observer.controlOwner(scene), 'details'));
    assert.doesNotMatch(spoken.at(-1), /Use the displayed code/);
    result.processOk();
    assert.equal(links, 1);
    layer.removeChild(result);

    scene.createCouponResponseWindow({ ...response,
        body1: 'First public paragraph. Second public paragraph. Third public paragraph.',
        body2: 'Fourth public paragraph. Fifth public paragraph.' }, 0, 'SYNTHETIC');
    while (imageLoads.length) load();
    frame();
    const detailsStart = spoken.length;
    assert(observer.command(observer.controlOwner(scene), 'details'));
    const details = spoken.slice(detailsStart);
    assert(details.length > 1, 'long visible details use more than one bounded packet');
    assert.match(details.join(' '), /First public paragraph.*Fifth public paragraph.*Coupon code/);
    console.log('Verified installed coupon art, request retirement, both response layouts, explicit code review and native action boundaries.');
    console.log('Throttled presented coupon focus through formatted receipt', receipt.toFixed(2), 'ms.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
