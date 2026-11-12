'use strict';

const { captureWorld } = require('./snapshot');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { worldBoundaryName } = require('./world-destinations');
const { createAutowalk } = require('./autowalk');
const { browse, createDestinationBrowser } = require('./destinations');
const { questDestinationCurrent } = require('./quest-destinations');
const { createSaltGuide } = require('./puzzles/salt-caverns');
const { createCaveGuide, timedCave, warningApproach, captureMotion, TIMING_CUE } = require('./puzzles/cave');
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
    const preferences = host.navigationPreferences;
    const autowalk = createAutowalk(root, ready, preferences, (scene, record, failed) => {
        if (failed) host.beacon?.stop(scene);
        if (record && scene === host.manager._scene) command('navigationReport', record);
        else if (failed) retire(scene);
    });

    function guideFor(scene) {
        if (salt.available(scene)) return salt;
        return cave.available(scene) ? cave : null;
    }

    function ready(scene, moving = false) {
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        return !!(scene?._wqaFieldReady && !scene._wqaSettingsActive &&
            scene === host.manager._scene && host.graphics.app?.stage === scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !host.screenFading() && host.hasFocus() && !scene._wqaTerrainWork &&
            scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 && root.$gameScreen?._brightness === 255 &&
            map?.inactiveTime < 30 && !map._needsRefresh && !map._needsTilemapRefresh && !player?._transferring &&
            !player?._vehicleGettingOn && !player?._vehicleGettingOff &&
            !root.$gameMessage?.isBusy() && !map?._interpreter?._list && travelMode(map, player) &&
            !player._moveRouteForcing && (moving || player._x === player._realX && player._y === player._realY) &&
            !(player._jumpCount > 0));
    }

    function retire(scene) {
        if (!owner || owner.scene !== scene) return;
        if (admission) Atomics.store(admission, 0, 0);
        active = null;
        scene._wqaRouteActive = false;
        scene._wqaCaveReview = false;
        scene._wqaQuestNavigation = false;
        scene._wqaPreviewUntil = 0;
        if (speech) notifications.close(speech);
        speech = 0;
    }

    function present(job, record, moving = false) {
        if (active !== job || !ready(job.scene, moving)) return;
        speech = notifications.open(record, () => active === job && ready(job.scene, moving) &&
            (!job.quest || questDestinationCurrent(root, job.scene, job.quest)) &&
            (!job.scene._wqaPreviewUntil || host.graphics.frameCount < job.scene._wqaPreviewUntil));
    }

    function status(job, name) { present(job, { kind: 'fieldStatus', name }); }

    function navigationRequest(job) {
        return job && (job.action === 'directions' || job.action === 'currentDestination' || BROWSE.has(job.action));
    }

    function follow(job, result, record) {
        if (job.autowalk && autowalk.start(job, result, record)) {
            // The movement owner now watches native outcomes. Ordinary
            // position notifications must leave its path narration admitted.
            job.scene._wqaRouteActive = false;
            if (preferences().speakAutowalkPath) {
                if (result.autowalkStop) {
                    const legs = record.legs.slice();
                    if (!record.more) {
                        const last = legs.pop();
                        if (last?.tiles > 1) legs.push({ ...last, tiles: last.tiles - 1 });
                    }
                    present(job, { ...record, legs, more: result.autowalkMore, activate: result.autowalkStop }, true);
                } else present(job, record, true);
            }
            return;
        }
        present(job, record);
    }

    function received(packet) {
        const job = inFlight;
        if (!job || packet?.sequence !== job.sequence || packet.epoch !== job.sequence || packet.map !== job.map) return;
        inFlight = null;
        if (admission && Atomics.load(admission, 0) === job.sequence) Atomics.store(admission, 0, 0);
        if (active === job && ready(job.scene) && root.$gameMap._mapId === job.map &&
            travelMode(root.$gameMap, root.$gamePlayer) === job.mode) {
            const player = root.$gamePlayer;
            if (player._x !== job.x || player._y !== job.y) return retire(job.scene);
            if (job.filter) {
                const snapshot = job.filter;
                job.filter = null;
                const result = packet.result;
                if (result?.status !== 'reachable' || Object.prototype.toString.call(result.available) !== '[object Uint8Array]' ||
                    result.available.length !== snapshot.objects.length) {
                    job.performed = true;
                    job.scene._wqaQuestNavigation = false;
                    return status(job, 'Reachable destinations unavailable');
                }
                snapshot.eligibleObjects = snapshot.objects;
                snapshot.objects = snapshot.objects.filter((target, index) => result.available[index] === 1 &&
                    (!target.quest || questDestinationCurrent(root, job.scene, target.quest)));
                job.performed = true;
                return select(job, snapshot);
            }
            if (job.quest && !questDestinationCurrent(root, job.scene, job.quest)) {
                job.quest = null;
                job.scene._wqaQuestNavigation = false;
                return status(job, 'Quest destination changed. Request directions again.');
            }
            if (job.vehicle) {
                const vehicle = parkedVehicle(root.$gameMap, job.vehicle.type);
                if (vehicle?._x !== job.vehicle.x || vehicle._y !== job.vehicle.y)
                    return status(job, 'The boat moved. Request directions again.');
            }
            if (job.area && !warningApproach(root.$gameMap, player._x, player._y, job.target))
                return status(job, 'Warning sign directions are no longer available');
            const result = packet.result;
            if (result?.status === 'timedCue') {
                if (!job.cueRetried && host.graphics.frameCount > job.motionFrame + result.opening?.through - TIMING_CUE.lead) {
                    // One fresh native sample after a cold/late worker result.
                    // The previous snapshot and expired opening are retired.
                    job.cueRetried = true;
                    return afterRender();
                }
                if (!job.timing || !host.caveTiming.start(job.timing, job.x, job.y, result.opening))
                    return status(job, 'Patrol timing changed. Request directions again.');
                job.scene._wqaPreviewUntil = job.motionFrame + result.opening.through - 22;
                return present(job, { kind: 'timedCue', direction: result.opening.direction, terminal: result.opening.terminal,
                    alternate: result.opening.alternate });
            }
            if (result?.status === 'timed') {
                const age = host.graphics.frameCount - job.motionFrame;
                if (!Number.isInteger(age) || age < 0 || !Number.isInteger(result.startWindow) ||
                    result.startWindow > 60 || result.startWindow - age < 30)
                    return status(job, 'Patrol timing changed. Request directions again');
                job.scene._wqaPreviewUntil = job.motionFrame + result.startWindow;
                return present(job, { kind: 'timedDirections', direction: result.direction, tiles: result.tiles,
                    terminal: result.terminal === true, alternate: result.alternate === true });
            }
            if (result?.status === 'timedWait') status(job, 'No crossing preview ready. Check the patrols and request again');
            else if (result?.status === 'ready') {
                if (result.land && !canLand(root.$gameMap, result.arrival.x, result.arrival.y))
                    return status(job, 'Landing site changed. Request directions again.');
                if (!result.reenter) host.beacon?.start(job.scene, job.target, job.x, job.y, result, job.area ? () =>
                    warningApproach(root.$gameMap, player._x, player._y, job.target) : null, job.vehicle?.type, job.quest);
                follow(job, result, { kind: 'routeDirections', name: job.label,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    reenter: result.reenter === true, board: !!job.vehicle, land: result.land === true,
                    discovery: result.discovery && worldBoundaryName(root, result.discovery) });
            }
            else if (result?.status === 'interrupted') follow(job, result, { kind: 'routeDirections', name: job.label,
                legs: result.legs, boundary: result.boundary, boundaryName: worldBoundaryName(root, result.boundaryEvent),
                more: result.more === true });
            else if (result?.status === 'approachBlocked') status(job, 'A floor event blocks the approach to ' + job.label);
            else if (result?.status === 'unreachable') {
                const prefix = job.mode === 'walk' ? 'No walkable route to ' : job.mode === 'airship' ?
                    'No connected landing for ' : 'No sailing route to ';
                status(job, job.nearestLanding ? 'No landing site is available' : prefix + job.label);
            }
            else if (result?.status === 'unavailable') status(job, 'Directions unavailable for ' + job.label);
        } else if (navigationRequest(active) && ready(active.scene)) afterRender();
    }

    function submit(job, snapshot, request, filtering = false) {
        job.filter = filtering ? snapshot : null;
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
                    if (dropped && active === dropped) {
                        dropped.performed = true;
                        dropped.scene._wqaQuestNavigation = false;
                        status(dropped, dropped.filter ? 'Reachable destinations unavailable' : 'Directions service unavailable');
                        dropped.filter = null;
                    }
                    if (navigationRequest(active) && active !== dropped && ready(active.scene)) afterRender();
                };
                created.on('message', received);
                created.on('error', failed);
                created.on('exit', failed);
                created.unref();
            }
            job.map = snapshot.map;
            job.mode = snapshot.mode;
            job.x = snapshot.x;
            job.y = snapshot.y;
            Atomics.store(admission, 0, job.sequence);
            inFlight = job;
            // A directions request queued behind browse still needs this
            // same settled snapshot when the availability reply returns.
            const transfers = filtering && job.action === 'directions' ? [] : [snapshot.live.terrain.buffer];
            worker.postMessage({ map: snapshot.map, sequence: job.sequence, epoch: job.sequence, live: snapshot.live,
                request: { x: snapshot.x, y: snapshot.y, ...request } }, transfers);
        } catch {
            if (admission) Atomics.store(admission, 0, 0);
            inFlight = null;
            job.filter = null;
            job.performed = true;
            status(job, filtering ? 'Reachable destinations unavailable' : 'Directions service unavailable');
        }
    }

    function route(job, snapshot, target, area, motion) {
        job.label = target.name;
        job.area = area;
        job.target = target.id;
        job.vehicle = target.vehicle && { type: target.vehicle, x: target.x, y: target.y };
        job.nearestLanding = target.nearestLanding === true;
        job.autowalk = !timedCave(snapshot.map) && preferences().autowalk;
        job.motionFrame = motion?.frame;
        if (motion) {
            host.caveTiming?.warm(job.scene);
            job.timing = host.caveTiming?.capture(job.scene, motion, target);
        }
        submit(job, snapshot, { event: target.nearestLanding ? undefined : target.id,
            limit: 8, area, motion, field: true, landing: snapshot.mode === 'airship',
            surface: snapshot.mode !== 'walk', vehicle: target.vehicle, entryDirection: target.entryDirection,
            waypoint: target.quest?.waypoint === true,
            beacon: !motion && host.beacon?.enabled() === true, autowalk: job.autowalk, timingCue: !!job.timing });
    }

    function select(job, snapshot) {
        const result = browse(owner.browser, snapshot, job.changes);
        job.quest = result.target?.quest;
        job.scene._wqaQuestNavigation = !!job.quest;
        if (!result.target) return status(job, result.status);
        const { target, category } = result;
        if (job.action !== 'directions') return present(job, { kind: 'fieldTarget', name: target.name, category,
            dx: target.x - snapshot.x, dy: target.y - snapshot.y });
        if (!timedCave(snapshot.map)) return route(job, snapshot, target);
        const area = warningApproach(root.$gameMap, snapshot.x, snapshot.y, target.id);
        const motion = area ? null : captureMotion(root, host.graphics);
        if (!area && !motion) return status(job, 'Patrol timing is unavailable here');
        const terrain = captureWorld(root);
        if (!terrain) return status(job, 'Map information unavailable');
        route(job, terrain, target, area, motion);
    }

    function perform(job) {
        const movingReport = job.action === 'navigationReport';
        if (active !== job || !ready(job.scene, movingReport)) return;
        if (navigationRequest(job) && inFlight) return;
        if (movingReport) return present(job, job.text, true);
        if (job.action === 'status') return status(job, job.text);
        const routing = job.action === 'directions';
        const timed = timedCave(root.$gameMap._mapId);
        const filtering = !timed && navigationRequest(job) && (!routing || job.changes.length > 0);
        const label = salt.available(job.scene) ? (id, fallback) => salt.label(job.scene, id, fallback) : undefined;
        const snapshot = captureWorld(root, filtering || (routing && !timed), label, job.scene);
        if (!snapshot) return status(job, 'Map information unavailable');
        if (filtering && snapshot.objects.length) {
            job.scene._wqaQuestNavigation = snapshot.objects.some(target => !!target.quest);
            return submit(job, snapshot, { candidates: snapshot.objects.map(target => ({
                event: target.nearestLanding ? undefined : target.id, vehicle: target.vehicle,
                entryDirection: target.entryDirection, waypoint: target.quest?.waypoint === true,
                nearestLanding: target.nearestLanding === true
            })) }, true);
        }
        job.performed = true;
        if (job.action === 'puzzleGuide') {
            const result = guideFor(job.scene)?.review(job.scene, snapshot.objects, snapshot.x, snapshot.y);
            if (!result) return;
            if (result.target) {
                owner.browser.category = result.target.category;
                owner.browser.selections[result.target.category] = result.target.id;
            }
            return status(job, result.text);
        }
        select(job, snapshot);
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

    for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => {
        autowalk.stop();
        if (owner) retire(owner.scene);
    });
    function pendingAutowalk(scene) {
        return active?.scene === scene && active.action === 'directions' && preferences().autowalk &&
            !timedCave(root.$gameMap._mapId);
    }
    function command(action, text) {
        const scene = host.manager._scene;
        if (action === 'beaconStop') {
            if (!ready(scene, true)) return false;
            const walking = autowalk.stop(scene) || pendingAutowalk(scene);
            const beaming = host.beacon?.stop(scene);
            if (!walking && !beaming) return false;
            command('navigationReport', { kind: 'fieldStatus', name: walking ? 'Autowalk stopped.' : 'Beacon stopped.' });
            return true;
        }
        if (action === 'puzzleStop') {
            if (!host.hasFocus()) return false;
            const pending = active?.scene === scene && active.action === 'puzzleGuide';
            const stopped = salt.stop(scene) || cave.stop(scene);
            const timing = host.caveTiming?.stop(scene);
            const waiting = active?.scene === scene && active.action === 'directions' && timedCave(root.$gameMap._mapId);
            if (!pending && !stopped && !timing && !waiting) return false;
            if (pending || waiting) retire(scene);
            if (stopped && timedCave(root.$gameMap._mapId)) host.beacon?.stop(scene);
            if (!active && ready(scene)) command('status', 'Puzzle guidance stopped');
            return true;
        }
        const puzzle = action === 'puzzleGuide' && guideFor(scene);
        const reporting = action === 'navigationReport';
        if ((!BROWSE.has(action) && action !== 'currentDestination' && action !== 'directions' &&
            action !== 'status' && !reporting && !puzzle) || !ready(scene, reporting) || sequence >= 0x7ffffffe) return false;
        if (BROWSE.has(action) || action === 'directions' || puzzle) {
            autowalk.stop(scene);
            host.beacon?.stop(scene);
            host.caveTiming?.cancelPlan(scene);
        }
        const changes = active?.scene === scene && !active.performed ? active.changes.slice() : [];
        if (BROWSE.has(action) && changes.length < 16) changes.push(action);
        if (owner) retire(owner.scene);
        if (owner?.scene !== scene) owner = { scene, browser: createDestinationBrowser() };
        active = { scene, action, sequence: ++sequence, changes, text };
        // Patrol steps between the key press and the rendered frame are
        // expected. Their new sprite positions belong to the requested sample.
        scene._wqaCaveReview = timedCave(root.$gameMap._mapId);
        scene._wqaRouteActive = !scene._wqaCaveReview && !autowalk.active(scene);
        scene._wqaPresentation = true;
        afterRender();
        return true;
    }
    return {
        ready,
        autowalk,
        questRefresh(scene) {
            if (active?.scene !== scene || !scene._wqaQuestNavigation) return;
            autowalk.stop(scene);
            host.beacon?.stop(scene);
            retire(scene);
        },
        controlOwner(scene) {
            const settled = ready(scene);
            if (!settled && (!autowalk.active(scene) || !ready(scene, true))) return null;
            if (control?.scene !== scene) control = { kind: 'field', scene };
            control.navigationOnly = !settled;
            control.puzzle = !!guideFor(scene);
            control.puzzleActive = salt.active(scene) || cave.active(scene) || !!host.caveTiming?.active(scene) ||
                (active?.scene === scene && active.action === 'directions' && timedCave(root.$gameMap._mapId));
            control.autowalkActive = autowalk.active(scene) || pendingAutowalk(scene);
            control.beaconActive = control.autowalkActive || host.beacon?.active(scene);
            return control;
        },
        dialoguePresented(scene, paint) { guideFor(scene)?.presented(scene, paint); },
        puzzleActive(scene) { return salt.active(scene) || cave.active(scene); },
        caveEventAccepted: cave.accepted,
        observeCaveReady(scene) {
            if (!ready(scene)) return;
            cave.recover(scene);
            const outcome = cave.settleProgress(scene);
            if (outcome && !active) command('status', outcome);
        },
        command,
        report(text) {
            const scene = host.manager._scene;
            return autowalk.active(scene) ? command('navigationReport', { kind: 'fieldStatus', name: text }) :
                command('status', text);
        },
        changed(scene) {
            autowalk.dirty(scene);
            retire(scene);
        },
        controlLost(scene) {
            autowalk.stop(scene);
            retire(scene);
            if (control?.scene === scene) control = null;
        },
        leave(scene) {
            autowalk.stop(scene);
            if (scene) scene._wqaFieldReady = false;
            retire(scene);
            if (owner?.scene === scene) owner = null;
            if (control?.scene === scene) control = null;
        }
    };
}

module.exports = { createField };
