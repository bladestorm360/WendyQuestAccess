'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot } = require('../src/plugin');
const { formatSpeech } = require('../src/services/speech-text.cjs');

// Compile the pinned installed producers in memory. The fixture replaces the
// render device and storage with isolated stand-ins and never opens a save.
const game = process.argv[2];
const native = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'file-producers.py'), game], { encoding: 'utf8', timeout: 6000, maxBuffer: 32768 }));
const windowSource = fs.readFileSync(path.join(game, 'package.nw', 'js', 'rmmz_windows.js'), 'utf8');

function fixture() {
    const renderer = new EventEmitter();
    const timers = [];
    const messages = [];
    const images = [];
    const events = new EventEmitter();
    const makeWorker = function () {};
    const data = [{ level: 8, playtime: '01:27:19', stones: [true, false, true, false, false],
        characters: [['test', 1], ['test2', 3]], faces: [['Three', 0], ['One', 0]] }, null,
        { level: 11, stones: [true, true, true, true, true] }];
    let word;
    let saveReads = 0;
    let nativeClose = 0;
    let deleted = 0;
    const coroutines = [];
    const context = vm.createContext({
        a16_0x55d438: key => { throw Error('Unexpected undecoded property ' + key); },
        Scene_Title: function () {}, Scene_File: function () {}, Scene_Load: function () {},
        Scene_FileLoad: function () {}, Scene_Base: function () {}, Scene_Options: function () {},
        Scene_Coupons: function () {}, Scene_DeleteGame: function () {},
        Window_SavefileList: function () {}, Window_Selectable: function () {}, Window_Command: function () {},
        Scene_Load_prototype_start() {}, Scene_Load_prototype_update() {},
        Scene_MenuBase: { prototype: { update() {} } },
        Utils: { RPGMAKER_NAME: 'MZ', RPGMAKER_VERSION: '1.8.0', isMobileSafari: () => false },
        Graphics: { app: { renderer, stage: null }, boxXOffset: 0, endLoading() {}, setStage(stage) { this.app.stage = stage; } },
        document: { hasFocus: () => true },
        addEventListener: (name, listener) => events.on(name, listener),
        setTimeout: callback => timers.push(callback),
        DataManager: { _globalInfo: [true, true, true], savefileInfo(index) { saveReads++; return data[index]; },
            deleteGame() { assert.equal(Atomics.load(word, 0), 0); deleted++; } },
        SceneManager: {
            _scene: null, _nextScene: null,
            goto(target) { assert.equal(word ? Atomics.load(word, 0) : 0, 0);
                this._nextScene = target ? new target() : {}; nativeClose++; },
            push() { this.goto(); },
            snapForBackground() { assert.equal(Atomics.load(word, 0), 0); }
        },
        $gameTemp: {}, $gameVariables: { value: id => id === 43 ? 3 : 5 },
        $dataActors: [null, { name: 'Actor one', faceName: 'One' }, null, { name: 'Actor three', faceName: 'Three' }],
        TrackedStats: { CRITICAL_HITS: 43, CRIT_STREAK_RECORD: 44 },
        Input: { GetLastInputDeviceIsGamePad: () => false, isTriggered: () => false },
        TouchInput: { isCancelled: () => false }, SoundManager: { playOk() {}, playBuzzer() {} },
        ConfigManager: { developerMode: false }, Time: { GetDeltaTime: () => 60 },
        CoroutineManager: { StartAnonymousCoroutine: factory => { const instance = factory(); coroutines.push(instance); return instance; } },
        Sprite_Text: class {
            setText(text) { this.text = text; return this; }
            setBitmapFont() { return this; }
            setDrawColour() { return this; }
            setOutline() { return this; }
            setAlignment() { return this; }
            setShadow() { return this; }
            setShadowDraw() { return this; }
            StartTextAnimation() {}
            delete() {}
        },
        SpriteTextAnimation: {}, TextAlignment: {},
        ImageLoader: function (_names, callback) {
            images.push(() => callback({ GetImage: () => ({}) }));
        }
    });
    function run(source) { vm.runInContext(source, context, { timeout: 100 }); }
    for (const method of Object.values(native)) run(method);
    for (const name of ['select', 'forceSelect', 'isHandled', 'callHandler', 'processOk', 'callOkHandler']) {
        const head = 'Window_Selectable.prototype.' + name + ' = function(';
        const offset = windowSource.indexOf(head);
        assert(offset >= 0, name);
        run(windowSource.slice(offset, windowSource.indexOf('\n};', offset) + 3));
    }
    const commandHead = windowSource.indexOf('Window_Command.prototype.callOkHandler = function(');
    run(windowSource.slice(commandHead, windowSource.indexOf('\n};', commandHead) + 3));
    const nodeRequire = name => {
        if (name === 'path') return path;
        assert.equal(name, 'worker_threads');
        return { Worker: class extends EventEmitter {
            constructor(_script, options) { super(); word = new Int32Array(options.workerData); }
            postMessage(packet) {
                messages.push(packet);
                if (packet.kind !== 'cancel') queueMicrotask(() => this.emit('message', 'ack'));
            }
            unref() {}
        } };
    };
    boot(context, nodeRequire, { mainModule: { filename: path.join(game, 'package.nw', 'index.html') } });
    function show(scene, window) {
        Object.assign(scene, {
            _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0,
            _listWindow: window, slowFadeSpeed: () => 2,
            startFadeIn(duration) { this._fadeDuration = duration; this._fadeSign = 1; this._fadeOpacity = 255; },
            fadeOutAll() {}, popScene() { context.SceneManager.goto(); }
        });
        Object.assign(window, {
            visible: true, active: true, openness: 255, _index: 0,
            index() { return this._index; },
            refreshCursor() {}, callUpdateHelp() {}, ensureCursorVisible() {},
            deactivate() { this.active = false; }, _handlers: {},
            isCurrentItemEnabled: () => true, playOkSound() {}, updateInputData() {}
        });
        context.SceneManager._scene = scene;
        return scene;
    }
    return { context, renderer, timers, images, messages, show, coroutines, saveReads: () => saveReads,
        deleted: () => deleted, nativeClose: () => nativeClose, epoch: () => word && Atomics.load(word, 0) };
}

