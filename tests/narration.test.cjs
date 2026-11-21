'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createNarration, unpackClips } = require('../src/dialogue/narration');
const cues = require('../src/dialogue/narration-cues.json');
const stock = process.argv[2];
const maps = new Map();
function map(id) {
    if (!maps.has(id)) maps.set(id, JSON.parse(fs.readFileSync(
        path.join(stock, 'package.nw/data', 'Map' + String(id).padStart(3, '0') + '.json'))));
    return maps.get(id);
}
const raw = fs.readFileSync(path.resolve('.build/payload/wendyquest-access/narration.webmpack'));
const response = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const clips = unpackClips(globalThis, response);
assert.equal(Object.keys(clips).length, 79);
const locators = new Set();
for (const [id, { beats }] of Object.entries(cues)) {
    assert.equal(Buffer.from(clips[id]).subarray(0, 4).toString('hex'), '1a45dfa3');
    for (const [m, e, p, i, actor, switched, visual] of beats) {
        const data = map(m);
        const row = data.events[e].pages[p].list[i];
        assert(actor === -1 || data.events[actor]);
        const key = [m, e, i].join('/');
        assert(!locators.has(key));
        locators.add(key);
        assert.equal(row.code, visual > 0 ? 213 : visual === -1 ? 224 : [-2, -3, -4].includes(visual) ? 250 : switched ? 121 : 205, key);
        if (visual > 0) {
            assert.equal(row.parameters[0] || e, actor, key);
            assert.equal(row.parameters[1], visual, key);
        }
    }
}
assert.equal(locators.size, 148);
function fixture(m, e, page, warm = true) {
    const data = m ? map(m) : null;
    const list = data?.events[e].pages[page].list;
    const interpreter = { _mapId: m, _eventId: e };
    const renderer = new EventEmitter();
    const tilemap = {};
    const effects = {};
    const spriteset = { _tilemap: tilemap, _effectsContainer: effects, _characterSprites: [], _balloonSprites: [] };
    const scene = { _wqaFieldReady: true, _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true,
        srcWendy: true, srcStones: true, _spriteset: spriteset, _fadeDuration: 0, _fadeOpacity: 0 };
    const graphics = { app: { stage: scene, renderer }, frameCount: 0, width: 640, height: 480,
        _wqaNarrationEnabled: true };
    const switches = new Set();
    const nativeMap = { inactiveTime: 0, _mapId: m, _interpreter: interpreter, _events: {}, filters: {},
        getFilterController(id) { return this.filters[id]; } };
    const status = { _brightness: 255, _flashColor: [0, 0, 0, 0] };
    const played = [];
    const playback = { enabled: true, narration: { enabled: true, volume: 65, playbackPercent: 200 } };
    const root = {
        ArrayBuffer, DataView, Uint8Array,
        $gameMap: nativeMap, $dataMap: data, $gameScreen: status, $gamePlayer: {},
        $gameSwitches: { value: id => switches.has(id) },
        XMLHttpRequest: class {
            open() {}
            send() { Object.assign(this, { status: 200, response }); this.onloadend(); }
        },
        Blob: class { constructor(parts) { this.bytes = parts[0]; } },
        URL: {
            createObjectURL(blob) {
                const id = Object.keys(clips).find(key => Buffer.from(clips[key]).equals(Buffer.from(blob.bytes)));
                assert(id, 'playback uses a catalog clip');
                return id;
            },
            revokeObjectURL() {}
        },
        Audio: class extends EventEmitter {
            canPlayType() { return true; }
            addEventListener(event, listener) { this.once(event, listener); }
            play() { this.id = this.src; played.push(this); }
            pause() { this.paused = true; }
            removeAttribute() { this.src = ''; }
            load() {}
        }
    };
    const narration = createNarration(root, { graphics, manager: { _scene: scene },
        screenFading: () => false, hasFocus: () => true }, () => playback);
    if (warm) narration.warm(scene);
    interpreter._list = list;
    function actor(id) {
        const candidate = { _characterName: id === -1 ? 'Wendy' : 'NPC' };
        const sprite = { _character: candidate, _characterName: candidate._characterName, parent: tilemap,
            worldVisible: true, worldAlpha: 1, texture: { valid: true }, worldTransform: { tx: 100, ty: 100 } };
        spriteset._characterSprites.push(sprite);
        if (id === -1) root.$gamePlayer = candidate;
        else nativeMap._events[id] = candidate;
        return { candidate, sprite };
    }
    function balloon(id, candidate, sprite) {
        spriteset._balloonSprites.push({ parent: effects, worldVisible: true, worldAlpha: 1,
            texture: { valid: true }, _balloonId: id, _duration: 30, targetObject: candidate, _target: sprite });
    }
    function frame(paint = true) {
        graphics.frameCount++;
        narration.present(scene);
        if (paint) renderer.emit('postrender');
    }
    return { scene, graphics, root, interpreter, nativeMap, renderer, spriteset, status, switches,
        played, playback, narration, actor, balloon, frame };
}

