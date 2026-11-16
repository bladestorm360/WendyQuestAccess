'use strict';

const { DIRECTIONS, indexOf, offset, step, clipRectangle } = require('../geometry.cjs');
const { routeGoals, inside, solveWorldRoute } = require('../routes.cjs');
const { motionWorld, startMotion, advancePatrols, advancePlayer } = require('./motion-world.cjs');
const { TIMING_CUE, STAMP_WIDTH, writeMotionStamp, mayAdvanceAutonomousRoute, tickPatrol } = require('./patrol-motion.cjs');

const { lineCrossing } = require('./patrol-line.cjs');

const START_WINDOW = 60;
const MIN_START_WINDOW = TIMING_CUE.minSpan;
const MAX_STEPS = 3;
const MAX_CROSSING_STEPS = 12;

function stationaryRoute(route) {
    return route?.commands.every(([code]) => code === 0 || code === 25 || code >= 15 && code <= 19);
}

function stationaryPatrol(actor) {
    return !actor.forced && !actor.jump && actor.x === actor.rx && actor.y === actor.ry &&
        (!actor.autonomous || stationaryRoute(actor.route));
}

function finitePatrolCoverage(world, unsafe, actor, origin) {
    if (actor.route.skippable || actor.autonomous && !stationaryRoute(actor.original)) return false;
    // Authored non-skippable paths can stop on collision. Every cell
    // they can reach is still on this finite sequence of reserved tiles.
    let cell = origin;
    for (let i = actor.index; i < actor.route.commands.length; i++) {
        const [code, x, y] = actor.route.commands[i];
        if (code === 0) break;
        if (code === 28 && (x === 582 || x === 583) && actor.route.commands.slice(i + 1).every(([next]) =>
            next === 0 || next >= 15 && next <= 19)) break;
        if (code >= 1 && code <= 4) cell = offset(world, cell, code - 1);
        else if (code === 14) cell = indexOf(world, cell % world.width + x, Math.floor(cell / world.width) + y);
        else if ((code < 15 || code > 19) && code !== 25 && code !== 29 && code !== 33) return false;
        if (cell < 0) return false;
        unsafe[cell] = 1;
    }
    return true;
}

function patrolCoverage(world, patrols, cancelled) {
    const unsafe = new Uint8Array(world.cells.length);
    const seen = new Uint8Array(unsafe.length);
    const queue = new Uint16Array(unsafe.length);
    // Ignore other actors as stopping points. A guard can attempt contact
    // across an impassable edge, but that edge stops further movement.
    for (const actor of patrols) {
        if (actor.through || actor.jump && (!actor.forced || actor.route.repeat)) return null;
        if (!actor.hazard && !actor.normal) continue;
        const { commands, repeat, skippable } = actor.route;
        const origin = indexOf(world, actor.x, actor.y);
        if (origin < 0) return null;
        unsafe[origin] = 1;
        if (actor.forced && !repeat) {
            if (!finitePatrolCoverage(world, unsafe, actor, origin)) return null;
            continue;
        }
        if (stationaryPatrol(actor)) continue;
        if (commands.some(([code]) => code > 4 && (code < 15 || code > 19))) return null;
        if (!repeat) return null;
        if (!skippable) {
            // A blocked non-skippable command retries in the same phase.
            // Trace one cycle from the current reserved tile.
            let cell = origin;
            for (let n = 0; n < commands.length; n++) {
                const [code] = commands[(actor.index + n) % commands.length];
                if (code === 0 || code > 4) continue;
                cell = offset(world, cell, code - 1);
                if (cell < 0) return null;
                unsafe[cell] = 1;
            }
            if (cell !== origin) return null;
            continue;
        }
        // Skipped moves can cause drift. Traverse every tile this route
        // can reach using the terrain edges and its authored directions.
        const headings = [...new Set(commands.filter(([code]) => code >= 1 && code <= 4).map(([code]) => code - 1))];
        seen.fill(0);
        seen[origin] = 1;
        queue[0] = origin;
        let end = 1;
        for (let head = 0; head < end; head++) {
            if ((head & 63) === 0 && cancelled()) return null;
            const cell = queue[head];
            for (const heading of headings) {
                const next = offset(world, cell, heading);
                if (next < 0) continue;
                unsafe[next] = 1;
                if (!seen[next] && (world.cells[cell] & (1 << heading)) &&
                    (world.cells[next] & (1 << (3 - heading)))) {
                    seen[next] = 1;
                    queue[end++] = next;
                }
            }
        }
    }
    return unsafe;
}

