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

async function verifyInteraction(mapId, eventId, pageIndex = 0, testPathfinder = false) {
    const data = mapData(mapId);
    const f = fixture(data);
    const { c } = f;
    const player = c.$gamePlayer;
    const map = c.$gameMap;
    const sounds = [];
    const entry = data.events[eventId];
    const page = entry.pages[pageIndex];
    const blocker = entry.pages[0].list.find(command =>
        command.code === 357 && command.parameters[1] === 'SetBlocker')?.parameters[3];
    const x = entry.x + Number(blocker?.minX || 0) - 1;
    const target = Object.assign(f.event(eventId, pageIndex), {
        x: entry.x, y: entry.y, _x: entry.x, _y: entry.y, _pageIndex: pageIndex, _trigger: page.trigger,
        _walkAnime: page.walkAnime, _moveType: page.moveType, _moveRoute: page.moveRoute,
        _priorityType: page.priorityType, _through: page.through,
        isNormalPriority: () => page.priorityType === 1,
        isTriggerIn(triggers) { return triggers.includes(this._trigger); },
        lock() { assert.equal(f.epoch(), 0); }
    });
    if (blocker) target.blockerProperties = { x1: Number(blocker.minX), y1: Number(blocker.minY),
        x2: Number(blocker.maxX), y2: Number(blocker.maxY) };
    map._events = [];
    map._events[eventId] = target;
    map.fixtureEvents.push(target);
    Object.assign(map, {
        _mapId: mapId, _tilesetId: data.tilesetId, _nameDisplay: false, event: id => map._events[id],
        _tileEvents: [], _vehicles: [],
        roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
        roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0)
    });
    Object.assign(player, {
        x, y: entry.y, _x: x, _y: entry.y, _realX: x, _realY: entry.y,
        _direction: 4, _nextDirection: 4, _vehicleType: 'walk', _eventWasRunning: false,
        isMoving: () => false, direction() { return this._direction; }
    });
    Object.assign(c.Graphics, { width: 1280, height: 720 });
    c.Input.deviceType = { MOUSE: 1, KEYBOARD: 2, GAMEPAD: 3, TOUCH_DEVICE: 4 };
    c.Input.GetLastInputDeviceType = () => c.Input.deviceType[eventId === 53 ? 'GAMEPAD' : 'KEYBOARD'];
    c.AudioManager.playSe = sound => sounds.push(sound.name);
    Object.assign(c, {
        WorldX: x => x - player.x + c.Graphics.width / 64,
        WorldY: y => y - player.y + c.Graphics.height / 64,
        Point: function (x, y) { this.x = x; this.y = y; },
        Lerp: (a, b, t) => a + (b - a) * t,
        $dataTilesets: JSON.parse(fs.readFileSync(path.join(packageRoot, 'data/Tilesets.json'), 'utf8')),
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
    player.reserveTransfer(mapId, player.x, player.y, 2, 0);
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
    const announcements = () => f.packets.filter(packet => packet.kind === 'interactionPrompt').map(formatSpeech);
    if (testPathfinder) {
        f.dispatchWindowEvent('keydown', { key: 'k', keyCode: 75 });
        tick();
        const request = f.routePackets.at(-1);
        assert(request?.request.candidates.some(candidate => candidate.event === eventId));
        player._nextDirection = 6;
        tick();
        player._interactIcon.children[0].texture.valid = true;
        tick();
        assert.deepEqual(announcements(), [], 'an in-flight pathfinder read keeps its priority');
        f.routeReply({ map: mapId, sequence: request.sequence, epoch: request.epoch,
            result: { status: 'reachable', available: new Uint8Array(request.request.candidates.length).fill(1) } });
    } else player._nextDirection = 6;
    tick();
    assert(sounds.includes('WQ/Menu/SFX_InteractPop'), 'the native target produces the original cue');
    assert.match(player._interactIcon.children[0].asset, eventId === 53 ? /InteractGamepad_Icon/ : /InteractKeyboard_Icon/);
    if (!testPathfinder) {
        assert.deepEqual(announcements(), [], 'unpainted artwork is silent');
        player._interactIcon.children[0].texture.valid = true;
        tick();
    }
    tick();
    assert.deepEqual(announcements(), ['Interact'], 'a finished pathfinder request leaves the visible icon eligible');
    if (testPathfinder) {
        const targetSpeech = f.packets.find(packet => packet.kind === 'fieldTarget');
        const promptSpeech = f.packets.find(packet => packet.kind === 'interactionPrompt');
        assert.equal(promptSpeech.epoch, targetSpeech.epoch);
        assert.equal(promptSpeech.append, true, 'the prompt follows the pathfinder read in the same speech context');
    }
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
    await verifyInteraction(13, 14);
    await verifyInteraction(16, 51, 1, true);
    await verifyInteraction(16, 53, 0, true);
    console.log('Verified the native chest, ice block and statue prompts, including pathfinder handback and lifecycle retirement.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
