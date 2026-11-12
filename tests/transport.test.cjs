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
function loadService(outputPort, admission, spawn) {
    vm.runInNewContext(fs.readFileSync(serviceSource, 'utf8'), {
        __dirname: path.dirname(serviceSource),
        require(name) {
            if (name === 'worker_threads') return { parentPort: outputPort, workerData: admission.buffer };
            if (name === 'child_process') return { spawn };
            if (name === 'path') return path;
            if (name === './speech-text.cjs') return require('../src/services/speech-text.cjs');
            throw Error('Unexpected service dependency: ' + name);
        }
    }, { timeout: 150 });
}
loadService(port, word, () => { spawnCount++; return child; });

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
const latest = renderer.notifications.open(title);
assert.equal(commands.length, providerInProgress, 'neither native close nor next focus can send a second provider call');
child.stdout.emit('data', 'S\r\n');
assert.equal(commands.at(-1), 'SSynthetic command\n', 'only the new admitted epoch is prepared');
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
child.stdout.emit('data', 'S\r\n');
deliverReceipts();
assert.equal(renderer.counters.submitted, 2, 'provider completions stay distinct from discarded requests');
renderer.notifications.focus(latest, { kind: 'dialogueChoice', text: 'Synthetic first choice', append: true });
assert.equal(commands.at(-1), 'ASynthetic first choice\n', 'the initial choice uses append on the native helper pipe');
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
child.stdout.emit('data', 'S\r\n');
deliverReceipts();

renderer.notifications.focus(latest, { kind: 'dialoguePage', text: 'Speech already in the provider' });
child.stdout.emit('data', 'P\r\n');
const busy = commands.length;
renderer.notifications.focus(latest, { ...title, name: 'Queued stale title' });
renderer.setSpeechEnabled(false, () => true);
assert.equal(commands.length, busy, 'mute does not enter a busy backend or block');
child.stdout.emit('data', 'S\r\n');
assert.equal(commands.at(-1), 'Q\n', 'the queued stale title was replaced by a single explicit stop');
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'Y\n');
child.stdout.emit('data', 'Q\r\n');
deliverReceipts();
assert.equal(renderer.counters.silenced, 1);
renderer.retireSilence();
assert.equal(Atomics.load(word, 0), 0);

renderer.notifications.focus(latest, { kind: 'dialoguePage', text: 'Current page while muted' });
assert.equal(commands.at(-1), 'LCurrent page while muted\n');
child.stdout.emit('data', 'P\r\n');
child.stdout.emit('data', 'S\r\n');
deliverReceipts();
const beforeRestore = commands.length;
renderer.setSpeechEnabled(true);
assert.equal(commands.length, beforeRestore, 'restoring speech never replays the old page');
renderer.notifications.focus(latest, { kind: 'dialogueChoice', text: 'New current choice', first: true, append: true });
assert.equal(commands.at(-1), 'SChoices. New current choice\n', 'a fresh sequence starts with interruption');
child.stdout.emit('data', 'P\r\n');
child.stdout.emit('data', 'S\r\n');
deliverReceipts();

renderer.setSpeechEnabled(false, () => true);
assert.equal(commands.at(-1), 'Q\n');
renderer.retireSilence();
child.stdout.emit('data', 'P\r\n');
assert.equal(commands.at(-1), 'N\n', 'leaving settings before the stop grant revokes it');
child.stdout.emit('data', 'D\r\n');
assert.equal(renderer.counters.silenced, 1);
renderer.setSpeechEnabled(true);
child.emit('exit', 3);
assert.equal(receipts.at(-1), 'failed');
transport.emit('message', 'failed');
assert.equal(Atomics.load(word, 0), 0);
assert.equal(renderer.counters.workerFailures, 1);

const startupWord = new Int32Array(new SharedArrayBuffer(4));
const startupWorker = new EventEmitter();
const startupPort = new EventEmitter();
const startupChild = new EventEmitter();
startupChild.stdout = new EventEmitter();
startupChild.stdout.setEncoding = () => {};
startupChild.stdin = new EventEmitter();
const startupCommands = [];
startupChild.stdin.write = command => startupCommands.push(command);
startupChild.stdin.end = () => {};
startupPort.postMessage = message => startupWorker.emit('message', message);
startupPort.close = () => {};
loadService(startupPort, startupWord, () => startupChild);
const startupPackets = [];
startupWorker.postMessage = packet => { startupPackets.push(packet); startupPort.emit('message', packet); };
startupWorker.unref = () => {};
let startupTask;
const startup = createRenderer({
    makeWord: () => startupWord,
    titleStillReady: () => true,
    schedule: task => { startupTask = task; },
    createWorker: () => startupWorker
}, true);
const oldStartup = startup.notifications.open({ ...title, name: 'Retired startup' });
const liveStartup = startup.notifications.open({ ...title, name: 'Current startup' });
assert.equal(Atomics.load(startupWord, 0), 0, 'speech cannot start before saved settings resolve');
assert.equal(startupTask, undefined);
startup.setSpeechEnabled(false);
startupTask();
assert.deepEqual(startupPackets.map(p => [p.name, p.brailleOnly]), [['Current startup', true]]);
startupChild.stdout.emit('data', 'R\r\n');
startupChild.stdout.emit('data', 'P\r\n');
assert.deepEqual(startupCommands, ['LCurrent startup\n', 'Y\n']);
startupChild.stdout.emit('data', 'C\r\n');
assert.equal(startupCommands.at(-1), 'N\n', 'a provider without braille cannot receive muted text');
startupChild.stdout.emit('data', 'D\r\n');
startup.notifications.focus(oldStartup, title);
startup.notifications.focus(liveStartup, title);
assert.equal(startupPackets.length, 1, 'muted output is skipped once the provider reports no braille');
startup.setSpeechEnabled(true);
assert.equal(startupPackets.length, 2, 'restoration only revokes the muted transport');
assert.equal(startupPackets[1].kind, 'cancel');
startup.notifications.focus(liveStartup, title);
assert.equal(startupPackets[2].name, title.name);
assert.equal(startupPackets[2].brailleOnly, undefined);
assert.equal(startupCommands.at(-1), 'SSynthetic command\n');
console.log('Verified startup preference gating, bounded speech, safe stop and retirement, live braille, and fresh unmute without replay.');
