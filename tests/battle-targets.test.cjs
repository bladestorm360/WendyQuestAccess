'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBattleTargets } = require('../src/battle/targets');
const { nativeTextHost } = require('./native-text-host.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'targets'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const states = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw/data/States.json'), 'utf8'));
const renderer = new EventEmitter();
const input = new Set();
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0,
    isActive: () => true, isBusy: () => false, updateBattleProcess() { c.BattleManager.isBusy(); } };
let spriteBusy = false;
let displayedFill = 0;
const battle = { _phase: 'input', _inputting: true, _targets: [], _spriteset: { isBusy: () => spriteBusy },
    _logWindow: { isBusy: () => false }, selectNextCommand() {}, isActionCommandCanceable() { return this._currentActionCommand?._cancelable; } };
const action = { _targetIndex: 0, makeTargets() { return nativeTargets(enemies[this._targetIndex]); } };
battle._subject = { currentAction: () => action };
const enemies = [makeEnemy(), makeEnemy(), makeEnemy()];
function makeEnemy() { return { alive: true, isAlive() { return this.alive; }, originalName: () => 'Same name' }; }
function nativeTargets(...targets) {
    Object.defineProperty(targets, 'contains', { value: targets.includes });
    return targets;
}
let cancellations = 0;
const sprites = [];
const c = vm.createContext({
    ...nativeTextHost(), Scene_Battle: function () {}, Scene_Message: function () {}, Sprite_Enemy: function () {},
    Sprite_EnemyGauge: function () {}, Sprite_StateIcon: function () {}, ActionCommand: function () {},
    ActionCommandResult: function () { this.Cancel = () => {}; },
    a2_0x990531() { throw Error('Unresolved battle property'); },
    a0_0x453a8f() { throw Error('Unresolved action property'); },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer } }, BattleManager: battle,
    $gameScreen: { update() {} }, $gameTimer: { update() {} }, $gameMessage: { isBusy: () => false },
    $gameTroop: { _interpreter: {}, members: () => enemies }, $dataStates: states,
    ImageManager: { iconWidth: 32, iconHeight: 32 }, Game_BattlerBase: { ICON_BUFF_START: 32, ICON_DEBUFF_START: 48 },
    TextManager: { param: index => index === 2 ? 'Attack' : '' },
    AudioManager: { playSe() {} }, Input: { isTriggered: key => input.delete(key) },
    BattleHelper: { CanSelectEnemy: () => true, GetAliveEnemySprites: () => sprites.filter(sprite => sprite._enemy.isAlive()),
        HideAllSelectionArrow() {} },
    Time: { GetGameTime: () => 0, GetDeltaTime: () => 1 / 60 },
    Approach(from, to, delta) { return from < to ? Math.min(from + delta, to) : Math.max(from - delta, to); }
});
c.Scene_Message.prototype.update = () => {
    for (const sprite of sprites) {
        sprite.updateUIVisibility();
        sprite.updateSelected();
    }
};
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
const nativeSceneUpdate = c.Scene_Battle.prototype.update;
function visible(parent) { return { parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } }; }
function makeSprite(enemy, x, name, rate) {
    const sprite = Object.assign(new c.Sprite_Enemy(), { _enemy: enemy, x, y: x, _isSelected: false,
        worldVisible: true, worldAlpha: 1, setBlendColor() {}, revertToNormal() {} });
    sprite._selectorIconPivot = { parent: sprite };
    sprite._selectorIcon = { ...visible(sprite._selectorIconPivot), visible: false, worldVisible: false };
    sprite._nameSprite = Object.assign(new c.Sprite_Text().setText(name), { parent: sprite, alpha: 0, worldAlpha: 0 });
    sprite._nameSprite.update();
    sprite._gaugeSprite = Object.assign(new c.Sprite_EnemyGauge(), visible(sprite), {
        _battler: enemy, _statusType: 'hp', gaugeRate: () => rate, gaugeBackColor: () => '',
        gaugeColor1: () => '', gaugeColor2: () => ''
    });
    Object.assign(sprite._gaugeSprite.bitmap, { width: 64, fillRect() {},
        gradientFillRect(_x, _y, width) { displayedFill = width; } });
    return sprite;
}
sprites.push(makeSprite(enemies[0], 70, 'Same name', 1));
sprites.push(makeSprite(enemies[1], 10, 'Same name', 0.37));
sprites.push(makeSprite(enemies[2], 90, 'Hidden name', 0));
scene._spriteset = { _enemySprites: sprites };
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);