function safeRoute(world, request, unsafe, origin, cancelled) {
    if (!unsafe || unsafe[origin]) return null;
    const blocked = world.blocked.map((value, cell) => value || unsafe[cell]);
    return solveWorldRoute({ ...world, blocked }, request, cancelled);
}

function distancesToApproach(world, goals, origin, area, cancelled) {
    const distances = new Int16Array(goals.length).fill(-1);
    const queue = new Uint16Array(goals.length);
    let end = 0;
    for (let cell = 0; cell < goals.length; cell++) {
        if (goals[cell] && cell !== origin && (!area || inside(world, cell, area))) {
            distances[cell] = 0;
            queue[end++] = cell;
        }
    }
    for (let head = 0; head < end; head++) {
        if ((head & 63) === 0 && cancelled()) return null;
        const cell = queue[head];
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const prior = offset(world, cell, 3 - heading);
            // A detour must still reach the approach if the current tile
            // remains closed behind the player. Reject dead-end retreats.
            if (prior < 0 || prior === origin || distances[prior] >= 0 ||
                (area && !inside(world, prior, area)) || step(world, prior, heading) !== cell) continue;
            distances[prior] = distances[cell] + 1;
            queue[end++] = prior;
        }
    }
    return distances;
}

function crossingStops(world) {
    const stops = new Uint8Array(world.cells.length);
    for (const event of world.events) {
        if (event.normal || event.erased || !event.action || (event.trigger !== 1 && event.trigger !== 2)) continue;
        const [left, top, right, bottom] = clipRectangle(world,
            event.rectangle || [event.x, event.y, event.x, event.y]);
        for (let row = top; row <= bottom; row++)
            stops.fill(1, row * world.width + left, row * world.width + right + 1);
    }
    return stops;
}

function safeCrossingCandidates(world, goals, origin, unsafe, stops, area, cancelled) {
    if (!unsafe || unsafe[origin]) return [];
    const distances = new Int16Array(goals.length).fill(-1);
    const queue = new Uint16Array(goals.length);
    let end = 0;
    let best = Infinity;
    const options = [];
    for (let cell = 0; cell < goals.length; cell++) {
        if (goals[cell] && !unsafe[cell] && (!area || inside(world, cell, area))) {
            distances[cell] = 0;
            queue[end++] = cell;
        }
    }
    for (let head = 0; head < end; head++) {
        if ((head & 63) === 0 && cancelled()) return [];
        const cell = queue[head];
        const score = distances[cell] + 1;
        if (score > best) break;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            let next = cell;
            for (let count = 1; count <= MAX_STEPS; count++) {
                const prior = offset(world, next, 3 - heading);
                if (prior < 0 || (area && !inside(world, prior, area)) || step(world, prior, heading) !== next) break;
                if (prior === origin) {
                    options.push({ heading, count, cell, terminal: stops[cell] === 1, score });
                    best = score;
                    break;
                }
                // Only stable landings are graph nodes. Each edge can
                // cross a patrol lane in one straight, timed movement.
                if (stops[prior]) break;
                if (!unsafe[prior] && distances[prior] < 0) {
                    distances[prior] = score;
                    queue[end++] = prior;
                }
                next = prior;
            }
        }
    }
    return options.sort((a, b) => a.count - b.count || a.heading - b.heading);
}

