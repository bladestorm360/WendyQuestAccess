'use strict';

function createAudio(host) {
    let generation = null;
    let worker = null;
    let active = null;
    let pending = null;
    let inFlight = null;
    let scheduled = false;
    let failed = false;
    let nextEpoch = 0;

    function retire(scene) {
        if (!active || (scene && active.scene !== scene)) return;
        Atomics.store(generation, 0, 0);
        active = pending = null;
    }

    function notify(request, status) {
        if (active !== request) return;
        if (!request.ready()) return retire(request.scene);
        if (status === 2) request.report('Preview uses HRTF.');
        else if (status === 1) request.report(request.hrtf ?
            'HRTF unavailable. Preview uses stereo and rear pitch.' : 'Preview uses stereo and rear pitch.');
        else if (status < 0) request.report('Mod audio output unavailable.');
    }

    function failedWorker() {
        if (failed) return;
        failed = true;
        if (active) notify(active, -1);
        retire();
        inFlight = null;
    }

    function drain() {
        scheduled = false;
        if (!pending || inFlight || failed) return;
        const request = pending;
        pending = null;
        if (active !== request || !request.ready()) return retire(request.scene);
        try {
            if (!worker) {
                worker = host.createAudioWorker(generation.buffer);
                worker.on('message', receipt => {
                    const done = inFlight;
                    if (!done || done.epoch !== receipt?.epoch) return;
                    inFlight = null;
                    notify(done, receipt.status);
                    schedule();
                });
                worker.on('error', failedWorker);
                worker.on('exit', failedWorker);
                worker.unref();
            }
            inFlight = request;
            const { epoch, hrtf, right, up, forward, gain } = request;
            // Only the bounded bearing and scalar settings cross to the worker.
            // The scene and readiness predicate remain in the renderer.
            worker.postMessage({ epoch, hrtf, right, up, forward, gain });
        } catch { failedWorker(); }
    }

    function schedule() {
        if (scheduled || inFlight || !pending) return;
        scheduled = true;
        host.schedule(drain);
    }

    function preview(scene, hrtf, bearing, ready, report) {
        if (!ready()) return false;
        if (failed || nextEpoch >= 0x7ffffffe) {
            report('Mod audio output unavailable.');
            return true;
        }
        if (!generation) generation = host.makeWord();
        const [right, up, forward] = bearing;
        // Replacing the pending preview also revokes any previous native PCM.
        // The callback observes the same word without a worker round trip.
        active = pending = { epoch: ++nextEpoch, scene, hrtf, right, up, forward, gain: 0.65, ready, report };
        Atomics.store(generation, 0, active.epoch);
        schedule();
        return true;
    }

    return { preview, retire };
}

module.exports = { createAudio };