for (const id of ['frostyna-idea', 'frostyna-prison-blast', 'frostyna-reaction',
    'frygor-frustration', 'wendy-knocks', 'wendy-door-reaction']) {
    const [m, e, p, i, a, , visual] = cues[id].beats[0];
    const f = fixture(m, e, p);
    const { candidate, sprite } = f.actor(a);
    f.interpreter._index = i;
    f.narration.accepted(f.scene, { ...f.interpreter, _list: [] }, candidate, undefined, visual);
    assert(!f.scene._wqaNarrationActive);
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, visual);
    if (visual !== -2) f.frame();
    assert.equal(f.played.length, 0);
    if (visual > 0) f.balloon(visual, candidate, sprite);
    if (visual === -1) f.status._flashColor[3] = 255;
    f.frame(false);
    assert.equal(f.played.length, 0);
    f.renderer.emit('postrender');
    assert.equal(f.played[0]?.id, id);
    assert.equal(f.played[0].playbackRate, 2);
    f.narration.leave(f.scene);
    assert(f.played[0].paused);
}

// These sound commands anchor actual rendered camera and particle effects.
for (const [m, e, p, i, a, , visual] of cues['underground-staircase'].beats) {
    const f = fixture(m, e, p);
    const { candidate } = f.actor(a);
    f.nativeMap._displayY = 12;
    f.interpreter._index = i;
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, visual);
    f.frame();
    assert.equal(f.played.length, 0);
    Object.assign(f.spriteset._tilemap, { worldVisible: true, worldAlpha: 1 });
    Object.assign(f.nativeMap, { _scrollDirection: 8, _scrollRest: 4, _displayY: 11.9 });
    f.frame(false);
    assert.equal(f.played.length, 0, 'camera movement must be painted');
    f.renderer.emit('postrender');
    assert.equal(f.played[0]?.id, 'underground-staircase');
}
for (const glow of [false, true]) {
    const f = fixture(197, 18, 0);
    const { candidate } = f.actor(-1);
    f.interpreter._index = 151;
    f.status._pictures = [];
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, -4);
    for (let i = 0; i < 22; i++) f.frame();
    assert.equal(f.played.length, 0, 'sound alone does not describe a chest glow');
    if (glow) {
        const name = 'img/ParticleEffects/LockedChestGlow.json';
        f.status._pictures[1] = { _animated: true, _name: name, _opacity: 255 };
        const parent = f.spriteset._pictureContainer_upper = { children: [] };
        const sprite = { _pictureId: 1, _pictureName: name, _frameAnimator: {}, parent,
            worldVisible: true, worldAlpha: 1, texture: { valid: true }, worldTransform: { tx: -20, ty: 100 } };
        parent.children.push(sprite);
        f.frame();
        assert.equal(f.played.length, 0, 'offscreen glow is not narrated');
        sprite.worldTransform.tx = 100;
        f.frame(false);
        assert.equal(f.played.length, 0);
        f.renderer.emit('postrender');
        assert.equal(f.played[0]?.id, 'sacred-reward-glow');
    } else {
        for (let i = 0; i < 60; i++) f.frame();
        assert.equal(f.played.length, 0, 'no eligible visible glow remains silent');
        assert(!f.scene._wqaNarrationActive);
    }
}
{
    const f = fixture(197, 18, 0);
    const { candidate, sprite } = f.actor(1);
    f.interpreter._index = 77;
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, 1);
    f.frame();
    assert.equal(f.played.length, 0);
    f.balloon(1, candidate, sprite);
    f.frame();
    assert.equal(f.played[0]?.id, 'frostyna-spots-markborg');
}

for (const [m, e, p, i, a, , visual] of cues['idea-dave-statue'].beats) {
    const f = fixture(m, e, p);
    const { candidate, sprite } = f.actor(a);
    candidate._characterName = sprite._characterName = '';
    sprite.texture.valid = false;
    f.interpreter._index = i;
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, visual);
    f.frame();
    assert.equal(f.played.length, 0);
    f.balloon(visual, candidate, sprite);
    const balloon = f.spriteset._balloonSprites[0];
    balloon.worldTransform = { tx: -20, ty: 100 };
    f.frame();
    assert.equal(f.played.length, 0);
    balloon.worldTransform.tx = 100;
    f.frame(false);
    assert.equal(f.played.length, 0);
    f.renderer.emit('postrender');
    assert.equal(f.played[0]?.id, 'idea-dave-statue');
}

