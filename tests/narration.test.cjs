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
assert.equal(Object.keys(clips).length, 147);
const locators = new Set();
for (const [id, { beats }] of Object.entries(cues)) {
    assert.equal(Buffer.from(clips[id]).subarray(0, 4).toString('hex'), '1a45dfa3');
    for (const [m, e, p, i, actor, switched, visual] of beats) {
        const data = map(m);
        const row = data.events[e].pages[p].list[i];
        assert(actor === -1 || data.events[actor]);
        const key = [m, e, p, i].join('/');
        assert(!locators.has(key));
        locators.add(key);
        assert.equal(row.code, visual === -6 ? switched ? 121 : [117, 205, 232, 250].find(code => code === row.code) : visual > 0 ? 213 : visual === -1 ? 224 : [-2, -3, -4].includes(visual) ? 250 : visual === -5 ? 117 : switched ? 121 : 205, key);
        if (visual > 0) {
            assert.equal(row.parameters[0] || e, actor, key);
            assert.equal(row.parameters[1], visual, key);
        }
    }
}
assert.equal(locators.size, 294);
assert.match(cues['party-vanishes'].text, /gather into her.*party fits on the elevator/);
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
            play() { this.id = this.src; this.paused = false; if (!this.started) played.push(this);this.started = true; }
            pause() { this.paused = true; }
            removeAttribute() { this.src = ''; }
            load() {}
        }
    };
    const host = { graphics, manager: { _scene: scene }, screenFading: () => status._fadeOutDuration > 0, hasFocus: () => true };
    const narration = createNarration(root, host, () => playback);
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
    return { scene, graphics, root, host, interpreter, nativeMap, renderer, spriteset, status, switches,
        played, playback, narration, actor, balloon, frame };
}

const sceneCommands=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
    path.join(stock,'package.nw'),'narration-commands'],{encoding:'utf8',timeout:5000}));
function commandContext(f) {
    const c=vm.createContext({...f.root,Game_Interpreter:function(){},SceneManager:{_scene:f.scene},Graphics:f.graphics,
        WendyQuestAccessNarrationAccepted:f.narration.accepted,
        WendyQuestAccessNarrationPausing:f.narration.pause,
        WendyQuestAccessNarrationFading:scene=>f.narration.pause(scene,true)});
    // Definitions run under the shared CPU cap; this is a fixture watchdog, not a game-frame budget.
    for(const method of sceneCommands)vm.runInContext(method,c,{timeout:500});
    return c;
}
for (const id of ['double-first-entrance', 'elder-tater-freed']) {
    for (const [m, e, p, i, a, switched] of cues[id].beats) {
        const f = fixture(m, e, p), { candidate, sprite } = f.actor(a);
        Object.assign(candidate, { _realX: 3, _realY: 3, forceMoveRoute(route) { this._moveRoute = route; } });
        if (switched) candidate._characterName = sprite._characterName = '';
        Object.assign(f.interpreter, { _index: i, character: () => candidate, setWaitMode() {} });
        f.nativeMap.refreshIfNeeded = () => {};
        f.root.$gameSwitches.setValue = (key, value) => value ? f.switches.add(key) : f.switches.delete(key);
        const c = commandContext(f), row = f.interpreter._list[i];
        assert(c.Game_Interpreter.prototype['command' + row.code].call(f.interpreter, row.parameters));
        f.frame(); assert.equal(f.played.length, 0, 'the authored command alone is not a rendered change');
        if (switched) candidate._characterName = sprite._characterName = '~ElderTater';
        else candidate._realY++;
        f.frame(false); assert.equal(f.played.length, 0);
        f.renderer.emit('postrender'); assert.equal(f.played[0]?.id, id);
        assert.equal(f.played[0].playbackRate, 2);
        f.narration.leave(f.scene); assert(f.played[0].paused);
    }
}
console.log('Verified all four first-Mech entrances and cell-opening branches through native commands and actual rendered movement/reveal.');

