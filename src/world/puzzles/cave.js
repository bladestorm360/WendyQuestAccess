'use strict';

const ROOMS = Object.freeze({
    196: { patrols: [4, 5, 6, 7, 12, 13, 14, 15, 17, 18], checkpoints: [21], sign: 2 },
    199: { patrols: [4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], checkpoints: [] },
    200: { patrols: [4, 9, 16, 17, 18], checkpoints: [6, 15] },
    201: { patrols: [3, 8, 10, 12, 14, 15, 16, 17, 18], checkpoints: [] }
});
const RESET_MAP = 198;
const CAPTURE_EVENT = 102;
const LANDING_COMMANDS = [33, 37, 41, 45];
const WARNING_APPROACH = Object.freeze([6, 38, 22, 51]);
const DISTRACTIONS = { 4: [5, 25], 9: [10, 6], 16: [19, 8], 17: [19, 25], 18: [19, 45] };
const RETURN_ROUTES = { 16: [19, 0], 17: [19, 19], 18: [19, 45] };
const CHASES = { 3: [4, 4], 8: [9, 3], 10: [11, 3], 12: [13, 3], 14: [24, 3],
    15: [26, 3], 16: [27, 3], 17: [28, 3], 18: [29, 3] };

function timedCave(map) { return Number.isInteger(map) && !!ROOMS[map]; }

function checkpointTarget(map, id, page, trigger) {
    return page === 0 && trigger === 1 && ROOMS[map]?.checkpoints.includes(id);
}

function separatedFromApproach(event) {
    const route = event._moveRoute;
    if (event._moveRouteForcing || !route?.repeat || !Array.isArray(route.list) || route.list.length > 40) return false;
    let x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const command of route.list) {
        const code = command.code;
        if (code === 1) y++;
        else if (code === 2) x--;
        else if (code === 3) x++;
        else if (code === 4) y--;
        else if (code !== 0 && !(code >= 15 && code <= 19)) return false;
        minX = Math.min(x, minX);
        maxX = Math.max(x, maxX);
        minY = Math.min(y, minY);
        maxY = Math.max(y, maxY);
    }
    const [left, top, right, bottom] = WARNING_APPROACH;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (route.skippable || x || y) {
        // A blocked skippable step can shift a repeating route along its
        // movement axis. Treat every tile on that row or column as occupied.
        return (!spanX && (event._x < left || event._x > right)) ||
            (!spanY && (event._y < top || event._y > bottom));
    }
    // A blocked non-skippable step retries from the same tile and phase.
    // The whole authored extent, measured from any current phase, is a bound.
    return event._x + spanX < left || event._x - spanX > right ||
        event._y + spanY < top || event._y - spanY > bottom;
}

function warningApproach(map, x, y, target) {
    const [left, top, right, bottom] = WARNING_APPROACH;
    if (map._mapId !== 196 || target !== ROOMS[196].sign ||
        !Number.isInteger(x) || !Number.isInteger(y) || x < left || y < top || x > right || y > bottom) return null;
    for (const id of ROOMS[196].patrols) {
        const event = map._events[id];
        if (!event || event._erased || event._pageIndex !== 0 || event._trigger !== 2) continue;
        if (!separatedFromApproach(event)) return null;
    }
    return WARNING_APPROACH;
}

function offsetLabel(delta, negative, positive) {
    const steps = Math.round(Math.abs(delta));
    return steps ? steps + ' ' + (delta < 0 ? negative : positive) : '';
}

function patrolRole(map, data, patrol) {
    if (!patrol._moveRouteForcing || !patrol._moveRoute) return '';
    const id = patrol._eventId;
    const matches = (locator, page) => {
        if (!locator) return false;
        const [source, index] = locator;
        const command = data?.events?.[source]?.pages?.[page]?.list?.[index];
        return command?.code === 205 && command.parameters[0] === id && command.parameters[1] === patrol._moveRoute;
    };
    if (map === 201 && matches(CHASES[id], 0)) return 'giving chase';
    if (map === 200) {
        if (matches(DISTRACTIONS[id], 0)) return 'responding to a distraction';
        if (matches(RETURN_ROUTES[id], 1)) return 'returning to patrol';
    }
    return '';
}

