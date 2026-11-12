'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { createBattleCues } = require('../src/battle/timing-cues');
const { CUE } = require('../src/runtime/audio');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'sweeps'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const scene = { _active: true, _started: true, _wqaBattleStarted: true, _fadeDuration: 0, _fadeOpacity: 0 };
const battle = { _phase: 'ActionCommand', _wqaDialogueBusy: false };
const beats = [];
const samples = [];
let prepared = true;
let configuration = { enabled: true, hrtf: true, battleTiming: true, battleTimingVolume: 65 };
let now = 0;
let delta = 1 / 60;
let latest = null;
let preparedReady;
let preparedComplete;
const audio = {
    cues: CUE,
    isPrepared: () => prepared,
    prepare(_scene, _hrtf, ready, complete) { preparedReady = ready; preparedComplete = complete; return true; },
    play(_scene, hrtf, cue, gain, bearing, ready) {
        assert(ready());
        assert.equal(hrtf, true);
        assert.equal(gain, 0.65);
        beats.push({ cue, at: now, progress: samples.at(-1)?.progress, bearing });
        latest = ready;
        return true;
    },
    retire() { latest = null; }
};
const c = vm.createContext({
    ActionCommandRadial: function () {},
    a0_0x453a8f() { throw Error('Unresolved action property'); },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene } }, BattleManager: battle,
    $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} },
    Time: { GetDeltaTime: () => delta, GetGameTime: () => now / 1000 },
    AudioManager: { resumeSound() {}, pauseSound() {}, playSe() {} }, ScreenShake: { CreateImpulse() {} },
    Noise2D: (_x, _y, time) => ({ x: Math.sin(time * 25) }), EaseFunction: { None: value => value },
    GraphicsArc() {}, RandomRange: (lower, upper) => (lower + upper) / 2,
    Clamp1: value => Math.max(0, Math.min(1, value)),
    InverseLerp: (start, end, value) => (value - start) / (end - start),
    Lerp: (start, end, amount) => start + (end - start) * amount
});
const cues = createBattleCues(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false, now: () => now }, audio, () => configuration);
c.WendyQuestAccessBattleCueSample = (scene, action, phase, progress, ...rest) => {
    samples.push({ phase, progress, paused: rest[6], at: now });
    cues.sample(scene, action, phase, progress, ...rest);
};
c.WendyQuestAccessBattleCueEndSweep = cues.endSweep;
c.WendyQuestAccessBattleCueLeaving = cues.retire;
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

function run(method, scenario, play) {
    cues.retire();
    now = 0;
    delta = scenario.delta || 1 / 60;
    beats.length = samples.length = 0;
    const press = [...scenario.press];
    const action = battle._currentActionCommand = Object.assign(new c.ActionCommandRadial(), {
        _spriteBase: { parent: scene }, _hitZoneSize: 0.1,
        InputPressed() {
            if (!press.length || now < press[0]) return false;
            press.shift();
            return true;
        },
        CreateFrozenIceShards() {}
    });
    action._backing = { parent: action._spriteBase, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } };
    action._params = action.BarParams(scenario.settings);
    if (play) cues.begin(scene, action);
    const stage = action[method]({ ...scenario, duration: 0.8 / action._params.timeScale,
        ice: { x: 0, y: 0, destroy() {} },
        marker: { setText() {}, clear() {}, lineStyle() {}, moveTo() {}, lineTo() {} }
    });
    const started = performance.now();
    for (let frame = 0; frame < 300; frame++) {
        now += delta * 1000;
        const tick = stage.next();
        if (tick.done) return { outcome: [...tick.value], beats: [...beats], samples: [...samples], elapsed: performance.now() - started };
    }
    throw Error('Native fixture sweep exceeded its update bound');
}

const ordinaryPower = { settings: {}, press: [774], lower: 0.9, upper: 1, iceStart: 0.4, iceEnd: 0.55 };
const ordinary = run('observedPower', ordinaryPower, true);
assert.deepEqual(ordinary.outcome, run('nativePower', ordinaryPower, false).outcome);
assert.deepEqual(ordinary.beats.map(beat => beat.cue), [CUE.battleLead, CUE.battlePower]);
assert(ordinary.beats[0].at + 110 < ordinary.beats[1].at);
assert(ordinary.beats[1].progress >= 0.90 && ordinary.beats[1].progress < 0.98);
assert(ordinary.beats[1].bearing[0] > 0.85);
assert.equal(latest, null, 'native sweep exit clears active output');

