'use strict';

const { createGate } = require('./gate');

const MAX_PENDING = 8;

function createRenderer(host, waitForSpeechPreference = false) {
    let gate = null;
    let word = null;
    let worker = null;
    let failed = false;
    let scheduled = false;
    let inFlight = 0;
    let nextSequence = 0;
    let nextContext = 0;
    let context = 0;
    let isPresented = null;
    let speechEnabled = waitForSpeechPreference ? null : true;
    let brailleAvailable = true;
    let outputStarted = false;
    const pending = [];
    const counters = { dropped: 0, discarded: 0, submitted: 0, silenced: 0, silenceUnavailable: 0, workerFailures: 0 };

    function workerFailed() {
        if (failed) return;
        failed = true;
        counters.workerFailures++;
        pending.length = 0;
        if (gate) gate.close();
        // Feature observers keep their context and review even if output fails.
    }

    function drain() {
        while (worker && gate?.domain === 'frontend' && inFlight < MAX_PENDING && pending.length) {
            const record = pending.shift();
            try {
                // A retained logical context can begin a fresh transport
                // sequence after mute. Its first record has no prior output.
                if (!outputStarted && record.append) record.append = false;
                worker.postMessage({ ...record, epoch: gate.epoch, ...(speechEnabled ? {} : { brailleOnly: true }) });
                outputStarted = true;
                inFlight++;
            } catch {
                workerFailed();
            }
        }
    }

    function start() {
        scheduled = false;
        if (failed || worker || !pending.length || gate?.domain !== 'frontend') return;
        if (!isPresented?.()) return retireOutput();
        try {
            worker = host.createWorker(word.buffer);
            worker.on('message', message => {
                if (message === 'ack' || message === 'discarded') {
                    if (inFlight > 0) inFlight--;
                    if (message === 'ack') counters.submitted++;
                    else counters.discarded++;
                    drain();
                } else if (message === 'noBraille') {
                    brailleAvailable = false;
                    if (speechEnabled === false) pending.length = 0;
                } else if (message === 'silenced') {
                    counters.silenced++;
                } else if (message === 'silenceUnavailable') {
                    counters.silenceUnavailable++;
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

    function readyOutput() {
        if (failed || speechEnabled === null || !pending.length) return;
        if (speechEnabled === false && !brailleAvailable) {
            pending.length = 0;
            return;
        }
        if (!gate) {
            try {
                word = host.makeWord();
                gate = createGate(word);
            } catch {
                workerFailed();
                return;
            }
        }
        if (gate.domain !== 'frontend' && !gate.open('frontend')) {
            pending.length = 0;
            return;
        }
        drain();
        if (!worker && !scheduled) {
            scheduled = true;
            host.schedule(start);
        }
    }

    function submit(token, focused) {
        if (failed || !context || token !== context || (speechEnabled === false && !brailleAvailable)) return false;
        if (pending.length + inFlight >= MAX_PENDING) {
            counters.dropped++;
            return false;
        }
        pending.push({ kind: 'title', ...focused, sequence: ++nextSequence });
        readyOutput();
        return true;
    }

    function retireOutput() {
        pending.length = 0;
        outputStarted = false;
        // Publish the invalid epoch before sending a bounded cancellation.
        if (!gate?.close() || !worker || failed) return;
        try { worker.postMessage({ kind: 'cancel' }); }
        catch { workerFailed(); }
    }

    function setSpeechEnabled(enabled, maySilence) {
        if (enabled === speechEnabled) return;
        const previous = speechEnabled;
        speechEnabled = enabled;
        if (previous === null) {
            if (!isPresented?.()) pending.length = 0;
            readyOutput();
            return;
        }
        retireOutput();
        // Explicit mute may stop a provider that is already open. The worker
        // serializes it with any output call, and settings can retire its grant.
        if (enabled || !worker || failed || !maySilence?.()) return;
        const epoch = gate.open('silence');
        if (!epoch) return;
        try { worker.postMessage({ kind: 'silence', epoch }); }
        catch { workerFailed(); }
    }

    const notifications = {
        open(focused, ready = host.titleStillReady) {
            if (nextContext >= 0x7ffffffe) return 0;
            retireOutput();
            const token = context = ++nextContext;
            isPresented = ready;
            submit(token, focused);
            return token;
        },
        close(token = context) {
            if (!context || token !== context) return;
            context = 0;
            isPresented = null;
            if (gate?.domain !== 'silence') retireOutput();
        },
        focus: submit
    };
    return {
        notifications, counters, setSpeechEnabled,
        retireSilence() { if (gate?.domain === 'silence') retireOutput(); }
    };
}

module.exports = { createRenderer };