function crossingCandidates(world, origin, distances, stops) {
    const candidates = [];
    for (let heading = 0; heading < DIRECTIONS.length; heading++) {
        let cell = origin;
        let remaining = Infinity;
        for (let count = 1; count <= MAX_STEPS; count++) {
            cell = step(world, cell, heading);
            if (cell < 0 || distances[cell] < 0 || distances[cell] >= remaining) break;
            remaining = distances[cell];
            const terminal = stops[cell] === 1;
            candidates.push({ heading, count, cell, terminal, score: remaining + count });
            if (terminal || remaining === 0) break;
        }
    }
    return candidates.sort((a, b) => a.score - b.score || a.heading - b.heading || b.count - a.count);
}

function crossingToSafeTile(world, origin, distances, unsafe, stops, distance, area, cancelled) {
    // A shorter exposure can lead to a side refuge uphill from the start
    // even if the geometrically shortest route stays in the patrol lane.
    const frontier = [{ cell: origin, headings: [] }];
    const seen = new Uint8Array(distances.length);
    seen[origin] = 1;
    let choice;
    for (let index = 0; index < frontier.length; index++) {
        if ((index & 31) === 0 && cancelled()) return null;
        const point = frontier[index];
        const count = point.headings.length + 1;
        if (count > MAX_CROSSING_STEPS || choice && count > choice.count) break;
        for (let heading = 0; heading < DIRECTIONS.length; heading++) {
            const cell = step(world, point.cell, heading);
            if (cell < 0 || seen[cell] || distances[cell] < 0 || area && !inside(world, cell, area)) continue;
            seen[cell] = 1;
            const headings = [...point.headings, heading];
            const terminal = stops[cell] === 1;
            if (!unsafe[cell] || terminal) {
                // Require progress toward the destination. A turn into a safe
                // side tile may add a step compared with the direct route.
                if (distances[cell] < distance && (!choice || distances[cell] < distances[choice.cell]))
                    choice = { heading: headings[0], count, cell, headings, terminal };
            } else frontier.push({ cell, headings });
        }
    }
    return choice;
}

function scrollRange(low, high, from, to, view, tiles, increment) {
    // The native scroll moves by the current interpolation increment
    // once the player passes the center. Account for the first increment
    // overshooting the center by at most one interpolation increment.
    const rounded = Math.round(view * 16) / 16;
    if (tiles < rounded || from === to) return [low, high];
    const center = to - (rounded - 1) / 2;
    if (to > from) return [
        Math.min(Math.max(low, center), low + 1, tiles - rounded),
        Math.min(Math.max(high, center + increment), high + 1, tiles - rounded)
    ];
    return [Math.max(0, Math.min(low, center - increment), low - 1), Math.max(0, Math.min(high, center), high - 1)];
}

function studyCrossing(world, origin, motion, candidate, cancelled) {
    const headings = candidate.headings;
    const cellSet = new Set([origin]);
    let cell = origin;
    for (const heading of headings) {
        cell = step(world.player, cell, heading);
        if (cell < 0) return false;
        cellSet.add(cell);
    }

    // Only guards able to exchange collision with this crossing can
    // affect it. Include their neighbors until that set stops growing.
    const coverage = motion.patrols.map(actor => patrolCoverage(world.patrol, [actor], cancelled));
    if (coverage.some(mask => !mask)) return false;
    const relevant = new Set();
    const covered = new Uint8Array(world.patrol.cells.length);
    for (const cell of cellSet) covered[cell] = 1;
    for (let pass = 0; pass < coverage.length; pass++) {
        const previous = relevant.size;
        for (let i = 0; i < coverage.length; i++) {
            if (relevant.has(i) || !coverage[i].some((bit, at) => bit && covered[at])) continue;
            relevant.add(i);
            for (let at = 0; at < covered.length; at++) covered[at] |= coverage[i][at];
        }
        if (relevant.size === previous || cancelled()) break;
    }

    const { view, speed, dash } = motion;
    let x = [view.x, view.x];
    let y = [view.y, view.y];
    const ranges = [{ cell: origin, from: 0, until: 0, camera: [view.x, view.y, view.x, view.y] }];
    let earliest = 0;
    let latest = 0;
    cell = origin;
    const walking = 256 / 2 ** speed;
    const fastest = dash ? walking / 2 : walking;
    for (let i = 0; i < headings.length; i++) {
        const prior = cell;
        cell = step(world.player, cell, headings[i]);
        const { width, height } = world.player;
        const nextX = scrollRange(...x, prior % width, cell % width, view.width, width, 1 / fastest);
        const nextY = scrollRange(...y, Math.floor(prior / width), Math.floor(cell / width), view.height, height, 1 / fastest);
        const camera = [Math.min(x[0], nextX[0]), Math.min(y[0], nextY[0]), Math.max(x[1], nextX[1]), Math.max(y[1], nextY[1])];
        x = nextX;
        y = nextY;
        const from = earliest;
        earliest += fastest;
        latest += walking + (i < headings.length - 1 && headings[i] !== headings[i + 1] ? TIMING_CUE.turnGrace : 0);
        ranges.push({ cell, from, until: latest, camera });
    }
    const independent = new Set();
    for (const index of relevant) {
        if (![...relevant].some(other => other !== index &&
            coverage[index].some((bit, cell) => bit && coverage[other][cell])))
            independent.add(motion.patrols[index].id);
    }
    candidate.study = { ids: new Set([...relevant].map(index => motion.patrols[index].id)), independent, ranges, latest };
    return true;
}

