'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTreasureReward } = require('../src/world/treasure-reward');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const game = process.argv[2];
const native = JSON.parse(execFileSync('python', [path.join(__dirname, 'treasure-producers.py'), game],
    { encoding: 'utf8', timeout: 8000, maxBuffer: 25000 }));
const read = name => JSON.parse(fs.readFileSync(path.join(game, 'package.nw', 'data', name + '.json'), 'utf8'));
const items = read('Items');
const common = read('CommonEvents');
const ruins = new Set([161, 162, ...Array.from({ length: 17 }, (_, index) => index + 164), 207, 208]);
const popups = [];
let maps = 0;
let ruinsText = 0;
for (const info of read('MapInfos').filter(Boolean)) {
    maps++;
    const map = read('Map' + String(info.id).padStart(3, '0'));
    for (const event of map.events.filter(Boolean)) {
        for (const page of event.pages) {
            const commands = page.list;
            const popup = commands.find(({ code, parameters }) => code === 357 &&
                parameters[0] === 'WendyQuest' && parameters[1] === 'ShowRewardTokens');
            if (popup) popups.push({ map: info.id, event: event.id, popup });
            if (ruins.has(info.id) && page.image.characterName === 'TREASURE CHEST SPECIAL' &&
                !popup && commands.some(command => command.code === 101)) ruinsText++;
        }
    }
}
assert.equal(maps, 239);
assert.equal(popups.length, 25);
assert.equal(popups.filter(reward => ruins.has(reward.map)).length, 19);
assert.equal(ruinsText, 2);
assert(common[62].list.some(({ code, parameters }) => code === 126 && parameters[0] === 2));

function exercise({ popup }, action) {
    const renderer = new EventEmitter();
    const scene = { _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true,
        _fadeDuration: 0, _fadeOpacity: 0, _spriteset: { children: [] }, _wqaTreasureDue: 0 };
    scene._spriteset.parent = scene;
    scene._spriteset.addChild = function (sprite) { this.children.push(sprite); sprite.parent = this; };
    const manager = { _scene: scene };
    const graphics = { width: 800, height: 600, frameCount: 1, app: { stage: scene, renderer } };
    const root = { $gameMap: { inactiveTime: 0, _interpreter: { _list: [popup], wait(value) { this._waitCount = value; } } },
        $gamePlayer: {}, $gameScreen: { _brightness: 255 }, $gameMessage: { isBusy: () => false }, $dataItems: items };
    const speech = [];
    let valid;
    const reward = createTreasureReward(root, { manager, graphics, hasFocus: () => true, screenFading: () => false }, {
        open(record, ready) { speech.push(formatSpeech(record)); valid = ready; return 1; },
        close(id) { assert.equal(id, 1); }
    });
    reward.leave(undefined);
    reward.update(undefined);
    const animation = () => {
        const body = {};
        const text = value => {
            const sprite = { parent: body, worldVisible: true, worldAlpha: 1, _dirty: true,
                _currentString: value, children: [] };
            sprite.children = Array.from(value, () => ({ parent: sprite, worldVisible: true, worldAlpha: 1,
                bitmap: { isReady: () => true }, scale: { x: 1, y: 1 } }));
            return sprite;
        };
        const result = { _body: body, _coinSprite: { parent: body, texture: { valid: false },
            worldVisible: true, worldAlpha: 1, scale: { x: 1, y: 1 } },
        _numberSprite: text('x' + popup.parameters[3].Amount), _titleSprite: text('You got') };
        body.parent = result;
        return result;
    };
    const sandbox = {
        SceneManager: manager, Graphics: graphics, $gameMap: root.$gameMap, WendyQuest: {},
        RewardTokenAnimation: function (amount) { assert.equal(amount, +popup.parameters[3].Amount); return animation(); },
        Game_Interpreter: function () {}, Utils: { extractFileName: value => value },
        PluginManager: {
            registerCommand(_plugin, _name, call) { this.call = call; },
            callCommand(owner, plugin, name, args) {
                if (plugin === 'WendyQuest' && name === 'ShowRewardTokens') this.call.call(owner, args);
            }
        },
        WendyQuestAccessTreasureStarted: reward.started
    };
    vm.createContext(sandbox);
    vm.runInContext(native.reward, sandbox);
    vm.runInContext(native.command, sandbox);
    const interpreter = new sandbox.Game_Interpreter();
    interpreter.command357(['WendyQuest', 'HideStatusUI', '', {}]);
    assert.equal(scene._wqaTreasureDue, 0);
    interpreter.command357(popup.parameters);
    assert.equal(root.$gameMap._interpreter._waitCount, 190);
    const sprite = scene._spriteset.children[0];
    const update = () => { graphics.frameCount = scene._wqaTreasureDue; reward.update(scene); };
    update();
    renderer.emit('postrender');
    assert.deepEqual(speech, [], 'nothing is spoken before the artwork appears');
    sprite._coinSprite.texture.valid = true;
    sprite._titleSprite._dirty = sprite._numberSprite._dirty = false;
    update();
    assert.equal(speech.length, 0, 'a native update cannot announce before paint');
    if (action === 'transfer') root.$gamePlayer._transferring = true;
    renderer.emit('postrender');
    if (action === 'transfer') {
        assert.deepEqual(speech, []);
        assert.equal(scene._wqaTreasureDue, 0);
        return;
    }
    const amount = popup.parameters[3].Amount;
    assert.deepEqual(speech, ["You got " + amount + " Hero's Idol" + (amount === '1' ? '' : 's') + '.']);
    assert(valid());
    update();
    renderer.emit('postrender');
    assert.equal(speech.length, 1);
    sprite._exit = true;
    update();
    assert(!valid());
    assert.equal(scene._wqaTreasureDue, 0);
}

for (const popup of popups) exercise(popup);
exercise(popups[0], 'transfer');
console.log('Audited 239 maps and replayed all 25 native reward popups, including 19 Lost Ruins and the animated ice chest.');
