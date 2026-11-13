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
        assert.equal(word.length, 4);
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
audio.prepare(scene, true, () => ready, status => assert.equal(status, 2));
run();
const prepare = messages.at(-1);
assert.equal(prepare.cue, CUE.prepare);
assert.equal(prepare.gain, 0);
worker.emit('message', { epoch: prepare.epoch, status: 2 });

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

assert(audio.play(scene, true, CUE.wallEast, 0.5, [1, 0, 0], () => ready, null, 'wall', 1, Date.now() + 2900));
assert(audio.play(scene, true, CUE.footstep, 0.5, [0, -1, 0], () => ready, null, 'footstep'));
run();
const loop = messages.at(-1);
assert.equal(loop.lane, 1);
worker.emit('message', { epoch: loop.epoch, status: 2 });
run();
const foot = messages.at(-1);
assert.equal(foot.lane, 2);
worker.emit('message', { epoch: foot.epoch, status: 2 });
assert(audio.play(scene, true, CUE.beaconPulse, 0.5, [0, 0, 1], () => ready, null, 'beacon'));
run();
assert.equal(messages.at(-1).lane, 0);
assert.equal(Atomics.load(word, 1), loop.epoch);
assert.equal(Atomics.load(word, 2), foot.epoch);
assert(audio.extendWall(scene, Date.now() + 3000));
audio.retire(scene, 'wall');
assert.equal(Atomics.load(word, 1), 0);
assert.equal(Atomics.load(word, 2), foot.epoch);
worker.emit('message', { epoch: messages.at(-1).epoch, status: 2 });
audio.retire(scene);
assert.deepEqual([...word.slice(0, 3)], [0, 0, 0]);

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
