'use strict';

const DIRECTIONS = [2, 4, 6, 8];
const DX = [0, -1, 1, 0];
const DY = [1, 0, 0, -1];
const PASSAGE = 15;
const COUNTER = 16;
const BOAT = 32;
const SHIP = 64;
const TILE_OVERRIDE = 128;
const MAX_CELLS = 16384;
const MAX_EVENTS = 512;
const HEADER = 16;
const MAGIC = 'WQG1';

function dimensions(width, height, scrollType) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height > MAX_CELLS || !Number.isInteger(scrollType) || scrollType < 0 || scrollType > 3) {
        throw new Error('Unsupported map dimensions');
    }
    return width * height;
}

function surface(top, upper, lower, bottom, region) {
    let flag = top;
    if (flag & 16) flag = upper;
    if (flag & 16) flag = lower;
    if (flag & 16) flag = bottom;
    const walking = flag & 16 ? 0 : ~flag & PASSAGE;
    const counter = (top | upper | lower | bottom) & 128 ? COUNTER : 0;
    const water = region === 254 ? BOAT | SHIP : region === 253 ? BOAT : 0;
    return walking | counter | water;
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
    return { width, height, scrollType, cells };
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
    if (!Buffer.isBuffer(data) || data.length < HEADER || data.toString('ascii', 0, 4) !== MAGIC ||
        data.readUInt16LE(4) !== id || data.readUInt8(11) || data.readUInt32LE(12)) throw new Error('Invalid map geometry');
    const width = data.readUInt16LE(6);
    const height = data.readUInt16LE(8);
    const scrollType = data.readUInt8(10);
    if (data.length !== HEADER + dimensions(width, height, scrollType)) throw new Error('Truncated map geometry');
    return { width, height, scrollType, cells: new Uint8Array(data.subarray(HEADER)) };
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
    if (!(geometry.cells instanceof Uint8Array) || geometry.cells.length !== count ||
        !Array.isArray(live.terrain) || live.terrain.length > count || !Array.isArray(live.events) ||
        live.events.length > MAX_EVENTS || !Array.isArray(live.vehicles) || live.vehicles.length > 2 ||
        !['walk', 'boat', 'ship', 'airship'].includes(live.mode)) throw new Error('Incomplete world state');
    const cells = geometry.cells.slice();
    const blocked = new Uint8Array(count);
    const world = { width, height, scrollType, cells, blocked, events: live.events, mode: live.mode, through: live.through === true };
    for (let n = 0; n < live.terrain.length; n++) {
        if ((n & 63) === 0 && cancelled()) return null;
        const [x, y, flags] = live.terrain[n];
        const cell = indexOf(world, x, y);
        if (cell < 0 || !Number.isInteger(flags) || flags < 0 || flags >= TILE_OVERRIDE) throw new Error('Invalid terrain delta');
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
    for (let n = 0; n < live.events.length; n++) {
        if ((n & 31) === 0 && cancelled()) return null;
        const event = live.events[n];
        if (event.erased || event.through) continue;
        const { x, y, tileFlag, rectangle } = event;
        const cell = indexOf(world, x, y);
        // Input order matches the native tile-event list. A star event tile
        // yields to the next event tile and then the baked/changed surface.
        if (cell >= 0 && Number.isInteger(tileFlag) && !(tileFlag & 16) && !(cells[cell] & TILE_OVERRIDE)) {
            cells[cell] = (cells[cell] & ~PASSAGE) | (~tileFlag & PASSAGE) | TILE_OVERRIDE;
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
    if (next < 0 || world.through) return next;
    if (world.blocked[next]) return -1;
    const destination = world.cells[next];
    if (world.mode === 'boat') return destination & BOAT ? next : -1;
    if (world.mode === 'ship') return destination & SHIP ? next : -1;
    if (world.mode === 'airship') return next;
    return (world.cells[cell] & (1 << heading)) && (destination & (1 << (3 - heading))) ? next : -1;
}

module.exports = { DIRECTIONS, COUNTER, MAX_CELLS, HEADER, bakeMap, encodeMap, decodeMap, surface,
    composeWorld, indexOf, offset, step, clipRectangle };