function readyFrame(f) {
    f.renderer.emit('postrender');
    while (f.timers.length) f.timers.shift()();
}

for (const imagesFirst of [false, true]) {
    const f = fixture();
    const c = f.context;
    const window = new c.Window_Selectable();
    const scene = f.show(new c.Scene_FileLoad(), window);
    const info = c.DataManager.savefileInfo(0);
    Object.assign(scene, { _info: info, _saveIndex: 0, _detailsWindow: { drawText() {} },
        detailsWindowRect: () => ({ width: 450 }), drawLoadedImages() {},
        executeLoad() { c.SceneManager.goto(); } });
    window.options = ['Synthetic back', 'Synthetic delete', 'Load'];
    window._handlers.ok = scene.onListSelection.bind(scene);
    c.SceneManager.onSceneStart();
    scene.loadImages();
    const art = f.images.shift();
    (imagesFirst ? art : () => scene.onLoadSuccess())();
    readyFrame(f);
    assert.equal(f.messages.length, 0, 'one completion is not enough');
    (imagesFirst ? () => scene.onLoadSuccess() : art)();
    assert.equal(f.messages.length, 0, 'the final completion must be presented');
    readyFrame(f);
    assert.equal(f.messages.length, 1);
    assert.match(formatSpeech(f.messages[0]), /Save slot 1, Level 8, Playtime 01:27:19, Critical hits 3, Longest critical streak 5, 2 cornerstones, Party: Actor one, Actor three/);
    if (imagesFirst) {
        c.TouchInput.isCancelled = () => true;
        scene.update();
    } else {
        window.select(2);
        readyFrame(f);
        assert.equal(formatSpeech(f.messages[1]), 'Load');
        window.processOk();
    }
    assert.equal(f.nativeClose(), 1);
    assert.equal(f.epoch(), 0);
    assert.equal(f.messages.at(-1).kind, 'cancel');
}