function earliestPatrolStep(actor) {
    let delay = Math.max(0, actor.wait);
    // Even with uninterrupted screen admission, the native route has
    // to spend its scripted waits before trying its first movement.
    for (let index = actor.index; index < actor.route.commands.length; index++) {
        const [code, frames] = actor.route.commands[index];
        if (code === 0 || code < 15 || code > 19) break;
        delay += code === 15 ? frames : 1;
    }
    return delay;
}

function staysOutsideCrossing(world, actor, ranges, wake, reachedByWake, tick, cancelled) {
    const deadlines = new Map();
    let latest = 0;
    for (const [index, range] of ranges.entries()) {
        if (range.until < tick) continue;
        if (range.cell === indexOf(world, actor.x, actor.y)) return false;
        if (index < wake || range.until < reachedByWake) continue;
        const deadline = range.until - reachedByWake;
        deadlines.set(range.cell, Math.max(deadlines.get(range.cell) ?? 0, deadline));
        latest = Math.max(latest, deadline);
    }
    // This guard has no collision interactions with other patrols.
    // Dispatching its actual commands continuously from the earliest
    // possible wake gives the earliest time it can threaten each cell.
    const guard = { ...actor, frequency: 5 };
    const alwaysNear = () => true;
    const noPlayer = { x: -1, y: -1 };
    for (let elapsed = 0; elapsed <= latest; elapsed++) {
        if (cancelled()) return false;
        const cell = indexOf(world, guard.x, guard.y);
        if (deadlines.get(cell) >= elapsed) return false;
        const tryStep = (_guard, heading) => {
            const next = offset(world, cell, heading);
            if (deadlines.get(next) >= elapsed) return 'contact';
            if (step(world, cell, heading) < 0) return null;
            return { x: next % world.width, y: Math.floor(next / world.width) };
        };
        if (tickPatrol(guard, noPlayer, null, tryStep, alwaysNear) !== 'settled') return false;
    }
    return true;
}

