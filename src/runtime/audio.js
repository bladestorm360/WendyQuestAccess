'use strict';

// IDs match the Windows cue bank. Preparation uses no output.
const CUE = Object.freeze({ prepare: -1, preview: 0, wallBump: 1, wallBrush: 2,
    beaconPulse: 3, beaconTurn: 4, beaconArrival: 5, caveGo: 6, entityPerson: 7, entityExit: 8,
    entityDoor: 9, entityStairs: 10, entityTreasure: 11, entityObject: 12, entityCheckpoint: 13,
    battleLead: 14, battlePower: 15, battleAccuracy: 16, battleIce: 17, wallNorth: 18, footstep: 19,
    wallEast: 20, wallSouth: 21, wallWest: 22 });
const WALL = 1;
const FOOTSTEP = 2;
const WALL_DEADLINE = 3;

function createAudio(host) {
    let generation = null;
    let worker = null;
    // One replaceable request per output lane and one operation in flight.
    const active = [null, null, null];
    const pending = [null, null, null];
    let inFlight = null;
    let scheduled = false;
    let failed = false;
    let stereoReady = false;
    let hrtfResolved = false;
    let nextEpoch = 0;

    function retire(scene, source) {
        for (let lane = 0; lane < active.length; lane++) {
            const request = active[lane];
            if (!request || (scene && request.scene !== scene) || (source && request.source !== source)) continue;
            Atomics.store(generation, lane, 0);
            active[lane] = pending[lane] = null;
        }
    }

    function notify(request, status) {
        if (status > 0) {
            stereoReady = true;
            if (request.hrtf) hrtfResolved = true;
        }
        if (active[request.lane] !== request) return;
        if (!request.ready()) return retire(request.scene, request.source);
        request.complete?.(status);
    }

    function failedWorker() {
        if (failed) return;
        failed = true;
        for (const request of active) if (request) notify(request, -1);
        retire();
        inFlight = null;
    }

    function drain() {
        scheduled = false;
        const request = pending.find(Boolean);
        if (!request || inFlight || failed) return;
        pending[request.lane] = null;
        if (active[request.lane] !== request || !request.ready()) {
            retire(request.scene, request.source);
            schedule();
            return;
        }
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
            const { epoch, lane, hrtf, cue, right, up, forward, gain, pitch } = request;
            worker.postMessage({ epoch, lane, hrtf, cue, right, up, forward, gain, pitch });
        } catch { failedWorker(); }
    }

    function schedule() {
        if (scheduled || inFlight || !pending.some(Boolean)) return;
        scheduled = true;
        host.schedule(drain);
    }

    function play(scene, hrtf, cue, gain, bearing, ready, complete, source = 'preview', pitch = 1, wallUntil = 0) {
        if (!ready()) return false;
        const primary = active[0];
        if (source === 'soundscape' && primary && primary.source !== 'soundscape') return false;
        if (source === 'beacon' && primary?.scene === scene && primary.source === 'wall') return false;
        if (source !== 'cave' && source !== 'preview' && primary?.scene === scene && primary.source === 'cave' &&
            (cue === CUE.prepare || source === 'beacon')) return false;
        if (cue === CUE.prepare && (primary?.cue === CUE.prepare || inFlight?.cue === CUE.prepare)) return false;
        if (failed || nextEpoch >= 0x7ffffffe) {
            complete?.(-1);
            return false;
        }
        if (!generation) generation = new Int32Array(new SharedArrayBuffer(16));
        const lane = wallUntil ? WALL : source === 'footstep' && cue === CUE.footstep ? FOOTSTEP : 0;
        const [right, up, forward] = bearing;
        active[lane] = pending[lane] = {
            epoch: ++nextEpoch, lane, scene, source, hrtf, cue, right, up, forward, gain, pitch, ready, complete
        };
        if (lane === WALL) Atomics.store(generation, WALL_DEADLINE, wallUntil);
        Atomics.store(generation, lane, nextEpoch);
        schedule();
        return true;
    }

    return {
        cues: CUE, play, retire,
        extendWall(scene, until) {
            if (active[WALL]?.scene !== scene || ((Atomics.load(generation, WALL_DEADLINE) - Date.now()) | 0) <= 0)
                return false;
            Atomics.store(generation, WALL_DEADLINE, until);
            return true;
        },
        isPrepared: hrtf => !failed && stereoReady && (!hrtf || hrtfResolved),
        prepare(scene, hrtf, ready, complete, source) {
            return play(scene, hrtf, CUE.prepare, 0, [0, 0, 1], ready, complete, source);
        },
        preview(scene, hrtf, bearing, ready, report, cue = CUE.preview, gain = 0.65, pitch = 1) {
            return play(scene, hrtf, cue, gain, bearing, ready, status => {
                if (status === 2) report('Preview uses HRTF.');
                else if (status === 1) report(hrtf ?
                    'HRTF unavailable. Preview uses stereo and rear pitch.' : 'Preview uses stereo and rear pitch.');
                else if (status < 0) report('Mod audio output unavailable.');
            }, 'preview', pitch);
        }
    };
}

module.exports = { CUE, createAudio };
