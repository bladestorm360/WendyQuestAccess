'use strict';

// IDs match the Windows cue bank. Preparation uses no output.
const CUE = Object.freeze({ prepare: -1, preview: 0, wallBump: 1, wallBrush: 2,
    beaconPulse: 3, beaconTurn: 4, beaconArrival: 5, caveGo: 6, entityPerson: 7, entityExit: 8,
    entityDoor: 9, entityStairs: 10, entityTreasure: 11, entityObject: 12, entityCheckpoint: 13,
    battleLead: 14, battlePower: 15, battleAccuracy: 16, battleIce: 17, wallNorth: 18, footstep: 19,
    wallEast: 20, wallSouth: 21, wallWest: 22 });
// Match the native mixer's fixed wall lanes and shared deadline word.
const WALL_LANES = { [CUE.wallNorth]: 1, [CUE.wallEast]: 3, [CUE.wallSouth]: 4, [CUE.wallWest]: 5 };
const FOOTSTEP = 2;
const SOUNDSCAPE_START = 6;
const SOUNDSCAPE_VOICES = 5;
const WALL_DEADLINE = SOUNDSCAPE_START + SOUNDSCAPE_VOICES;

function createAudio(host) {
    let generation = null;
    let worker = null;
    // One replaceable request per output lane and one operation in flight.
    const active = Array(WALL_DEADLINE).fill(null);
    const pending = Array(WALL_DEADLINE).fill(null);
    let inFlight = null;
    let scheduled = false;
    let failed = false;
    let stereoReady = false;
    let hrtfResolved = false;
    let nextEpoch = 0;

    function retire(scene, source, cue, voice) {
        for (let lane = 0; lane < active.length; lane++) {
            const request = active[lane];
            if ((voice !== undefined && lane !== SOUNDSCAPE_START + voice) || !request || (scene && request.scene !== scene) || (source && request.source !== source) ||
                (cue !== undefined && request.cue !== cue)) continue;
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
        const ready = request.ready();
        // Preparation opens the device but never owns a playing voice.
        // Release the channel before notifying callers so a fresh request
        // can use the initialized output immediately.
        if (!ready || request.cue === CUE.prepare) retireRequest(request);
        if (ready) request.complete?.(status);
    }

    function retireRequest(request) {
        const lane = request.lane;
        if (active[lane] !== request) return;
        Atomics.store(generation, lane, 0);
        active[lane] = pending[lane] = null;
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
        if (!request.ready()) {
            retireRequest(request);
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

    function play(scene, hrtf, cue, gain, bearing, ready, complete, source = 'preview', pitch = 1, wallUntil = 0, voice) {
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
        const movement = source === 'footstep' && cue === CUE.footstep ||
            (source === 'bump' || source === 'caveStop') && cue === CUE.wallBump;
        const ambient = (source === 'soundscape' || source === 'guardStep') && Number.isInteger(voice) && voice >= 0 && voice < SOUNDSCAPE_VOICES;
        const lane = wallUntil ? WALL_LANES[cue] : movement ? FOOTSTEP : ambient ? SOUNDSCAPE_START + voice : 0;
        if (lane === undefined) return false;
        if (lane === 0 && source !== 'soundscape' && cue !== CUE.prepare) retire(scene, 'soundscape');
        if (!generation) generation = new Int32Array(new SharedArrayBuffer((WALL_DEADLINE + 1) * Int32Array.BYTES_PER_ELEMENT));
        const [right, up, forward] = bearing;
        active[lane] = pending[lane] = {
            epoch: ++nextEpoch, lane, scene, source, hrtf, cue, right, up, forward, gain, pitch, ready, complete
        };
        if (wallUntil) Atomics.store(generation, WALL_DEADLINE, wallUntil);
        Atomics.store(generation, lane, nextEpoch);
        schedule();
        return true;
    }

    return {
        cues: CUE, play, retire, soundscapeVoices: SOUNDSCAPE_VOICES,
        extendWall(scene, until) {
            if (!generation || ((Atomics.load(generation, WALL_DEADLINE) - Date.now()) | 0) <= 0 ||
                !active.some((request, lane) => lane > 0 && lane < SOUNDSCAPE_START && lane !== FOOTSTEP && request?.scene === scene))
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
