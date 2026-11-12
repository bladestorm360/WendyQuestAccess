'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot } = require('../src/plugin');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const game = path.join(process.argv[2], 'package.nw');
const read = file => fs.readFileSync(path.join(game, file), 'utf8');
const system = JSON.parse(read('data/System.json'));
const mapData = id => JSON.parse(read(`data/Map${String(id).padStart(3, '0')}.json`));
const custom = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'map-producers.py'), game], { encoding: 'utf8', timeout: 6000, maxBuffer: 64000 }));
const stock = {
    managers: {
        SceneManager: ['goto', 'changeScene', 'updateScene', 'onSceneTerminate', 'onSceneCreate',
            'onBeforeSceneStart', 'onSceneStart', 'isSceneChanging', 'isCurrentSceneBusy', 'clearStack'],
        DataManager: ['saveGame', 'saveGlobalInfo'],
        StorageManager: ['saveObject', 'objectToJson', 'jsonToZip', 'saveZip', 'saveToLocalFile']
    },
    scenes: {
        'Scene_Base.prototype': ['create', 'isActive', 'isReady', 'isStarted', 'start', 'requestAutosave', 'isAutosaveEnabled'],
        'Scene_Map.prototype': ['create', 'isReady', 'onMapLoaded', 'onTransfer', 'onTransferEnd', 'shouldAutosave',
            'updateMapNameWindow', 'isSceneChangeOk']
    },
    objects: {
        'Game_Player.prototype': ['reserveTransfer', 'isTransferring', 'newMapId', 'performTransfer', 'canMove'],
        'Game_Map.prototype': ['isEventRunning', 'isAnyEventStarting', 'setupStartingEvent', 'setupStartingMapEvent',
            'isNameDisplayEnabled'],
        'Game_Event.prototype': ['isStarting', 'clearStartingFlag', 'start', 'updateParallel', 'findProperPageIndex', 'meetsConditions'],
        'Game_Interpreter.prototype': ['setup', 'isRunning', 'clear', 'loadImages', 'setupReservedCommonEvent']
    },
    windows: { 'Window_MapName.prototype': ['open', 'close', 'update', 'updateFadeIn', 'updateFadeOut'] }
};

