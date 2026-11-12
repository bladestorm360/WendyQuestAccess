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
let writing = false;
let cancel = false;
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
    if (!ready || writing || failed) return;
    if (cancel) {
        cancel = false;
        writing = true;
        child.stdin.write('C\n');
        return;
    }
    while (queue.length) {
        const message = queue.shift();
        if (Atomics.load(word, 0) !== message.epoch) {
            parentPort.postMessage('ack');
            continue;
        }
        const payload = formatSpeech(message);
        if (!payload) {
            parentPort.postMessage('ack');
            continue;
        }
        writing = true;
        child.stdin.write(`S${payload}\n`);
        return;
    }
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
            if (status === 'R' && !ready) ready = true;
            else if ((status === 'S' || status === 'C') && writing) {
                writing = false;
                if (status === 'S') parentPort.postMessage('ack');
            } else return fail();
        }
        pump();
    });
}

parentPort.on('message', message => {
    if (failed || !message) return;
    if (message.kind === 'cancel') {
        while (queue.length) {
            queue.shift();
            parentPort.postMessage('ack');
        }
        if (child) cancel = true;
    } else if (queue.length < 8 &&
        Number.isInteger(message.epoch) && message.epoch > 0 && Atomics.load(word, 0) === message.epoch) {
        queue.push(message);
        if (!child) begin();
    } else {
        parentPort.postMessage('ack');
    }
    pump();
});
