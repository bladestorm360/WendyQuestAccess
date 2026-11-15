'use strict';

const assert = require('node:assert/strict');
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
assert.equal(Object.keys(clips).length, 29);
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
        assert.equal(row.code, visual > 0 ? 213 : visual === -1 ? 224 : visual === -2 ? 250 : switched ? 121 : 205, key);
        if (visual > 0) {
            assert.equal(row.parameters[0] || e, actor, key);
            assert.equal(row.parameters[1], visual, key);
        }
    }
}
assert.equal(locators.size, 138);
for (const id of ['frostyna-idea','frostyna-prison-blast','frostyna-reaction','frygor-frustration','wendy-knocks','wendy-door-reaction']) {
    const [m, e, p, i, actor, , visual] = cues[id].beats[0];
    const candidate = { _characterName: actor === -1 ? 'Wendy' : 'NPC' };
    const status = { _brightness: 255, _flashColor: [0,0,0,0] };
    const data = map(m);
    const interpreter = {_index:i, _mapId:m, _eventId:e, _list:data.events[e].pages[p].list};
    const renderer = new EventEmitter();
    const tilemap = {};
    const effects = {};
    const sprite = { _character:candidate, _characterName:candidate._characterName, parent:tilemap, worldVisible:true, worldAlpha:1,
        texture:{valid:true}, worldTransform:{tx:100,ty:100} };
    const spriteset = {_tilemap:tilemap, _effectsContainer:effects, _characterSprites:[sprite], _balloonSprites:[]};
    const scene = {_wqaFieldReady:true, _wqaMapRestored:true, _mapLoaded:true, _started:true, _active:true, srcWendy:true, srcStones:true,
        _spriteset:spriteset, _fadeDuration:0, _fadeOpacity:0};
    const graphics = {app:{stage:scene,renderer}, frameCount:0, width:640,height:480};
    const played = [];
    const root = {
        ArrayBuffer, DataView, Uint8Array,
        $gameMap:{_mapId:m,_interpreter:interpreter,_events:{[actor]:candidate}},
        $dataMap:data, $gameScreen:status, $gamePlayer:actor === -1 ? candidate : {},
        XMLHttpRequest: class {
            open() {}
            send() {
                Object.assign(this, { status: 200, response });
                this.onloadend();
            }
        },
        Blob: class { constructor(parts) { this.parts = parts; } },
        URL: {
            createObjectURL(blob) {
                assert.deepEqual(blob.parts[0], clips[id]);
                return id;
            },
            revokeObjectURL() {}
        },
        Audio: class {
            canPlayType() { return true; }
            addEventListener() {}
            play() { played.push(this); }
            pause() { this.paused = true; }
            removeAttribute() { this.src = ''; }
            load() {}
        }
    };
    const narration = createNarration(root,{graphics,manager:{_scene:scene},screenFading:()=>false,hasFocus:()=>true},
        ()=>({enabled:true,narration:{enabled:true,volume:65,playbackPercent:200}}));
    const activeList = interpreter._list;
    interpreter._list = null;
    narration.warm(scene);
    interpreter._list = activeList;
    narration.accepted(scene,{...interpreter,_list:[]},candidate,undefined,visual);
    assert(!scene._wqaNarrationActive);
    narration.accepted(scene,interpreter,candidate,undefined,visual);
    narration.present(scene);
    assert.equal(played.length,0);
    if (visual > 0) spriteset._balloonSprites.push({...sprite,parent:effects,_balloonId:visual,
        _duration:30,targetObject:candidate,_target:sprite});
    if (visual === -1) status._flashColor[3] = 255;
    narration.present(scene);
    assert.equal(played.length,0);
    renderer.emit('postrender');
    assert.equal(played[0]?.src,id);
    assert.equal(played[0].playbackRate,2);
    narration.leave(scene);
    assert(played[0].paused);
}
console.log('Verified the 29 clip containers, all 138 authored beat locators, and six prison cues from acceptance through rendering and retirement.');
