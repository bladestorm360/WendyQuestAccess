'use strict';

const MAX_BYTES = 32 * 1024;
// Only the owner's reported cave context gets extra diagnostic observation.
// 198 is the native capture/reset continuation; shrine 197 is excluded.
const CAVE_MAPS = new Set([196, 198, 199, 200, 201, 202]);
const number = value => Number.isFinite(value) ? value : null;


function createFieldDiagnostics(root, host, nodeRequire, nodeProcess) {
    let busy = false;
    let previous = '';
    let lastAt = -Infinity;
    let lastCave = null;
    let caveScene = null;
    let lostScene = null;
    let faults = 0;
    const pendingFaults = [];

    // Called only by existing admitted route/actual-step/control-loss sites.
    // Copy bounded scalar data; never retain an interpreter, event or route in
    // a queued record and never scan native objects from the asynchronous writer.
    function capture(scene, resumed = true) {
        if (!CAVE_MAPS.has(root.$gameMap?._mapId)) {
            lastCave = caveScene = lostScene = null;
            return null;
        }
        if (!canWrite(scene) || !scene?._wqaMapRestored || !scene._started || !scene._active) return null;
        if (resumed) lostScene = null;
        const map = root.$gameMap, player = root.$gamePlayer;
        const interpreters = [];
        let interpreter = map?._interpreter;
        for (let depth = 0; interpreter && depth < 4; depth++, interpreter = interpreter._childInterpreter) {
            interpreters.push([number(interpreter._eventId), number(interpreter._index),
                String(interpreter._waitMode || '').slice(0, 32), number(interpreter._waitCount),
                number(interpreter._list?.[interpreter._index]?.code)]);
        }
        const guards = [], events = map?._events;
        if (Array.isArray(events) && events.length <= 256) {
            for (let id = 1; id < events.length && guards.length < 24; id++) {
                const guard = events[id];
                if (!guard || guard._trigger !== 2 || guard._erased) continue;
                guards.push([id, number(guard._x), number(guard._y), number(guard._realX), number(guard._realY),
                    number(guard._direction), number(guard._moveRouteIndex), number(guard._waitCount),
                    !!guard._moveRouteForcing, number(guard._stopCount), number(guard._pageIndex)]);
            }
        }
        caveScene = scene;
        lastCave = {
            frame: number(host.graphics.frameCount), map: number(map?._mapId),
            player: [number(player?._x), number(player?._y), number(player?._realX), number(player?._realY),
                number(player?._direction), number(player?._moveRouteIndex), number(player?._waitCount),
                !!player?._moveRouteForcing],
            ready: !!scene._wqaFieldReady, move: !!scene._prevCanMove,
            footsteps: !!host.graphics._wqaFootstepsEnabled, caveTiming: !!host.graphics._wqaCaveTimingEnabled,
            autowalk: !!scene._wqaAutowalkActive, cleanup: !!scene._wqaAutowalkCleanup,
            message: !!root.$gameMessage?.isBusy(), interpreters, guards
        };
        return lastCave;
    }

    function controlLost(scene) {
        // The native unavailable producer may repeat while a route is suspended.
        // One receipt per control-loss episode avoids per-frame scans/disk work.
        if (lostScene === scene) return;
        const state = capture(scene, false);
        if (state) {
            lostScene = scene;
            write(scene, { action: 'caveControlLost', state });
        }
    }

    // Exact native error handlers call this before their existing behavior.
    // Normal-build catchException can log an error without stopping the music.
    // Keep its first four cave receipts, including one behind a busy async write;
    // a repeating native error must never create an unbounded backlog or I/O loop.
    function fault(producer, error) {
        if (!lastCave || !caveScene || root.$gameMap?._mapId !== lastCave.map || !canWrite(caveScene) || faults >= 4) return;
        if (producer !== 'catchException' && producer !== 'onError') return;
        faults++;
        const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
        const row = { action: 'caveNativeError', producer, ordinal: faults,
            error: { name: text(error?.name, 64), message: text(error?.message, 1024), stack: text(error?.stack, 4096),
                file: text(error?.filename, 512), line: number(error?.lineno) }, state: lastCave };
        if (busy) pendingFaults.push({ scene: caveScene, row });
        else write(caveScene, row);
    }


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
            moving: player?._x !== player?._realX || player?._y !== player?._realY
        };
        const signature = JSON.stringify(row);
        if (signature === previous && time - lastAt < 15000) return;
        lastAt = time;
        previous = signature;
        const state = capture(scene);
        if (state) row.state = state;
        write(scene, row);
    }

    function write(scene, row) {
        if (busy || !canWrite(scene)) return;
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
                const bytes = nodeRequire('buffer').Buffer.byteLength(line);
                if (bytes > MAX_BYTES) return;
                await fs.writeFile(log, line, { flag: size + bytes <= MAX_BYTES ? 'a' : 'w' });
            } catch { /* A read-only installation can still use field controls. */ }
            finally {
                busy = false;
                const pending = pendingFaults.shift();
                if (pending) write(pending.scene, pending.row);
            }
        });
    }

    function routed(job, result) {
        if (job.action !== 'directions' || busy || !canWrite(job.scene) || result?.status === 'cancelled') return;
        const destination = job.destination;
        const request = job.request;
        const state = capture(job.scene);
        write(job.scene, {
            ...(state ? { state } : {}),
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
            airshipBoarding: result?.airshipBoarding,
            interaction: result?.interaction
        });
    }

    function caveTiming(scene, action, leg, result) {
        const player = root.$gamePlayer;
        write(scene, { action, map: root.$gameMap?._mapId, from: [player?._x, player?._y], leg, result });
    }

    return { denied, routed, caveTiming, capture, controlLost, fault };
}

module.exports = { createFieldDiagnostics };