const fight = fixture(63, 5, 1);
const { candidate: collapsed } = fight.actor(16);
const frygor = fight.actor(6);
const frostyna = fight.actor(7);
function accept(index, actor, switched, visual) {
    fight.interpreter._index = index;
    fight.narration.accepted(fight.scene, fight.interpreter, actor, switched, visual);
}
fight.switches.add(419);
accept(55, collapsed, 419);
fight.frame();
assert.equal(fight.played[0].id, 'chicken-falls');
accept(58, frygor.candidate, undefined, 1);
accept(59, frostyna.candidate, undefined, 1);
fight.balloon(1, frygor.candidate, frygor.sprite);
fight.balloon(1, frostyna.candidate, frostyna.sprite);
fight.frame();
assert.deepEqual(fight.played.map(clip => clip.id), ['chicken-falls']);
assert(!fight.played[0].paused, 'new descriptions leave existing playback alone');
fight.spriteset._balloonSprites.length = 0;
fight.graphics.frameCount += 150;
fight.played[0].emit('ended');
fight.frame();
assert.equal(fight.played[1].id, 'startled-frygor');
fight.played[1].emit('ended');
fight.frame();
assert.equal(fight.played[2].id, 'startled-frostyna');
assert.equal(cues['startled-frostyna'].text, 'Frostyna is surprised.');
assert.equal(cues['startled-frygor'].text, 'Frygor is surprised.');
accept(58, frygor.candidate, undefined, 1);
fight.balloon(1, frygor.candidate, frygor.sprite);
fight.frame();
fight.narration.leave(fight.scene);
assert(fight.played[2].paused);
fight.played[2].emit('ended');
fight.frame();
assert.equal(fight.played.length, 3, 'native leaving cancels pending descriptions');