function clearFootprint(sprite, tilemap) {
    const matrix = sprite.transform?.localTransform;
    const frame = sprite.texture?.orig;
    if (!matrix || matrix.b !== 0 || matrix.c !== 0 || !(frame?.width > 0 && frame.height > 0) ||
        !(tilemap.tileWidth > 0 && tilemap.tileHeight > 0) || !tilemap.origin) return false;
    // Use the drawn frame in tilemap-local pixels. Include a pixel on each
    // edge for the native tile layer's integer scroll rounding.
    const width = matrix.a * frame.width;
    const height = matrix.d * frame.height;
    if (!(Math.abs(width) > 0 && Math.abs(height) > 0)) return false;
    const x = matrix.tx + tilemap.origin.x - sprite.anchor.x * width;
    const y = matrix.ty + tilemap.origin.y - sprite.anchor.y * height;
    const left = Math.floor((Math.min(x, x + width) - 1) / tilemap.tileWidth);
    const right = Math.floor((Math.max(x, x + width) + 1) / tilemap.tileWidth);
    const top = Math.floor((Math.min(y, y + height) - 1) / tilemap.tileHeight);
    const bottom = Math.floor((Math.max(y, y + height) + 1) / tilemap.tileHeight);
    if (!((right - left + 1) * (bottom - top + 1) <= 16)) return false;
    for (let row = top; row <= bottom; row++) {
        for (let column = left; column <= right; column++) {
            const overpass = tilemap._isOverpassPosition(column, row);
            for (let layer = 0; layer < 4; layer++) {
                const tile = tilemap._readMapData(column, row, layer);
                if (tile && (tilemap._isHigherTile(tile) || (overpass && layer >= 2))) return false;
            }
        }
    }
    return true;
}

function patrolInView(room, map, data, scene, screen, x, y) {
    const tilemap = scene._spriteset?._tilemap;
    if (!tilemap || !(screen?.width > 0 && screen.height > 0)) return '';
    let nearest = null;
    let distance = Infinity;
    for (const id of room.patrols) {
        const event = map._events[id];
        if (!event || event._erased || event._pageIndex !== 0 || event._trigger !== 2 ||
            event._priorityType !== 1 || event._through) continue;
        const offset = Math.abs(event._realX - x) + Math.abs(event._realY - y);
        if (!(offset < distance)) continue;
        // Eli's lookup is keyed to the native Sprite_Character. Its transform
        // already includes the tilemap offset and camera zoom from this paint.
        const sprite = event.getMapSprite?.();
        const point = sprite?.worldTransform;
        if (!point || sprite._character !== event || sprite.parent !== tilemap ||
            !sprite.worldVisible || !sprite.renderable || !(sprite.worldAlpha > 0) || !sprite.texture?.valid ||
            !(point.tx >= 0 && point.ty >= 0 && point.tx < screen.width && point.ty < screen.height) ||
            point.a === 0 || point.d === 0 ||
            !clearFootprint(sprite, tilemap)) continue;
        distance = offset;
        nearest = event;
    }
    if (!nearest) return '';
    const offsets = [offsetLabel(nearest._realX - x, 'west', 'east'), offsetLabel(nearest._realY - y, 'north', 'south')];
    const dx = nearest._x - nearest._realX;
    const dy = nearest._y - nearest._realY;
    const moving = dx ? (dx < 0 ? 'west' : 'east') : dy ? (dy < 0 ? 'north' : 'south') : '';
    const location = offsets.filter(Boolean).join(', ') || 'very close';
    const role = patrolRole(map._mapId, data, nearest);
    return 'Closest patrol at this check: ' + location + (moving ? ', moving ' + moving : '') + (role ? ', ' + role : '') + '.';
}

