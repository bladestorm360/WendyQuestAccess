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
    path.join(__dirname, 'file-producers.py'), game], { encoding: 'utf8', timeout: 6000, maxBuffer: 65536 }));
const windowSource = fs.readFileSync(path.join(game, 'package.nw', 'js', 'rmmz_windows.js'), 'utf8');

function fixture() {
    const renderer = new EventEmitter();
    const timers = [];
    const messages = [];
    const images = [];
    const events = new EventEmitter();
    const windowTimers = [];
    const nwWindow = { isFullscreen: false };
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
        a18_0x52f0af: key => { throw Error('Unexpected undecoded property ' + key); },
        a22_0x524e38: key => { throw Error('Unexpected undecoded property ' + key); },
        Scene_Title: function () {}, Scene_File: function () {}, Scene_Load: function () {},
        Scene_FileLoad: function () {}, Scene_Base: function () {}, Scene_Options: function () {},
        Scene_Coupons: function () {}, Scene_DeleteGame: function () {}, Scene_Gameover: function () {},
        Window_SavefileList: function () {}, Window_Selectable: function () {}, Window_Command: function () {},
        Window_Options: function () {}, Window_HorzCommand: function () {},
        Window_Selectable_prototype_initialize() {}, Scene_Options_prototype_create() {},
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Scene_Load_prototype_start() {}, Scene_Load_prototype_update() {},
        Scene_MenuBase: { prototype: { update() {} } },
        Utils: { RPGMAKER_NAME: 'MZ', RPGMAKER_VERSION: '1.8.0', isMobileSafari: () => false,
            isMobileDevice: () => false, isNwjs: () => true, isOptionValid: () => false },
        Graphics: { app: { renderer, stage: null }, boxXOffset: 0, endLoading() {},
            setStage(stage) { this.app.stage = stage; },
            _updateRealScale() {}, _updateErrorPrinter() {}, _updateCanvas() {}, _updateVideo() {} },
        window: { innerWidth: 1280, innerHeight: 720, screen: { width: 1920, height: 1080 } },
        require(name) { assert.equal(name, 'nw.gui'); return { Window: { get: () => nwWindow } }; },
        screenWidth: 640, screenHeight: 360, ResizeEnable() {}, GetResizeEnabled: () => false,
        document: { hasFocus: () => true },
        addEventListener: (name, listener) => events.on(name, listener),
        setTimeout: (callback, interval) => (interval === 50 || interval === 16 ? windowTimers : timers).push(callback),
        DataManager: { _globalInfo: [true, true, true], savefileInfo(index) { saveReads++; return data[index]; },
            deleteGame() { assert.equal(Atomics.load(word, 0), 0); deleted++; } },
        SceneManager: {
            _scene: null, _nextScene: null,
            goto(target) { assert.equal(word ? Atomics.load(word, 0) : 0, 0);
                this._nextScene = target ? new target() : {}; nativeClose++; },
            push() { this.goto(); }, pop() { this.goto(); }, exit() { this.goto(); },
            snapForBackground() { assert.equal(Atomics.load(word, 0), 0); }
        },
        $gameTemp: { isPlaytest: () => false }, $gameVariables: { value: id => id === 43 ? 3 : 5 },
        $dataActors: [null, { name: 'Actor one', faceName: 'One' }, null, { name: 'Actor three', faceName: 'Three' }],
        TrackedStats: { CRITICAL_HITS: 43, CRIT_STREAK_RECORD: 44 },
        Input: { GetLastInputDeviceIsGamePad: () => false, isTriggered: () => false },
        TouchInput: { isCancelled: () => false, isPressed: () => false },
        SoundManager: { playOk() {}, playBuzzer() {}, playCursor() {}, playCancel() {} },
        AudioManager: { stopMe() {} }, console: { log() {}, error() {} },
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
    const fixtureGoto = context.SceneManager.goto;
    for (const method of Object.values(native)) run(method);
    const nativeGoto = context.SceneManager.goto;
    context.SceneManager.goto = fixtureGoto;
    for (const [type, names] of Object.entries({
        Window_Selectable: ['select', 'forceSelect', 'isHandled', 'callHandler', 'processOk', 'callOkHandler', 'setHandler'],
        Window_Command: ['callOkHandler'],
        Window_Options: ['statusText', 'isVolumeSymbol', 'booleanStatusText', 'changeValue', 'getConfigValue', 'setConfigValue']
    })) {
        for (const name of names) {
            const head = `${type}.prototype.${name} = function(`;
            const offset = windowSource.indexOf(head);
            assert(offset >= 0, name);
            run(windowSource.slice(offset, windowSource.indexOf('\n};', offset) + 3));
        }
    }
    for (const type of [context.Window_Options, context.Window_HorzCommand]) {
        Object.setPrototypeOf(type.prototype, context.Window_Selectable.prototype);
    }
    run('Math.Clamp = (min, max, value) => Math.min(max, Math.max(min, value));');
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
    return { context, renderer, timers, images, messages, show, coroutines, nwWindow, windowTimers, nativeGoto,
        saveReads: () => saveReads,
        deleted: () => deleted, nativeClose: () => nativeClose, epoch: () => word && Atomics.load(word, 0) };
}

