'use strict';

const { createGate } = require('./gate');

const MAX_PENDING = 8;

function createRenderer(host) {
    let gate = null;
    let word = null;
    let worker = null;
    let failed = false;
    let scheduled = false;
    let inFlight = 0;
    let nextSequence = 0;
    const pending = [];
    const counters = { dropped: 0, submitted: 0, workerFailures: 0 };

    function workerFailed() {
        if (failed) return;
        failed = true;
        counters.workerFailures++;
        pending.length = 0;
        if (gate) gate.close();
    }

    function drain() {
        while (worker && inFlight < MAX_PENDING && pending.length) {
            const request = pending.shift();
            if (!gate.accepts(request.epoch)) continue;
            try {
                worker.postMessage(request);
                inFlight++;
            } catch {
                workerFailed();
            }
        }
    }

    function start() {
        scheduled = false;
        if (failed || worker || !gate.epoch || !host.titleStillReady()) return;
        try {
            worker = host.createWorker(word.buffer);
            worker.on('message', message => {
                if (message === 'ack') {
                    if (inFlight > 0) inFlight--;
                    counters.submitted++;
                    if (gate.epoch) drain();
                } else if (message === 'failed') {
                    workerFailed();
                }
            });
            worker.on('error', workerFailed);
            worker.on('exit', workerFailed);
            worker.unref();
            drain();
        } catch {
            workerFailed();
        }
    }

    function submit(epoch, focused) {
        if (failed || !gate.accepts(epoch)) return;
        if (pending.length + inFlight >= MAX_PENDING) {
            counters.dropped++;
            return;
        }
        pending.push({ epoch, sequence: ++nextSequence, kind: 'title', name: focused.name,
            enabled: focused.enabled, index: focused.index });
        drain();
        if (!worker && !scheduled) {
            scheduled = true;
            host.schedule(start);
        }
    }

    const notifications = {
        open(focused) {
            if (failed) return 0;
            if (!gate) {
                try {
                    word = host.makeWord();
                    gate = createGate(word);
                } catch {
                    workerFailed();
                    return 0;
                }
            }
            const epoch = gate.open('title');
            submit(epoch, focused);
            return epoch;
        },
        close() {
            if (!gate || !gate.close()) return;
            pending.length = 0;
            // Invalidation is visible to the worker before this message can
            // run. The message requests interruption of previously posted speech.
            if (worker && !failed) {
                try { worker.postMessage({ kind: 'cancel' }); }
                catch { workerFailed(); }
            }
        },
        focus: submit
    };
    return { notifications, counters };
}

module.exports = { createRenderer };
