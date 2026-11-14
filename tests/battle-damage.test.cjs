'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createBattleLog } = require('../src/battle/action-log');
const { recordAttackSource } = require('../src/battle/damage-popup');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { nativeTextHost } = require('./native-text-host.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'damage'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const renderer = new EventEmitter();
const host = nativeTextHost();
const { Sprite, Sprite_Text } = host;
const field = new Sprite();
const layer = {};
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0,
    _windowLayer: layer, _spriteset: { _battleField: field, _actorSprites: [], _enemySprites: [], _animationSprites: [] },
    isActive: () => true, isBusy: () => false, updateBattleProcess() { battle.isBusy(); } };
const battle = { _phase: 'action', _spriteset: { isBusy: () => false }, _logWindow: { isBusy: () => true } };
const sceneLog = scene._actionLogWindow = { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255,
    contentsOpacity: 255, contents: { isReady: () => true }, items: [] };
let tick = 1 / 60;
const seen = [];

function Sprite_Damage() { this.initialize(); }
Sprite_Damage.prototype = Object.create(Sprite.prototype);
Sprite_Damage.prototype.damageColor = () => '#ffffff';

function Sprite_Battler() { this.initialize(); this._damages = []; }
Sprite_Battler.prototype = Object.create(Sprite.prototype);
Sprite_Battler.prototype.damageOffsetX = Sprite_Battler.prototype.damageOffsetY = () => 0;
Sprite_Battler.prototype.destroyDamageSprite = function (sprite) {
    this._damages.shift();
    field.removeChild(sprite);
};
function Battler() {}
Object.assign(Battler.prototype, {
    isSpriteVisible: () => true, isAlive: () => true, result() { return this.paintResult; },
    isDamagePopupRequested() { return !!this.paintResult; }, clearDamagePopup() {},
    clearResult() { this.paintResult = null; }
});
function Game_Enemy() {}
Game_Enemy.prototype = Object.create(Battler.prototype);
Game_Enemy.prototype.constructor = Game_Enemy;

for (const name of ['setDrawColour', 'setOutline', 'setAlignment', 'setShadow', 'setShadowDraw', 'setBitmapFont'])
    Sprite_Text.prototype[name] = function () { return this; };
Sprite_Text.prototype.setBlendColor = () => {};
const c = vm.createContext({
    ...host, Sprite_Damage, Sprite_Battler, Game_Enemy, Game_ActionResult: function () {}, Scene_Battle: function () {}, Scene_Message: function () {},
    Sprite_Damage_prototype_initialize: function () { Sprite.prototype.initialize.call(this); this._flashColor = []; },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer }, width: 640, height: 360 }, BattleManager: battle,
    a2_0x990531() { throw Error('Unresolved battle property'); },
    $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} }, $gameTemp: { _animationQueue: [] },
    $gameScreen: { update() {}, startFlash() {} }, $gameTimer: { update() {} },
    Time: { GetDeltaTime: () => tick }, Lerp: (from, to, amount) => from + (to - from) * amount,
    EaseFunction: { EaseOutOver: value => value }, InverseLerp: (from, to, value) => (value - from) / (to - from),
    Clamp1: value => Math.max(0, Math.min(1, value))
});
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);
const log = createBattleLog(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { assert(live()); seen.push(formatSpeech(record)); return 1; },
    focus(_id, record) { seen.push(formatSpeech(record)); }, close() {}
}, () => false);
c.WendyQuestAccessBattleLogReady = log.observe;
c.WendyQuestAccessBattleLogLeaving = log.retire;

const ally = field.addChild(Object.assign(new Sprite_Battler(), { x: 100, y: 130, _battler: new Battler() }));
const enemy = field.addChild(Object.assign(new Sprite_Battler(), { x: 280, y: 125, _battler: new Game_Enemy() }));
const right = field.addChild(Object.assign(new Sprite_Battler(), { x: 430, y: 135, _battler: new Game_Enemy() }));
enemy._battler.originalName = () => 'Golden Archer';
right._battler.originalName = () => 'Lil Pink Salty';
scene._spriteset._actorSprites = [ally];
scene._spriteset._enemySprites = [right, enemy];
const sources = [ally, enemy, right];

c.Scene_Message.prototype.update = () => {
    for (const source of sources) {
        source.updateDamagePopup();
        for (const popup of source._damages) {
            for (const text of popup.children) {
                text.worldTransform = { tx: popup.x + text.x, ty: popup.y + text.y };
                for (const glyph of text.children) glyph.worldAlpha = glyph.alpha ?? 1;
            }
        }
    }
};

function frame() { scene.update(); renderer.emit('postrender'); }
function advance(count) { for (let index = 0; index < count; index++) frame(); }
function result(source, values) {
    source._battler.paintResult = { missed: false, evaded: false, hpAffected: false, mpDamage: 0, ...values };
}

result(ally, { missed: true });
advance(30);
assert.equal(seen.length, 0, 'unsettled battle entry does not enqueue damage');
scene._wqaBattleStarted = true;
c.$gameTemp._animationQueue.push({});
result(enemy, { hpAffected: true, hpDamage: 23, damageStatus: 1, superEffective: 1 });
advance(30);
assert.equal(seen.length, 0, 'native animation admission keeps damage pending');
c.$gameTemp._animationQueue.length = 0;
const first = performance.now();
scene.update();
assert.equal(seen.length, 0, 'even complete glyphs must reach postrender');
renderer.emit('postrender');
const delay = performance.now() - first;
assert.equal(seen[0], 'Golden Archer, 23 HP damage, elemental weakness, boosted.');