function clearEntireCrossing(world, waiting, candidate, cancelled) {
    const { ids, independent, ranges, latest } = candidate.study;
    const player = { ...waiting.player, x: -1, y: -1 };
    const state = startMotion(world, waiting.patrols.filter(actor => ids.has(actor.id)), player, waiting.view);
    for (let tick = 0; tick <= latest; tick++) {
        if (cancelled()) return false;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const { from, until, camera } of ranges) {
            if (tick < from || tick > until) continue;
            x0 = Math.min(x0, camera[0]);
            y0 = Math.min(y0, camera[1]);
            x1 = Math.max(x1, camera[2]);
            y1 = Math.max(y1, camera[3]);
        }
        // Before an autonomous command can run, all possible camera
        // positions must agree about its near-screen check.
        state.view.x = x0;
        state.view.y = y0;
        for (let index = state.patrols.length - 1; index >= 0; index--) {
            const actor = state.patrols[index];
            if (!mayAdvanceAutonomousRoute(actor)) continue;
            const left = actor.rx + 0.5 - 1.5 * state.view.width;
            const right = actor.rx + 0.5 + 0.5 * state.view.width;
            const top = actor.ry + 0.5 - 1.5 * state.view.height;
            const bottom = actor.ry + 0.5 + 0.5 * state.view.height;
            const always = x0 >= left && x1 <= right && y0 >= top && y1 <= bottom;
            const never = x1 < left || x0 > right || y1 < top || y0 > bottom;
            if (always || never) continue;
            if (!independent.has(actor.id)) return false;
            // If the camera can wake this guard only after a certain
            // player step, earlier slow steps or turns cannot give it an
            // earlier start. Count the remaining movement from that step.
            const wake = ranges.findIndex(({ until, camera: [a, b, c, d] }) =>
                tick <= until && c >= left && a <= right && d >= top && b <= bottom);
            const reachedByWake = Math.max(tick, ranges[wake - 1]?.until ?? 0);
            const delay = earliestPatrolStep(actor);
            const stride = 256 / 2 ** actor.speed;
            if (!ranges.every((range, index) => {
                if (tick > range.until) return true;
                const distance = Math.abs(range.cell % world.player.width - actor.x) +
                    Math.abs(Math.floor(range.cell / world.player.width) - actor.y);
                return distance > 0 && (index < wake || reachedByWake + delay + (distance - 1) * stride > range.until);
            }) && !staysOutsideCrossing(world.patrol, actor, ranges, wake, reachedByWake, tick, cancelled)) return false;
            // This isolated guard cannot reach the crossing in time, even
            // if it uses every available frame to move toward the player.
            const cell = indexOf(world.patrol, actor.x, actor.y);
            state.patrols.splice(index, 1);
            state.bodies[cell]--;
            if (actor.normal) state.normal[cell]--;
            if (actor.hazard) state.hazards[cell]--;
        }
        const occupied = cell => ranges.some(range => cell === range.cell && tick >= range.from && tick <= range.until);
        if (advancePatrols(state, occupied) !== 'settled' ||
            ranges.some(range => state.normal[range.cell] && tick >= range.from && tick <= range.until)) return false;
    }
    return true;
}

function simulatePrefix(state, candidate, speed, dashMask, cancelled) {
    const { heading, count, terminal } = candidate;
    let moved = 0;
    let hold = 256 / 2 ** speed;
    // The slowest accepted native speed takes at most 32 updates per tile.
    const limit = count * 32 + hold + 1;
    for (let tick = 0; tick < limit; tick++) {
        if (cancelled()) return false;
        const { player } = state;
        const standing = player.x === player.rx && player.y === player.ry;
        if (standing && moved === count && (terminal || hold-- === 0)) return true;
        if (advancePatrols(state) !== 'settled') return false;
        const next = standing && moved < count ? heading : null;
        if (next !== null) player.speed = speed + ((dashMask >> moved++) & 1);
        if (advancePlayer(state, next) !== 'settled') return false;
    }
    return false;
}

function safeStart(world, waiting, motion, candidate, cancelled) {
    if (candidate.study) return clearEntireCrossing(world, waiting, candidate, cancelled);
    const profiles = motion.dash === true ? 1 << candidate.count : 1;
    for (let mask = 0; mask < profiles; mask++) {
        const run = startMotion(world, waiting.patrols, waiting.player, waiting.view);
        if (!simulatePrefix(run, candidate, motion.speed, mask, cancelled)) return false;
    }
    return true;
}

function checkedStartWindow(world, motion, player, candidate, cancelled) {
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    for (let delay = 0; delay <= START_WINDOW; delay++) {
        if (!safeStart(world, waiting, motion, candidate, cancelled)) return delay - 1;
        if (advancePatrols(waiting) !== 'settled') return delay;
    }
    return START_WINDOW;
}

