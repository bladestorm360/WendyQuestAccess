'use strict';

const DIRECTIONS = [2, 4, 6, 8];
const DX = [0, -1, 1, 0];
const DY = [1, 0, 0, -1];
const PASSAGE = 15;
const COUNTER = 16;
const BOAT = 32;
const SHIP = 64;
const LAND = 128;
const MAX_CELLS = 16384;
const CELL_BITS = 14;
const MAX_EVENTS = 512;
const HEADER = 16;
const MAGIC = 'WQG2';

function dimensions(width, height, scrollType) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_CELLS || !Number.isInteger(scrollType) || scrollType < 0 || scrollType > 3) {
        throw new Error('Unsupported map dimensions');
    }
    return width * height;
}

function layerDecision(flag, mask) {
    if (flag & 16) return 0;
    const bits = flag & mask;
    return bits === 0 ? 1 : bits === mask ? -1 : 0;
}

function passesMask(top, upper, lower, bottom, mask) {
    return (layerDecision(top, mask) || layerDecision(upper, mask) ||
        layerDecision(lower, mask) || layerDecision(bottom, mask)) === 1;
}

function surface(top, upper, lower, bottom, region) {
    let flag = top;
    if (flag & 16) flag = upper;
    if (flag & 16) flag = lower;
    if (flag & 16) flag = bottom;
    const walking = flag & 16 ? 0 : ~flag & PASSAGE;
    const counter = (top | upper | lower | bottom) & 128 ? COUNTER : 0;
    const water = region === 254 ? BOAT | SHIP : region === 253 ? BOAT : 0;
    // The native landing test treats a partial 0x0f mask as undecided,
    // while each ordinary walking edge is a single bit.
    const landing = !water && passesMask(top, upper, lower, bottom, 0x800) &&
        passesMask(top, upper, lower, bottom, PASSAGE) ? LAND : 0;
    return walking | counter | water | landing;
}

function bakeMap(map, flags) {
    const { width, height, scrollType, data } = map;
    const count = dimensions(width, height, scrollType);
    if (!Array.isArray(data) || data.length !== count * 6 || !Array.isArray(flags)) throw new Error('Invalid map layers');
    const cells = new Uint8Array(count);
    for (let cell = 0; cell < count; cell++) {
        // Stock passage examines the first non-star layer, from layer 3
        // downward. Counter and vehicle flags have independent producers.
        cells[cell] = surface(flags[data[3 * count + cell]], flags[data[2 * count + cell]],
            flags[data[count + cell]], flags[data[cell]], data[5 * count + cell]);
    }
    return { width, height, scrollType, cells, hasLandings: true };
}

function encodeMap(id, geometry) {
    const { width, height, scrollType, cells } = geometry;
    if (!Number.isInteger(id) || id < 1 || id > 999 || cells.length !== dimensions(width, height, scrollType)) {
        throw new Error('Invalid map identity');
    }
    const data = Buffer.alloc(HEADER + cells.length);
    data.write(MAGIC, 0, 'ascii');
    data.writeUInt16LE(id, 4);
    data.writeUInt16LE(width, 6);
    data.writeUInt16LE(height, 8);
    data.writeUInt8(scrollType, 10);
    data.set(cells, HEADER);
    return data;
}

function decodeMap(id, data) {
    if (!Buffer.isBuffer(data) || data.length < HEADER ||
        data.readUInt16LE(4) !== id || data.readUInt8(11) || data.readUInt32LE(12)) throw new Error('Invalid map geometry');
    const magic = data.toString('ascii', 0, 4);
    if (magic !== MAGIC && magic !== 'WQG1') throw new Error('Unsupported map geometry format');
    const width = data.readUInt16LE(6);
    const height = data.readUInt16LE(8);
    const scrollType = data.readUInt8(10);
    if (data.length !== HEADER + dimensions(width, height, scrollType)) throw new Error('Truncated map geometry');
    return { width, height, scrollType, cells: new Uint8Array(data.subarray(HEADER)), hasLandings: magic === MAGIC };
}

function indexOf(world, x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.width && y < world.height
        ? y * world.width + x : -1;
}

function offset(world, cell, heading) {
    let x = cell % world.width + DX[heading];
    let y = Math.floor(cell / world.width) + DY[heading];
    if (world.scrollType & 2) x = (x + world.width) % world.width;
    if (world.scrollType & 1) y = (y + world.height) % world.height;
    return indexOf(world, x, y);
}

function clipRectangle(world, values) {
    if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite)) {
        throw new Error('Invalid event rectangle');
    }
    const [left, top, right, bottom] = values;
    return [Math.max(0, Math.ceil(left)), Math.max(0, Math.ceil(top)),
        Math.min(world.width - 1, Math.floor(right)), Math.min(world.height - 1, Math.floor(bottom))];
}

