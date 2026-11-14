'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createBattleFocus } = require('../src/battle/focus');
const { nativeTextHost } = require('./native-text-host.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const { methods, baseline_update: baselineUpdate } = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2]],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const renderer = new EventEmitter();
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0, _uiLayer: {} };
let pressed = false;
let paint = true;
let activated = 0;
let errors = 0;
const c = vm.createContext({
    ...nativeTextHost(), Sprite_BattleOption: function () {}, Sprite_UIButton: function () {},
    a2_0x990531() { throw Error('Unresolved battle property'); },
    a18_0x52f0af() { throw Error('Unresolved text property'); },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer } },
    BattleManager: { _phase: 'input', _inputting: true, _wqaDialogueBusy: false, isBusy: () => false, isTpb: () => false },
    $gameTroop: { _interpreter: {} }, $gameMessage: { isBusy: () => false },
    Input: { isTriggered: key => key === 'ok' && pressed },
    BattleHelper: { IsBattleScene: () => true, unfocusAllBattleOptions() { for (const item of group) item.focusLost(); } },
    AudioManager: { playSe() { errors++; } }
});

c.Sprite_UIButton.prototype.update = function () {
    if (!paint) return;
    for (const child of [this._nameSprite, this._subTextSprite, this._costTextSprite]) child?.update();
};
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

const battlefield = {};
function enemy(name, overrides = {}) {
    return { parent: battlefield, worldVisible: true, worldAlpha: 1, texture: { valid: true },
        _enemy: { originalName: () => name, isAlive: () => true }, ...overrides };
}
scene._spriteset = { _battleField: battlefield, _enemySprites: [
    enemy('Golden Archer'), enemy('Lil Pink Salty'), enemy('Golden Archer'),
    enemy('Hidden battler', { worldVisible: false })
] };

const group = [];
const actor = { _battleOptionsActive: 0, battleOptions: [group] };
function text(parent, value) {
    return Object.assign(new c.Sprite_Text().setText(value), { parent });
}
function command(name, enabled) {
    const option = Object.assign(new c.Sprite_BattleOption(), { parent: scene._uiLayer, _followTarget: actor,
        _animationPosition: 1, _animationPositionTarget: 1, _prerequisitesMet: enabled,
        _hasFocus: false, worldVisible: true, worldAlpha: 1, _shakeCount: 0,
        updateAnimation() {}, updateEnabled() {}, updateIsVisible() {}, updateFollow() {}, updatePosition() {},
        updateShakeCount() {}, focusAnimation() {}, startFlashAnimation() {}, endFlashAnimation() {}, errorAnimation() {},
        onActivate() { assert.equal(observer.controlOwner(scene), null); activated++; } });
    option._nameSprite = text(option, name);
    group.push(option);
    return option;
}
const attack = command('Attack', true);
const skill = command('Guard', false);
skill._subTextSprite = text(skill, 'Reduce incoming damage.');
skill._costTextSprite = text(skill, 'x2');
const messages = [];
const active = new Map();
let epoch = 0;
const observer = createBattleFocus(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { active.set(++epoch, live); messages.push(formatSpeech(record)); return epoch; },
    focus(id, record) {
        assert(active.get(id)());
        if (messages.length === 1) {
            assert.equal(record.append, true);
            assert.equal(record.kind, 'menuFocus');
            assert.equal(active.size, 1);
        }
        messages.push(formatSpeech(record));
    },
    close(id) { active.delete(id); }
}, () => ({ indexing: true, autodetail: true }));
c.WendyQuestAccessBattleFocusReady = observer.observe;
c.WendyQuestAccessBattleFocusLeaving = observer.retire;

