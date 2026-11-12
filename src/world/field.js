'use strict';

const { captureWorld } = require('./snapshot');
const { browse, createDestinationBrowser } = require('./destinations');
const { createSaltGuide } = require('./puzzles/salt-caverns');
const { createCaveGuide, timedCave, warningApproach } = require('./puzzles/cave');
const BROWSE = new Set(['previousDestination', 'nextDestination', 'previousCategory', 'nextCategory']);

function createField(root, host, notifications) {
    const salt = createSaltGuide(root);
    const cave = createCaveGuide(root, host.graphics);
    let owner = null;
    let active = null;
    let worker = null;
    let admission = null;
    let inFlight = null;
    let sequence = 0;
    let speech = 0;
    let renderOwner = null;
    let control = null;

    function guideFor(scene) {
        if (salt.available(scene)) return salt;
        return cave.available(scene) ? cave : null;
    }

    function ready(scene) {
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        return !!(scene?._wqaFieldReady && !scene._wqaSettingsActive &&
            scene === host.manager._scene && host.graphics.app?.stage === scene &&
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
        scene._wqaCaveReview = false;
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
            const player = root.$gamePlayer;
            if (job.area && !warningApproach(root.$gameMap, player._x, player._y, job.target))
                return status(job, 'Warning sign directions are no longer available');
            const result = packet.result;
            if (result?.status === 'ready') present(job, { kind: 'routeDirections', name: job.label,
                legs: result.legs, facing: result.arrival.facing, more: result.more === true });
            else if (result?.status === 'unreachable') status(job, 'No walkable route to ' + job.label);
            else if (result?.status === 'unavailable') status(job, 'Directions unavailable for ' + job.label);
        } else if (active?.action === 'directions' && ready(active.scene)) afterRender();
    }

    function route(job, snapshot, target, area) {
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
                    if (active?.action === 'directions' && active !== dropped && ready(active.scene)) afterRender();
                };
                created.on('message', received);
                created.on('error', failed);
                created.on('exit', failed);
                created.unref();
            }
            job.map = snapshot.map;
            job.label = target.name;
            job.area = area;
            job.target = target.id;
            Atomics.store(admission, 0, job.sequence);
            inFlight = job;
            worker.postMessage({ map: snapshot.map, sequence: job.sequence, epoch: job.sequence, live: snapshot.live,
                request: { x: snapshot.x, y: snapshot.y, event: target.id, limit: 8, area } }, [snapshot.live.terrain.buffer]);
        } catch {
            if (admission) Atomics.store(admission, 0, 0);
            inFlight = null;
            status(job, 'Directions service unavailable');
        }
    }

    function perform(job) {
        if (active !== job || !ready(job.scene)) return;
        if (job.action === 'directions' && inFlight) return;
        job.performed = true;
        if (job.action === 'status') return status(job, job.text);
        const routing = job.action === 'directions';
        const timed = timedCave(root.$gameMap._mapId);
        const label = salt.available(job.scene) ? (id, fallback) => salt.label(job.scene, id, fallback) : undefined;
        const snapshot = captureWorld(root, routing && !timed, label);
        if (!snapshot) return status(job, 'Map information unavailable');
        if (job.action === 'puzzleGuide') {
            const result = guideFor(job.scene)?.review(job.scene, snapshot.objects, snapshot.x, snapshot.y);
            if (!result) return;
            if (result.target) {
                owner.browser.category = result.target.category;
                owner.browser.selections[result.target.category] = result.target.id;
            }
            return status(job, result.text);
        }
        const result = browse(owner.browser, snapshot, job.changes);
        if (!result.target) return status(job, result.status);
        const { target, category } = result;
        if (!routing) return present(job, { kind: 'fieldTarget', name: target.name, category,
            dx: target.x - snapshot.x, dy: target.y - snapshot.y });
        if (!timed) return route(job, snapshot, target);
        const area = warningApproach(root.$gameMap, snapshot.x, snapshot.y, target.id);
        if (!area) return status(job, 'Ordinary directions unavailable in this timed area');
        const terrain = captureWorld(root);
        if (!terrain) return status(job, 'Map information unavailable');
        route(job, terrain, target, area);
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
    function command(action, text) {
        const scene = host.manager._scene;
        if (action === 'puzzleStop') {
            if (!host.hasFocus()) return false;
            const pending = active?.scene === scene && active.action === 'puzzleGuide';
            const stopped = salt.stop(scene) || cave.stop(scene);
            if (!pending && !stopped) return false;
            if (pending) retire(scene);
            if (!active && ready(scene)) command('status', 'Puzzle guidance stopped');
            return true;
        }
        const puzzle = action === 'puzzleGuide' && guideFor(scene);
        if ((!BROWSE.has(action) && action !== 'currentDestination' && action !== 'directions' && action !== 'status' && !puzzle) ||
            !ready(scene) || sequence >= 0x7ffffffe) return false;
        const changes = active?.scene === scene && !active.performed ? active.changes : [];
        if (BROWSE.has(action) && changes.length < 16) changes.push(action);
        if (owner) retire(owner.scene);
        if (owner?.scene !== scene) owner = { scene, browser: createDestinationBrowser() };
        active = { scene, action, sequence: ++sequence, changes, text };
        // Patrol steps between the key press and the rendered frame are
        // expected. Their new sprite positions belong to the requested sample.
        scene._wqaCaveReview = timedCave(root.$gameMap._mapId);
        scene._wqaRouteActive = !scene._wqaCaveReview;
        scene._wqaPresentation = true;
        afterRender();
        return true;
    }
    return {
        ready,
        controlOwner(scene) {
            if (!ready(scene)) return null;
            if (control?.scene !== scene) control = { kind: 'field', scene };
            control.puzzle = !!guideFor(scene);
            control.puzzleActive = salt.active(scene) || cave.active(scene);
            return control;
        },
        dialoguePresented(scene, paint) { guideFor(scene)?.presented(scene, paint); },
        puzzleActive(scene) { return salt.active(scene) || cave.active(scene); },
        observeRecovery(scene) { if (ready(scene)) cave.recover(scene); },
        command,
        report(text) { return command('status', text); },
        changed: retire,
        controlLost(scene) {
            retire(scene);
            if (control?.scene === scene) control = null;
        },
        leave(scene) {
            if (scene) scene._wqaFieldReady = false;
            retire(scene);
            if (owner?.scene === scene) owner = null;
            if (control?.scene === scene) control = null;
        }
    };
}

module.exports = { createField };
