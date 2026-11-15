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
    play(_scene, hrtf, cue, gain, bearing, ready, _complete, _source, pitch) {
        assert(ready());
        assert.equal(hrtf, true);
        assert.equal(gain, 0.65);
        beats.push({ cue, at: now, progress: samples.at(-1)?.progress, bearing, pitch });
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
c.WendyQuestAccessBattleCueSample = (scene, action, phase, progress, start, end, limit, blocked) => {
    samples.push({ phase, progress, start, end, limit, blocked, at: now });
    cues.sample(scene, action, phase, progress, start, end, limit, blocked);
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
            if (scenario.followCue && beats.length && now - beats[0].at >= (scenario.cueDelay || 0)) return true;
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


function check(method, scenario, cue) {
    const result = run('observed' + method, scenario, true);
    assert.deepEqual(result.outcome, run('native' + method, scenario, false).outcome);
    if (cue === undefined) {
        assert.equal(result.beats.length, 0);
        return result;
    }
    const first = result.samples.find(sample => !sample.blocked && sample.start < sample.end &&
        sample.progress >= sample.start && sample.progress <= sample.end &&
        sample.progress < sample.limit && sample.progress < 1);
    assert(first);
    const previous = result.samples[result.samples.indexOf(first) - 1];
    const note = method === 'Accuracy' && previous && !previous.blocked ? previous : first;
    assert.deepEqual(result.beats, [{ cue, at: note.at, progress: note.progress, bearing: [0, 0, 1], pitch: 1 }]);
    return result;
}

const ordinaryPower = { settings: {}, press: [790], lower: 0.9, upper: 1, iceStart: 0.4, iceEnd: 0.55 };
const ordinary = check('Power', ordinaryPower, CUE.battlePower);
const accuracy = { ...ordinaryPower, press: [760] };
check('Accuracy', accuracy, CUE.battleAccuracy);
const mid = { ...accuracy, lower: 0.45, upper: 0.58, press: [690] };
check('Accuracy', mid, CUE.battleAccuracy);

for (const [method, scenario] of [['Power', ordinaryPower], ['Accuracy', mid]]) {
    const following = run('observed' + method, { ...scenario, press: [], followCue: true }, true);
    assert.equal(following.beats.length, 1);
    const [progress, accepted, frozen] = following.outcome;
    const { start, end, limit } = following.samples.at(-1);
    assert(accepted && !frozen && progress >= start && progress <= end && progress < limit && progress < 1);
}

// Blandhawk has a five-percent band. This legal roll ends at 94.7%.
const narrow = { ...accuracy, lower: 0.897, upper: 0.947, press: [], followCue: true, cueDelay: 30 };
const narrowAccuracy = run('observedAccuracy', narrow, true);
assert.equal(narrowAccuracy.beats.length, 1);
const [narrowResult, narrowAccepted] = narrowAccuracy.outcome;
assert(narrowAccepted && narrowResult >= narrow.lower && narrowResult <= narrow.upper,
    'A two-frame response to the accuracy cue reached ' + Math.floor(narrowResult * 100) + '%.');
assert(narrowAccuracy.beats[0].progress < narrow.lower, 'the predicted opening uses the previous update');
const promptAccuracy = run('observedAccuracy', { ...narrow, cueDelay: 0 }, true);
assert(promptAccuracy.outcome[0] >= narrow.lower && promptAccuracy.outcome[0] <= narrow.upper,
    'the earliest native response is inside the same window');

const frozen = { ...ordinaryPower, settings: { Frozen: true }, press: [410, 1290] };
const ice = check('Power', frozen, CUE.battlePower);
assert(ice.samples.some(sample => sample.blocked && sample.at > 410 && sample.at < 900));
assert(ice.beats[0].at > 910);
check('Accuracy', { ...frozen, press: [410, 1280] }, CUE.battleAccuracy);
check('Power', { ...frozen, press: [] });
const frosty = { ...ordinaryPower, settings: { Frosty: true }, press: [1110] };
const slower = check('Power', frosty, CUE.battlePower);
assert(slower.beats[0].at > ordinary.beats[0].at + 180);
check('Power', { ...ordinaryPower, settings: { Soggy: true, Wobble: 0.35 }, press: [] });
check('Power', { ...ordinaryPower, settings: { Bland: true }, press: [] });
check('Accuracy', { ...accuracy, lower: 1, upper: 1 });
check('Power', { ...ordinaryPower, press: [120] });

const lastAction = battle._currentActionCommand;
cues.begin(scene, lastAction);
now = 0;
beats.length = 0;
cues.sample(scene, lastAction, 0, 0.94, 0.94, 1, 1, false);
assert(latest());
now = 49;
assert(!latest(), 'unsent audio requests expire before another native update');
cues.sample(scene, lastAction, 0, 0.93, 0.94, 1, 1, false);
assert.equal(latest, null, 'leaving the band retires active audio');
cues.sample(scene, lastAction, 0, 0.95, 0.94, 1, 1, false);
assert.equal(beats.length, 1, 'wobble re-entry does not replay the note');
cues.endSweep(scene, lastAction);
cues.sample(scene, lastAction, 1, 0.58, 0.45, 0.58, 1, false);
assert.equal(beats.length, 2, 'the inclusive accuracy upper bound and independent phase are honored');
cues.sample(scene, lastAction, 1, 0.58, 0.45, 0.58, 1, true);
assert.equal(latest, null, 'accepted input retires audio');
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

console.log('Verified native power and accuracy outcomes, one note per eligible window, next-frame confirm, early confirmation, frozen pause, Frosty speed and Soggy cutoff.');
console.log('Throttled observed sweep wall time', ordinary.elapsed.toFixed(2), 'ms across', ordinary.samples.length, 'samples.');
console.log('Throttled 20 complete power and accuracy pairs', nativeTotal.toFixed(2), 'ms native,',
    observedTotal.toFixed(2), 'ms enabled.');