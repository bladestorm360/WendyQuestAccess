'use strict';

const ROOM = 199;
const GUARDS = [9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const HORIZON = 2300;
const MAX_MOVES = 128;
const MANUAL_HORIZON = 1700;
const REACTION_FRAMES = 30;

function lineDestination(map, event) {
    return map === ROOM && (event === 25 || event === 34 || event === 26);
}

function lineActors(patrols) {
    const line = patrols.filter(actor => GUARDS.includes(actor.id));
    if (line.length !== GUARDS.length || !line.every((actor, i) => actor.id === GUARDS[i] &&
        actor.normal && actor.hazard && !actor.through && actor.forced && actor.route.repeat &&
        !actor.route.skippable && !actor.jump && actor.route.commands.every(([code]) =>
            code === 0 || code >= 1 && code <= 4 || code === 15))) return null;
    return line;
}

module.exports = { GUARDS, lineDestination, lineActors, HORIZON, MAX_MOVES, MANUAL_HORIZON, REACTION_FRAMES };
