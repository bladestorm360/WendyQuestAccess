'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { fixture, mapData } = require('./map-lifecycle.test.cjs');

const packageRoot = path.join(process.argv[2], 'package.nw');
const producer = path.join(__dirname, 'map-producers.py');

function install(f, kind) {
    const methods = JSON.parse(execFileSync('python', ['-B', '-W', 'ignore::SyntaxWarning', producer, packageRoot, kind],
        { encoding: 'utf8', timeout: 6000, maxBuffer: 16000 }));
    for (const method of methods) f.run(method);
}

function sprite(parent, other = {}) {
    return { parent, visible: true, worldVisible: true, worldAlpha: 1, texture: { valid: true }, ...other };
}

function verifySplash() {
    const f = fixture(mapData(13));
    const { c } = f;
    Object.assign(c, {
        a16_0x55d438() { throw Error('Unresolved splash property'); },
        Scene_Splash: function () {}, TouchInput: { isPressed: () => false },
        Clamp1: value => Math.min(1, Math.max(0, value)),
        InverseLerp: (a, b, value) => (value - a) / (b - a),
        Lerp: (a, b, ratio) => a + (b - a) * ratio
    });
    c.DataManager.isAnySavefileExists = () => false;
    c.Input.isPressed = () => false;
    c.Scene_Splash.TIME_FOR_WENDY = 120;
    c.Scene_Splash.TIME_FOR_81MONKEY = 140;
    install(f, 'splash');
    const scene = new c.Scene_Splash();
    Object.assign(scene, { _started: true, _active: true, _fadeDuration: 1, _fadeOpacity: 255,
        stop() { assert.equal(f.epoch(), 0); },
        _backSprite: sprite(scene), _81monkeysBack: { alpha: 0 },
        _81monkeys: sprite(scene, { alpha: 0, _frame: { x: 0, y: 0 }, SetAnimationSpeed() {} }) });
    c.SceneManager._scene = c.Graphics.app.stage = scene;
    scene.initWaitCount();
    function tick() { scene.checkSkip(); scene.updateWaitCount(); f.frame(); }
    function announcements() {
        return f.packets.filter(packet => packet.kind === 'splashCard').map(formatSpeech);
    }
    tick();
    assert.deepEqual(announcements(), [], 'native fade blocks the first card');
    scene._fadeDuration = scene._fadeOpacity = 0;
    tick();
    tick();
    assert.deepEqual(announcements(), ["Wendy's Studios presents"]);
    scene._waitCount = 138;
    tick();
    assert.equal(f.epoch(), 0, 'the first card closes when the native studio phase starts');
    assert.equal(announcements().length, 1, 'an early animation frame has no full developer caption');
    const atlas = JSON.parse(fs.readFileSync(path.join(packageRoot, 'img/system/81monkeysSplashLogo.json'), 'utf8'));
    const final = atlas.animations[0].frames.at(-1);
    scene._81monkeys._frame = { x: final.x * atlas.frameWidth, y: final.y * atlas.frameHeight };
    tick();
    tick();
    assert.deepEqual(announcements(), ["Wendy's Studios presents", 'Developed by 81monkeys']);
    assert(f.epoch());
    scene.gotoTitle();
    assert.equal(f.epoch(), 0, 'the title constructor is not allowed to keep splash output admitted');
}

