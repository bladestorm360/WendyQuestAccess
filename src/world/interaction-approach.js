'use strict';

const { CARDINAL } = require('./spatial-direction');

const NORMAL_TRIGGERS = [0, 1, 2];

function nextTile(map, x, y, direction) {
    return [map.roundXWithDirection(x, direction), map.roundYWithDirection(y, direction)];
}

function firstStartable(player, x, y, triggers, normal) {
    return player.findEventsAt(x, y).find(event =>
        player.canTriggerEvent(event, triggers, normal) && event.list()?.length > 1);
}

function atApproach(map, player, target, { x, y, facing }) {
    if (!player.canStartLocalEvents()) return false;
    if (facing === null && target._trigger !== 0) return firstStartable(player, x, y, [1, 2], false) === target;
    const forward = nextTile(map, x, y, facing ?? player._direction);
    if (map.airship?.()?.pos(x, y) || map.ship?.()?.pos(...forward) || map.boat?.()?.pos(...forward)) return false;
    // Native OK checks the player's tile before looking in front. A startable
    // event there or before a counter changes which interaction will win.
    const here = firstStartable(player, x, y, [0], false);
    if (here || facing === null) return here === target;
    const next = firstStartable(player, ...forward, NORMAL_TRIGGERS, true);
    if (next) return next === target;
    return map.isCounter(...forward) &&
        firstStartable(player, ...nextTile(map, ...forward, facing), NORMAL_TRIGGERS, true) === target;
}

function atBoardingApproach(map, type, target, { x, y, facing }) {
    if (type === 'airship') return target.pos(x, y);
    if (!CARDINAL[facing] || map.airship?.()?.pos(x, y)) return false;
    const [a, b] = nextTile(map, x, y, facing);
    if (!target.pos(a, b)) return false;
    return type !== 'boat' || !map.ship?.()?.pos(a, b);
}

module.exports = { nextTile, atApproach, atBoardingApproach };
