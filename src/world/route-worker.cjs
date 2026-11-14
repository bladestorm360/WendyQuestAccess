'use strict';

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { decodeMap, DIRECTIONS, HEADER, MAX_CELLS, CELL_BITS } = require('./geometry.cjs');
const { solveRoute, findReachable } = require('./routes.cjs');
const { MAX_CATALOG_BYTES, readCatalog, rankEntrances } = require('./walking-catalog.cjs');
const { previewCrossing } = require('./puzzles/crossing.cjs');
const { routeThroughTerrain } = require('./terrain-controls.cjs');
const { solveSaltRoute } = require('./puzzles/salt-route.cjs');

const BUILD = '26578620';
const admission = new Int32Array(workerData.admission);
const directory = workerData.geometryDirectory;
let manifest = null;
let walking;
let cachedId = 0;
let cachedTileset;
let cachedGeometry = null;

function readBounded(name, limit, cancelled) {
    if (cancelled()) return null;
    const handle = fs.openSync(path.join(directory, name), 'r');
    try {
        if (cancelled()) return null;
        const size = fs.fstatSync(handle).size;
        if (!Number.isSafeInteger(size) || size < 1 || size > limit) throw new Error('Invalid map geometry size');
        if (cancelled()) return null;
        const bytes = Buffer.allocUnsafe(size);
        if (fs.readSync(handle, bytes, 0, size, 0) !== size) throw new Error('Incomplete map geometry');
        return bytes;
    } finally {
        fs.closeSync(handle);
    }
}

function geometry(id, tileset, cancelled) {
    if (id === cachedId && tileset === cachedTileset) return cachedGeometry;
    if (!manifest) {
        const bytes = readBounded('manifest.json', 128 * 1024, cancelled);
        if (!bytes || cancelled()) return null;
        const source = JSON.parse(bytes);
        if (source.build !== BUILD || !source.maps) throw new Error('Unsupported map geometry build');
        manifest = source;
    }
    const entry = manifest.maps[id];
    const expected = entry?.geometry;
    if (!expected) throw new Error('Map geometry is unavailable');
    const variant = tileset === undefined || tileset === entry.tileset ? null : entry.variants?.[tileset];
    if (tileset !== undefined && tileset !== entry.tileset && !Array.isArray(variant))
        throw new Error('Unverified active tileset');
    const bytes = readBounded(`${id}.wqg`, HEADER + MAX_CELLS, cancelled);
    if (!bytes || cancelled()) return null;
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Map geometry changed');
    if (cancelled()) return null;
    const geometry = decodeMap(id, bytes);
    if (variant) {
        if (variant.length > geometry.cells.length) throw new Error('Invalid tileset variant');
        for (let index = 0; index < variant.length; index++) {
            if ((index & 63) === 0 && cancelled()) return null;
            const packed = variant[index];
            const cell = packed & (MAX_CELLS - 1);
            const flags = packed >>> CELL_BITS;
            if (!Number.isInteger(packed) || cell >= geometry.cells.length || flags > 255)
                throw new Error('Invalid alternate terrain');
            geometry.cells[cell] = flags;
        }
    }
    cachedId = id;
    cachedTileset = tileset;
    return cachedGeometry = geometry;
}

function walkingCatalog() {
    if (walking !== undefined) return walking;
    walking = null;
    if (!manifest.walking) return walking;
    const { hash, catalog } = manifest.walking;
    if (!catalog || typeof hash !== 'string') return walking;
    const bytes = Buffer.from(JSON.stringify(catalog));
    if (bytes.length <= MAX_CATALOG_BYTES && createHash('sha256').update(bytes).digest('hex') === hash)
        walking = readCatalog(catalog, manifest.maps);
    return walking;
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
        // A retired cold job can close its current file handle and return.
        // Each subsequent disk operation and the solver need current admission.
        const base = !cancelled() && geometry(map, live?.tileset, cancelled);
        if (base && !cancelled()) {
            if (live.width !== undefined && (live.width !== base.width || live.height !== base.height ||
                live.scrollType !== base.scrollType)) throw new Error('Map dimensions changed');
            if (request.candidates !== undefined) result = findReachable(base, live, request, cancelled);
            else if (request.transfer !== undefined) {
                const catalog = walkingCatalog();
                const { transfer } = request;
                const entrances = rankEntrances(catalog, map, transfer, manifest.maps, cancelled, live.mode === 'walk');
                const groundEntrances = transfer.ground && rankEntrances(catalog, map,
                    { ...transfer, candidates: transfer.ground }, manifest.maps, cancelled, false);
                const discoveries = Array.isArray(transfer.discoveries) && transfer.discoveries.length <= 24
                    ? transfer.discoveries : undefined;
                result = solveRoute(base, live, { ...request, entrances, groundEntrances, discoveries }, cancelled);
            }
            else result = request.motion ? previewCrossing(base, live, request, cancelled) : solveRoute(base, live, request, cancelled);
            if (map === 19 && live.salt && !request.refresh &&
                ['unreachable', 'approachBlocked'].includes(result.status)) {
                result = solveSaltRoute(base, live, request, manifest.maps[map].salt, cancelled) || result;
            }
            if (['unreachable', 'approachBlocked'].includes(result.status))
                result = routeThroughTerrain(base, live, request, manifest.maps[map].controls, cancelled) || result;
            const follows = (result.status === 'ready' || result.status === 'enemyBlocked' || result.status === 'iceRoute') &&
                !result.reenter && (request.beacon === true || request.autowalk === true);
            const prefix = ['interrupted', 'saltRoute', 'controlRoute'].includes(result.status);
            if (follows || prefix && (request.beacon === true || result.status === 'interrupted' && request.autowalk === true)) {
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
            if (result.status === 'ready' && request.autowalk === true && !result.land && !request.vehicle &&
                request.waypoint !== true && result.distance > 0 && result.arrival.facing === null) {
                const target = live.events.find(event => event.id === (result.entrance ?? request.event));
                if (target && !target.normal && (target.trigger === 1 || target.trigger === 2)) {
                    const last = result.legs[result.legs.length - 1];
                    result.autowalkStop = last.direction;
                    result.autowalkMore = result.legs.length - (last.tiles === 1 ? 1 : 0) > request.limit;
                }
            }
            if ((result.status === 'ready' || result.status === 'interrupted' || result.status === 'enemyBlocked' || result.status === 'saltRoute' || result.status === 'controlRoute' || result.status === 'iceRoute') &&
                Number.isInteger(request.limit) && request.limit > 0 && request.limit <= 8 &&
                result.legs.length > request.limit) {
                result.more = true;
                result.legs.length = request.limit;
            }
        }
    } catch {
        result = { status: 'unavailable' };
    }
    if (cancelled() || !result) result = { status: 'cancelled' };
    const data = result.available || result.course || result.opening?.stamps;
    parentPort.postMessage({ epoch, sequence, map, result }, data ? [data.buffer] : []);
});
