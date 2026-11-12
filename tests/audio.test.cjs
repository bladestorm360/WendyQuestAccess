'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAudio } = require('../src/runtime/audio');

const word = new Int32Array(new SharedArrayBuffer(4));
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
        assert.equal(admission, word.buffer);
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
assert.equal(Atomics.load(word, 0), 0);
ready = false;
assert.equal(preview(), false);
assert.equal(scheduled.length, 0);

ready = true;
preview();
assert.equal(starts, 0);
run();
assert.equal(starts, 1);
const cold = messages[0];
assert.deepEqual(Object.keys(cold), ['epoch', 'hrtf', 'right', 'up', 'forward', 'gain']);
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
assert.deepEqual(messages[1], { epoch: latestEpoch, hrtf: false, right: 0, up: 0, forward: -1, gain: 0.65 });
worker.emit('message', { epoch: latestEpoch, status: 1 });
assert.deepEqual(reports, ['Preview uses stereo and rear pitch.']);

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
assert.equal(preview(), true);
assert.equal(scheduled.length, 0);
assert.equal(starts, 1);
console.log('Audio preview admission, bounded replacement, readiness retirement and worker failure verified.');