for(const visible of [false,true]) {
    const f=fixture(98,19,0),player=f.actor(-1),follower=f.actor(3);
    follower.candidate._memberIndex=1;follower.sprite.worldVisible=visible;
    f.interpreter._index=34;
    const common=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/CommonEvents.json'),'utf8'));
    const actors=new Map([2,3,4,5].map(id=>[id,{graphic:'Companion',setCharacterImage(name){this.graphic=name;},setFaceImage(){},setBattlerImage(){}}]));
    const c=commandContext(f);c.$dataCommonEvents=common;c.$gameActors={actor:id=>actors.get(id)};
    player.candidate.refresh=()=>{follower.candidate._characterName=actors.get(3).graphic;};
    Object.assign(f.interpreter,{isOnCurrentMap:()=>true,setupChild(list){this._childInterpreter={_list:list};}});
    assert(c.Game_Interpreter.prototype.command117.call(f.interpreter,[65]));
    assert.equal(f.interpreter._childInterpreter._list,common[65].list);f.frame();assert.equal(f.played.length,0);
    for(const row of common[65].list.filter(row=>row.code===322))
        assert(c.Game_Interpreter.prototype.command322.call(f.interpreter,row.parameters));
    assert([...actors.values()].every(actor=>actor.graphic===''));
    f.frame();assert.equal(f.played.length,0,'wait for the native sprite to reflect its cleared graphic');
    follower.sprite._characterName='';f.frame(false);assert.equal(f.played.length,0);f.renderer.emit('postrender');
    assert.equal(f.played[0]?.id,visible?'party-vanishes':undefined);
}
{
    const f=fixture(97,8,1),chomps=f.actor(8),player=f.actor(-1);
    f.interpreter._index=10;f.narration.accepted(f.scene,f.interpreter,chomps.candidate,undefined,6);
    f.balloon(6,chomps.candidate,chomps.sprite);f.frame();assert.equal(f.played[0]?.id,'hazy-chomps');
    Object.assign(player.candidate,{_realX:3,_realY:12,forceMoveRoute(route){this._moveRoute=route;}});
    Object.assign(f.interpreter,{_index:56,character:()=>player.candidate,setWaitMode(){}});
    const c=commandContext(f);f.nativeMap.refreshIfNeeded=()=>{};
    assert(c.Game_Interpreter.prototype.command205.call(f.interpreter,f.interpreter._list[56].parameters));
    f.frame();assert.equal(f.played.length,1);player.candidate._realY=11;f.frame();
    assert.equal(f.played.length,1);assert(!f.played[0].paused,'the door description queues behind the dizzy reaction');
    f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id,'chomps-door-open');
}
console.log('Verified the old-RPG companion disappearance through native common/actor commands, prior visibility and actual cleared sprite; native post-smash movement and noninterrupting Chomps queue.');

const emoteMethods = JSON.parse(execFileSync('python', ['-B', path.join(__dirname, 'map-producers.py'),
    path.join(stock, 'package.nw'), 'music-emotes'], { encoding: 'utf8', timeout: 5000 }));
