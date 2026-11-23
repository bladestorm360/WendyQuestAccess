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
let brailleAvailable = true;
let active = null;
let silence = 0;
let failed = false;
let line = '';
const receipt=(status,message,retry=false)=>parentPort.postMessage(message?.preserveDescription?{status,sequence:message.sequence,retry}:status);

function fail() {
    if (failed) return;
    failed = true;
    queue.length = 0;
    silence = 0;
    if (child) child.stdin.end();
    parentPort.postMessage('failed');
    parentPort.close();
}

function pump() {
    if (!ready || active || failed) return;
    if (silence) {
        const epoch = silence;
        silence = 0;
        if (providerOpened && Atomics.load(word, 0) === epoch) {
            active = { epoch, expected: 'P', silence: true };
            child.stdin.write('Q\n');
            return;
        }
    }
    while (queue.length) {
        const message = queue.shift();
        if (Atomics.load(word, 0) !== message.epoch || (message.brailleOnly === true && !brailleAvailable)) {
            receipt('discarded',message,Atomics.load(word,0)!==message.epoch);
            continue;
        }
        const payload = formatSpeech(message);
        if (!payload || Atomics.load(word, 0) !== message.epoch) {
            receipt('discarded',message,Atomics.load(word,0)!==message.epoch);
            continue;
        }
        active = { epoch: message.epoch, expected: 'P', braille: message.brailleOnly === true, message };
        const command = active.braille ? 'L' : message.append === true ? 'A' : 'S';
        child.stdin.write(`${command}${payload}\n`);
        return;
    }
}

function grant() {
    // A pipe write is only preparation. The helper requests a fresh decision
    // before provider work and again if it just finished initialization.
    const accepted = Atomics.load(word, 0) === active.epoch && (!active.braille || brailleAvailable);
    active.expected = accepted ? (active.silence ? 'Q' : providerOpened ? 'S' : 'B') : 'D';
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
            const expected = active?.expected;
            const noBraille = status === 'C' && expected === 'B';
            const silenceUnavailable = status === 'U' && expected === 'Q';
            const brailleRejected = status === 'D' && expected === 'S' && active?.braille;
            if (status !== expected && !noBraille && !silenceUnavailable && !brailleRejected) return fail();
            if (status === 'P' || status === 'B' || noBraille) {
                if (status !== 'P') {
                    providerOpened = true;
                    if (noBraille) {
                        brailleAvailable = false;
                        parentPort.postMessage('noBraille');
                    }
                }
                grant();
            } else {
                const control = active.silence;
                const message=active.message;
                active = null;
                if (control) {
                    if (status !== 'D') parentPort.postMessage(status === 'Q' ? 'silenced' : 'silenceUnavailable');
                } else receipt(status === 'S' ? 'ack' : 'discarded',message,Atomics.load(word,0)!==message.epoch);
            }
        }
        pump();
    });
}

parentPort.on('message', message => {
    if (failed || !message) return;
    if (message.kind === 'cancel') {
        silence = 0;
        while (queue.length) {
            receipt('discarded',queue.shift(),true);
        }
    } else if (message.kind === 'silence') {
        if (child && Number.isInteger(message.epoch) && message.epoch > 0 && Atomics.load(word, 0) === message.epoch)
            silence = message.epoch;
    } else if (queue.length < 8 &&
        Number.isInteger(message.epoch) && message.epoch > 0 && Atomics.load(word, 0) === message.epoch) {
        queue.push(message);
        if (!child) begin();
    } else {
        receipt('discarded',message);
    }
    pump();
});