function composeWorld(geometry, live, cancelled = () => false) {
    const { width, height, scrollType } = geometry;
    const count = dimensions(width, height, scrollType);
    const packedTerrain = live.terrain instanceof Uint32Array;
    if (!(geometry.cells instanceof Uint8Array) || geometry.cells.length !== count ||
        (!packedTerrain && !Array.isArray(live.terrain)) || live.terrain.length > count || !Array.isArray(live.events) ||
        live.events.length > MAX_EVENTS || !Array.isArray(live.vehicles) || live.vehicles.length > 2 ||
        !['walk', 'boat', 'ship', 'airship'].includes(live.mode)) throw new Error('Incomplete world state');
    const cells = geometry.cells.slice();
    const blocked = new Uint8Array(count);
    const world = { width, height, scrollType, cells, blocked, events: live.events, mode: live.mode, hasLandings: geometry.hasLandings,
        vehicles: live.vehicles, aircraft: live.aircraft, through: live.through === true };
    for (let n = 0; n < live.terrain.length; n++) {
        if ((n & 63) === 0 && cancelled()) return null;
        const entry = live.terrain[n];
        const cell = packedTerrain ? entry & (MAX_CELLS - 1) : indexOf(world, entry[0], entry[1]);
        const flags = packedTerrain ? entry >>> CELL_BITS : entry[2];
        if (cell < 0 || cell >= count || !Number.isInteger(flags) || flags < 0 || flags > 255) {
            throw new Error('Invalid terrain delta');
        }
        cells[cell] = flags;
    }
    // Rectangle collision is inclusive and independent of event priority.
    // Four corners plus a prefix sum bound overlapping wide gates to one scan.
    const stride = width + 1;
    const difference = new Int16Array(stride * (height + 1));
    function block(rectangle) {
        const [left, top, right, bottom] = clipRectangle(world, rectangle);
        if (left > right || top > bottom) return;
        difference[top * stride + left]++;
        difference[top * stride + right + 1]--;
        difference[(bottom + 1) * stride + left]--;
        difference[(bottom + 1) * stride + right + 1]++;
    }
    let tileOverrides;
    for (let n = 0; n < live.events.length; n++) {
        if ((n & 31) === 0 && cancelled()) return null;
        const event = live.events[n];
        const { x, y, tileFlag, rectangle } = event;
        const cell = indexOf(world, x, y);
        // Native aircraft landing checks all event positions, including
        // inactive and erased events which do not block ordinary movement.
        if (cell >= 0 && world.mode === 'airship') cells[cell] &= ~LAND;
        if (event.erased || event.through) continue;
        // Input order matches the native tile-event list. A star event tile
        // yields to the next event tile and then the baked/changed surface.
        if (cell >= 0 && Number.isInteger(tileFlag) && !(tileFlag & 16)) {
            if (!tileOverrides) tileOverrides = new Uint8Array(count);
            if (!tileOverrides[cell]) {
                tileOverrides[cell] = 1;
                cells[cell] = (cells[cell] & ~PASSAGE) | (~tileFlag & PASSAGE);
            }
        }
        if (rectangle) block(rectangle);
        if (event.normal && cell >= 0) block([x, y, x, y]);
    }
    for (const vehicle of live.vehicles) {
        const cell = indexOf(world, vehicle.x, vehicle.y);
        if (cell >= 0 && !vehicle.through) block([vehicle.x, vehicle.y, vehicle.x, vehicle.y]);
    }
    for (let y = 0; y < height; y++) {
        if ((y & 7) === 0 && cancelled()) return null;
        let row = 0;
        for (let x = 0; x < width; x++) {
            const cursor = y * stride + x;
            row += difference[cursor];
            difference[cursor] = row + (y ? difference[cursor - stride] : 0);
            blocked[y * width + x] = difference[cursor] > 0 ? 1 : 0;
        }
    }
    return world;
}

function step(world, cell, heading) {
    const next = offset(world, cell, heading);
    if (next < 0 || world.through || world.mode === 'airship') return next;
    if (world.blocked[next]) return -1;
    const destination = world.cells[next];
    if (world.mode === 'boat') return destination & BOAT ? next : -1;
    if (world.mode === 'ship') return destination & SHIP ? next : -1;
    return (world.cells[cell] & (1 << heading)) && (destination & (1 << (3 - heading))) ? next : -1;
}

module.exports = { DIRECTIONS, COUNTER, LAND, MAX_CELLS, MAX_EVENTS, CELL_BITS, HEADER, bakeMap, encodeMap, decodeMap, surface,
    composeWorld, indexOf, offset, step, clipRectangle };