let musicCost = 0, faceCost = 0, faceCases = 0;
assert(!Object.values(cues).some(cue => /anger mark/i.test(cue.text)));
for (const [id, { beats, text }] of Object.entries(cues).filter(([name, cue]) =>
    name.startsWith('music-') || name.startsWith('heart-') || cue.beats.some(beat => beat[6] === 5))) {
    if (beats[0][6] === 5) assert.match(text, /^A spiral-eyed face appears over .+\.$/);
    for (const [m, e, p, i, a, , visual] of beats) {
        const f = fixture(m, e, p), { candidate, sprite } = f.actor(a);
        if (m === 12 && visual === 3) { candidate._characterName = sprite._characterName = '';sprite.texture.valid = false; }
        f.interpreter._index = i;f.interpreter.character = () => candidate;
        f.interpreter.setWaitMode = mode => f.interpreter._waitMode = mode;
        const native = vm.createContext({ Game_Interpreter: function () {}, SceneManager: { _scene: f.scene },
            Graphics: f.graphics, $gameMap: f.nativeMap,
            $gameTemp: { requestBalloon() {} },
            WendyQuestAccessNarrationAccepted: f.narration.accepted });
        for (const method of emoteMethods) vm.runInContext(method, native);
        const at = performance.now();
        assert(native.Game_Interpreter.prototype.command213.call(f.interpreter, [a === e ? 0 : a, visual, true]));
        assert.equal(f.interpreter._waitMode, 'balloon');
        f.frame();assert.equal(f.played.length, 0, 'sound/request alone is not a rendered reaction');
        f.balloon(2, candidate, sprite);f.frame();assert.equal(f.played.length, 0, 'a question mark is not the selected reaction');
        f.balloon(visual, candidate, sprite);
        const balloon = f.spriteset._balloonSprites.at(-1);balloon.worldTransform = { tx: 100, ty: 100 };
        candidate._erased = true;f.frame();assert.equal(f.played.length, 0);candidate._erased = false;
        balloon.worldVisible = false;f.frame();assert.equal(f.played.length, 0);balloon.worldVisible = true;
        f.frame(false);assert.equal(f.played.length, 0);f.renderer.emit('postrender');
        assert.equal(f.played[0]?.id, id, 'the named clip follows its actual painted balloon');
        if (visual === 5) { faceCost += performance.now() - at;faceCases++; }
        else if (visual === 3) musicCost += performance.now() - at;
        f.narration.accepted(f.scene, f.interpreter, candidate, undefined, visual);f.frame();
        assert.equal(f.played.length, 1, 'one accepted-command guard within the active context');
        f.played[0].emit('ended');f.frame();
        assert(!f.scene._wqaNarrationActive);
        f.spriteset._balloonSprites = [];f.balloon(visual, candidate, sprite);
        f.spriteset._balloonSprites[0].worldTransform = { tx: 100, ty: 100 };
        f.narration.accepted(f.scene, f.interpreter, candidate, undefined, visual);f.frame();
        assert.equal(f.played[1]?.id, id, 'a new real activation is not text-deduplicated');
    }
}
assert.equal(faceCases, 24, 'all authored spiral-eyed balloon sites exercise the native producer');
console.log('Verified all 24 spiral-eyed reactions, 16 corrected named clips and absence of anger-mark wording.');
console.log('Throttled 24 separate spiral-face description episodes', faceCost.toFixed(2), 'ms total.');
// Both Tatoria pages use command 1: selecting a cue must include native list identity.
{
    const f = fixture(24, 4, 0), { candidate, sprite } = f.actor(4);
    f.interpreter._index = 1;f.narration.accepted(f.scene, f.interpreter, candidate, undefined, 3);
    f.balloon(3, candidate, sprite);f.frame();assert.equal(f.played.length, 0);
    f.narration.accepted(f.scene, f.interpreter, candidate, undefined, 5);
    f.balloon(5, candidate, sprite);f.frame();assert.equal(f.played[0]?.id, 'anger-tatoria');
}
{
    const f = fixture(105, 5, 0), kathryn = f.actor(7), toby = f.actor(8);
    f.interpreter._index = 14;f.narration.accepted(f.scene, f.interpreter, kathryn.candidate, undefined, 3);
    f.balloon(3, kathryn.candidate, kathryn.sprite);f.frame();
    assert.equal(f.played[0]?.id, 'music-kathryn');
    f.interpreter._index = 36;f.narration.accepted(f.scene, f.interpreter, toby.candidate, undefined, 3);
    f.balloon(3, toby.candidate, toby.sprite);f.frame();assert.equal(f.played.length, 1);
    assert(!f.played[0].paused, 'the next reaction does not interrupt the playing description');
    f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id, 'music-toby');
}
assert.equal(Object.values(cues).flatMap(cue => cue.beats).filter(beat => beat[6] === 4).length, 13);
console.log('Verified all 13 heart locators and eight named clips through native command213 and actual rendered heart balloons.');
console.log('Verified every authored musical-note locator through native command213, actual balloon visibility, repeat activation, page identity and uninterrupted named queue.');
console.log('Throttled eleven complete music description episodes', musicCost.toFixed(2), 'ms.');

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
console.log('Verified 147 clips, 294 authored locators, shrine reactions/glows and underground camera reveal, native cold idle warmup, 15 idle cues, and uninterrupted named reaction order.');