function readyFrame(f) {
    f.renderer.emit('postrender');
    while (f.timers.length) f.timers.shift()();
}

function displayed(f) {
    return f.messages.filter(packet => packet.kind !== 'cancel').map(formatSpeech);
}

for (const action of ['pending goto', 'goto', 'reload']) {
    const f = fixture();
    const c = f.context;
    const window = new c.Window_Selectable();
    const scene = f.show(new c.Scene_Load(), window);
    scene._wqaFileKind = 1;
    scene.stop = () => { scene._active = false; };
    window._wqaCards = true;
    c.SceneManager.onSceneStart();
    assert.equal(scene._wqaPresentation, true);
    const pending = action === 'pending goto';
    if (!pending) {
        readyFrame(f);
        assert(f.epoch());
    }
    let nativeEntry = false;
    function enter() {
        assert.equal(f.epoch(), pending ? undefined : 0);
        assert.equal(scene._wqaPresentation, false);
        nativeEntry = true;
    }
    if (action === 'reload') {
        c.chrome = { runtime: { reload: enter } };
        c.SceneManager.reloadGame();
    } else {
        f.nativeGoto.call(c.SceneManager, enter);
    }
    assert(nativeEntry);
    readyFrame(f);
    assert.equal(displayed(f).length, pending ? 0 : 1);
}