const accuracy = { ...ordinaryPower, press: [760] };
const second = run('observedAccuracy', accuracy, true);
assert.deepEqual(second.outcome, run('nativeAccuracy', accuracy, false).outcome);
assert.deepEqual(second.beats.map(beat => beat.cue), [CUE.battleLead, CUE.battleAccuracy]);
assert(second.beats[1].progress > 0.88 && second.beats[1].progress < 0.95);
assert(second.beats[1].bearing[0] < -0.85);
assert.equal(scene._wqaBattleCueActive, false);

const frozen = { ...ordinaryPower, settings: { Frozen: true }, press: [410, 1274] };
const ice = run('observedPower', frozen, true);
assert.deepEqual(ice.outcome, run('nativePower', frozen, false).outcome);
assert.deepEqual(ice.beats.map(beat => beat.cue), [CUE.battleLead, CUE.battleIce, CUE.battleLead, CUE.battlePower]);
assert(ice.beats[1].progress >= 0.4 && ice.beats[1].progress < 0.55);
assert(ice.beats[2].at > ice.beats[1].at + 500);
assert(ice.samples.some(sample => sample.paused), 'the native break pause is exercised');
const iceAccuracy = { ...frozen, press: [410, 1260] };
const frozenSecond = run('observedAccuracy', iceAccuracy, true);
assert.deepEqual(frozenSecond.outcome, run('nativeAccuracy', iceAccuracy, false).outcome);
assert.deepEqual(frozenSecond.beats.map(beat => beat.cue),
    [CUE.battleLead, CUE.battleIce, CUE.battleLead, CUE.battleAccuracy]);

const frosty = { ...ordinaryPower, settings: { Frosty: true }, press: [1070] };
const slower = run('observedPower', frosty, true);
assert.deepEqual(slower.outcome, run('nativePower', frosty, false).outcome);
assert(slower.beats.find(beat => beat.cue === CUE.battlePower).at > ordinary.beats[1].at + 200);

const soggy = { ...ordinaryPower, settings: { Soggy: true, Wobble: 0.35 }, press: [] };
const reduced = run('observedPower', soggy, true);
assert.deepEqual(reduced.outcome, run('nativePower', soggy, false).outcome);
assert(reduced.beats.some(beat => beat.cue === CUE.battlePower && beat.progress < 0.75));

const missingBand = { ...accuracy, lower: 1, upper: 1 };
assert.deepEqual(run('observedAccuracy', missingBand, true).beats.map(beat => beat.cue), [CUE.battleLead, CUE.battleAccuracy]);
const quick = { ...ordinaryPower, press: [120] };
assert.deepEqual(run('observedPower', quick, true).beats, []);

const lastAction = battle._currentActionCommand;
cues.begin(scene, lastAction);
now = 0;
cues.sample(scene, lastAction, 0, 0.94, 0.8, 0.94, 1, 1, -1, 0, false, false, false);
assert(latest());
now = 91;
assert(!latest(), 'stale audio requests expire even before another native update');
cues.retire(scene);

let nativeTotal = 0;
let observedTotal = 0;
for (let repeat = 0; repeat < 20; repeat++) {
    nativeTotal += run('nativePower', ordinaryPower, false).elapsed + run('nativeAccuracy', accuracy, false).elapsed;
    observedTotal += run('observedPower', ordinaryPower, true).elapsed + run('observedAccuracy', accuracy, true).elapsed;
}
configuration = { ...configuration, battleTiming: false };
assert.equal(run('observedPower', ordinaryPower, true).samples.length, 0);
configuration = { ...configuration, battleTiming: true };
prepared = false;
assert.equal(run('observedPower', ordinaryPower, true).samples.length, 0);
battle._phase = 'input';
scene._wqaBattleStarted = false;
cues.prepare(scene);
assert.equal(preparedReady, undefined);
scene._wqaBattleStarted = true;
cues.prepare(scene);
assert(preparedReady());
cues.retire(scene);
assert(!preparedReady());
preparedComplete(2);
assert.equal(scene._wqaBattleCueActive, false);

console.log('Verified the installed power and accuracy sweeps, normal timing, frozen pause, Frosty speed, and Soggy cutoff.');
console.log('Throttled observed sweep wall time', ordinary.elapsed.toFixed(2), 'ms across', ordinary.samples.length, 'samples.');
console.log('Throttled 20 complete power and accuracy pairs', nativeTotal.toFixed(2), 'ms native,',
    observedTotal.toFixed(2), 'ms enabled.');