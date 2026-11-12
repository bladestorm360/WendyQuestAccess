'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRenderer } = require('../src/runtime/renderer');

// Exercise the actual worker implementation while the child pipe deliberately
// delays its replies. No screen reader, audio device or game is used.
const word = new Int32Array(new SharedArrayBuffer(4));
const port = new EventEmitter();
const child = new EventEmitter();
child.stdout = new EventEmitter();
child.stdout.setEncoding = () => {};
child.stdin = new EventEmitter();
const commands = [];
const receipts = [];
child.stdin.write = message => commands.push(message);
child.stdin.end = () => {};
port.postMessage = message => receipts.push(message);
port.close = () => {};

let spawnCount = 0;
const serviceSource = path.join(__dirname, '..', 'src', 'services', 'speech-worker.cjs');
vm.runInNewContext(fs.readFileSync(serviceSource, 'utf8'), {
    __dirname: path.dirname(serviceSource),
    require(name) {
        if (name === 'worker_threads') return { parentPort: port, workerData: word.buffer };
        if (name === 'child_process') return { spawn() { spawnCount++; return child; } };
        if (name === 'path') return path;
        throw Error('Unexpected service dependency: ' + name);
    }
}, { timeout: 150 });

let task;
const transport = new EventEmitter();
transport.postMessage = message => port.emit('message', message);
transport.unref = () => {};
let workerCount = 0;
const renderer = createRenderer({
    makeWord: () => word,
    schedule(callback) { task = callback; },
    titleStillReady: () => true,
    createWorker() { workerCount++; return transport; }
});

const title = { name: 'Synthetic command', enabled: true, index: 0 };
const retired = renderer.notifications.open(title);
renderer.notifications.close();
task();
assert.equal(workerCount, 0, 'retired generation must not start a worker');
assert.equal(spawnCount, 0);

const first = renderer.notifications.open(title);
assert.notEqual(first, retired);
task();
assert.equal(workerCount, 1);
assert.equal(spawnCount, 1);
assert.equal(commands.length, 0, 'pipe accepts only after helper readiness');

child.stdout.emit('data', 'R\r\n');
assert.deepEqual(commands, ['SSynthetic command\n']);
for (let i = 0; i < 16; i++) renderer.notifications.focus(first, { ...title, index: i + 1 });
assert.equal(commands.length, 1, 'only one command may cross the pipe while backend is busy');
assert.equal(renderer.counters.dropped, 9, 'renderer caps all outstanding records at eight');

renderer.notifications.close();
assert.equal(Atomics.load(word, 0), 0);
assert.equal(commands.length, 1, 'the native caller never waits for a cancellation reply');
assert.deepEqual(receipts, Array(7).fill('ack'));
child.stdout.emit('data', 'S\r\n');
assert.deepEqual(commands, ['SSynthetic command\n', 'C\n'], 'stale title packets were retired');
child.stdout.emit('data', 'C\r\n');
for (const message of receipts.splice(0)) transport.emit('message', message);

renderer.notifications.open(title);
assert.equal(commands.length, 3, 'same text is still eligible in the next presentation');
child.stdout.emit('data', 'S\r\n');
child.emit('exit', 3);
assert.equal(receipts.at(-1), 'failed');
transport.emit('message', 'failed');
assert.equal(Atomics.load(word, 0), 0);
assert.equal(renderer.counters.workerFailures, 1);
console.log('Verified startup cancellation, eight-record cap, stalled pipe, stale epoch retirement, repeat text and helper failure.');