function fixture(data, failSave = false) {
    const trace = [];
    const bitmapCallbacks = [];
    const idleCallbacks = [];
    const events = new EventEmitter();
    const renderer = new EventEmitter();
    const timers = [];
    const packets = [];
    let admission;
    const c = vm.createContext({
        a15_0x363c12() { throw Error('Unresolved map property'); },
        a18_0x52f0af() { throw Error('Unresolved platform property'); },
        _0x27781d() { throw Error('Unresolved canvas property'); },
        Scene_Base: function () {}, Scene_Message: function () {}, Scene_Map: function () {}, Scene_Title: function () {},
        Scene_Boot: function () {},
        Game_Player: function () {}, Game_Event: function () {}, Game_Map: function () {}, Game_Screen: function () {},
        Game_Interpreter: function () {}, Window_MapName: function () {},
        Game_Event_prototype_onSceneStart: undefined,
        SceneManager: { _scene: null, _nextScene: null, _previousScene: null, isGameActive: () => true },
        Graphics: {
            app: { stage: null, renderer }, startLoading: () => trace.push('loading'), endLoading: () => trace.push('loaded'),
            setStage(scene) { this.app.stage = scene; if (scene) trace.push('stage'); }
        },
        ImageManager: {
            ready: false, isReady() { return this.ready; }, clear: () => trace.push('image clear'),
            loadFace: () => trace.push('event face'), loadPicture: () => trace.push('event picture')
        },
        EffectManager: { isReady: () => true, clear: () => trace.push('effect clear') },
        FontManager: { isReady: () => true },
        Bitmap: { load: () => ({ addLoadListener(callback) { bitmapCallbacks.push(callback); } }) },
        ImageLoader: function (_names, callback) { idleCallbacks.push(() => callback({ GetImage: () => ({}) })); },
        Window_Base: { prototype: { update() {} } },
        DataManager: {
            ready: false, loadMapData: () => trace.push('map read'), isMapLoaded() { return this.ready; },
            isBattleTest: () => false, isEventTest: () => false, GetLastLoadedFile: () => 2,
            makeSavefileInfo: () => ({}), makeSaveContents: () => ({}), makeSavename: id => `slot${id}`,
            _globalInfo: []
        },
        StorageManager: {
            isLocalMode: () => true, fileDirectoryPath: () => 'fixture-only', filePath: name => name,
            fsMkdir() {}, fsUnlink() {}, fsRename() {},
            fsWriteFile(name) {
                trace.push('write ' + name);
                if (failSave) throw Error('Synthetic disk failure');
            }
        },
        JsonEx: { stringify: JSON.stringify }, pako: { deflate: text => text },
        CheckForSteamAchievements: () => trace.push('native start complete'),
        $dataMap: data, $dataSystem: system,
        $gameSystem: { isAutosaveEnabled: () => true, isSaveEnabled: () => true, onBeforeSave() {} },
        $gameTemp: { isCommonEventReserved: () => false, resumeDestination() {}, requestBalloon() {} },
        $gameMessage: { busy: false, isBusy() { return this.busy; } },
        $gameSelfSwitches: { value: key => key[0] === 38 && key[1] === 1 && key[2] === 'A' },
        Input: { _signX: () => 0, _signY: () => 0, HasAnyInput: () => false },
        Time: { _gameTime: 1, GetDeltaTime: () => 1 }, ConfigManager: { developerMode: false },
        AudioManager: { playSe() {} }, BattleManager: { initMembers() {}, makeEscapeRatio() {} },
        $gameTroop: { setup() {} }, Utils: { RPGMAKER_NAME: 'MZ', RPGMAKER_VERSION: '1.8.0' },
        document: { hasFocus: () => true }, setTimeout: callback => timers.push(callback),
        addEventListener: (event, callback) => events.on(event, callback),
        console: { log() {}, warn() {} }
    });
    const run = text => vm.runInContext(text, c, { timeout: 100 });
    for (const [file, groups] of Object.entries(stock)) {
        const source = read(`js/rmmz_${file}.js`);
        for (const [target, methods] of Object.entries(groups)) {
            for (const name of methods) {
                const anchor = `${target}.${name} = function(`;
                const start = source.indexOf(anchor);
                assert(start >= 0 && source.indexOf(anchor, start + anchor.length) < 0, anchor);
                run(source.slice(start, source.indexOf('\n};', start) + 3));
            }
        }
    }
    for (const method of custom) run(method);
    Object.setPrototypeOf(c.Scene_Message.prototype, c.Scene_Base.prototype);
    Object.setPrototypeOf(c.Scene_Map.prototype, c.Scene_Message.prototype);
    c.Scene_Message.prototype.update = function () { this._mapNameWindow.update(); };
    c.$gameScreen = Object.assign(new c.Game_Screen(), { _brightness: 255, _fadeOutDuration: 0, onBattleStart() {} });
    c.$gameMap = Object.assign(new c.Game_Map(), {
        id: 1, _interpreter: new c.Game_Interpreter(), mapId() { return this.id; }, displayName: () => data.displayName,
        events() { return this.fixtureEvents; }, setup(id) { this.id = id; trace.push('map setup'); },
        autoplay: () => trace.push('autoplay'), _nameDisplay: true, inactiveTime: 0,
        refreshIfNeeded() {}, setupTestEvent: () => false, setupAutorunCommonEvent: () => false, fixtureEvents: []
    });
    c.$gamePlayer = Object.assign(new c.Game_Player(), {
        setDirection() {}, locate: () => trace.push('player placed'), refresh() {},
        clearTransferInfo() { this._transferring = false; },
        isMoveRouteForcing: () => false, areFollowersGathering: () => false, isInVehicle: () => false
    });
    const name = Object.assign(new c.Window_MapName(), {
        contentsOpacity: 0, visible: true, worldVisible: true, worldAlpha: 1, openness: 255,
        _showCount: 0, innerWidth: 200, innerHeight: 50, lineHeight: () => 30,
        contents: { clear() {}, blt() {}, context: { resetTransform() {}, scale() {} } },
        drawBackground() {}, drawText(text) { this.drawn = text; }
    });
    Object.assign(c.Scene_Map.prototype, {
        createDisplayObjects() {
            this._mapNameWindow = name;
            this._windowLayer = name.parent = {};
            trace.push('display objects');
        },
        fadeInForTransfer() { this._fadeDuration = this._fadeOpacity = 1; trace.push('fade requested'); },
        forceLeaveVehicle() {}, onSceneUpdate() {}, updateDestination() {}, updateMenuButton() {}, updateMainMultiply() {},
        updateScene() {}, updateWaitCount() {}, stop() { this._active = false; },
        playAutoSaveAnimation: () => trace.push('save animation'), onAutosaveFailure: () => trace.push('save failure')
    });
    function event(id, page) {
        const entry = data.events[id];
        assert(entry);
        return Object.assign(new c.Game_Event(), {
            _mapId: c.$gameMap.mapId(), _eventId: id, _eventUpdateID: -1, _erased: false, _starting: false,
            event: () => entry, eventId: () => id, list: () => entry.pages[page].list, isTriggerIn: () => false,
            deserializeCustomData: () => trace.push('event restored')
        });
    }
    function workerRequire(module) {
        if (module === 'path') return path;
        assert.equal(module, 'worker_threads');
        return { Worker: class extends EventEmitter {
            constructor(_script, options) { super(); admission = new Int32Array(options.workerData); }
            postMessage(packet) { packets.push(packet); }
            unref() {}
        } };
    }
    boot(c, workerRequire, { mainModule: { filename: path.join(game, 'index.html') } });
    function frame() {
        renderer.emit('postrender');
        while (timers.length) timers.shift()();
    }
    return { c, event, name, trace, bitmapCallbacks, idleCallbacks, frame, renderer,
        epoch: () => admission ? Atomics.load(admission, 0) : 0,
        speech: () => packets.filter(packet => packet.kind === 'mapBanner').map(formatSpeech) };
}

