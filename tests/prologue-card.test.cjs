'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createCredits } = require('../src/dialogue/credits');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const nativeMap = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw/data/Map039.json'), 'utf8'));
const list = nativeMap.events[3].pages[2].list;
const spec = list[2].parameters[3];
assert.equal(+spec.id, 5);
const renderer = new EventEmitter(), records = [];
const scene = { _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
const spriteset = scene._spriteset = { parent: scene };
const container = spriteset._pictureContainer_upper = { parent: spriteset, children: [] };
const picture = { _text: spec.text, _opacity: 0, _duration: 120 };
const card = { parent: container, _pictureId: 5, worldVisible: true, worldAlpha: 1 };
const text = card._textSprite = { parent: card, _currentString: spec.text, _dirty: false,
    worldVisible: true, worldAlpha: 1, worldTransform: { tx: 320, ty: 240 } };
text.children = [...spec.text].map(() => ({ parent: text, worldVisible: true, worldAlpha: 1,
    bitmap: { isReady: () => true }, scale: { x: 1, y: 1 } }));
container.children.push(card);
const root = { $gameMap: { _mapId: 39, _interpreter: { _list: list } },
    $gameScreen: { _pictures: { 5: picture }, _brightness: 255 }, $gamePlayer: {}, $gameMessage: { isBusy: () => false } };
const graphics = { width: 640, height: 480, frameCount: 0, app: { stage: scene, renderer } };
const reader = createCredits(root, { graphics, manager: { _scene: scene }, hasFocus: () => true, screenFading: () => false },
    { open(record) { records.push(record);return 1; }, focus(_epoch, record) { records.push(record);return true; }, close() {} }, () => ({}));
function frame() { graphics.frameCount++;reader.observe(scene);renderer.emit('postrender'); }
frame();assert.equal(records.length, 0);
picture._duration = 0;picture._opacity = 255;
reader.observe(scene);assert.equal(records.length, 0);renderer.emit('postrender');
assert.equal(formatSpeech(records[0]), spec.text);
for (let n = 0; n < 5; n++) frame();assert.equal(records.length, 1, 'stable rendered card does not repeat');
assert(reader.command(scene, 'details'));assert.equal(formatSpeech(records[1]), spec.text);
root.$gameScreen._brightness = 0;frame();assert.equal(reader.owner(scene), null);
console.log('Verified the native post-Hope prologue card, initial fade gate, actual glyph ownership, postrender speech, repeat and fade retirement.');