attack.focusGained();
attack.update();
assert.equal(renderer.listenerCount('postrender'), 0, 'battle entry keeps the observer closed');
scene._wqaBattleStarted = true;
attack._animationPosition = 0.9;
attack.update();
assert.equal(renderer.listenerCount('postrender'), 0, 'the command must be natively actionable');
attack._animationPosition = 1;
attack._nameSprite.setText('Attack from paint');
paint = false;
attack.update();
assert.equal(renderer.listenerCount('postrender'), 0, 'a dirty label is withheld');
paint = true;
const start = performance.now();
attack.update();
skill.update();
assert.equal(messages.length, 0, 'no output before the rendered frame');
renderer.emit('postrender');
const firstFocus = performance.now() - start;
assert.deepEqual(messages.slice(0, 2), [
    'Enemy formation. 2 Golden Archer. 1 Lil Pink Salty.',
    'Battle commands, Attack from paint, 1 of 2'
]);
assert(observer.controlOwner(scene));
assert.equal(attack._nameSprite.bitmap, undefined);
assert.equal(attack._nameSprite.children.map(glyph => glyph.bitmap.paint).join(''), 'Attack from paint');
const finalGlyph = attack._nameSprite.children.at(-1);
finalGlyph.scale.x = 0;
assert.equal(observer.controlOwner(scene), null, 'an invisible glyph withholds the text');
finalGlyph.scale.x = 1;

attack.update();
renderer.emit('postrender');
assert.equal(messages.length, 2, 'the same native focus does not publish a new event');
const patchedUpdate = c.Sprite_BattleOption.prototype.update;
vm.runInContext(baselineUpdate, c, { timeout: 100 });
const nativeUpdate = c.Sprite_BattleOption.prototype.update;
c.Sprite_BattleOption.prototype.update = patchedUpdate;
function measureFrames(update) {
    const start = performance.now();
    for (let frame = 0; frame < 600; frame++) {
        update.call(attack);
        update.call(skill);
        renderer.emit('postrender');
    }
    return performance.now() - start;
}
measureFrames(nativeUpdate);
measureFrames(patchedUpdate);
const nativeFrames = measureFrames(nativeUpdate);
const modFrames = measureFrames(patchedUpdate);
assert.equal(messages.length, 2, 'stable focus does not queue work on subsequent frames');
skill.focusGained();
skill.update();
attack.focusGained();
attack.update();
skill.focusGained();
skill.update();
assert.equal(renderer.listenerCount('postrender'), 1);
renderer.emit('postrender');
assert.equal(messages[2], 'Guard, unavailable, 2 of 2');
assert.match(messages[3], /Reduce incoming damage.*Cost x2/);
const page = observer.controlOwner(scene);
assert(observer.command(page, 'details'));
assert.match(messages.at(-1), /Reduce incoming damage.*Cost x2/);
assert(observer.command(page, 'reviewLast'));
assert.match(messages.at(-1), /Cost x2/);
pressed = true;
skill.update();
assert.equal(errors, 1, 'native unavailable activation retains its feedback');
assert.equal(observer.controlOwner(scene), page);
pressed = false;
skill._prerequisitesMet = true;
assert.equal(observer.controlOwner(scene), null, 'old availability cannot be reviewed');
skill.update();
renderer.emit('postrender');
assert.equal(messages.at(-2), 'Guard, 2 of 2');
assert.notEqual(observer.controlOwner(scene), page);

attack.focusGained();
attack.update();
pressed = true;
attack.update();
renderer.emit('postrender');
assert.equal(activated, 1);
assert.equal(observer.controlOwner(scene), null);
assert.equal(active.size, 0, 'native acceptance cancels queued focus');
pressed = false;
attack.update();
renderer.emit('postrender');
assert(observer.controlOwner(scene));
c.BattleManager._phase = 'turn';
c.BattleManager.updateEvent = () => { assert.equal(active.size, 0); return true; };
c.BattleManager.update(true);
assert.equal(observer.controlOwner(scene), null);
assert.equal(active.size, 0);
assert.equal(messages.filter(text => text.startsWith('Enemy formation')).length, 1);
console.log('Verified native battle command focus, paint, review, unavailable and accepted input, and phase retirement.');
console.log('Throttled first command update through synthetic render and focus receipt', firstFocus.toFixed(2), 'ms.');
console.log('Throttled 600 stable frames', nativeFrames.toFixed(2), 'ms native,', modFrames.toFixed(2), 'ms enabled.');