async function main() {
    for (const failSave of [false, true]) {
        const data = mapData(19);
        const f = fixture(data, failSave);
        const { c, event, name, trace, bitmapCallbacks, idleCallbacks, frame, epoch, speech } = f;
        c.$gameMap.fixtureEvents.push(event(16, 0));
        c.$gamePlayer.reserveTransfer(19, 8, 8, 2, 0);
        c.SceneManager.goto(c.Scene_Map);
        c.SceneManager.changeScene();
        c.SceneManager.updateScene();
        assert.equal(c.Graphics.app.stage, null);
        c.DataManager.ready = true;
        c.SceneManager.updateScene();
        assert.deepEqual(trace.slice(0, 7), ['map read', 'image clear', 'effect clear', 'loading',
            'map setup', 'player placed', 'display objects']);
        assert.equal(c.Graphics.app.stage, null, 'map data alone does not release presentation');
        c.ImageManager.ready = true;
        c.SceneManager.updateScene();
        assert.deepEqual(trace.slice(7), ['fade requested', 'autoplay', 'event restored', 'native start complete', 'loaded', 'stage']);
        assert(c.Graphics.app.stage instanceof c.Scene_Map);
        assert.equal(name.drawn, undefined);
        bitmapCallbacks.shift()();
        assert.equal(name.drawn, data.displayName);
        assert.equal(name.contentsOpacity, 0, 'drawing to the bitmap is earlier than visible presentation');
        name.update();
        assert(name.contentsOpacity > 0);
        const scene = c.Graphics.app.stage;
        scene._fadeDuration = scene._fadeOpacity = 0;
        c.SceneManager.updateScene();
        idleCallbacks.shift()();
        c.SceneManager.updateScene();
        frame();
        assert.equal(c.SceneManager._wqaNativeAutosaves, 1);
        assert.deepEqual(speech(), [], 'a visible banner cannot start speech during a save');
        await new Promise(setImmediate);
        assert.deepEqual(trace.slice(13), failSave ? ['write slot2', 'save failure'] :
            ['write slot2', 'save animation', 'write global']);
        assert.equal(c.SceneManager._wqaNativeAutosaves, 0);
        scene._fadeDuration = scene._fadeOpacity = 1;
        c.SceneManager.updateScene();
        frame();
        assert.deepEqual(speech(), [], 'completed storage cannot bypass the native fade');
        scene._fadeDuration = scene._fadeOpacity = 0;
        c.SceneManager.updateScene();
        assert.deepEqual(speech(), [], 'the native candidate must pass postrender');
        name.worldAlpha = 0;
        frame();
        assert.deepEqual(speech(), [], 'a transparent window cannot publish speech');
        name.worldAlpha = 1;
        c.SceneManager.updateScene();
        frame();
        assert.deepEqual(speech(), [data.displayName]);
        assert(epoch());
        c.SceneManager.updateScene();
        frame();
        assert.deepEqual(speech(), [data.displayName]);

        const pendingEvent = c.$gameMap.fixtureEvents[0];
        c.ImageManager.loadFace = () => { assert.equal(epoch(), 0); trace.push('event face'); };
        pendingEvent.start();
        assert.equal(c.$gamePlayer.canMove(), false, 'a queued main event already blocks native movement');
        assert(c.$gameMap.setupStartingEvent());
        assert(c.$gameMap._interpreter.isRunning());
        assert(trace.includes('event face'), 'preload happens synchronously inside interpreter setup');
        assert.equal(c.$gamePlayer.canMove(), false);
        c.$gameMap._interpreter.clear();
        assert.equal(c.$gamePlayer.canMove(), true);

        function replay() {
            name.open();
            bitmapCallbacks.shift()();
            c.SceneManager.updateScene();
            frame();
            assert(epoch());
        }
        name.open();
        name.open();
        bitmapCallbacks.shift()();
        c.SceneManager.updateScene();
        frame();
        assert.equal(epoch(), 0, 'an older bitmap callback cannot publish a newer draw');
        bitmapCallbacks.shift()();
        c.SceneManager.updateScene();
        frame();
        assert.deepEqual(speech(), [data.displayName, data.displayName], 'a new native banner may repeat the same text');

        const parallel = new c.Game_Interpreter();
        parallel.setup(pendingEvent.list(), 16);
        assert.equal(epoch(), 0, 'a parallel face preload retires the existing banner');
        replay();
        c.$gameMap.inactiveTime = 29;
        c.$gameTemp.requestBalloon = () => assert.equal(epoch(), 0);
        c.SceneManager.updateScene();
        frame();
        assert.equal(epoch(), 0);
        c.$gameMap.inactiveTime = 0;
        replay();
        c.$gameTroop.setup = () => assert.equal(epoch(), 0);
        c.BattleManager.setup(1, true, false);
        assert.equal(epoch(), 0);

        replay();
        c.Graphics._updateAllElements = () => assert.equal(epoch(), 0);
        c.Graphics._onWindowResize();
        assert.equal(epoch(), 0);

        replay();
        c.$gameScreen.startFadeOut(5);
        assert.equal(epoch(), 0);
        assert.equal(c.$gameScreen._fadeOutDuration, 5);
        c.$gameScreen._fadeOutDuration = 0;

        // The next native transfer can begin between the map update and render.
        const beforeTransfer = speech().length;
        name.open();
        bitmapCallbacks.shift()();
        c.SceneManager.updateScene();
        c.$gamePlayer.reserveTransfer(196, 5, 5, 2, 0);
        frame();
        assert.equal(epoch(), 0);
        assert.equal(speech().length, beforeTransfer);

        c.$gamePlayer._transferring = false;
        replay();
        c.Scene_Boot.prototype.resizeScreen = () => assert.equal(epoch(), 0);
        c.OnWindowSizeChanged();
        assert(c.SceneManager._nextScene instanceof c.Scene_Map);
    }

    const data = mapData(system.startMapId);
    const { c, event, trace } = fixture(data);
    c.$gameMap.id = system.startMapId;
    const intro = event(1, 1);
    c.$gameMap.fixtureEvents.push(intro);
    assert.equal(intro.findProperPageIndex(), 1, 'native page priority selects the opening parallel dialogue');
    assert.equal(data.events[1].pages[1].trigger, 4);
    intro._interpreter = new c.Game_Interpreter();
    intro._interpreter.update = () => trace.push('parallel wait');
    intro.updateParallel();
    assert(intro._interpreter.isRunning());
    assert(trace.includes('event face'));
    assert.equal(c.$gameMap.isEventRunning(), false);
    const scene = new c.Scene_Map();
    scene.updateMoveDetector();
    assert.equal(scene._prevCanMove, true, 'parallel intro can be active while the movement detector is positive');
    c.$gameMessage.busy = true;
    scene.updateMoveDetector();
    assert.equal(scene._prevCanMove, false, 'native dialogue owns movement while it is actually busy');

    for (const id of [system.startMapId, 198, 196]) {
        const entryData = mapData(id);
        const entry = fixture(entryData);
        const { c, name, bitmapCallbacks, idleCallbacks, frame, speech } = entry;
        c.$gamePlayer.reserveTransfer(id, 5, 5, 2, 0);
        c.SceneManager.goto(c.Scene_Map);
        c.SceneManager.changeScene();
        c.DataManager.ready = c.ImageManager.ready = true;
        c.SceneManager.updateScene();
        bitmapCallbacks.shift()();
        await new Promise(setImmediate);
        const scene = c.Graphics.app.stage;
        scene._fadeDuration = scene._fadeOpacity = 0;
        c.SceneManager.updateScene();
        idleCallbacks.shift()();
        c.SceneManager.updateScene();
        frame();
        if (id === 196) {
            assert(name._wqaBannerDrawnRevision > 0);
            assert.deepEqual(speech(), [entryData.displayName], 'the visible secret cave banner remains accessible');
        } else {
            assert.equal(name._wqaBannerDrawnRevision, 0);
            assert.deepEqual(speech(), [], 'unnamed opening or reset maps do not publish a location');
        }
    }
    console.log('Verified installed map lifecycle and visible banner speech through save, fade, event, idle, battle and transfer boundaries.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
