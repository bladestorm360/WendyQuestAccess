'use strict';

const MAX_BYTES = 32 * 1024;
const MOTION_KEYS = new Set(['up', 'down', 'left', 'right']);

function createFieldDiagnostics(root, host, nodeRequire, nodeProcess, fieldReady = () => false) {
    let busy = false;
    let previous = '';
    let lastAt = -Infinity;
    let dash = null;

    function canWrite(scene) {
        return scene === host.manager._scene && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize &&
            host.graphics.app?.stage === scene && !host.screenFading() && host.hasFocus() &&
            !scene._fadeDuration && !scene._fadeOpacity && !scene._wqaTerrainWork &&
            !scene._wqaPreloads?.size && !scene._wqaPreloadOverflow && !root.$gamePlayer?._transferring;
    }

    // Use the same admission and size limit for rejected gestures and completed
    // route requests. The rows carry copied IDs, snapshots and directions only.
    function denied(scene, action) {
        if (busy || !scene?._wqaMapRestored || !scene._started || !scene._active || !canWrite(scene)) return;
        const time = host.now();
        if (time - lastAt < 1000) return;
        const map = root.$gameMap;
        const player = root.$gamePlayer;
        const main = map?._interpreter;
        const row = {
            action, map: map?._mapId, move: scene._prevCanMove, ready: scene._wqaFieldReady,
            event: main?._list ? main._eventId : 0, message: root.$gameMessage?.isBusy(),
            tileset: map?._tilesetId, authoredTileset: root.$dataMap?.tilesetId,
            refresh: !!map?._needsRefresh, nonPageRefresh: !!scene._wqaNonPageRefreshOnly,
            tileRefresh: !!map?._needsTilemapRefresh, idle: map?.inactiveTime >= 30,
            forcing: !!player?._moveRouteForcing, through: !!player?._through,
            vehicle: player?._vehicleType, modal: !!scene._wqaSettingsActive,
            moving: player?._x !== player?._realX || player?._y !== player?._realY,
            dashInput: action === 'directions' ? dashInput(scene) : undefined
        };
        const signature = JSON.stringify(row);
        if (signature === previous && time - lastAt < 15000) return;
        lastAt = time;
        previous = signature;
        write(scene, row);
    }

    function write(scene, row) {
        if (busy || !canWrite(scene)) return false;
        busy = true;
        host.schedule(async () => {
            try {
                if (!canWrite(scene)) return;
                const fs = nodeRequire('fs').promises;
                const path = nodeRequire('path');
                const game = path.dirname(path.dirname(nodeProcess.mainModule.filename));
                const log = path.join(game, 'WendyQuestAccess-field.log');
                let size = 0;
                try {
                    const stat = await fs.lstat(log);
                    if (!stat.isFile()) return;
                    size = stat.size;
                }
                catch (error) { if (error.code !== 'ENOENT') return; }
                if (!canWrite(scene)) return;
                const line = JSON.stringify({ utc: new Date().toISOString(), ...row }) + '\n';
                await fs.writeFile(log, line, { flag: size + line.length <= MAX_BYTES ? 'a' : 'w' });
            } catch { /* A read-only installation can still use field controls. */ }
            finally { busy = false; }
        });
        return true;
    }

    function dashReady(scene) {
        if (root.$gamePlayer?._vehicleType !== 'walk' || !fieldReady(scene)) return;
        const map = root.$gameMap;
        if (map?._mapId !== 196 && map?._mapId !== 199) return;
        const player = root.$gamePlayer;
        if (dash?.scene === scene && dash.map === map && dash.player === player) return;
        if (write(scene, { action: 'dashTraceReady', map: map._mapId, pid: nodeProcess.pid })) {
            dash = { scene, map, player, domShift: null, loggedAt: -Infinity };
            scene._wqaDashTrace = true;
        }
    }

    function dashActive(scene) {
        return dash?.scene === scene && dash.map === root.$gameMap && dash.player === root.$gamePlayer &&
            !scene._wqaAutowalkActive && dash.player._vehicleType === 'walk' && fieldReady(scene);
    }

    function dashKey(scene, event, down) {
        if (!scene?._wqaDashTrace) return;
        const shift = event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight';
        const direction = root.Input?.keyMapper?.[event.keyCode];
        if ((!shift && !MOTION_KEYS.has(direction)) || !dashActive(scene)) return;
        const frame = host.graphics.frameCount;
        dash.domShift = !!event.shiftKey;
        if (shift) {
            dash.key = { side: event.code === 'ShiftLeft' ? 'left' : event.code === 'ShiftRight' ? 'right' : 'unknown',
                keyCode: event.keyCode, down, frame };
        } else dash.direction = { direction, down, frame };
    }

    function dashInput(scene) {
        if (!scene?._wqaDashTrace || !dashActive(scene)) return;
        return { domShift: dash.domShift, shiftKey: dash.key, directionKey: dash.direction,
            nativeShift: !!root.Input?._currentState?.shift, dashing: !!dash.player._dashing };
    }

    function dashStarted(scene) {
        if (!dashActive(scene)) return;
        const { _x, _y, _dashing, _moveSpeed } = dash.player;
        dash.step = { x: _x, y: _y, frame: host.graphics.frameCount, at: host.now(),
            domShift: dash.domShift, key: dash.key, direction: dash.direction,
            nativeShift: !!root.Input?._currentState?.shift, shiftBinding: root.Input?.keyMapper?.[16] || '',
            dashing: !!_dashing, moveSpeed: _moveSpeed };
    }

    function dashLanded(scene) {
        if (!dashActive(scene) || !dash.step) return;
        const { step, player, map } = dash;
        dash.step = null;
        const frames = host.graphics.frameCount - step.frame + 1;
        if (step.x !== player._x || step.y !== player._y || frames < 1 || frames > 120) return;
        const ms = Math.round(host.now() - step.at);
        const finalDash = !!player._dashing;
        const signature = JSON.stringify([step.domShift, step.nativeShift, step.dashing, finalDash, step.moveSpeed, frames]);
        const since = step.at - dash.loggedAt;
        if (since < 200 || (dash.signature === signature && since < 2000)) return;
        if (write(scene, {
            action: 'dashTraceStep', map: map._mapId, pid: nodeProcess.pid, frame: step.frame,
            domShift: step.domShift, shiftKey: step.key, directionKey: step.direction,
            nativeShift: step.nativeShift, shiftBinding: step.shiftBinding, dashing: step.dashing,
            finalDash, moveSpeed: step.moveSpeed, frames, ms
        })) {
            dash.signature = signature;
            dash.loggedAt = step.at;
        }
    }

    function routed(job, result) {
        if (job.action !== 'directions' || busy || !canWrite(job.scene) || result?.status === 'cancelled') return;
        const destination = job.destination;
        const request = job.request;
        write(job.scene, {
            action: job.action, outcome: result?.status || 'unavailable',
            map: job.map, mode: job.mode, from: [job.x, job.y], source: job.controller ? 'controller' : 'keyboard',
            target: request?.event, targetPoint: request?.targetX === undefined ? undefined : [request.targetX, request.targetY],
            targetMap: request?.transfer?.map, category: destination?.category,
            targetTile: destination && Number.isInteger(destination.x) ? [destination.x, destination.y] : undefined,
            followedDirection: request?.followedDirection, approach: result?.entrance ?? result?.event,
            blocker: result?.npc ?? result?.enemy ?? result?.boundaryEvent,
            distance: result?.distance, legs: result?.legs?.slice(0, 8).map(leg => [leg.direction, leg.tiles]),
            arrival: result?.arrival, boundary: result?.boundary, reenter: result?.reenter, more: result?.more,
            patrolStep: result?.opening?.direction ?? result?.direction, patrolTiles: result?.opening?.tiles ?? result?.tiles,
            patrolOpening: result?.opening && [result.opening.from, result.opening.through],
            patrolHeadings: result?.opening?.headings ?? result?.headings,
            dashInput: dashInput(job.scene)
        });
    }

    function caveTiming(scene, action, leg, result) {
        const player = root.$gamePlayer;
        write(scene, { action, map: root.$gameMap?._mapId, from: [player?._x, player?._y], leg, result });
    }

    return { denied, routed, caveTiming, dashReady, dashKey, dashStarted, dashLanded };
}

module.exports = { createFieldDiagnostics };