{
    const f = fixture();
    const c = f.context;
    const window = new c.Window_Options();
    const scene = f.show(new c.Scene_Options(), window);
    const drawn = [];
    const pips = [];
    const rect = () => new c.Rectangle(0, 0, 200, 30);
    c.ConfigManager.bgmVolume = 15;
    let nativeEnters = 0;
    let nativeLeaves = 0;
    const nativeWindow = f.nwWindow;
    nativeWindow.enterFullscreen = () => { assert.equal(f.epoch(), 0); nativeEnters++; };
    nativeWindow.leaveFullscreen = () => { assert.equal(f.epoch(), 0); nativeLeaves++; };
    nativeWindow.setPosition = place => assert.equal(place, 'center');
    let windowSize;
    nativeWindow.resizeTo = (width, height) => { windowSize = [width, height]; };
    c.ResizeEnable = () => assert.equal(f.epoch(), 0);
    Object.defineProperty(c.ConfigManager, 'fullscreen', {
        get: () => c.Graphics._isFullScreen(),
        set(value) {
            c.ResizeEnable(true);
            if (value) c.Graphics._requestFullScreen();
            else c.Graphics._cancelFullScreen();
            c.ResizeEnable(false);
        }
    });
    Object.assign(window, {
        parent: scene,
        refresh() {
            this.tabs = {
                Volume: [{ name: 'Fixture music', symbol: 'bgmVolume', enabled: true }],
                Display: [{ name: 'Fixture full screen', symbol: 'fullscreen', enabled: true }]
            };
            this.paint();
        },
        paint() {
            this._list = this.tabs[this.currentTab];
            this.drawItem(0);
        },
        refreshCursor() { this.paint(); }, redrawItem(index) { this.drawItem(index); },
        commandName(index) { return this._list[index].name; },
        commandSymbol(index) { return this._list[index].symbol; },
        findSymbol(symbol) { return this._list.findIndex(item => item.symbol === symbol); },
        isCommandEnabled: () => true, resetTextColor() {}, changePaintOpacity() {},
        activate() { this.active = true; }, playCursorSound() {},
        itemLineRect: rect, titleRect: rect, statusRect: rect, rectToScreenRect: value => value,
        volumeWidth: () => 160, isHoverEnabled: () => false,
        drawVolumeBackgroundRectPressed() {}, drawBackgroundRectPressed() {},
        drawText(value) { drawn.push(value); }, contents: { blt(_image, sourceX) { pips.push(sourceX); } }
    });
    Object.assign(scene, {
        _optionsWindow: window, update() {}, setBackgroundOpacity() {}, onGoToTitle() {},
        systemOptionActive: () => true, systemOptionCount() { return this.systemButtons.length; },
        createOptionsSystemWindow() { for (const button of this.systemButtons) button.sprite = { visible: true }; }
    });
    window.initialize(rect());
    scene.create();
    c.SceneManager.onSceneStart();
    readyFrame(f);
    assert.deepEqual(displayed(f), []);
    assert.equal(pips.length, 0);
    f.images.shift()(); // The real Options loader completes after native scene start.
    assert.equal(pips.filter(x => x === 0).length, 2);
    assert.deepEqual(displayed(f), []);
    readyFrame(f);
    assert.equal(displayed(f).at(-1), 'Volume, Fixture music, 2 of 10');
    window.cursorRight(false);
    assert.equal(pips.slice(-10).filter(x => x === 0).length, 3);
    readyFrame(f);
    assert.equal(displayed(f).at(-1), 'Fixture music, 3 of 10');
    window.setVolumeConfig('bgmVolume', 26, false);
    window.redrawItem(0);
    readyFrame(f);
    assert.deepEqual(displayed(f).slice(-2), ['Fixture music, 3 of 10', 'Fixture music, 3 of 10']);
    window.cursorPagedown();
    assert.equal(window.index(), 0);
    assert.equal(drawn.at(-1), 'OFF');
    readyFrame(f);
    assert.equal(displayed(f).at(-1), 'Display, Fixture full screen, OFF');
    const epoch = f.epoch();
    scene.doSystemButton(-1);
    assert.equal(f.epoch(), epoch);
    window.changeValue('fullscreen', c.ConfigManager.fullscreen);
    assert.equal(f.epoch(), epoch);
    window.changeValue('fullscreen', true);
    readyFrame(f);
    assert.equal(f.epoch(), 0);
    assert.equal(nativeEnters, 1);
    assert.equal(displayed(f).at(-1), 'Display, Fixture full screen, OFF');
    c.ConfigManager.developerMode = true;
    c.Graphics._onKeyDown({ keyCode: 115, preventDefault() {} });
    assert.equal(nativeEnters, 2);
    assert.equal(c.Graphics._wqaResize.pending, 2);
    nativeWindow.isFullscreen = true;
    Object.assign(c.window, { innerWidth: 1920, innerHeight: 1080 });
    c.Graphics._updateCanvas = () => assert.equal(f.epoch(), 0);
    c.Graphics._onWindowResize();
    window.redrawItem(0);
    f.windowTimers.shift()();
    readyFrame(f);
    assert.equal(f.epoch(), 0);
    assert.equal(c.Graphics._wqaResize.pending, 1);
    f.windowTimers.shift()();
    assert.equal(f.epoch(), 0, 'native terminal still waits for postrender');
    readyFrame(f);
    assert.equal(drawn.at(-1), 'ON');
    assert.equal(displayed(f).at(-1), 'Display, Fixture full screen, ON');
    window.changeValue('fullscreen', false);
    assert.equal(nativeLeaves, 1);
    assert.equal(f.epoch(), 0);
    nativeWindow.isFullscreen = false;
    Object.assign(c.window, { innerWidth: 1100, innerHeight: 660 });
    c.Graphics._onWindowResize();
    window.redrawItem(0);
    readyFrame(f);
    assert.equal(f.epoch(), 0, 'the restore event precedes the game’s final resize');
    f.windowTimers.shift()();
    assert.deepEqual(windowSize, [1280, 720]);
    readyFrame(f);
    assert.equal(f.epoch(), 0, 'resizeTo return alone does not prove new geometry');
    Object.assign(c.window, { innerWidth: 1280, innerHeight: 720 });
    c.Graphics._onWindowResize();
    readyFrame(f);
    assert.equal(displayed(f).at(-1), 'Display, Fixture full screen, OFF');
    assert.notEqual(f.epoch(), 0);
    scene.doSystemButton(-1);
    assert.equal(f.nativeClose(), 0);
    scene.doSystemButton(0);
    assert.equal(f.epoch(), 0);
    assert.equal(f.nativeClose(), 1);
}

