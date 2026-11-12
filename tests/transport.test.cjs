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
        if (name === './speech-text.cjs') return require('../src/services/speech-text.cjs');
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
assert.deepEqual(receipts, Array(7).fill('discarded'));
child.stdout.emit('data', 'P\r\n');
assert.deepEqual(commands, ['SSynthetic command\n', 'N\n'], 'the helper cannot initialize on a retired packet');
child.stdout.emit('data', 'D\r\n');
function deliverReceipts() {
    for (const message of receipts.splice(0)) transport.emit('message', message);
}
deliverReceipts();
assert.equal(renderer.counters.discarded, 8);
assert.equal(renderer.counters.submitted, 0);

renderer.notifications.open(title);
assert.equal(commands.at(-1), 'SSynthetic command\n', 'the same text is eligible again');
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
renderer.notifications.close();
renderer.notifications.open(title);
child.stdout.emit('data', 'B\r\n');
assert.equal(commands.at(-1), 'N\n', 'finishing initialization cannot reuse a different live epoch');
child.stdout.emit('data', 'D\r\n');
deliverReceipts();
assert.equal(renderer.counters.discarded, 9);
assert.equal(commands.at(-1), 'SSynthetic command\n');

child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
const providerInProgress = commands.length;
renderer.notifications.close();
assert.equal(Atomics.load(word, 0), 0);
renderer.notifications.open(title);
assert.equal(commands.length, providerInProgress, 'neither native close nor next focus can send a second provider call');
child.stdout.emit('data', 'S\r\n');
assert.equal(commands.at(-1), 'SSynthetic command\n', 'only the new admitted epoch is prepared');
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
child.stdout.emit('data', 'S\r\n');
deliverReceipts();
assert.equal(renderer.counters.submitted, 2, 'provider completions stay distinct from discarded requests');
child.emit('exit', 3);
assert.equal(receipts.at(-1), 'failed');
transport.emit('message', 'failed');
assert.equal(Atomics.load(word, 0), 0);
assert.equal(renderer.counters.workerFailures, 1);
console.log('Verified startup cancellation, eight-record cap, retirement before provider work, and native progress during a stalled provider call.');
