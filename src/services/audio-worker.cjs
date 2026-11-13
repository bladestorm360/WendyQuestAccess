'use strict';

const { parentPort, workerData } = require('worker_threads');
const { join } = require('path');
const generation = new Int32Array(workerData);
let addon;
let failed = false;

parentPort.on('message', request => {
    const { epoch, hrtf, cue, right, up, forward, gain, pitch } = request;
    let status = 0;
    if (epoch > 0 && Atomics.load(generation, 0) === epoch) {
        try {
            if (failed) status = -1;
            else {
                if (!addon) {
                    addon = require(join(__dirname, 'WendyQuestAudio.node'));
                    if (addon.attach(Buffer.from(workerData)) !== 1) throw Error('Audio addon attachment failed');
                }
                status = addon.play(epoch, hrtf ? 1 : 0, cue, right, up, forward, gain, pitch);
                if (status !== -1 && status !== 0 && status !== 1 && status !== 2) {
                    throw Error('Invalid audio addon result');
                }
            }
        } catch {
            failed = true;
            status = -1;
        }
    }
    parentPort.postMessage({ epoch, status });
});
