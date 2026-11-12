'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { decodeMap, DIRECTIONS, HEADER, MAX_CELLS } = require('./geometry.cjs');
const { solveRoute } = require('./routes.cjs');
const { previewCrossing } = require('./puzzles/crossing.cjs');

const BUILD = '26578620';
const admission = new Int32Array(workerData.admission);
const directory = workerData.geometryDirectory;
let manifest = null;
let cachedId = 0;
let cachedGeometry = null;

function readBounded(name, limit) {
    const file = path.join(directory, name);
    const handle = fs.openSync(file, 'r');
    try {
        const size = fs.fstatSync(handle).size;
        if (!Number.isSafeInteger(size) || size < 1 || size > limit) throw new Error('Invalid map geometry size');
        const bytes = Buffer.allocUnsafe(size);
        if (fs.readSync(handle, bytes, 0, size, 0) !== size) throw new Error('Incomplete map geometry');
        return bytes;
    } finally {
        fs.closeSync(handle);
    }
}

function geometry(id) {
    if (id === cachedId) return cachedGeometry;
    if (!manifest) {
        const source = JSON.parse(readBounded('manifest.json', 65536));
        if (source.build !== BUILD || !source.maps) throw new Error('Unsupported map geometry build');
        manifest = source;
    }
    const expected = manifest.maps[id]?.geometry;
    if (!expected) throw new Error('Map geometry is unavailable');
    const bytes = readBounded(`${id}.wqg`, HEADER + MAX_CELLS);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Map geometry changed');
    cachedGeometry = decodeMap(id, bytes);
    cachedId = id;
    return cachedGeometry;
}

// Each request carries a copied world state. Keep one current geometry, with
// no access to game objects or game files. The caller owns the in-flight cap.
parentPort.on('message', message => {
    const { epoch, sequence, map, live, request } = message || {};
    if (!Number.isInteger(epoch) || epoch < 1 || epoch > 0x7ffffffe ||
        !Number.isSafeInteger(sequence) || sequence < 1 || !Number.isInteger(map) || map < 1 || map > 999) return;
    const cancelled = () => Atomics.load(admission, 0) !== epoch;
    let result;
    try {
        if (!cancelled()) {
            const base = geometry(map);
            if (live.width !== undefined && (live.width !== base.width || live.height !== base.height ||
                live.scrollType !== base.scrollType)) throw new Error('Map dimensions changed');
            result = request.motion ? previewCrossing(base, live, request, cancelled) : solveRoute(base, live, request, cancelled);
            if (result.status === 'ready' && request.beacon === true) {
                // Two direction bits and the bounded distance to the next turn.
                // The renderer advances one byte per accepted native step.
                const course = new Uint8Array(result.distance);
                let index = 0;
                for (const leg of result.legs) {
                    const heading = DIRECTIONS.indexOf(leg.direction);
                    for (let left = leg.tiles; left > 0; left--) {
                        if ((index & 63) === 0 && cancelled()) return parentPort.postMessage({ epoch, sequence, map,
                            result: { status: 'cancelled' } });
                        course[index++] = (Math.min(63, left) << 2) | heading;
                    }
                }
                result.course = course;
            }
            if (result.status === 'ready' && Number.isInteger(request.limit) && request.limit > 0 && request.limit <= 8 &&
                result.legs.length > request.limit) {
                result.more = true;
                result.legs.length = request.limit;
            }
        }
    } catch {
        result = { status: 'unavailable' };
    }
    if (cancelled() || !result) result = { status: 'cancelled' };
    const data = result.course || result.opening?.stamps;
    parentPort.postMessage({ epoch, sequence, map, result }, data ? [data.buffer] : []);
});
