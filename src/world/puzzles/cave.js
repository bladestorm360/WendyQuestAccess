'use strict';

const { copyPatrol, TIMING_CUE, STAMP_WIDTH, matchesMotionStamp } = require('./patrol-motion.cjs');
const { CHASES, CRYSTALS, activeDistraction, corridorMap, caveDestination, createCaveProgress } = require('./cave-progression');

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

function waitingDistraction(map, event, page) {
    // The only admitted parallel interpreter is the authored return route.
    // It publishes switch 620 as soon as the last forced route completes.
    if (map._mapId !== 200 || event._eventId !== 19 || event._pageIndex !== 1) return false;
    const wait = event._interpreter;
    const actor = map._events[18];
    const command = page.list[45];
    return command?.code === 205 && command.parameters[0] === 18 && command.parameters[1]?.wait === true &&
        wait?._list === page.list && wait._index === 46 && wait._waitMode === 'route' && wait._characterId === 18 &&
        actor?._moveRouteForcing === true && actor._moveRoute === command.parameters[1];
}

function captureMotion(root, graphics) {
    const map = root.$gameMap;
    const room = ROOMS[map?._mapId];
    const player = root.$gamePlayer;
    const data = root.$dataMap;
    const tileSize = root.$dataSystem?.tileSize;
    const speed = player._moveSpeed;
    const frame = graphics.frameCount;
    if (!room || data?.scrollType !== 0 || !Number.isInteger(frame) || frame < 0 ||
        !Number.isInteger(speed) || speed < 3 || speed > 6 || player._moveRouteForcing || map._scrollRest > 0 ||
        map._commonEvents?.length || !(tileSize > 0) || !Array.isArray(map._events) || map._events.length > 64) return null;
    const view = { x: map._displayX, y: map._displayY, width: graphics.width / tileSize, height: graphics.height / tileSize };
    if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0) return null;
    const patrols = [];
    let barrier = 0;
    for (const event of map._events) {
        if (!event || event._erased || event._pageIndex < 0) continue;
        const id = event._eventId;
        const page = data.events[id]?.pages?.[event._pageIndex];
        if (!page) return null;
        if ((event._trigger === 3 || event._trigger === 4) && page.list.length > 1) {
            if (!waitingDistraction(map, event, page)) return null;
            barrier = 18;
        }
        const mobile = event._moveType > 0 || event._moveRouteForcing || event._jumpCount > 0 ||
            event._x !== event._realX || event._y !== event._realY;
        if (!mobile && event._trigger !== 2) continue;
        if (!room.patrols.includes(id) || event._tileId > 0 || event.blockerProperties) return null;
        const actor = copyPatrol(event);
        if (!actor) return null;
        patrols.push(actor);
    }
    return { frame, speed, dash: data.disableDashing === false, view, patrols, barrier };
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
    const progress = createCaveProgress(root, graphics);

    function available(scene) {
        return !!(scene?._wqaMapRestored && !scene._wqaBattleStarted && corridorMap(root.$gameMap?._mapId));
    }

    function visit(scene) {
        let state = visits.get(scene);
        if (!state) {
            state = { active: false, sign: false, captured: false, outcome: '' };
            visits.set(scene, state);
        }
        return state;
    }

    function activate(scene) {
        const state = visit(scene);
        state.active = true;
        scene._wqaCaveGuideActive = scene._wqaPresentation = true;
        return state;
    }

    function presented(scene, paint) {
        if (!available(scene) || scene._wqaTerrainWork || paint.end !== paint.text.length || paint.end > 384) return;
        const map = root.$gameMap;
        const room = ROOMS[map._mapId];
        if (!room) return;
        const source = root.$gameMessage?.interpreter;
        if (!source?._list || source._mapId !== map._mapId || source._waitMode !== 'message') return;
        const common = root.$dataCommonEvents?.[CAPTURE_EVENT]?.list;
        if (source._list === common && source._index === 28) {
            const state = visit(scene);
            state.captured = true;
            state.outcome = 'The patrol caught you.';
            progress.cancel();
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
        const state = activate(scene);
        state.outcome = checkpoint ? 'Returned to a checkpoint after capture.' : 'Returned after capture.';
    }

    function choicesFor(roomId, state, x, y) {
        if (roomId === 196) return [
            [21, 'Step on the checkpoint to save this crossing.', root.$gameVariables?.value?.(90) === 0],
            [20, 'Continue toward the next patrol room.']
        ];
        if (roomId === 199) {
            const triggers = x < 20 ? [24, 22] : [22, 24];
            return [...triggers.map(id => [id, 'Step onto the trigger, then let the line of mechs begin moving.']),
                [26, 'Cross behind the patrol line to the next room.']];
        }
        if (roomId === 200) {
            const checkpoint = root.$gameVariables?.value?.(90);
            const ordered = [5, 19, 10].map(id => {
                const event = root.$gameMap._events[id];
                const usable = event?._pageIndex === 0 && !event._erased &&
                    root.$gameSwitches?.value?.(CRYSTALS[id][0]) === false;
                return { id, usable, distance: usable ? Math.abs(x - event._x) + Math.abs(y - event._y) : Infinity };
            });
            const moving = ordered.some(({ id }) => activeDistraction(root.$gameMap, root.$dataMap, id));
            const crystals = moving ? [] : ordered.filter(({ usable }) => usable).sort((a, b) => a.distance - b.distance)
                .map(({ id }) => [id, 'Activate the distraction crystal, then move while the patrol turns away.']);
            // Each checkpoint is a native recovery landing. A distraction
            // is useful only while its real activation branch is available.
            return [
                [6, 'Step on the first checkpoint before crossing the patrol route.', checkpoint < 2],
                [15, 'Reach the checkpoint below the exit.', checkpoint < 3 && y <= 14],
                ...crystals,
                [15, 'Reach the checkpoint below the exit.', checkpoint < 3 && y > 14],
                [11, moving ? 'The distraction is active. Continue toward the chase-room entrance.' : 'Continue to the chase-room entrance.']
            ];
        }
        if (roomId === 201) return [[2, state.outcome === 'A mech started chasing you.' ?
            'Keep moving toward the staircase passage. Recheck each turn.' : 'Follow the next safe step toward the staircase passage. Passing a trigger can start a chase.']];
        return {
            206: [[11, 'Enter the cave to begin the patrol route.']],
            202: [[4, 'Go up the staircase to the chamber. Step through the scene when prompted.']],
            197: [[11, 'Use the statue to complete the route.']]
        }[roomId];
    }

    function review(scene, objects, x, y) {
        const map = root.$gameMap;
        const room = ROOMS[map._mapId];
        const state = activate(scene);
        const find = id => objects.find(item => item.id === id && item.category !== 'quests');
        const sign = room?.sign && !state.sign && warningApproach(map, x, y, room.sign) && find(room.sign);
        const next = sign ? [[room.sign, 'Read the warning sign before crossing.']] :
            choicesFor(map._mapId, state, x, y);
        const options = [];
        for (const [id, hint, include = true] of next || []) {
            const target = include && find(id);
            if (!target) continue;
            const eventAction = target.eventAction || (target.category === 'objects' ? 'interact' : 'step');
            options.push({ target: { ...target, eventAction }, hint });
        }
        const patrol = room && patrolInView(room, map, root.$dataMap, scene, graphics.app?.renderer?.screen, x, y);
        const text = ['Secret Cave.', state.outcome, options[0]?.hint || 'Wait for a clear approach and check again.',
            patrol].filter(Boolean).join(' ');
        return { options, target: options[0]?.target, text };
    }

    return {
        available, presented, recover, review,
        accepted(scene, event) { if (available(scene) && visits.get(scene)?.active) progress.accepted(scene, event); },
        settleProgress(scene) {
            const result = progress.settle(scene);
            if (!result || !available(scene)) return '';
            activate(scene).outcome = result.outcome;
            // Arrival stays in review so it cannot replace the native map name.
            return result.arrived ? '' : result.outcome;
        },
        active(scene) { return visits.get(scene)?.active === true; },
        stop(scene) {
            const state = visits.get(scene);
            const waiting = pending.delete(root.$gameMap);
            const progression = progress.cancel();
            if (waiting) graphics._wqaCaveRecoveryPending = false;
            if (!state?.active) return waiting || progression;
            state.active = false;
            scene._wqaCaveGuideActive = false;
            return true;
        }
    };
}

module.exports = { createCaveGuide, timedCave, checkpointTarget, caveDestination, warningApproach, captureMotion,
    TIMING_CUE, STAMP_WIDTH, matchesMotionStamp };