const messages = [];
const liveContexts = new Map();
let epoch = 0;
const settings = { indexing: true, autodetail: true };
const observer = createBattleTargets(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { liveContexts.set(++epoch, live); messages.push(formatSpeech(record)); return epoch; },
    focus(id, record) { assert(liveContexts.get(id)()); messages.push(formatSpeech(record)); },
    close(id) { liveContexts.delete(id); }
}, () => settings);
let observations = 0;
c.WendyQuestAccessBattleTargetReady = scene => { observations++; observer.observe(scene); };
c.WendyQuestAccessBattleTargetLeaving = observer.retire;
function draw() {
    for (const sprite of sprites) {
        sprite._nameSprite.worldAlpha = sprite._nameSprite.alpha;
        sprite._selectorIcon.worldVisible = sprite._selectorIcon.visible;
    }
    renderer.emit('postrender');
}

battle._targets = nativeTargets(enemies[0]);
scene.update();
draw();
assert.equal(observations, 0, 'battle entry cannot call the observer');
scene._wqaBattleStarted = true;
spriteBusy = true;
scene.update();
draw();
assert.equal(observations, 0, 'native busy prevents observation');
spriteBusy = false;
const start = performance.now();
scene.update();
assert.equal(messages.length, 0, 'native selection awaits postrender');
draw();
const first = performance.now() - start;
assert.equal(messages[0], 'Same name 2: 100%');
assert.equal(messages.length, 1, 'Autodetail does not repeat HP from the focus label');
assert.equal(observations, 1);
for (let frame = 0; frame < 300; frame++) { nativeSceneUpdate.call(scene); draw(); }
assert.equal(observations, 1, 'unchanged targets do not run the observer per frame');

battle._phase = 'ActionCommand';
battle._currentActionCommand = Object.assign(new c.ActionCommand(), { _cancelable: true, SetTargets() {},
    _coroutineContainer: { coroutine: { Cancel() { assert.equal(liveContexts.size, 0); cancellations++; } } } });
scene.update();
draw();
assert.equal(messages.at(-1), 'Same name 2: 100%');
input.add('left');
scene.update();
draw();
scene.update();
draw();
assert.equal(messages.at(-1), 'Same name 1: 35%');
const page = observer.controlOwner(scene);
assert(observer.command(page, 'details'));
sprites[1]._gaugeSprite.drawGaugeRect(0, 0, 64, 5);
assert.equal(displayedFill, 22);
assert.match(messages.at(-1), /HP 35%/);
sprites[1]._battlerName = 'GoldenArcher';
sprites[1].texture = { valid: true };
enemies[1].battlerName = () => 'GoldenArcher';
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /gold plate.*pointed helmet.*curved gold bow.*lowered arrow/);
enemies[1].battlerName = () => 'GoldenArcherVAR1';
assert(observer.command(page, 'details'));
assert.doesNotMatch(messages.at(-1), /gold plate|orange visor/, 'do not describe a changed enemy using stale art');
sprites[1]._battlerName = 'GoldenArcherVAR1';
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /bright orange visor/);
enemies[1].battlerName = () => 'Axoflopl';
sprites[1]._battlerName = 'Axoflopl';
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /floppy bacon.*fan out like gills/);
assert(observer.command(page, 'reviewLast'));
assert.doesNotMatch(messages.at(-1), /bacon/);
enemies[1].battlerName = () => 'LilSaltyVar1';
sprites[1]._battlerName = 'LilSaltyVar1';
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /pale pink.*jagged mouth.*clawed feet/);
assert(observer.command(page, 'reviewLast'));
assert.doesNotMatch(messages.at(-1), /clawed feet/, 'ordinary review does not request appearance');

