'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { CUE, createAudio } = require('../src/runtime/audio');

let word;
const scheduled = [];
const reports = [];
const worker = new EventEmitter();
const messages = [];
let starts = 0;
let ready = true;
worker.postMessage = message => messages.push(message);
worker.unref = () => {};
const audio = createAudio({
    makeWord: () => word,
    schedule: task => scheduled.push(task),
    createAudioWorker(admission) {
        word = new Int32Array(admission);
        assert.equal(word.length, 7);
        starts++;
        return worker;
    }
});
const scene = {};
const preview = (bearing = [0, 0, 1], hrtf = true) =>
    audio.preview(scene, hrtf, bearing, () => ready, report => reports.push(report));
const run = () => scheduled.shift()();

assert.equal(preview(), true);
audio.retire(scene);
run();
assert.equal(starts, 0);
assert.equal(word, undefined);
ready = false;
assert.equal(preview(), false);
assert.equal(scheduled.length, 0);

ready = true;
preview();
assert.equal(starts, 0);
run();
assert.equal(starts, 1);
const cold = messages[0];
assert.deepEqual(Object.keys(cold), ['epoch', 'lane', 'hrtf', 'cue', 'right', 'up', 'forward', 'gain', 'pitch']);
preview([-1, 0, 0]);
preview([0, 0, -1], false);
const latestEpoch = Atomics.load(word, 0);
audio.retire({});
assert.equal(Atomics.load(word, 0), latestEpoch);
assert.equal(messages.length, 1);
assert.equal(scheduled.length, 0);
worker.emit('message', { epoch: cold.epoch, status: 2 });
assert.deepEqual(reports, []);
run();
assert.equal(messages.length, 2);
assert.deepEqual(messages[1], { epoch: latestEpoch, lane: 0, hrtf: false, cue: CUE.preview, right: 0, up: 0, forward: -1, gain: 0.65, pitch: 1 });
worker.emit('message', { epoch: latestEpoch, status: 1 });
assert.deepEqual(reports, ['Preview uses stereo and rear pitch.']);
assert.equal(audio.isPrepared(true), true);
assert(audio.prepare(scene, true, () => ready, status => assert.equal(status, 2), 'wall'));
run();
const prepare = messages.at(-1);
assert.equal(prepare.cue, CUE.prepare);
assert.equal(prepare.gain, 0);
worker.emit('message', { epoch: prepare.epoch, status: 2 });
assert.equal(Atomics.load(word, 0), 0, 'wall initialization leaves the beacon channel free');
assert(audio.play(scene, true, CUE.beaconPulse, 0.5, [1, 0, 0], () => ready, null, 'beacon'));
run();
assert.equal(messages.at(-1).cue, CUE.beaconPulse);
worker.emit('message', { epoch: messages.at(-1).epoch, status: 2 });
audio.retire(scene, 'beacon');

assert(audio.play(scene, true, CUE.wallBump, 0.5, [0, 0, 1], () => ready, null, 'bump'));
run();
const impact = messages.at(-1);
assert.equal(impact.lane, 2);
assert.equal(impact.cue, CUE.wallBump);
worker.emit('message', { epoch: impact.epoch, status: 2 });
audio.retire(scene, 'bump');

audio.play(scene, true, CUE.wallBump, 0.5, [0, 0, 1], () => ready, null, 'wall');
run();
const wall = messages.at(-1);
assert.equal(audio.play(scene, true, CUE.beaconPulse, 0.5, [1, 0, 0], () => ready, null, 'beacon'), false);
const soundscape = () => audio.play(scene, true, CUE.entityPerson, 0.5, [1, 0, 0], () => ready, null, 'soundscape');
assert.equal(soundscape(), false, 'an ambient request cannot replace wall audio');
audio.retire(scene, 'beacon');
assert.equal(Atomics.load(word, 0), wall.epoch);
worker.emit('message', { epoch: wall.epoch, status: 2 });
audio.retire(scene, 'wall');
assert.equal(Atomics.load(word, 0), 0);

assert(soundscape());
run();
const ambient = messages.at(-1);
assert.equal(ambient.cue, CUE.entityPerson);
assert(audio.play(scene, true, CUE.caveGo, 0.5, [0, 0, 1], () => ready, null, 'cave'));
assert.notEqual(Atomics.load(word, 0), ambient.epoch);
worker.emit('message', { epoch: ambient.epoch, status: 0 });
run();
const crossing = messages.at(-1);
assert.equal(crossing.cue, CUE.caveGo);
assert.equal(soundscape(), false, 'an ambient request cannot replace the crossing cue');
audio.retire(scene, 'soundscape');
assert.equal(Atomics.load(word, 0), crossing.epoch);
worker.emit('message', { epoch: crossing.epoch, status: 2 });
audio.retire(scene, 'cave');

const until = Date.now() + 3000;
let eastReady = true;
for (const [cue, position, available] of [
    [CUE.wallNorth, [0, 0, 1], () => ready], [CUE.wallEast, [1, 0, 0], () => eastReady],
    [CUE.wallSouth, [0, 0, -1], () => ready], [CUE.wallWest, [-1, 0, 0], () => ready]
]) assert(audio.play(scene, true, cue, 0.5, position, available, null, 'wall', 1, until));
assert(audio.play(scene, true, CUE.footstep, 0.5, [0, -1, 0], () => ready, null, 'footstep'));
const epochs = [...word.slice(1, 6)];
assert.equal(new Set(epochs).size, 5);
assert(epochs.every(epoch => epoch > 0));
for (const [lane, cue] of [[1, CUE.wallNorth], [2, CUE.footstep], [3, CUE.wallEast],
    [4, CUE.wallSouth], [5, CUE.wallWest]]) {
    run();
    const message = messages.at(-1);
    assert.equal(message.cue, cue);
    assert.equal(message.lane, lane);
    if (lane === 3) eastReady = false;
    worker.emit('message', { epoch: message.epoch, status: 2 });
}
assert.deepEqual([...word.slice(1, 6)], [epochs[0], epochs[1], 0, epochs[3], epochs[4]],
    'a stale east receipt does not revoke other walls');
assert(audio.play(scene, true, CUE.beaconPulse, 0.5, [0, 0, 1], () => ready, null, 'beacon'));
run();
assert.equal(messages.at(-1).lane, 0);
assert(audio.extendWall(scene, until + 100));
assert.equal(Atomics.load(word, 6), (until + 100) | 0);
audio.retire(scene, 'wall', CUE.wallNorth);
assert.deepEqual([...word.slice(1, 6)], [0, epochs[1], 0, epochs[3], epochs[4]]);
audio.retire(scene, 'wall');
assert.deepEqual([...word.slice(1, 6)], [0, epochs[1], 0, 0, 0]);
worker.emit('message', { epoch: messages.at(-1).epoch, status: 2 });
audio.retire(scene);
assert.deepEqual([...word.slice(0, 6)], [0, 0, 0, 0, 0, 0]);

preview();
run();
ready = false;
worker.emit('message', { epoch: messages.at(-1).epoch, status: 2 });
assert.equal(Atomics.load(word, 0), 0);
assert.equal(reports.length, 1);

ready = true;
preview();
run();
worker.emit('error', Error('Fixture worker loss'));
assert.equal(Atomics.load(word, 0), 0);
assert.equal(reports.at(-1), 'Mod audio output unavailable.');
assert.equal(preview(), false);
assert.equal(scheduled.length, 0);
assert.equal(starts, 1);
console.log('Audio preview admission, bounded replacement, readiness retirement and worker failure verified.');
