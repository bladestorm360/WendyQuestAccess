'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const vm = require('node:vm');
const { nativeTextHost } = require('./native-text-host.cjs');
const { createMenuObserver } = require('../src/menus/observer');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning', path.join(__dirname, 'menu-producers.py'),
    process.argv[2], 'save'], { encoding: 'utf8', timeout: 6000, maxBuffer: 48 * 1024 }));

async function check({ count = 0, late = false, failed = false, brokenAnimation = false } = {}) {
    const renderer = new EventEmitter();
    const host = nativeTextHost();
    const { Sprite, Sprite_Text } = host;
    function Scene_Base() { this.initialize(); }
    Scene_Base.prototype = Object.create(Sprite.prototype);
    function Scene_Menu() { Scene_Base.call(this); }
    Scene_Menu.prototype = Object.create(Scene_Base.prototype);
    for (const name of ['setBitmapFont', 'setDrawColour', 'setOutline', 'setAlignment', 'setShadow', 'setShadowDraw'])
        Sprite_Text.prototype[name] = function () { return this; };
    Sprite_Text.prototype.delete = function () { this.parent?.removeChild(this); };
    const routines = [];
    const packets = [];
    const callbacks = [];
    let sequence = 0;
    let active = 0;
    let write;
    const c = vm.createContext({
        ...host, Scene_Base, Scene_Menu, Scene_Menu_prototype_update: Sprite.prototype.update,
        TouchInput: { isClicked: () => false }, SceneManager: {}, Graphics: { app: { renderer }, width: 640, height: 360 },
        Time: { GetDeltaTime: () => 1 / 60 }, SoundManager: { playSave() {} },
        CoroutineManager: { StartAnonymousCoroutine(task) { routines.push(task()); } },
        console: { log() {} },
        DataManager: { GetLastLoadedFile: () => 2, saveGame(slot) {
            assert.equal(slot, 2);
            assert.equal(c.SceneManager._wqaNativeAutosaves, 1);
            return new Promise((resolve, reject) => { write = { resolve, reject }; });
        } },
        $gameSystem: { ...host.$gameSystem, onBeforeSave() {} }, InverseLerp: (from, to, value) => (value - from) / (to - from),
        Clamp1: value => Math.max(0, Math.min(1, value)),
        a16_0x55d438() { throw Error('Unresolved menu property'); },
        a18_0x5c60() { throw Error('Unresolved save property'); }
    });
    for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

    const scene = c.SceneManager._scene = c.Graphics.app.stage = Object.assign(new Scene_Menu(), {
        _active: true, _started: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {},
        saveCount: count, playtime: () => 90, playtimeText: () => '00:01:30',
        onAutosaveFailure() { callbacks.push('failed'); }
    });
    if (brokenAnimation) scene.onAutosaveSuccess = () => { throw Error('Synthetic success animation failure'); };
    const window = scene._commandWindow = { parent: scene._windowLayer, active: true, worldVisible: true, worldAlpha: 1,
        openness: 255, contentsOpacity: 255, contents: { isReady: () => true }, _index: 0, innerWidth: 120, innerHeight: 48,
        _list: [{ symbol: 'save', name: 'Save' }], itemRect: () => ({ x: 0, y: 0, width: 100, height: 32 }),
        activate() { this.active = true; }
    };
    const observer = createMenuObserver(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true }, {
        open(record, live) { assert(live()); packets.push(record); return active = ++sequence; },
        close(id) { if (active === id) active = 0; },
        focus(id, record) { assert.equal(id, active); packets.push(record); }
    }, () => ({}));
    c.WendyQuestAccessMenuReady = observer.observe;
    c.WendyQuestAccessMenuLeaving = observer.retire;
    function frame(render = true) {
        scene.update();
        for (let index = routines.length - 1; index >= 0; index--)
            if (routines[index].next().done) routines.splice(index, 1);
        for (const banner of scene.children)
            for (const glyph of banner.children) glyph.worldAlpha = glyph.alpha ?? 1;
        if (render) renderer.emit('postrender');
    }

    frame();
    assert.equal(formatSpeech(packets.at(-1)), 'Menu, Save');
    window.active = false;
    scene.commandSave();
    assert.equal(active, 0, 'the native command retires menu speech before writing');
    frame();
    const nativeBanner = scene._wqaMenuSave.banner;
    assert.equal(nativeBanner.parent, scene);
    for (let index = 0; index < (late ? 120 : 22); index++) frame();
    assert.equal(packets.length, 1, 'save feedback cannot precede completed storage');
    if (late) {
        assert.equal(nativeBanner.parent, null);
        assert.equal(scene._wqaMenuSave.bannerDone, true);
    }

    if (failed) write.reject(Error('Synthetic save failure'));
    else write.resolve();
    await new Promise(setImmediate);
    assert.equal(c.SceneManager._wqaNativeAutosaves, 0);
    assert.deepEqual(callbacks, failed || brokenAnimation ? ['failed'] : []);
    assert.equal(scene._wqaMenuSave.status, failed ? -1 : 1);
    const expected = failed ? 'Could not save the game.' : late ? 'Save completed.' : nativeBanner._currentString;
    let observed = null;
    let receipt = 0;
    for (let index = 0; index < 420; index++) {
        const started = performance.now();
        frame();
        const record = packets.find(packet => packet.kind === 'dialoguePage');
        if (record) {
            observed = record;
            receipt = performance.now() - started;
            break;
        }
    }
    assert(window.active, 'native command handback comes before spoken feedback');
    assert(observed?.append);
    assert.equal(observed.text, expected);
    assert(observer.command(observer.controlOwner(scene), 'details'));
    assert.equal(formatSpeech(packets.at(-1)), expected.split('\n').join('. '));
    if (count === 209) {
        assert(expected.includes('\n'));
        assert(observer.command(observer.controlOwner(scene), 'reviewLast'));
        assert.equal(formatSpeech(packets.at(-1)), expected.split('\n').at(-1));
    }
    return receipt;
}

(async () => {
    const receipt = await check();
    await check({ late: true });
    await check({ failed: true });
    await check({ brokenAnimation: true });
    await check({ count: 209 });
    console.log('Verified the native Save request, confirmed write, expired-banner fallback, failure, callback error and displayed multiline review.');
    console.log('Throttled Save handback through synthetic render and formatted receipt', receipt.toFixed(2), 'ms.');
})().catch(error => { console.error(error); process.exitCode = 1; });
