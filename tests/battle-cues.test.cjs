'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { createBattleCues } = require('../src/battle/timing-cues');
const { createAutomaticTiming } = require('../src/battle/automatic-timing');
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
let automatic = false;
let focused = true;
const automaticPresses = [];
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
const automaticInput = createAutomaticTiming(c, { manager: c.SceneManager, graphics: c.Graphics,
    hasFocus: () => focused, screenFading: () => false }, () => ({ automaticTiming: automatic }));
c.WendyQuestAccessAutomaticTiming = (...sample) => {
    const accepted = automaticInput(...sample);
    if (accepted) automaticPresses.push(now);
    return accepted;
};
c.WendyQuestAccessBattleCueEndSweep = cues.endSweep;
c.WendyQuestAccessBattleCueLeaving = cues.retire;
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

function run(method, scenario, play) {
    cues.retire();
    now = 0;
    automaticPresses.length = 0;
    c.Graphics._wqaAutomaticTimingEnabled = automatic;
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
// Use the shipped state data rather than assuming the three statuses send
// the same settings. Frosty slows the sweep and Spicy changes the native sound.
const states = JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw/data/States.json'), 'utf8'));
for (const [stateId, name, flag] of [[39, 'Frosty', 'Frosty'], [11, 'Spicy', 'Spicy'], [23, 'Spicy+', 'Spicy']]) {
    const state = states[stateId];
    assert.equal(state.name, name);
    const settings = JSON.parse(state.note.slice(state.note.indexOf('{'))).ACSettings;
    assert.equal(settings[flag], true);
    for (const [method, cue] of [['Power', CUE.battlePower], ['Accuracy', CUE.battleAccuracy]]) {
        const scenario = { ...mid, settings, press: [1060] };
        const result = check(method, scenario, cue);
        const normal = check(method, { ...scenario, settings: {} }, cue);
        if (flag === 'Frosty') assert(result.beats[0].at > normal.beats[0].at + 100);
        else assert.equal(result.beats[0].at, normal.beats[0].at);
        // The narrow power band can close two updates after its first sample.
        const cueDelay = method === 'Accuracy' ? 30 : 0;
        const following = run('observed' + method, { ...scenario, press: [], followCue: true, cueDelay }, true);
        assert.equal(following.beats.length, 1);
        const [progress, accepted, frozen] = following.outcome;
        const { start, end, limit } = following.samples.at(-1);
        assert(accepted && !frozen && progress >= start && progress <= end && progress < limit,
            name + ' ' + method + ' accepts an input following the cue');
    }
}
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

console.log('Verified native power and accuracy outcomes, one note per eligible window, next-frame confirm, early confirmation, frozen pause, both Frosty and Spicy meters, and Soggy cutoff.');
console.log('Throttled observed sweep wall time', ordinary.elapsed.toFixed(2), 'ms across', ordinary.samples.length, 'samples.');
console.log('Throttled 20 complete power and accuracy pairs', nativeTotal.toFixed(2), 'ms native,',
    observedTotal.toFixed(2), 'ms enabled.');

// Replay the actual native confirm branches, including Frozen ice breaks.
// These must score exactly like native presses at the same accepted frames.
{
battle._phase = 'ActionCommand';
automatic = true;
let observedTotal = 0, nativeTotal = 0;
const nativeVariants = [39, 11, 23].map(id => JSON.parse(states[id].note.slice(states[id].note.indexOf('{'))).ACSettings);
for (const settings of [{}, ...nativeVariants, { Frozen: true }, { Soggy: true }]) {
    for (const method of ['Power', 'Accuracy']) {
        const scenario = { ...narrow, settings, press: [], followCue: false };
        const result = run('observed' + method, scenario, false);
        const presses = [...automaticPresses];
        if (settings.Soggy && method === 'Power') {
            assert.equal(presses.length, 0, 'Soggy cuts power off before a perfect band exists');
            assert.deepEqual(result.outcome, run('nativePower', scenario, false).outcome);
            continue;
        }
        assert.equal(presses.length, settings.Frozen ? 2 : 1, method + ' ' + JSON.stringify(settings) + ' ' + JSON.stringify(result.outcome));
        // With audio disabled there are no cue samples: native power/accuracy
        // outcomes themselves must be inside their current authored band.
        const start = method === 'Power' ? battle._currentActionCommand._params.powerCritZoneAmountStart : scenario.lower;
        const end = method === 'Power' ? battle._currentActionCommand._params.powerCritZoneAmountEnd : scenario.upper;
        assert(result.outcome[1] && !result.outcome[2] && result.outcome[0] >= start && result.outcome[0] <= end);
        const baseline = run('native' + method, { ...scenario, press: presses }, false);
        assert.deepEqual(result.outcome, baseline.outcome);
        observedTotal += result.elapsed; nativeTotal += baseline.elapsed;
    }
}
const current = battle._currentActionCommand;
const sample = () => automaticInput(scene, current, 0.93, 0.9, 0.95, 1, false, 0.4, 0.55, 0);
assert(sample());
for (const [object, key, value] of [[scene, '_wqaSettingsActive', true], [scene, '_fadeDuration', 1],
    [scene, '_active', false], [scene, '_wqaPreloads', new Set([1])], [scene, '_wqaPreloadOverflow', true], [battle, '_phase', 'input'], [battle, '_currentActionCommand', {}],
    [c.SceneManager, '_nextScene', {}], [c.Graphics, '_wqaResize', true],
    [current._backing, 'worldVisible', false]]) {
    const prior = object[key];object[key] = value;assert.equal(sample(), false, key);object[key] = prior;
}
focused = false;assert.equal(sample(),false);focused = true;
automatic = false;assert.equal(sample(),false);automatic = true;
assert.equal(automaticInput(scene,current,0.96,0.9,0.95,1,false,0.4,0.55,0),false);
assert.equal(automaticInput(scene,current,0.93,0.9,0.95,1,false,0.4,0.55,0.2),false);
assert.equal(automaticInput(scene,current,NaN,0.9,0.95,1,false,0.4,0.55,0),false);
assert.equal(automaticInput(scene,current,0.4,0.9,0.95,1,true,0.4,0.55,0),false);
console.log('Verified automatic native perfect timing, Frozen ice breaking, all meter variants, exact native scoring parity, disabled/manual behavior and lifecycle gates.');
console.log('Throttled 11 complete native/automatic sweeps',nativeTotal.toFixed(2),observedTotal.toFixed(2),'ms.');

}