const selectedSprite = sprites[1];
const selectedEnemy = selectedSprite._enemy;
let activeIcon = 65;
selectedEnemy.isActor = () => false;
selectedEnemy.allIcons = () => [activeIcon];
const icon = selectedSprite._stateIconSprite = Object.assign(new c.Sprite_StateIcon(), visible(selectedSprite), {
    _battler: selectedEnemy, _animationIndex: 0, setFrame(x, y, width, height) { this._frame = { x, y, width, height }; }
});
Object.assign(icon.bitmap, { width: 576, height: 720 });
icon.updateIcon();
icon.updateFrame();
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /Frozen or frosted/);
activeIcon = states.find(state => state?.name === 'Burning').iconIndex;
icon.updateIcon();
assert(observer.command(page, 'details'));
assert.doesNotMatch(messages.at(-1), /Burning|Frozen/);
icon.updateFrame();
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /Burning/);
activeIcon = 42;
icon.updateIcon();
icon.updateFrame();
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /Attack up, strong/);
icon.worldVisible = false;
assert(observer.command(page, 'details'));
assert.doesNotMatch(messages.at(-1), /Attack/);

battle._targets = nativeTargets(enemies[0], enemies[1], enemies[0]);
scene.update();
draw();
assert.equal(messages.at(-1), 'Same name 1: 35%, Same name 2: 100%');
assert.doesNotMatch(messages.at(-1), /clawed feet/, 'group highlight with Autodetail does not request appearance');
assert(observer.command(observer.controlOwner(scene), 'details'));
assert.match(messages.at(-2), /clawed feet/);
assert(observer.command(observer.controlOwner(scene), 'reviewLast'));
assert.match(messages.at(-1), /Same name 2, HP 100%, 2 of 2/);
// Target identity is required even when optional menu indexing is off.
settings.indexing = false;
for (const sprite of sprites) {
    sprite._nameSprite.setText('Blandhawk');
    sprite._nameSprite.update();
    sprite._gaugeSprite.gaugeRate = () => 1;
    sprite._enemy.originalName = () => 'Blandhawk';
}
battle._targets = nativeTargets(...enemies);
scene.update(); draw();
assert.equal(messages.at(-1), 'Blandhawk 1: 100%, Blandhawk 2: 100%, Blandhawk 3: 100%');
for (const [enemy, ordinal] of [[enemies[1], 1], [enemies[0], 2], [enemies[2], 3]]) {
    battle._targets = nativeTargets(enemy, enemy);
    scene.update(); draw();
    assert.equal(messages.at(-1), 'Blandhawk ' + ordinal + ': 100%');
    assert.doesNotMatch(messages.at(-1), /enemy|Target|of 3/i);
}
settings.indexing = true;
battle._targets = nativeTargets(enemies[0], enemies[1]);
scene.update(); draw();

enemies[0].alive = false;
assert.equal(observer.controlOwner(scene), null);
battle._currentActionCommand.Cancel();
assert.equal(cancellations, 1);
assert.equal(liveContexts.size, 0);
assert.equal(scene._wqaBattleTargetControl, false);

battle._phase = 'input';
battle._targets = nativeTargets(enemies[1]);
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1);
battle._subject.currentAction = () => { assert.equal(scene._wqaBattleTargetActive, false); return null; };
battle.startAction();
draw();
assert.equal(liveContexts.size, 0, 'accepted native action cancels pending render');
console.log('Verified native battle target rendering, directional change, repeat hits, HP fill, rendered status icons, cancellation and handback.');
console.log('Throttled target selection through a synthetic render and formatted receipt', first.toFixed(2), 'ms.');