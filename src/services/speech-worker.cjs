'use strict';

// This module runs in a dedicated Node worker. A single bounded request crosses
// the child pipe at a time, so a stalled backend cannot accumulate pipe writes.
const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const { join } = require('path');
const { formatSpeech } = require('./speech-text.cjs');

const word = new Int32Array(workerData);
const queue = [];
let child = null;
let ready = false;
let providerOpened = false;
let active = null;
let failed = false;
let line = '';

function fail() {
    if (failed) return;
    failed = true;
    queue.length = 0;
    if (child) child.stdin.end();
    parentPort.postMessage('failed');
    parentPort.close();
}

function pump() {
    if (!ready || active || failed) return;
    while (queue.length) {
        const message = queue.shift();
        if (Atomics.load(word, 0) !== message.epoch) {
            parentPort.postMessage('discarded');
            continue;
        }
        const payload = formatSpeech(message);
        if (!payload || Atomics.load(word, 0) !== message.epoch) {
            parentPort.postMessage('discarded');
            continue;
        }
        active = { epoch: message.epoch, expected: 'P' };
        child.stdin.write(`S${payload}\n`);
        return;
    }
}

function grant() {
    // A pipe write is only preparation. The helper requests a fresh decision
    // before provider work and again if it just finished initialization.
    const accepted = Atomics.load(word, 0) === active.epoch;
    active.expected = 'D';
    if (accepted) active.expected = providerOpened ? 'S' : 'B';
    child.stdin.write(accepted ? 'Y\n' : 'N\n');
}

function begin() {
    child = spawn(join(__dirname, 'WendyQuestSpeech.exe'), [], {
        cwd: __dirname, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], shell: false
    });
    child.once('error', fail);
    child.once('exit', fail);
    child.stdin.once('error', fail);
    child.stdout.setEncoding('ascii');
    child.stdout.on('data', chunk => {
        if (failed) return;
        if (line.length + chunk.length > 128) return fail();
        line += chunk;
        for (let end = line.indexOf('\n'); end >= 0; end = line.indexOf('\n')) {
            const status = line.slice(0, end).trimEnd();
            line = line.slice(end + 1);
            if (status === 'R' && !ready) {
                ready = true;
                continue;
            }
            if (status !== active?.expected) return fail();
            if (status === 'P' || status === 'B') {
                if (status === 'B') providerOpened = true;
                grant();
            } else {
                active = null;
                parentPort.postMessage(status === 'S' ? 'ack' : 'discarded');
            }
        }
        pump();
    });
}

parentPort.on('message', message => {
    if (failed || !message) return;
    if (message.kind === 'cancel') {
        while (queue.length) {
            queue.shift();
            parentPort.postMessage('discarded');
        }
    } else if (queue.length < 8 &&
        Number.isInteger(message.epoch) && message.epoch > 0 && Atomics.load(word, 0) === message.epoch) {
        queue.push(message);
        if (!child) begin();
    } else {
        parentPort.postMessage('discarded');
    }
    pump();
});