// Run the inserted end-of-map-update observer with the game's idle states.
const idleHook = execFileSync('python', ['-B', '-c', [
    'from pathlib import Path',
    'import sys',
    "sys.path.insert(0, 'tools')",
    'from registration import MAP_REL, map_notification',
    'source = map_notification((Path(sys.argv[1]) / MAP_REL).read_bytes()).decode()',
    "start = source.index('    // Sample optional idle effects')",
    "end = source.index('    if (this._wqaFieldReady) {', start)",
    'print(source[start:end])'
].join('\n'), stock], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
const f = fixture(undefined, undefined, undefined, false);
const player = f.actor(-1);
const { scene, nativeMap } = f;
scene._wqaFieldReady = false;
scene.rtSprite = { parent: scene, alpha: 0, worldAlpha: 1, worldVisible: true, texture: { valid: true } };
const observeIdle = vm.runInNewContext('(function () {\n' + idleHook + '\n})', {
    Graphics: f.graphics, $gameMap: nativeMap,
    WendyQuestAccessNarrationPresent: f.narration.present, WendyQuestAccessIdleNarration: f.narration.idle
});
function idle(seconds, paint = true) {
    nativeMap.inactiveTime = seconds;
    f.graphics.frameCount++;
    observeIdle.call(scene);
    if (paint) f.renderer.emit('postrender');
}
function expect(id) {
    const active = f.played.at(-1);
    assert.equal(active.id, id);
    active.emit('ended');
}
assert.equal(f.graphics._wqaNarrationPackFinished, undefined);
nativeMap._needsRefresh = true;
idle(30);
assert.equal(f.graphics._wqaNarrationPackFinished, undefined, 'a pending event-page refresh keeps idle warmup closed');
scene._wqaNonPageRefreshOnly = true;
idle(30.25);
assert.equal(f.graphics._wqaNarrationPackFinished, true, 'native idle can warm the pack with walking controls closed');
assert.equal(f.played.length, 0, 'a requested balloon must render');
f.balloon(2, player.candidate, player.sprite);
idle(30.5, false);
assert.equal(f.played.length, 0);
f.renderer.emit('postrender');
expect('idle-question');
nativeMap._needsRefresh = false;
scene._wqaNonPageRefreshOnly = false;
scene._statusWindow = { offsetY: -15 };
idle(41);
expect('idle-hud-slides');
f.balloon(10, player.candidate, player.sprite);
idle(80.5);
expect('idle-dozes');
idle(134.5);
assert.equal(f.played.length, 4, 'the later sleep animation has its own cue');
scene.rtSprite.alpha = 1;
scene.bgSprite = { alpha: 0.2 };
idle(136.5);
assert.equal(f.played.length, 4, 'the fade waits behind the second sleep cue');
expect('idle-dozes');
f.spriteset._balloonSprites.length = 0;
idle(138);
expect('idle-map-dark');
scene.inactiveDirX = 1;
idle(155);
expect('idle-wendy-glides');
scene.stoneSprites = [{ alpha: 1 }];
idle(176);
expect('idle-stones-appear');
scene.collectedStones = [true, false, false, false];
idle(190);
expect('idle-stone-pickup');
scene.stoneSpin = true;
idle(210);
expect('idle-stones-spin');
scene.trailAlpha = 0.5;
idle(215);
expect('idle-trails');
scene.solitaire = true;
scene.stoneSpin = false;
idle(240);
expect('idle-stones-bounce');
nativeMap.filters.crtFilter = { currentParams: [0, 0, 0.4] };
idle(291);
expect('idle-crt');
nativeMap.filters.displaceFilter = { currentParams: [0, 0, 2] };
idle(341);
expect('idle-ripple');
nativeMap.filters.rgbFilter = { currentParams: [0.5] };
idle(401);
expect('idle-color-split');
scene.rtSkewX = 0.03;
idle(470);
assert.equal(f.played[14].id, 'idle-screen-shifts');
assert.equal(f.played.length, 15);
idle(0);
assert(f.played.at(-1).paused);
assert(!scene._wqaIdleNarrationMask);
f.playback.narration.enabled = false;
f.balloon(2, player.candidate, player.sprite);
idle(30.25);
assert.equal(f.played.length, 15);
f.playback.narration.enabled = true;
idle(30.5, false);
nativeMap._interpreter._list = [{}];
f.renderer.emit('postrender');
assert.equal(f.played.length, 15, 'native event entry retires the pending idle clip');
nativeMap._interpreter._list = null;
idle(30.75);
expect('idle-question');
const nativeMethods = JSON.parse(execFileSync('python', ['-B', path.join(__dirname, 'map-producers.py'),
    path.join(stock, 'package.nw'), 'idle-animation'], { encoding: 'utf8', timeout: 5000 }));
const cold = fixture(undefined, undefined, undefined, false);
const warmRequest = cold.actor(-1);
const requests = [];
cold.nativeMap.inactiveTime = 29.99;
cold.nativeMap.isEventRunning = () => false;
cold.scene._wqaFieldReady = false;
const idleContext = vm.createContext({
    Scene_Map: function () {}, SceneManager: { _scene: cold.scene }, Graphics: cold.graphics,
    ConfigManager: {}, Input: { HasAnyInput: () => false }, Time: { GetDeltaTime: () => 0.02 },
    $gamePlayer: Object.assign(warmRequest.candidate, { isInVehicle: () => false }),
    $gameMap: cold.nativeMap, $gameTemp: { requestBalloon: (actor, id) => requests.push({ actor, id }) },
    AudioManager: { playSe() {} }, a15_0x363c12() { throw new Error('Unresolved idle property'); },
    WendyQuestAccessNarrationPresent: cold.narration.present, WendyQuestAccessIdleNarration: cold.narration.idle
});
for (const code of nativeMethods) vm.runInContext(code, idleContext, { timeout: 100 });
const observeCold = vm.runInContext('(function () {\n' + idleHook + '\n})', idleContext);
idleContext.Scene_Map.prototype.updateInactive.call(cold.scene);
observeCold.call(cold.scene);
assert.equal(cold.graphics._wqaNarrationPackFinished, true);
assert.deepEqual(requests, [{ actor: warmRequest.candidate, id: 2 }]);
assert.equal(cold.played.length, 0);
cold.balloon(2, warmRequest.candidate, warmRequest.sprite);
for (let n = 0; n < 14; n++) {
    idleContext.Scene_Map.prototype.updateInactive.call(cold.scene);
    cold.graphics.frameCount++;
    observeCold.call(cold.scene);
    cold.renderer.emit('postrender');
}
assert.equal(cold.played[0]?.id, 'idle-question', 'the native idle timer starts the first description');
console.log('Verified 79 clips, 148 authored locators, shrine reactions/glows and underground camera reveal, native cold idle warmup, 15 idle cues, and uninterrupted named reaction order.');