require('./finale-narration.cjs')(fixture, commandContext, stock);
require('./screen-jolt.cjs')(fixture, commandContext, stock);
require('./environment-narration.cjs')(fixture, commandContext, stock);
require('./reaction-audit.cjs')(fixture, commandContext, stock, emoteMethods);

require('./question-narration.cjs')(fixture, commandContext, stock, emoteMethods);

require('./narration-continuity.cjs')(fixture, commandContext, emoteMethods);

require('./tyler-entry.cjs')(fixture, commandContext, stock, emoteMethods);

// Momentum descriptions use the native branch, actual rendered crystal and
// the established FIFO; a later crystal cannot interrupt the first recording.
{
 const f=fixture(12,8,0);f.scene._wqaBattleStarted=true;
 f.scene._wqaMapRestored=false;const field=f.spriteset._battleField={};
 const sprite=full=>({parent:field,phase:0,_full:full,_frame:{x:0,y:32,width:32,height:32},
  bitmap:{isReady:()=>true},worldVisible:true,worldAlpha:1,texture:{valid:true},worldTransform:{tx:120,ty:110}});
 const normal=sprite(false),capped=sprite(true);
 assert(f.narration.momentumAccepted(f.scene,normal));assert(f.narration.momentumAccepted(f.scene,capped));
 assert.equal(f.played.length,0);f.frame();assert.equal(f.played[0].id,'momentum-collected');
 normal.phase=capped.phase=2;f.frame();assert.equal(f.played.length,1);
 f.played[0].emit('ended');f.frame();assert.equal(f.played[1].id,'momentum-full');
 assert.match(cues['momentum-collected'].text,/flies into the Momentum meter/);
 assert.match(cues['momentum-full'].text,/momentum crystal.*starburst.*breaking sound/);
 f.narration.leave(f.scene);assert(f.played[1].paused);
 console.log('Verified both rendered Momentum branches and uninterrupted recorded-caption order.');
}

// NVDA uses original captions without reading the pack or creating audio.
{
 const f=fixture(13,5,6,false),captions=[];
 f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
 f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};
 f.root.XMLHttpRequest=class{constructor(){throw Error('NVDA must not read recordings');}};
 f.root.Audio=class{constructor(){throw Error('NVDA must not create audio');}};
 f.playback.enabled=false;f.playback.narration.volume=0;
 const sleeper=f.actor(17);f.interpreter._index=16;
 assert(f.narration.accepted(f.scene,f.interpreter,sleeper.candidate,undefined,10));
 f.balloon(10,sleeper.candidate,sleeper.sprite);f.frame();
 assert.equal(captions[0],cues['sleeping-wendy'].text);assert.equal(f.played.length,0);
 assert.equal(f.narration.needsPack,false);
 f.narration.cancel(f.scene);
 f.scene._wqaBattleStarted=true;f.scene._wqaMapRestored=false;
 const field=f.spriteset._battleField={},crystal={parent:field,phase:0,_full:true,_frame:{y:32},
  bitmap:{isReady:()=>true},worldVisible:true,worldAlpha:1,texture:{valid:true},worldTransform:{tx:10,ty:10}};
 assert(f.narration.momentumAccepted(f.scene,crystal));f.frame();assert.equal(captions[1],cues['momentum-full'].text);
 console.log('Verified NVDA story/Momentum captions with sounds muted, no pack reads or Audio objects.');
}
