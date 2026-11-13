'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createRadialResult } = require('../src/battle/radial-result');
const { createBattleLog } = require('../src/battle/action-log');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { nativeTextHost } = require('./native-text-host.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'radial-result'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 96 * 1024 }));

function run(prefix, sample, expected, suspend = false) {
    const renderer = new EventEmitter();
    const layer = {};
    const scene = { _active: true, _started: true, _wqaBattleStarted: true, _fadeDuration: 0, _fadeOpacity: 0,
        _windowLayer: layer, isActive: () => true, isBusy: () => false, updateBattleProcess() { battle.isBusy(); } };
    const queued = [];
    const captions = [];
    const host = nativeTextHost();
    const { Sprite, Sprite_Text } = host;
    const backing = new Sprite({ isReady: () => true });
    const base = new Sprite();
    base.parent = scene;
    base.addChild(backing);
    for (const name of ['setBitmapFont', 'setDrawColour', 'setShadow', 'setShadowPosition', 'setShadowDraw',
        'setAlignmentV', 'setAlignment']) Sprite_Text.prototype[name] = function () { return this; };
    Sprite.prototype.destroy = function () { this.parent?.removeChild(this); };
    scene.removeChild = sprite => { sprite.parent = null; };

    function ActionCommand() {}
    ActionCommand.feedbackTextLevel = { lowHit: 0, medHit: 1, highHit: 2, perfectHit: 3, criticalHit: 4, miss: 9 };
    const action = Object.assign(new ActionCommand(), {
        _spriteBase: base, _backing: backing, _coroutineContainer: {}, _hitZoneBase: 0.9, _hitZoneRandom: 0,
        _params: { powerCritZoneAmountStart: 0.8, powerCritZoneAmountEnd: 0.9, powerFailAmount: 0.95,
            hitCritZoneAmountRange: 0.1, hitFailAmount: 0.97 },
        _battler: { iterateCriticalHitStreak() {}, getCritDamageBonus: () => 0.25, resetCriticalHitStreak() {},
            endOngoingCriticalHitStreak() {} },
        CreateStars() {}, CreateExplodeEffect() {}, CreateBurstEffect() {}, PlayTimingGameSound() {},
        PlayCritStreakSound() {}, StatusEffectsCleanUp() {}, EquipmentCleanUp() {}
    });
    const battle = { _phase: 'ActionCommand', _currentActionCommand: action, _spriteset: { isBusy: () => false },
        _logWindow: { isBusy: () => false } };

    function ActionCommandResult() {}
    Object.assign(ActionCommandResult.prototype, {
        SetDamageMultiplier(value) { this.power = value; }, SetHitChance(value) { this.accuracy = value; },
        SetCriticalHit(value) { this.critical = value; }, Succeed() { this.success = true; }, Fail() { this.success = false; }
    });
    const c = vm.createContext({
        ...host, ActionCommand, ActionCommandResult, BattleManager: battle, Scene_Battle: function () {},
        Scene_Message: function () {}, SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer } },
        a0_0x453a8f() { throw Error('Unresolved action property'); },
        a2_0x990531() { throw Error('Unresolved battle property'); },
        $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} }, $gameTemp: { _animationQueue: [] },
        $gameScreen: { update() {} }, $gameTimer: { update() {} },
        Time: { GetDeltaTime: () => 1 / 60 }, ScreenShake: { CreateImpulse() {} }, GraphicsArc() {},
        AudioManager: { stopSound() {}, playSe() {} }, Firebase: { AnalyticsLogEvent() {} },
        Game_Interpreter: function () {}, TrackedStats: {},
        Noise2D: () => ({ x: 0, y: 0 }),
        CoroutineManager: { RemoveCoroutine() {}, StartAnonymousCoroutine(task) { queued.push(task()); } },
        EaseFunction: { EaseIn: value => value, EaseOut: value => value, EaseOutOver: value => value },
        Lerp: (from, to, amount) => from + (to - from) * amount,
        Approach: (from, to, step) => Math.min(to, from + step),
        InverseLerp: (from, to, value) => (value - from) / (to - from),
        Clamp1: value => Math.max(0, Math.min(1, value)), RandomRange: () => 0
    });
    c.Game_Interpreter.prototype.increaseTrackedStat = () => {};
    c.Scene_Message.prototype.update = () => { if (base.parent === scene) base.update(); };
    for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
    Object.setPrototypeOf(scene, c.Scene_Battle.prototype);
    const logWindow = scene._actionLogWindow = { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255,
        contentsOpacity: 255, contents: { isReady: () => true }, items: [] };
    const accessHost = { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true, screenFading: () => false };
    const radial = createRadialResult(c, accessHost);
    const log = createBattleLog(c, accessHost, {
        open(record, live) { assert(live()); captions.push(formatSpeech(record)); return 1; },
        focus(_id, record) { captions.push(formatSpeech(record)); }, close() {}
    }, () => false);
    c.WendyQuestAccessBattleRadialReady = radial.observe;
    c.WendyQuestAccessBattleLogReady = log.observe;

    function badge() {
        const sprite = backing.addChild(new Sprite({ isReady: () => true }));
        sprite.visible = false;
        Object.defineProperty(sprite, 'worldVisible', { get() { return sprite.visible; } });
        return sprite;
    }
    const fixture = { ...sample, power: backing.addChild(new Sprite_Text().setText('50%')),
        accuracy: backing.addChild(new Sprite_Text().setText('51%')), powerBadge: badge(), accuracyBadge: badge() };
    const loop = action[prefix + 'Score'](fixture);
    const start = performance.now();
    let outcome;
    for (let frame = 0; frame < 130; frame++) {
        scene.update();
        const step = loop.next();
        for (let index = queued.length - 1; index >= 0; index--) {
            if (queued[index].next().done) queued.splice(index, 1);
        }
        for (const text of backing.children)
            for (const glyph of text.children) glyph.worldAlpha = glyph.alpha ?? 1;
        renderer.emit('postrender');
        if (step.done) { outcome = step.value; break; }
    }
    assert(outcome, 'the installed outcome finishes within the fixture frames');
    assert.equal(captions.length, 0, 'the mod is silent through the native result animation');
    assert.equal(scene._wqaRadialReport, expected);
    if (suspend) radial.retire(scene);
    action[prefix + 'CleanUp'](outcome);
    assert.equal(base.parent, null);
    battle._phase = 'action';
    c.$gameTemp._animationQueue.push({});
    scene.update();
    renderer.emit('postrender');
    assert.equal(captions.length, 0, 'native animation admission keeps the result out of the speech queue');
    c.$gameTemp._animationQueue.length = 0;
    scene.update();
    renderer.emit('postrender');
    assert.deepEqual(captions, expected && !suspend ? [expected] : []);
    if (expected && !suspend) assert.deepEqual(log.latest(scene).lines, [expected]);
    assert.equal(logWindow.items.length, 0, 'the score does not add a native log row');
    return { outcome: { ...outcome }, milliseconds: performance.now() - start };
}