{
    const f = fixture();
    const c = f.context;
    c.Graphics._updateAllElements();
    f.nwWindow.enterFullscreen = () => {};
    c.Graphics._requestFullScreen();
    for (let count = 0; count < 60; count++) f.windowTimers.shift()();
    assert.equal(f.windowTimers.length, 0);
    assert.equal(c.Graphics._wqaResize.failed, true);
    assert.equal(c.Graphics._wqaResize.pending, 0);
    c.Graphics._onWindowResize();
    assert(c.Graphics._wqaResize, 'a timeout plus a resize cannot establish readiness');

    c.Graphics._requestFullScreen();
    f.nwWindow.isFullscreen = true;
    f.windowTimers.shift()();
    assert(c.Graphics._wqaResize, 'successful mode alone cannot open admission');
    Object.assign(c.window, { innerWidth: 1920, innerHeight: 1080 });
    c.Graphics._onWindowResize();
    assert.equal(c.Graphics._wqaResize, null);
}

{
    const f = fixture();
    const c = f.context;
    // A successful mode change can retain the size already applied by the renderer.
    Object.assign(c.window, { innerWidth: 1920, innerHeight: 1080 });
    c.Graphics._updateAllElements();
    f.nwWindow.enterFullscreen = () => {};
    c.Graphics._requestFullScreen();
    f.nwWindow.isFullscreen = true;
    f.windowTimers.shift()();
    assert.equal(c.Graphics._wqaResize, null);
}

for (const [withDave, selection] of [[false, 'continue'], [true, 'continue'], [true, 'dave'], [true, 'title']]) {
    const f = fixture();
    const c = f.context;
    const painted = [];
    const addedLabels = [];
    const scene = f.show(new c.Scene_Gameover(), new c.Window_Selectable());
    function CommandWindow(rect) {
        f.show(scene, this);
        this._list = [];
        this._container = {};
        this.initialize(rect);
    }
    CommandWindow.prototype = Object.assign(Object.create(c.Window_HorzCommand.prototype), {
        addCommand(name, symbol) { this._list.push({ name, symbol }); },
        currentSymbol() { return this._list[this._index].symbol; },
        callOkHandler: c.Window_Command.prototype.callOkHandler,
        drawItem(index) { painted.push(this._list[index].symbol); },
        drawText(label) { addedLabels.push(label); },
        itemLineRect() { return new c.Rectangle(0, 0, 200, 30); },
        itemTextAlign: () => 'center', resetTextColor() {},
        paint() { for (let index = 0; index < this._list.length; index++) this.drawItem(index); }
    });
    c.Window_HorzCommand = CommandWindow;
    Object.assign(scene, {
        createWindowLayer() {}, gameoverCommandItemRect() {},
        addWindow(window) { window.parent = this; }, onLoadSuccess() {}
    });
    c.$gameSwitches = { _data: [] };
    c.$gameSwitches._data[16] = withDave;
    c.DataManager.GetLastLoadedFile = () => 2;
    let reject;
    c.DataManager.loadGame = slot => {
        assert.equal(f.epoch(), 0);
        assert.equal(slot, 2);
        return { then: () => ({ catch: callback => { reject = callback; } }) };
    };
    scene.createCommandWindow();
    c.SceneManager.onSceneStart();
    readyFrame(f);
    assert.deepEqual(displayed(f), []);
    assert.deepEqual(painted, []);
    f.images.shift()(); // Run UIGeneral's exact skin-load callback against the attached window.
    assert.deepEqual(painted, withDave ? ['title', 'dave', 'continue'] : ['title', 'continue']);
    assert.equal(addedLabels.length, 1);
    assert.deepEqual(displayed(f), []);
    readyFrame(f);
    assert.equal(f.messages.at(-1).tryAgain, !withDave);
    if (withDave) {
        scene._commandWindow.select(2);
        readyFrame(f);
        assert.equal(f.messages.at(-1).tryAgain, true);
    }
    scene._commandWindow.select(scene._commandWindow._list.findIndex(item => item.symbol === selection));
    readyFrame(f);
    scene._commandWindow.processOk();
    assert.equal(f.epoch(), 0);
    if (selection !== 'title') {
        assert.equal(scene.isDaveWarping, selection === 'dave');
        reject();
        assert.equal(c.SceneManager._nextScene._wqaRetryFailed, true);
    } else {
        assert.equal(reject, undefined);
    }
    assert(c.SceneManager._nextScene instanceof c.Scene_Title);
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
console.log('Verified native file, Options and retry presentation, fullscreen settlement, and close-before-entry.');