async function verifyInteraction() {
    const data = mapData(13);
    const f = fixture(data);
    const { c } = f;
    const player = c.$gamePlayer;
    const map = c.$gameMap;
    const sounds = [];
    const chest = data.events[14];
    const target = Object.assign(f.event(14, 0), {
        x: chest.x, y: chest.y, _pageIndex: 0, _trigger: chest.pages[0].trigger,
        _walkAnime: chest.pages[0].walkAnime, _moveType: chest.pages[0].moveType, _moveRoute: chest.pages[0].moveRoute,
        isNormalPriority: () => chest.pages[0].priorityType === 1,
        isTriggerIn(triggers) { return triggers.includes(this._trigger); },
        lock() { assert.equal(f.epoch(), 0); },
        GetCenter() { return { x: this.x, y: this.y }; }
    });
    map.fixtureEvents.push(target);
    Object.assign(map, {
        _mapId: 13, _nameDisplay: false, event: id => id === 14 ? target : null,
        roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
        roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0)
    });
    Object.assign(player, {
        x: chest.x - 1, y: chest.y, _x: chest.x - 1, _y: chest.y, _realX: chest.x - 1, _realY: chest.y,
        _direction: 4, _nextDirection: 4, _vehicleType: 'walk', _eventWasRunning: false,
        isMoving: () => false, direction() { return this._direction; }
    });
    Object.assign(c.Graphics, { width: 1280, height: 720 });
    c.Input.deviceType = { MOUSE: 1, KEYBOARD: 2, GAMEPAD: 3, TOUCH_DEVICE: 4 };
    c.Input.GetLastInputDeviceType = () => c.Input.deviceType.KEYBOARD;
    c.AudioManager.playSe = sound => sounds.push(sound.name);
    Object.assign(c, {
        WorldX: x => x, WorldY: y => y,
        GetIndicesOf: (needle, text) => [text.indexOf(needle)],
        Game_Player_prototype_update() { this._direction = this._nextDirection; },
        EaseFunction: {},
        Sprite_Animated: function (asset) {
            Object.assign(this, { asset, worldVisible: true, worldAlpha: 1, texture: { valid: false } });
        },
        VFXBody: class {
            constructor() { Object.assign(this, { visible: true, worldVisible: true, worldAlpha: 1, scale: { x: 1, y: 1 }, children: [] }); }
            chainBegin() { return this; }
            addTween() { return this; }
            chainEnd() { return this; }
            start() { return this; }
            addOnComplete() { return this; }
            destroyOnEnd() { return this; }
            addChild(child) { this.children.push(child); child.parent = this; }
            destroy() { this.parent = null; }
        }
    });
    f.run('String.prototype.contains = String.prototype.includes;');
    install(f, 'interaction');
    c.Scene_Map.prototype.addChild = function (child) { child.parent = this; };
    c.Scene_Map.prototype.updateMainMultiply = () => player.update();
    player.reserveTransfer(13, player.x, player.y, 2, 0);
    c.SceneManager.goto(c.Scene_Map);
    c.SceneManager.changeScene();
    c.DataManager.ready = c.ImageManager.ready = true;
    c.SceneManager.updateScene();
    await new Promise(setImmediate);
    const scene = c.Graphics.app.stage;
    scene._fadeDuration = scene._fadeOpacity = 0;
    c.SceneManager.updateScene();
    f.idleCallbacks.shift()();
    function tick() { c.SceneManager.updateScene(); f.frame(); }
    tick();
    player._nextDirection = 6;
    tick();
    assert(sounds.includes('WQ/Menu/SFX_InteractPop'), 'the native chest produces the original cue');
    assert.match(player._interactIcon.children[0].asset, /InteractKeyboard_Icon/);
    const announcements = () => f.packets.filter(packet => packet.kind === 'interactionPrompt').map(formatSpeech);
    assert.deepEqual(announcements(), [], 'unpainted artwork is silent');
    player._interactIcon.children[0].texture.valid = true;
    tick();
    tick();
    assert.deepEqual(announcements(), ['Interact']);
    const first = player._interactIcon;
    player._nextDirection = 4;
    tick();
    assert.equal(f.epoch(), 0, 'the native icon closing retires the cue');
    player._nextDirection = 6;
    tick();
    assert.notEqual(player._interactIcon, first);
    player._interactIcon.children[0].texture.valid = true;
    tick();
    assert.deepEqual(announcements(), ['Interact', 'Interact'], 'a new native pop may repeat the instruction');
    target.start();
    assert.equal(f.epoch(), 0, 'native acceptance closes the cue before event setup');
    target.clearStartingFlag();
    player._nextDirection = 4;
    tick();
    player._nextDirection = 6;
    tick();
    player._interactIcon.children[0].texture.valid = true;
    tick();
    assert(f.epoch());
    player.reserveTransfer(19, 8, 8, 2, 0);
    assert.equal(f.epoch(), 0, 'transfer closes pending interaction output before loading');
}

async function main() {
    verifySplash();
    await verifyInteraction();
    console.log('Verified both native splash cards and the authored Crispy Beach interaction icon, including lifecycle retirement.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
