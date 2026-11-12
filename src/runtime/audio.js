'use strict';

// IDs match the original Windows cue bank. Preparation uses no output.
const CUE = Object.freeze({ prepare: -1, preview: 0, wallBump: 1, wallBrush: 2,
    beaconPulse: 3, beaconTurn: 4, beaconArrival: 5 });

function createAudio(host) {
    let generation = null;
    let worker = null;
    let active = null;
    let pending = null;
    let inFlight = null;
    let scheduled = false;
    let failed = false;
    let stereoReady = false;
    let hrtfResolved = false;
    let nextEpoch = 0;

    function retire(scene, source) {
        if (!active || (scene && active.scene !== scene) || (source && active.source !== source)) return;
        Atomics.store(generation, 0, 0);
        active = pending = null;
    }

    function notify(request, status) {
        if (status > 0) {
            stereoReady = true;
            if (request.hrtf) hrtfResolved = true;
        }
        if (active !== request) return;
        if (!request.ready()) return retire(request.scene);
        request.complete?.(status);
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
            const { epoch, hrtf, cue, right, up, forward, gain } = request;
            // Only the bounded bearing and scalar settings cross to the worker.
            // The scene and readiness predicate remain in the renderer.
            worker.postMessage({ epoch, hrtf, cue, right, up, forward, gain });
        } catch { failedWorker(); }
    }

    function schedule() {
        if (scheduled || inFlight || !pending) return;
        scheduled = true;
        host.schedule(drain);
    }

    function play(scene, hrtf, cue, gain, bearing, ready, complete, source = 'preview') {
        if (!ready()) return false;
        if (active?.scene === scene && source === 'beacon' && active.source === 'wall') return false;
        if (cue === CUE.prepare && (active?.cue === CUE.prepare || inFlight?.cue === CUE.prepare)) return false;
        if (failed || nextEpoch >= 0x7ffffffe) {
            complete?.(-1);
            return !!complete;
        }
        if (!generation) generation = host.makeWord();
        const [right, up, forward] = bearing;
        // Replacing the pending preview also revokes any previous native PCM.
        // The callback observes the same word without a worker round trip.
        active = pending = { epoch: ++nextEpoch, scene, source, hrtf, cue, right, up, forward, gain, ready, complete };
        Atomics.store(generation, 0, active.epoch);
        schedule();
        return true;
    }

    return {
        cues: CUE, play, retire,
        isPrepared: hrtf => !failed && stereoReady && (!hrtf || hrtfResolved),
        prepare(scene, hrtf, ready, complete, source) {
            return play(scene, hrtf, CUE.prepare, 0, [0, 0, 1], ready, complete, source);
        },
        preview(scene, hrtf, bearing, ready, report, cue = CUE.preview, gain = 0.65) {
            return play(scene, hrtf, cue, gain, bearing, ready, status => {
                if (status === 2) report('Preview uses HRTF.');
                else if (status === 1) report(hrtf ?
                    'HRTF unavailable. Preview uses stereo and rear pitch.' : 'Preview uses stereo and rear pitch.');
                else if (status < 0) report('Mod audio output unavailable.');
            });
        }
    };
}

module.exports = { CUE, createAudio };