for (const imagesBeforeStage of [false, true]) {
    const f = fixture();
    const c = f.context;
    Object.setPrototypeOf(c.Window_SavefileList.prototype, c.Window_Selectable.prototype);
    const window = new c.Window_SavefileList();
    const scene = f.show(new c.Scene_Load(), window);
    window.refresh = () => {};
    window.loadImages();
    scene.start();
    if (imagesBeforeStage) f.images.shift()();
    c.SceneManager.onSceneStart();
    readyFrame(f);
    assert.equal(f.saveReads(), 0);
    for (let step = 0; step < 2; step++) c.Scene_Base.prototype.updateFade.call(scene);
    if (!imagesBeforeStage) f.images.shift()();
    readyFrame(f);
    assert.equal(f.messages.length, 1);
    window.select(1);
    readyFrame(f);
    assert.equal(formatSpeech(f.messages[1]), 'Save slot 2, Start new game');
    scene.optionsSprite = { worldVisible: true, alpha: 1, select() { this._selected = true; } };
    window.cursorUp();
    readyFrame(f);
    assert.equal(formatSpeech(f.messages[2]), 'Options');
    if (imagesBeforeStage) {
        c.Input.GetLastInputDeviceIsGamePad = () => true;
        c.Input.isTriggered = symbol => symbol === 'cancel';
        scene.update();
    } else {
        c.Scene_File.prototype.commandOptions.call(scene.optionsSprite);
    }
    assert.equal(f.nativeClose(), 1);
    assert.equal(f.epoch(), 0);
}

{
    const f = fixture();
    const c = f.context;
    const failed = f.show(new c.Scene_FileLoad(), new c.Window_Selectable());
    failed.drawLoadedImages = () => {};
    failed.loadImages();
    const lateArt = f.images.shift();
    c.SceneManager.onSceneStart();
    failed.onLoadFailure();
    readyFrame(f);
    assert.equal(f.messages.length, 0, 'failed detail scene never opens');
    const next = c.SceneManager._nextScene;
    assert(next instanceof c.Scene_Load);
    c.SceneManager._nextScene = null;
    Object.setPrototypeOf(c.Window_SavefileList.prototype, c.Window_Selectable.prototype);
    const window = new c.Window_SavefileList();
    const scene = f.show(next, window);
    window.refresh = () => {};
    scene.start();
    window.loadImages();
    f.images.shift()();
    c.SceneManager.onSceneStart();
    for (let step = 0; step < 2; step++) c.Scene_Base.prototype.updateFade.call(scene);
    lateArt();
    readyFrame(f);
    assert.match(formatSpeech(f.messages[0]), /^Could not load the save\. Save slot 1/);
    window.select(1);
    readyFrame(f);
    assert.doesNotMatch(formatSpeech(f.messages[1]), /Could not load/);
}

{
    const f = fixture();
    const c = f.context;
    const window = new c.Window_Selectable();
    const scene = f.show(new c.Scene_DeleteGame(), window);
    Object.assign(scene, { _wqaFileKind: 3, _optionsWindow: window, _deleteCount: 0, _saveIndex: 1,
        optionsWindowRect: () => ({ width: 360 }), addChild(sprite) { this.statusSprite = sprite; }, removeChild() {} });
    Object.assign(window, { _index: 2, _list: [{ name: 'Remove test slot', symbol: 'delete' },
        { name: 'Synthetic cancel', symbol: 'cancel' }], activate() { this.active = true; },
        currentSymbol() { return this._list[this._index].symbol; }, callOkHandler: c.Window_Command.prototype.callOkHandler });
    window._handlers.delete = scene.onDelete.bind(scene);
    c.SceneManager.onSceneStart();
    readyFrame(f);
    assert.match(formatSpeech(f.messages[0]), /Remove test slot\?/);
    window.select(0);
    readyFrame(f);
    assert.equal(formatSpeech(f.messages[1]), 'Remove test slot');
    window.processOk();
    assert.equal(f.epoch(), 0, 'confirmation retires focus at animation entry');
    const coroutine = f.coroutines.shift();
    assert.equal(coroutine.next().done, false);
    readyFrame(f);
    assert.notEqual(f.epoch(), 0, 'the status is available after its own render');
    assert.equal(formatSpeech(f.messages.at(-1)).toUpperCase(), scene.statusSprite.text);
    coroutine.next();
    assert.equal(f.deleted(), 1);
    assert.equal(f.epoch(), 0);
}
console.log('Verified native file publication orders, slot and sprite focus, load failure, delete status, and close-before-entry.');
