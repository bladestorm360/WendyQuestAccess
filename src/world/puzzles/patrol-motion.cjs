'use strict';

// A model of the pinned MZ movement producers. The worker supplies the copied
// collision and camera state. It never asks the live game to simulate a step.
const DIRECTIONS = [2, 4, 6, 8];
const MAX_ROUTE_COMMANDS = 128;

function copyRoute(route) {
    if (!Array.isArray(route?.list) || !route.list.length || route.list.length > MAX_ROUTE_COMMANDS) return null;
    const commands = [];
    for (const { code, parameters } of route.list) {
        if (!Number.isInteger(code)) return null;
        const a = parameters?.[0];
        const b = parameters?.[1];
        if (code === 14 && (!Number.isInteger(a) || !Number.isInteger(b) || Math.abs(a) > 8 || Math.abs(b) > 8)) return null;
        if (code === 15 && (!Number.isInteger(a) || a < 1 || a > 600)) return null;
        if (code === 29 && (!Number.isInteger(a) || a < 1 || a > 6)) return null;
        commands.push(code === 14 ? [code, a, b] : code === 15 || code === 29 ? [code, a] : [code]);
    }
    return { commands, repeat: route.repeat === true, skippable: route.skippable === true };
}

function copyPatrol(event) {
    const { _eventId: id, _x: x, _y: y, _realX: rx, _realY: ry, _moveSpeed: speed, _moveFrequency: frequency,
        _direction: direction, _stopCount: stop, _waitCount: wait, _jumpCount: jump, _moveRouteIndex: index } = event;
    if (![id, x, y, speed, frequency, direction, stop, wait, jump, index].every(Number.isSafeInteger) ||
        !Number.isFinite(rx) || !Number.isFinite(ry) || speed < 1 || speed > 6 || frequency < 1 || frequency > 5 ||
        stop < 0 || wait < 0 || jump < 0 || index < 0 || !DIRECTIONS.includes(direction) ||
        ![0, 3].includes(event._moveType)) return null;
    const route = copyRoute(event._moveRoute);
    if (!route || index > route.commands.length) return null;
    const forced = event._moveRouteForcing === true;
    const original = forced ? copyRoute(event._originalMoveRoute) : null;
    const originalIndex = forced ? event._originalMoveRouteIndex : 0;
    if (forced && (!original || !Number.isInteger(originalIndex) || originalIndex < 0 ||
        originalIndex > original.commands.length)) return null;
    return { id, x, y, rx, ry, speed, frequency, direction, stop, wait, jump, index, route, forced, original, originalIndex,
        autonomous: event._moveType === 3, locked: event._locked === true, fixed: event._directionFix === true,
        through: event._through === true, normal: event._priorityType === 1,
        hazard: event._trigger === 2 && event._priorityType === 1 };
}

function nearScreen(actor, view) {
    const x = actor.rx - view.x + 0.5 - view.width / 2;
    const y = actor.ry - view.y + 0.5 - view.height / 2;
    return Math.abs(x) <= view.width && Math.abs(y) <= view.height;
}

function turn(actor, direction) {
    if (!actor.fixed) actor.direction = direction;
    actor.stop = 0;
}

function advancePosition(actor) {
    if (actor.jump > 0) {
        actor.jump--;
        actor.rx = (actor.rx * actor.jump + actor.x) / (actor.jump + 1);
        actor.ry = (actor.ry * actor.jump + actor.y) / (actor.jump + 1);
    } else if (actor.rx !== actor.x || actor.ry !== actor.y) {
        const stride = 2 ** actor.speed / 256;
        actor.rx += Math.sign(actor.x - actor.rx) * Math.min(stride, Math.abs(actor.x - actor.rx));
        actor.ry += Math.sign(actor.y - actor.ry) * Math.min(stride, Math.abs(actor.y - actor.ry));
    }
}

function runRouteCommand(actor, player, tryStep) {
    if (actor.wait > 0) {
        actor.wait--;
        return;
    }
    const command = actor.route.commands[actor.index];
    if (!command) return;
    const [code, a, b] = command;
    let advanced = true;
    if (code >= 1 && code <= 4) {
        const heading = code - 1;
        turn(actor, DIRECTIONS[heading]);
        const next = tryStep(actor, heading);
        if (next === 'contact') return next;
        if (next) {
            actor.x = next.x;
            actor.y = next.y;
        } else advanced = actor.route.skippable;
    } else if (code === 0) {
        if (actor.route.repeat) actor.index = -1;
        else if (actor.forced) {
            actor.forced = false;
            actor.route = actor.original;
            actor.index = actor.originalIndex;
            actor.original = null;
            actor.originalIndex = 0;
            // MZ advances the restored route using its own skip flag.
            advanced = actor.route.skippable;
        }
    } else if (code === 14) {
        if (a || b) turn(actor, Math.abs(a) > Math.abs(b) ? (a < 0 ? 4 : 6) : (b < 0 ? 8 : 2));
        actor.x += a;
        actor.y += b;
        actor.jump = 2 * (10 + Math.round(Math.hypot(a, b)) - actor.speed);
        actor.stop = 0;
    } else if (code === 15) actor.wait = a - 1;
    else if (code >= 16 && code <= 19) turn(actor, DIRECTIONS[code - 16]);
    else if (code === 25) {
        const dx = player.x - actor.x;
        const dy = player.y - actor.y;
        if (dx || dy) turn(actor, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 4 : 6) : (dy < 0 ? 8 : 2));
    } else if (code === 29) actor.speed = a;
    else if (code !== 33) return 'boundary';
    if (advanced) {
        actor.index++;
        if (actor.route.repeat && actor.index >= actor.route.commands.length - 1) actor.index = 0;
    }
}

function tickPatrol(actor, player, view, tryStep) {
    if (!actor.jump && actor.x === actor.rx && actor.y === actor.ry) {
        actor.stop = actor.locked ? 1 : actor.stop + 1;
        if (actor.forced) {
            const outcome = runRouteCommand(actor, player, tryStep);
            if (outcome) return outcome;
        }
        if (!actor.forced && actor.autonomous && !actor.locked &&
            actor.stop > 30 * (5 - actor.frequency) && nearScreen(actor, view)) {
            const outcome = runRouteCommand(actor, player, tryStep);
            if (outcome) return outcome;
        }
    }
    advancePosition(actor);
    return 'settled';
}

module.exports = { copyPatrol, tickPatrol, advancePosition };
