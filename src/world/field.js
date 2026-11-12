'use strict';

const { captureWorld } = require('./snapshot');
const COMMANDS = new Set(['J', 'K', 'L', 'P']);
const TIMED_MAPS = new Set([196, 199, 200, 201]);

function createField(root, host, notifications) {
    let owner = null;
    let active = null;
    let worker = null;
    let admission = null;
    let inFlight = null;
    let sequence = 0;
    let speech = 0;
    let renderOwner = null;

    function ready(scene) {
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        return !!(scene?._wqaFieldReady && scene === host.manager._scene && host.graphics.app?.stage === scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !host.screenFading() && host.hasFocus() && !scene._wqaTerrainWork &&
            scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 && root.$gameScreen?._brightness === 255 &&
            map?.inactiveTime < 30 && !map._needsRefresh && !map._needsTilemapRefresh && !player?._transferring &&
            !player?._vehicleGettingOn && !player?._vehicleGettingOff &&
            !root.$gameMessage?.isBusy() && !map?._interpreter?._list && player?._vehicleType === 'walk' &&
            !player._through && player._x === player._realX && player._y === player._realY && !(player._jumpCount > 0));
    }

    function retire(scene) {
        if (!owner || owner.scene !== scene) return;
        if (admission) Atomics.store(admission, 0, 0);
        active = null;
        scene._wqaRouteActive = false;
        if (speech) notifications.close(speech);
        speech = 0;
    }

    function present(job, record) {
        if (active !== job || !ready(job.scene)) return;
        speech = notifications.open(record, () => active === job && ready(job.scene));
    }

    function status(job, name) { present(job, { kind: 'fieldStatus', name }); }

    function received(packet) {
        const job = inFlight;
        if (!job || packet?.sequence !== job.sequence || packet.epoch !== job.sequence || packet.map !== job.map) return;
        inFlight = null;
        if (admission && Atomics.load(admission, 0) === job.sequence) Atomics.store(admission, 0, 0);
        if (active === job && ready(job.scene)) {
            const result = packet.result;
            if (result?.status === 'ready') present(job, { kind: 'routeDirections', name: job.label,
                legs: result.legs, facing: result.arrival.facing, more: result.more === true });
            else if (result?.status === 'unreachable') status(job, 'No walkable route to ' + job.label);
            else if (result?.status === 'unavailable') status(job, 'Directions unavailable for ' + job.label);
        } else if (active && active.key === 'P' && ready(active.scene)) afterRender();
    }

    function route(job, snapshot, target) {
        try {
            if (!worker) {
                admission = host.makeWord();
                const created = host.createRouteWorker(admission.buffer);
                worker = created;
                const failed = () => {
                    if (worker !== created) return;
                    worker = null;
                    if (admission) Atomics.store(admission, 0, 0);
                    const dropped = inFlight;
                    inFlight = null;
                    if (dropped) status(dropped, 'Directions service unavailable');
                    if (active && active !== dropped && active.key === 'P' && ready(active.scene)) afterRender();
                };
                created.on('message', received);
                created.on('error', failed);
                created.on('exit', failed);
                created.unref();
            }
            job.map = snapshot.map;
            job.label = target.name;
            Atomics.store(admission, 0, job.sequence);
            inFlight = job;
            worker.postMessage({ map: snapshot.map, sequence: job.sequence, epoch: job.sequence, live: snapshot.live,
                request: { x: snapshot.x, y: snapshot.y, event: target.id, limit: 8 } }, [snapshot.live.terrain.buffer]);
        } catch {
            if (admission) Atomics.store(admission, 0, 0);
            inFlight = null;
            status(job, 'Directions service unavailable');
        }
    }

    function perform(job) {
        if (active !== job || !ready(job.scene)) return;
        if (job.key === 'P' && inFlight) return;
        job.performed = true;
        const snapshot = captureWorld(root);
        if (!snapshot) return status(job, 'Map information unavailable');
        const objects = snapshot.objects;
        if (!objects.length) return status(job, 'No named objects here');
        let index = objects.findIndex(item => item.id === owner.selection);
        if (index < 0 && owner.selection && (job.key === 'K' || job.key === 'P')) {
            owner.selection = null;
            return status(job, 'Selected object is unavailable');
        }
        if (index < 0) {
            index = 0;
            const distance = item => Math.abs(item.x - snapshot.x) + Math.abs(item.y - snapshot.y);
            for (let cursor = 1; cursor < objects.length; cursor++) {
                if (distance(objects[cursor]) < distance(objects[index])) index = cursor;
            }
        }
        index = ((index + job.delta) % objects.length + objects.length) % objects.length;
        const target = objects[index];
        owner.selection = target.id;
        if (job.key !== 'P') return present(job, { kind: 'fieldTarget', name: target.name,
            dx: target.x - snapshot.x, dy: target.y - snapshot.y });
        if (TIMED_MAPS.has(snapshot.map)) return status(job, 'Ordinary directions unavailable in this timed area');
        route(job, snapshot, target);
    }

    function afterRender() {
        const renderer = host.graphics.app?.renderer;
        if (renderer === renderOwner || typeof renderer?.once !== 'function') return;
        renderOwner = renderer;
        renderer.once('postrender', () => {
            if (renderOwner !== renderer) return;
            renderOwner = null;
            const job = active;
            if (!job) return;
            try { perform(job); } catch { status(job, 'Map information unavailable'); }
        });
    }

    for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => { if (owner) retire(owner.scene); });
    return {
        command(key) {
            const scene = host.manager._scene;
            if (!COMMANDS.has(key) || !ready(scene) || sequence >= 0x7ffffffe) return false;
            const pending = active?.scene === scene && !active.performed ? active.delta : 0;
            const delta = (pending + (key === 'J' ? -1 : key === 'L' ? 1 : 0)) % 512;
            if (owner) retire(owner.scene);
            if (owner?.scene !== scene) owner = { scene, selection: null };
            active = { scene, key, sequence: ++sequence, delta };
            scene._wqaRouteActive = scene._wqaPresentation = true;
            afterRender();
            return true;
        },
        changed: retire,
        leave(scene) {
            if (scene) scene._wqaFieldReady = false;
            retire(scene);
            if (owner?.scene === scene) owner = null;
        }
    };
}

module.exports = { createField };