const cases = [
    [{ powerAmount: 1, accuracyAmount: 1, settings: {} }, 'Power 35%, LATE. Accuracy 35%, LATE.'],
    [{ powerAmount: 0.62, accuracyAmount: 0.92, settings: {} }, 'Power 77%, GOOD. Accuracy 92%, NICE.'],
    [{ powerAmount: 0.85, accuracyAmount: 0.85, settings: {} }, 'Power 125%, PERFECT. Accuracy 100%, CRITICAL HIT.'],
    [{ powerAmount: 1, accuracyAmount: 1, powerFrozen: true, accuracyFrozen: true, settings: { Frozen: true } },
        'Power 35%, FROZEN. Accuracy 35%, FROZEN.']
];
let baseline = 0;
let observed = 0;
for (const [sample, expected] of cases) {
    const native = run('native', sample, undefined);
    const result = run('observed', sample, expected);
    assert.deepEqual(result.outcome, native.outcome);
    baseline += native.milliseconds;
    observed += result.milliseconds;
}
run('observed', cases[1][0], cases[1][1], true);
console.log('Verified the installed radial result and native glyph paint for normal, critical and frozen attempts, with animation gating and battle log review.');
console.log('Throttled four complete result episodes', baseline.toFixed(2), 'ms native,', observed.toFixed(2), 'ms enabled.');
