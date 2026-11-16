'use strict';

const { DIRECTIONS, indexOf, offset, step } = require('../geometry.cjs');
const { MANUAL_HORIZON, REACTION_FRAMES } = require('./patrol-line-state.cjs');

// Routes between standing pockets in Map 199. Each pair is a straight
// leg in engine direction order [south, west, east, north]. The lower
// links are continuous. The upper and west tracks have timed pauses.
const POCKET_LINKS = [
    [7, 17, true, [[3, 1], [2, 8], [3, 1]]],
    [17, 15, true, [[0, 1], [2, 8], [3, 1]]],
    [25, 15, true, [[0, 1], [2, 4]]],
    [24, 5, false, [[3, 1], [1, 4], [1, 4], [3, 1]]],
    [16, 3, false, [[0, 1], [1, 1], [1, 6], [1, 5], [0, 2], [1, 1]]],
    [3, 6, false, [[2, 1], [0, 6], [0, 4], [2, 1], [0, 1]]]
];

function routePockets(grid, size, origin, unsafe, stops, goals, cancelled) {
    const links = [];
    for (const [x, y, continuous, legs] of POCKET_LINKS) {
        const from = indexOf(grid, x, y);
        if (from < 0 || from >= size || unsafe[from] || stops[from]) continue;
        let cell = from;
        const strokes = [];
        for (const [heading, count] of legs) {
            const cells = [cell];
            for (let i = 0; cell >= 0 && i < count; i++) {
                const next = step(grid, cell, heading);
                cell = next >= 0 && next < size && !stops[next] ? next : -1;
                cells.push(cell);
            }
            if (cell < 0) break;
            strokes.push({ heading, cells });
        }
        if (cell >= 0 && !unsafe[cell]) links.push({ from, to: cell, strokes, continuous });
    }

    // Reverse search from usable interaction tiles. Edges either stay
    // outside all guard coverage or join two pockets through a timed route.
    const distance = new Int16Array(size).fill(-1);
    const next = new Int8Array(size).fill(-1);
    const queue = [];
    for (let cell = 0; cell < size; cell++) {
        if (goals[cell] && !unsafe[cell] && !stops[cell]) {
            distance[cell] = 0;
            queue.push(cell);
        }
    }
    for (let head = 0; head < queue.length && distance[origin] < 0; head++) {
        if ((head & 31) === 0 && cancelled()) return null;
        const cell = queue[head];
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const before = offset(grid, cell, 3 - heading);
            if (before < 0 || before >= size || distance[before] >= 0 || unsafe[before] || stops[before] ||
                step(grid, before, heading) !== cell) continue;
            distance[before] = distance[cell] + 1;
            next[before] = heading;
            queue.push(before);
        }
        for (let index = 0; index < links.length; index++) {
            const { from, to } = links[index];
            if (cell !== to || distance[from] >= 0) continue;
            distance[from] = distance[cell] + 1;
            next[from] = DIRECTIONS.length + index;
            queue.push(from);
        }
    }
    if (distance[origin] <= 0) return null;
    if (next[origin] >= DIRECTIONS.length) return { link: links[next[origin] - DIRECTIONS.length] };
    const legs = [];
    let cell = origin;
    while (distance[cell] > 0 && next[cell] >= 0 && next[cell] < DIRECTIONS.length) {
        const heading = next[cell];
        const direction = DIRECTIONS[heading];
        const last = legs[legs.length - 1];
        if (last?.direction === direction) last.tiles++;
        else {
            if (legs.length === 8) break;
            legs.push({ direction, tiles: 1 });
        }
        cell = step(grid, cell, heading);
    }
    return { legs, goal: distance[cell] === 0 ? cell : -1 };
}

function nextStrokes(safety, size, link, stride, cancelled) {
    const span = MANUAL_HORIZON + 1;
    const starts = new Uint16Array(span * link.strokes.length);
    const safeUntil = (time, cell) => safety[time * size + cell] || span;
    // Prove the rest of the crossing for EVERY accepted start in the
    // reaction window. The next cue can follow the actual arrival frame.
    for (let index = link.strokes.length - 1; index >= 0; index--) {
        const { cells } = link.strokes[index];
        const row = index * span;
        const length = cells.length - 1;
        const duration = length * stride;
        let consecutive = 0;
        for (let time = MANUAL_HORIZON - duration - 1; time >= 1; time--) {
            if ((time & 63) === 0 && cancelled()) return null;
            const first = time + 1;
            let safe = index === link.strokes.length - 1 || starts[row + span + first + duration] !== 0;
            for (let move = 0; safe && move < length; move++) {
                const frame = first + move * stride;
                safe = safeUntil(frame, cells[move]) > frame &&
                    safeUntil(frame, cells[move + 1]) >= frame + stride;
            }
            consecutive = safe ? consecutive + 1 : 0;
            if (safeUntil(time, cells[0]) === time) continue;
            if (consecutive >= REACTION_FRAMES && safeUntil(time, cells[0]) > time + REACTION_FRAMES)
                starts[row + time] = time;
            else starts[row + time] = starts[row + time + 1];
        }
    }
    return starts[1] ? starts : null;
}

module.exports = { routePockets, nextStrokes };