function createCaveGuide(root, graphics) {
    const visits = new WeakMap();
    const pending = new WeakMap();

    function available(scene) {
        return !!(scene?._wqaMapRestored && !scene._wqaBattleStarted && timedCave(root.$gameMap?._mapId));
    }

    function visit(scene) {
        let state = visits.get(scene);
        if (!state) {
            state = { active: false, sign: false, captured: false, outcome: '' };
            visits.set(scene, state);
        }
        return state;
    }

    function presented(scene, paint) {
        if (!available(scene) || scene._wqaTerrainWork || paint.end !== paint.text.length || paint.end > 384) return;
        const map = root.$gameMap;
        const source = root.$gameMessage?.interpreter;
        if (!source?._list || source._mapId !== map._mapId || source._waitMode !== 'message') return;
        const common = root.$dataCommonEvents?.[CAPTURE_EVENT]?.list;
        if (source._list === common && source._index === 28) {
            const state = visit(scene);
            state.captured = true;
            state.outcome = 'The patrol caught you.';
            if (state.active) {
                // Use the pinned native branch only to recognize its later
                // visible landing. The checkpoint variable is never reported.
                const command = common[LANDING_COMMANDS[root.$gameVariables?.value(90)]];
                if (command?.code === 201 && command.parameters[0] === 0) {
                    const [, id, x, y] = command.parameters;
                    pending.set(map, { id, x, y });
                    graphics._wqaCaveRecoveryPending = true;
                }
            }
            return;
        }
        const room = ROOMS[map._mapId];
        const id = source._eventId;
        const pages = root.$dataMap?.events?.[id]?.pages;
        if (room.checkpoints.includes(id) && source._index === 9 && source._list === pages?.[0]?.list) {
            visit(scene).outcome = 'Checkpoint reached.';
        } else if (id === room.sign && source._index === 4 && (source._list === pages?.[0]?.list ||
            source._list === pages?.[1]?.list)) visit(scene).sign = true;
    }

    function recover(scene) {
        if (!graphics._wqaCaveRecoveryPending) return;
        const map = root.$gameMap;
        if (map?._mapId === RESET_MAP || visits.get(scene)?.captured) return;
        const landing = pending.get(map);
        pending.delete(map);
        graphics._wqaCaveRecoveryPending = false;
        const player = root.$gamePlayer;
        if (!landing || !scene._transfer || !available(scene) || map._mapId !== landing.id ||
            player._x !== landing.x || player._y !== landing.y) return;
        const checkpoint = ROOMS[landing.id].checkpoints.some(id => {
            const point = root.$dataMap?.events?.[id];
            return point?.x === landing.x && point.y === landing.y;
        });
        const state = visit(scene);
        state.active = true;
        state.outcome = checkpoint ? 'Returned to a checkpoint after capture.' : 'Returned after capture.';
    }

    function review(scene, objects, x, y) {
        const map = root.$gameMap;
        const room = ROOMS[map._mapId];
        const state = visit(scene);
        state.active = true;
        const target = !state.sign && room.sign && warningApproach(map, x, y, room.sign) &&
            objects.find(item => item.id === room.sign);
        const patrol = patrolInView(room, map, root.$dataMap, scene, graphics.app?.renderer?.screen, x, y);
        const hint = target ? 'Warning sign selected. Get directions, then use the action button at the sign.' :
            map._mapId === 200 ? 'Find distraction crystals and checkpoints in Objects.' : 'Avoid contact with patrols.';
        const text = ['Secret cave.', state.outcome, hint, patrol || 'No patrol in view at this check.'].filter(Boolean).join(' ');
        return { target, text };
    }

    return {
        available, presented, recover, review,
        active(scene) { return visits.get(scene)?.active === true; },
        stop(scene) {
            const state = visits.get(scene);
            const waiting = pending.delete(root.$gameMap);
            if (waiting) graphics._wqaCaveRecoveryPending = false;
            if (!state?.active) return waiting;
            state.active = false;
            return true;
        }
    };
}

module.exports = { createCaveGuide, timedCave, checkpointTarget, warningApproach };