result(ally, { hpAffected: true, hpDamage: -8, damageStatus: 0, superEffective: 0 });
result(right, { hpAffected: true, hpDamage: 19, damageStatus: -2, superEffective: -1 });
advance(35);
assert.equal(seen[1], 'Party, 8 HP recovered.');
assert.equal(seen[2], 'Lil Pink Salty, 19 HP damage, elemental resistance, strongly reduced.');

result(ally, { hpAffected: true, hpDamage: 0 });
result(enemy, { evaded: true });
advance(40);
assert.equal(seen[3], 'Golden Archer, miss.');
assert.equal(seen[4], 'Party, blocked.');
result(ally, { mpDamage: -3 });
result(enemy, { missed: true });
advance(25);
assert.equal(seen[5], 'Party, 3 FP.');
assert.equal(seen[6], 'Golden Archer, miss.', 'two painted native events can say the same thing');

const popup = ally._damages.at(-1);
tick = 0;
function measure(update) {
    const savedDuration = popup._duration;
    const start = performance.now();
    for (let index = 0; index < 250; index++) {
        popup._duration = savedDuration;
        update.call(popup);
    }
    return performance.now() - start;
}
const baseline = measure(popup.fixtureNativeUpdate);
const stable = measure(popup.update);
assert.equal(seen.length, 7, 'stable updates queue no duplicate popups');
assert.equal(log.latest(scene).lines.at(-1), 'Golden Archer, miss');
tick = 1 / 60;
advance(180);
right.x = -30;
result(right, { hpAffected: true, hpDamage: 9, damageStatus: 0, superEffective: 0, critical: true });
advance(25);
assert.equal(seen.length, 7, 'a popup beyond the viewport does not speak');
right._damages[0].x = right.x = 430;
frame();
assert.equal(seen.at(-1), 'Lil Pink Salty, 9 HP damage.');

const data = name => JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', name), 'utf8'));
const actors = data('Actors.json');
const skills = data('Skills.json');
ally._actor = ally._battler;
ally._actor.actor = () => actors[1];
ally._battlerName = actors[1].battlerName;
ally._mainSprite = ally.addChild(Object.assign(new Sprite(), { bitmap: { isReady: () => true } }));
for (const sprite of [enemy, right]) sprite._enemy = sprite._battler;
const frygor = scene._spriteset._subActorSprite = field.addChild(Object.assign(new Sprite(), {
    _actor: actors[3], _battlerName: actors[3].battlerName
}));
frygor._mainSprite = frygor.addChild(Object.assign(new Sprite(), { bitmap: { isReady: () => true } }));
let delayed;
frygor.ActionTargetAnimation = () => [6, 60];
c.SkillUtility = { ExtractMetaData: item => item.note ? JSON.parse(item.note.slice(item.note.indexOf('{'))) : {} };
c.BattleHelper = { GetSubActorSprite: id => id === 3 ? frygor : null };
c.AudioManager = { playSe() {} };
c.CoroutineManager = { StartCoroutine(run) { delayed = run.finish; } };
c.OverTime = function (_duration, finish) { this.finish = finish; };
c.WendyQuestAccessAttackSource = (target, performer, subject, companion) =>
    recordAttackSource(scene, target, performer, subject, companion);
battle.applySubstitute = () => enemy._battler;
battle._logWindow.push = () => {};
battle._logWindow.displayActionResults = (_subject, target) => assert.equal(target, enemy._battler);
const action = (item, outcome = { hpAffected: true, hpDamage: 17 }) => ({
    isSkill: () => true, isItem: () => false, item: () => item, rollMissChance() {},
    apply(target) {
        const popupResult = new c.Game_ActionResult();
        popupResult.clear();
        Object.assign(popupResult, { used: true, ...outcome });
        target.paintResult = popupResult;
    }
});
battle._action = action(skills[9]);
battle.invokeNormalAction(ally._battler, right._battler);
assert.equal(enemy._battler.paintResult, null);
delayed(1);
advance(40);
assert.equal(seen.at(-1), 'Frygor to Golden Archer, 17 HP damage.');
battle._action = action({ note: '' });
battle.invokeNormalAction(ally._battler, enemy._battler);
advance(40);
assert.equal(seen.at(-1), 'Golden Archer, 17 HP damage.');
battle.applySubstitute = () => ally._battler;
battle._logWindow.displayActionResults = () => {};
battle.invokeNormalAction(right._battler, ally._battler);
advance(40);
assert.equal(seen.at(-1), 'Wendy, 17 HP damage.');
battle._action = action({ note: '' }, { missed: true });
battle.invokeNormalAction(right._battler, ally._battler);
advance(40);
assert.equal(seen.at(-1), 'Wendy, miss.');
const reused = new c.Game_ActionResult();
reused._wqaAttackSource = 'Frygor';
reused.clear();
assert.equal(reused._wqaAttackSource, null);
console.log('Verified companion-only attribution and native enemy damage and misses against Wendy.');
console.log('Verified the installed damage popup for HP, recovery, miss, block, visible modifiers and unsigned FP, with repeated events and animation gating.');
console.log('Throttled completed popup to formatted receipt', delay.toFixed(2), 'ms. 250 stable updates',
    baseline.toFixed(2), 'ms native,', stable.toFixed(2), 'ms enabled.');