function openingFor(world, motion, player, choices, cancelled) {
    // Validate every walk/dash combination across the complete straight
    // crossing and its settling time. Do not strand Wendy mid-patrol lane.
    const waiting = startMotion(world, motion.patrols, player, motion.view);
    const consecutive = new Uint8Array(choices.length);
    const stride = motion.patrols.length * STAMP_WIDTH;
    const ringLength = TIMING_CUE.maxSpan + 1;
    const history = new Float64Array(stride * ringLength);
    const wait = motion.exposed ? 0 : motion.cueSample ? TIMING_CUE.interval :
        choices[0]?.pace ? TIMING_CUE.paceWait : TIMING_CUE.wait;
    for (let delay = 0; delay <= wait + MIN_START_WINDOW; delay++) {
        if (cancelled()) return null;
        writeMotionStamp(history, (delay % ringLength) * stride, waiting.patrols);
        for (let i = 0; i < choices.length; i++) {
            const candidate = choices[i];
            const minSpan = candidate.pace ? TIMING_CUE.paceSpan : MIN_START_WINDOW;
            if (!safeStart(world, waiting, motion, candidate, cancelled)) {
                consecutive[i] = 0;
                continue;
            }
            if (++consecutive[i] <= minSpan) continue;
            const from = delay - minSpan;
            if (from > wait) return null;
            let through = delay;
            while (through - from < TIMING_CUE.maxSpan) {
                if (advancePatrols(waiting) !== 'settled' || !safeStart(world, waiting, motion, candidate, cancelled)) break;
                through++;
                writeMotionStamp(history, (through % ringLength) * stride, waiting.patrols);
            }
            const samples = through - from - TIMING_CUE.lead + 1;
            const stamps = new Float64Array(stride * samples);
            for (let frame = 0; frame < samples; frame++) {
                const begin = ((from + frame) % ringLength) * stride;
                stamps.set(history.subarray(begin, begin + stride), frame * stride);
            }
            return { direction: DIRECTIONS[candidate.heading], tiles: candidate.count, headings: candidate.headings, escape: candidate.escape, terminal: candidate.terminal,
                alternate: candidate.heading !== choices[0].heading, pace: candidate.pace, from, through, stamps };
        }
        if (advancePatrols(waiting) !== 'settled') break;
    }
    return null;
}

function previewCrossing(geometry, live, request, cancelled = () => false) {
    const { motion } = request;
    if (!Array.isArray(motion?.patrols) || !Number.isInteger(motion.speed) || motion.speed < 3 || motion.speed > 6)
        return { status: 'unavailable' };
    const world = motionWorld(geometry, live, motion.patrols, cancelled, motion.barrier);
    if (!world) return { status: cancelled() ? 'cancelled' : 'unavailable' };
    const origin = indexOf(world.player, request.x, request.y);
    const area = request.area && clipRectangle(world.player, request.area);
    if (origin < 0 || (area && !inside(world.player, origin, area))) return { status: 'unavailable' };
    // Guide targets are ordered by the verified room state. Test a small
    // set against the same static collision, then simulate one crossing.
    const alternatives = Array.isArray(request.guideOptions) && request.guideOptions.length <= 6
        ? request.guideOptions : [request];
    let selected;
    let candidates;
    let safeCrossing;
    let entire;
    const stops = crossingStops(world.player);
    const { patrolGuidance, timingDirection, timingPace: pace } = request;
    if (pace !== undefined && pace !== 'walk' && pace !== 'dash') return { status: 'unavailable' };
    const fixedHeading = DIRECTIONS.indexOf(timingDirection);
    const unsafe = patrolGuidance && (fixedHeading < 0 || request.timingHeadings) && !motion.barrier &&
        patrolCoverage(world.patrol, motion.patrols, cancelled);
    if (cancelled()) return { status: 'cancelled' };
    if (request.lineNavigation && !motion.barrier && fixedHeading < 0) {
        const course = lineCrossing(world, request, origin, unsafe, stops, patrolCoverage, cancelled);
        if (course) return course;
        if (cancelled()) return { status: 'cancelled' };
    }
    for (const option of alternatives) {
        const goals = routeGoals(world.player, option, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (!goals) continue;
        const guide = request.guideOptions ? { guideEvent: option.event } : {};
        if (goals[origin]) return { status: 'ready', distance: 0, legs: [], ...guide,
            arrival: { x: request.x, y: request.y, facing: goals[origin] === 1 ? null : goals[origin] } };
        if (unsafe) {
            const clear = safeRoute(world.player, { ...request, ...option }, unsafe, origin, cancelled);
            if (cancelled()) return { status: 'cancelled' };
            if (clear?.status === 'ready' || clear?.status === 'interrupted') return { ...clear, ...guide };
        }
        const distances = distancesToApproach(world.player, goals, origin, area, cancelled);
        if (!distances) return { status: 'cancelled' };
        candidates = crossingCandidates(world.player, origin, distances, stops);
        if (fixedHeading >= 0) {
            // Revalidate the exact spoken crossing even if it took a
            // longer approach to leave the patrol lane in one movement.
            const count = request.timingTiles || 1;
            const headings = request.timingHeadings;
            if (!Number.isInteger(count) || count < 1 || count > (headings ? MAX_CROSSING_STEPS : MAX_STEPS) ||
                (headings && (!Array.isArray(headings) || headings.length !== count || headings[0] !== fixedHeading ||
                    !headings.every(heading => Number.isInteger(heading) && heading >= 0 && heading < DIRECTIONS.length))))
                return { status: 'unavailable' };
            let cell = origin;
            for (let n = 0; n < count; n++) {
                cell = step(world.player, cell, headings ? headings[n] : fixedHeading);
                if (cell < 0 || (n < count - 1 && stops[cell])) return { status: 'unavailable' };
            }
            candidates = [{ heading: fixedHeading, count, cell, headings, terminal: stops[cell] === 1 }];
            if (headings && (!unsafe || unsafe[cell] && !stops[cell] || !studyCrossing(world, origin, motion, candidates[0], cancelled)))
                return { status: 'unavailable' };
        } else if (unsafe) {
            const linked = safeCrossingCandidates(world.player, goals, origin, unsafe, stops, area, cancelled);
            if (cancelled()) return { status: 'cancelled' };
            safeCrossing = linked[0];
            if (safeCrossing) candidates = linked;
        }
        if (!candidates.length) continue;
        if (patrolGuidance) candidates = candidates.filter(candidate => candidate.heading === candidates[0].heading);
        selected = guide;
        if (unsafe && !unsafe[origin]) {
            const { heading, count } = candidates[0];
            let cell = origin;
            let tiles = 0;
            while (tiles < count) {
                cell = step(world.player, cell, heading);
                if (unsafe[cell]) break;
                tiles++;
            }
            if (tiles) return { status: 'patrolApproach', direction: DIRECTIONS[heading], tiles,
                terminal: tiles === count && candidates[0].terminal, ...guide };
        }
        if (unsafe && fixedHeading < 0 && !safeCrossing && unsafe[candidates[0].cell]) {
            const complete = crossingToSafeTile(world.player, origin, distances, unsafe, stops,
                candidates[0].score, area, cancelled);
            if (complete) {
                // The fallback can choose a safe first tile in a different
                // direction than the shortest guarded route. Follow that lane
                // while it stays safe and continues toward the same goal.
                if (!unsafe[origin] && complete.count === 1 && !unsafe[complete.cell]) {
                    const { heading } = complete;
                    let cell = complete.cell;
                    let tiles = 1;
                    while (tiles < MAX_CROSSING_STEPS && distances[cell] > 0 && !stops[cell]) {
                        const next = step(world.player, cell, heading);
                        if (next < 0 || unsafe[next] || distances[next] !== distances[cell] - 1 ||
                            area && !inside(world.player, next, area)) break;
                        cell = next;
                        tiles++;
                    }
                    return { status: 'patrolApproach', direction: DIRECTIONS[heading], tiles,
                        terminal: stops[cell] === 1, ...guide };
                }
                if (studyCrossing(world, origin, motion, complete, cancelled)) entire = complete;
            }
        }
        break;
    }
    if (!selected) return { status: 'unreachable' };
    const player = { x: request.x, y: request.y, rx: request.x, ry: request.y, jump: 0, speed: motion.speed };
    const crossing = patrolGuidance && (fixedHeading >= 0 ? candidates[0] : safeCrossing || entire ||
        (unsafe && candidates.find(candidate => !unsafe[candidate.cell] || candidate.terminal)) ||
        candidates[0]);
    const exposed = unsafe?.[origin] === 1;
    const unsafeLanding = patrolGuidance && fixedHeading < 0 && unsafe?.[crossing.cell] && !crossing.terminal;
    if (unsafeLanding && !exposed) return { status: 'unsafeCrossing', ...selected };
    const paced = motion.dash && crossing?.headings && !exposed;
    if (request.timingCue === true) {
        const choices = crossing ? unsafeLanding ? [] : [crossing] : candidates.filter(candidate => candidate.count === 1);
        if (exposed) {
            // If Wendy is already in the lane, prioritize a nearby safe
            // tile over waiting there for the next turn of the patrol.
            for (let heading = 0; heading < DIRECTIONS.length; heading++) {
                const cell = step(world.player, origin, heading);
                if (cell >= 0 && !unsafe[cell] && !stops[cell] &&
                    !choices.some(choice => choice.heading === heading && choice.count === 1))
                    choices.push({ heading, count: 1, cell, escape: true });
            }
        }
        const forecast = { ...motion, cueSample: fixedHeading >= 0, exposed };
        if (choices.length && !pace) {
            const opening = openingFor(world, forecast, player, choices, cancelled);
            if (opening) return { status: 'timedCue', opening, ...selected };
        }
        if (paced && (fixedHeading < 0 || pace) && !cancelled()) {
            // Isolate the pace only when one constant native speed can
            // qualify the whole crossing. Rechecks keep the spoken pace.
            const options = [];
            for (const choice of pace ? [pace] : ['walk', 'dash']) {
                const candidate = { ...crossing, pace: choice };
                const singleSpeed = { ...motion, dash: false, speed: motion.speed + (choice === 'dash' ? 1 : 0) };
                if (studyCrossing(world, origin, singleSpeed, candidate, cancelled)) options.push(candidate);
            }
            const opening = options.length && openingFor(world, forecast, player, options, cancelled);
            if (opening) return { status: 'timedCue', opening, ...selected };
        }
        if (cancelled()) return { status: 'cancelled' };
    }
    if (exposed) return { status: 'unsafeCrossing', exposed, ...selected };
    if (crossing && fixedHeading < 0) {
        let cell = origin;
        for (let i = 0; i < crossing.count; i++) {
            cell = step(world.player, cell, crossing.headings?.[i] ?? crossing.heading);
            const guard = motion.patrols.find(actor => actor.hazard && !actor.through &&
                indexOf(world.player, actor.x, actor.y) === cell && stationaryPatrol(actor));
            if (guard) return { status: 'patrolBlocked', guard: guard.id, ...selected };
        }
    }
    if (patrolGuidance) return { status: 'timedWait', direction: DIRECTIONS[crossing.heading],
        tiles: crossing.count, headings: crossing.headings, terminal: crossing.terminal, pace, ...selected };
    for (const candidate of candidates) {
        const startWindow = checkedStartWindow(world, motion, player, candidate, cancelled);
        if (cancelled()) return { status: 'cancelled' };
        if (startWindow >= MIN_START_WINDOW) return { status: 'timed', direction: DIRECTIONS[candidate.heading],
            tiles: candidate.count, startWindow, terminal: candidate.terminal, ...selected,
            alternate: candidate.heading !== candidates[0].heading };
    }
    return { status: 'timedWait', ...selected };
}

module.exports = { previewCrossing };
