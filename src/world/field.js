'use strict';

const { captureWorld, eventTarget, bookmarkId, includeSavedBookmarks } = require('./snapshot');
const { fieldVitals, fieldVitalsVisible } = require('../battle/party-vitals');
const { MODES } = require('./bookmark-records');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { worldBoundaryName } = require('./world-destinations');
const { localHandoffName } = require('./local-destinations');
const { createAutowalk } = require('./autowalk');
const { createTransferBookmarks } = require('./transfer-bookmarks');
const { tileKey } = require('./geometry.cjs');
const { browse, createDestinationBrowser, activeMovingEnemy } = require('./destinations');
const { collectQuestDestinations, questDestinationCurrent } = require('./quest-destinations');
const { createSaltGuide } = require('./puzzles/salt-caverns');
const { mapPlace } = require('./map-banner');
const { mapDescription } = require('./map-descriptions');
const { createCaveGuide, timedCave, warningApproach, captureMotion, TIMING_CUE } = require('./puzzles/cave');
const BROWSE = new Set(['previousDestination', 'nextDestination', 'previousCategory', 'nextCategory']);
const ACTOR_RETRIES = 2;

function currentEnemy(root, result) {
    const map = root.$gameMap;
    const enemy = map?._events?.[result.enemy];
    const { x, y } = result.arrival || {};
    return Number.isInteger(x) && Number.isInteger(y) && HEADINGS[result.boundary] &&
        activeMovingEnemy(root, enemy) && enemy._x === map.roundXWithDirection(x, result.boundary) &&
        enemy._y === map.roundYWithDirection(y, result.boundary);
}
const HEADINGS = Object.freeze({ 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] });

function spokenRouteBounds(x, y, legs) {
    if (!Array.isArray(legs) || legs.length > 8) return null;
    let left = x, top = y, right = x, bottom = y;
    for (const { direction, tiles } of legs) {
        const offset = HEADINGS[direction];
        if (!offset || !Number.isInteger(tiles) || tiles < 1 || tiles > 16384) return null;
        x += offset[0] * tiles;
        y += offset[1] * tiles;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
    }
    // Include a neighboring floor trigger and a two-tile counter approach.
    return { left: left - 2, top: top - 2, right: right + 2, bottom: bottom + 2 };
}

function outsideSpokenRoute(job, actor) {
    const bounds = job.spokenBounds;
    if (!bounds || !Number.isInteger(actor._eventId) || actor._eventId === job.target ||
        !Number.isFinite(actor._x) || !Number.isFinite(actor._y) ||
        !Number.isFinite(actor._realX) || !Number.isFinite(actor._realY)) return false;
    const box = actor.blockerProperties;
    const left = Math.min(actor._x, actor._realX) + (box ? Math.min(0, box.x1) : 0);
    const right = Math.max(actor._x, actor._realX) + (box ? Math.max(0, box.x2) : 0);
    const top = Math.min(actor._y, actor._realY) + (box ? Math.min(0, box.y1) : 0);
    const bottom = Math.max(actor._y, actor._realY) + (box ? Math.max(0, box.y2) : 0);
    return right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom;
}

function remoteBookmarkAvailable(map, mode, bookmark) {
    return bookmark.mode === 'walk' && bookmark.map !== map &&
        ((mode === 'walk' && !timedCave(map)) || (map === 113 && (mode === 'ship' || mode === 'airship')));
}

function localLandingAvailable(map, mode, bookmark) {
    return map === 113 && bookmark.map === map && bookmark.mode === 'walk' && (mode === 'ship' || mode === 'airship');
}

function createField(root, host, notifications) {
    const salt = createSaltGuide(root);
    const cave = createCaveGuide(root, host.graphics);
    const transfers = createTransferBookmarks(root, host);
    const selectionSites = new WeakMap();
    let browser = createDestinationBrowser();
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
        else retire(scene);
    });

    function guideFor(scene) {
        if (salt.available(scene)) return salt;
        return cave.available(scene) ? cave : null;
    }

    function ready(scene, moving = false, waking = false) {
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        const nativeField = scene?._wqaFieldReady || waking && scene?._wqaMapRestored && scene._mapLoaded &&
            scene._started && scene._prevCanMove && scene.srcWendy && scene.srcStones;
        return !!(nativeField && !scene._wqaSettingsActive &&
            scene === host.manager._scene && host.graphics.app?.stage === scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !host.screenFading() && host.hasFocus() && !scene._wqaTerrainWork &&
            !scene._wqaPreloads?.size && !scene._wqaPreloadOverflow &&
            scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 && root.$gameScreen?._brightness === 255 &&
            (waking || map?.inactiveTime < 30) && (!map?._needsRefresh || scene._wqaLightningRefreshOnly) &&
            map && !map._needsTilemapRefresh && !player?._transferring &&
            !player?._vehicleGettingOn && !player?._vehicleGettingOff &&
            !root.$gameMessage?.isBusy() && !map?._interpreter?._list && travelMode(map, player) &&
            !player._moveRouteForcing && (moving || player._x === player._realX && player._y === player._realY) &&
            !(player._jumpCount > 0));
    }

    function browserOwner(scene) {
        const map = root.$gameMap;
        const mode = travelMode(map, root.$gamePlayer);
        const site = selectionSites.get(map);
        if (!site || site.id !== map._mapId || site.mode !== mode || site.browser !== browser) {
            const category = browser.category;
            browser = createDestinationBrowser();
            browser.category = category;
            // Event IDs are local to the current map and mode. The weak
            // identity lets a replaced game map be collected at scene exit.
            selectionSites.set(map, { id: map._mapId, mode, browser });
        }
        if (owner?.scene !== scene || owner.browser !== browser) owner = { scene, browser };
        return owner;
    }

    function retire(scene) {
        if (!owner || owner.scene !== scene) return;
        if (admission) Atomics.store(admission, 0, 0);
        active = null;
        scene._wqaRouteActive = false;
        scene._wqaInteractionDeferred = false;
        scene._wqaStepNavigation = false;
        scene._wqaNavigationWake = false;
        scene._wqaCaveReview = false;
        scene._wqaQuestNavigation = false;
        scene._wqaPreviewUntil = 0;
        if (speech) notifications.close(speech);
        speech = 0;
    }

    function present(job, record, moving = false) {
        if (active !== job) return;
        job.scene._wqaInteractionDeferred = false;
        if (!ready(job.scene, moving)) return;
        // Arrival and stop reports have their own command owner. Only
        // the requested route omits its heading in speech.
        if (job.action === 'directions' && record.kind === 'routeDirections')
            record = { ...record, directionsOnly: true };
        speech = notifications.open(record, () => active === job && ready(job.scene, moving) &&
            (!job.quest || questDestinationCurrent(root, job.scene, job.quest)) &&
            (!job.enemyCurrent || job.enemyCurrent()) &&
            (!job.entrance || transfers.current(job.entrance)) &&
            (!job.groundEntrance || transfers.current(job.groundEntrance, 'walk')) &&
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
            } else if (record.enemyBlocked) {
                present(job, { kind: 'fieldStatus', name: 'Route blocked by an enemy.' }, true);
            }
            return;
        }
        // A distant event can move before the speech helper reads this
        // route. Keep spoken directions admitted when the move could not
        // reach the spoken portion or its final interaction.
        if (job.mode === 'walk' && root.$dataMap?.scrollType === 0 && !job.area && !job.remote && !job.vehicle &&
            !job.autowalk && !host.beacon?.enabled() && !timedCave(job.map) && !result.reenter)
            job.spokenBounds = spokenRouteBounds(job.x, job.y, record.legs);
        present(job, record);
    }

    function cancelBeaconRefresh(state) {
        state.waiting = false;
        if (inFlight?.beaconState !== state || !admission) return;
        Atomics.store(admission, 0, 0);
    }

    function refreshBeacon(state) {
        if (inFlight || active && !active.performed || sequence >= 0x7ffffffe || !ready(state.scene)) return false;
        const snapshot = captureWorld(root, true, undefined, undefined, [], true);
        if (!snapshot) {
            host.beacon.refreshResult(state, state.revision, state.player._x, state.player._y, null);
            return true;
        }
        const job = { scene: state.scene, sequence: ++sequence, beaconState: state, revision: state.revision };
        state.waiting = true;
        submit(job, snapshot, state.request);
        return true;
    }

    function received(packet) {
        const job = inFlight;
        if (!job || packet?.sequence !== job.sequence || packet.epoch !== job.sequence || packet.map !== job.map) return;
        inFlight = null;
        if (admission && Atomics.load(admission, 0) === job.sequence) Atomics.store(admission, 0, 0);
        if (job.beaconState) {
            host.beacon.refreshResult(job.beaconState, job.revision, job.x, job.y, packet.result);
            if (navigationRequest(active) && !active.performed && ready(active.scene)) afterRender();
            return;
        }
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
                snapshot.objects = snapshot.objects.filter((target, index) => {
                    const available = result.available[index];
                    if (available === 2) target.handoff = true;
                    if (!available && target.showBlocked) target.outOfReach = true;
                    return (available === 1 || available === 2 || target.outOfReach) &&
                        (!target.quest || questDestinationCurrent(root, job.scene, target.quest));
                });
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
            if (job.remote && result?.status === 'ready' && !admitRemoteRoute(job, result))
                return status(job, 'The entrance changed. Request directions again.');
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
                if (job.landingBookmark) {
                    const { bookmark, edge } = job.landingBookmark;
                    const selection = { id: bookmark.id, revision: bookmark.revision, trail: [] };
                    if (edge) {
                        if (result.entrance !== edge.event || !transfers.current(edge))
                            return status(job, 'The boat landing changed. Request directions again.');
                        job.entrance = edge;
                        transfers.arm(job.scene, selection, edge);
                    } else if (result.land) transfers.armAirship(job.scene, selection, result.arrival);
                }
                if (result.land && job.remote) transfers.armAirship(job.scene, job.remote.selection, result.arrival);
                if (!result.reenter && host.beacon?.enabled()) {
                    // Transfer and landing handoffs own a previously verified
                    // exact approach. Keep that approach fixed during refresh.
                    const fixed = !!(job.remote || job.landingBookmark || result.land);
                    const { x, y, facing } = result.arrival;
                    const request = fixed ? { targetX: x, targetY: y, field: true, beacon: true } :
                        { ...job.request, motion: undefined, autowalk: false };
                    const destinationReady = (job.entrance || job.groundEntrance || result.land) ? () =>
                        (!job.entrance || transfers.current(job.entrance)) &&
                        (!job.groundEntrance || transfers.current(job.groundEntrance, 'walk')) &&
                        (!result.land || canLand(root.$gameMap, x, y)) : null;
                    host.beacon.start(job.scene, job.target, job.x, job.y, result, job.area ? () =>
                        warningApproach(root.$gameMap, player._x, player._y, job.target) : null, job.vehicle?.type,
                        { quest: job.quest, point: job.point, request: { ...request, limit: 8, refreshFacing: fixed ? facing : undefined },
                            destinationReady, enemyCurrent: obstacle => currentEnemy(root, obstacle) });
                }
                follow(job, result, { kind: 'routeDirections', name: job.label,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    reenter: result.reenter === true, enter: job.entrance?.action,
                    sailing: job.mode === 'ship' || job.mode === 'boat',
                    bump: job.eventAction === 'bump',
                    conversation: job.eventAction === 'talk',
                    board: !!job.vehicle, land: result.land === true,
                    discovery: result.discovery && worldBoundaryName(root, result.discovery) });
            }
            else if (result?.status === 'enemyBlocked') {
                if (!currentEnemy(root, result)) {
                    if (job.retries < ACTOR_RETRIES) {
                        job.retries++;
                        job.performed = false;
                        return afterRender();
                    }
                    return status(job, 'The enemy moved. Request directions again.');
                }
                if (host.beacon?.enabled()) host.beacon.start(job.scene, job.target, job.x, job.y, result,
                    null, undefined, { quest: job.quest, point: job.point, request: { ...job.request, autowalk: false, beacon: true },
                        enemyCurrent: obstacle => currentEnemy(root, obstacle), alreadyReported: true });
                job.enemyCurrent = () => currentEnemy(root, result);
                const record = { kind: 'routeDirections', name: job.label, legs: result.legs,
                    enemyBlocked: true, boundary: result.boundary, more: result.more === true };
                follow(job, result, record);
            }
            else if (result?.status === 'interrupted') {
                const handoff = !job.eventAction && localHandoffName(job.map, result.boundaryEvent);
                const activate = job.eventAction === 'step' && job.target === result.boundaryEvent ? result.boundary : undefined;
                follow(job, result, { kind: 'routeDirections', name: job.label, legs: result.legs, boundary: result.boundary,
                    activate, boundaryName: handoff || (!job.eventAction && worldBoundaryName(root, result.boundaryEvent)),
                    manualHandoff: !!handoff, more: result.more === true });
            }
            else if (result?.status === 'approachBlocked') status(job, 'A floor event blocks the approach');
            else if (job.remote && ['unreachable', 'unavailable'].includes(result?.status))
                status(job, 'No verified reachable entrance');
            else if (result?.status === 'unreachable') {
                const reason = job.mode === 'walk' ? 'No walkable route' : job.mode === 'airship' ?
                    'No connected landing' : 'No sailing route';
                status(job, job.nearestLanding ? 'No landing site is available' : reason);
            }
            else if (result?.status === 'unavailable') status(job, 'Directions unavailable');
            else retire(job.scene);
        } else if (navigationRequest(active) && ready(active.scene)) afterRender();
    }

    function submit(job, snapshot, request, filtering = false) {
        job.filter = filtering ? snapshot : null;
        job.request = request;
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
                    if (dropped?.beaconState)
                        host.beacon.refreshResult(dropped.beaconState, dropped.revision, dropped.x, dropped.y, null);
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
            if (job.beaconState) host.beacon.refreshResult(job.beaconState, job.revision, job.x, job.y, null);
            else status(job, filtering ? 'Reachable destinations unavailable' : 'Directions service unavailable');
        }
    }

    function destinationRequest(target) {
        if (target.point) return { targetX: target.x, targetY: target.y };
        return { event: target.nearestLanding ? undefined : (target.event ?? target.id),
            vehicle: target.vehicle, entryDirection: target.entryDirection,
            bumpDirections: target.eventAction === 'bump' ? target.bumpDirections ?? 15 : undefined,
            waypoint: target.waypoint === true || target.quest?.waypoint === true,
            nearestLanding: target.nearestLanding === true,
            ...(target.handoffs ? { handoffs: target.handoffs } : {}) };
    }

    function route(job, snapshot, target, area, motion) {
        job.label = target.name;
        job.area = area;
        const destination = destinationRequest(target);
        job.target = destination.event;
        job.eventAction = target.eventAction;
        job.point = target.point === true;
        job.vehicle = target.vehicle && { type: target.vehicle, x: target.x, y: target.y };
        job.nearestLanding = target.nearestLanding === true;
        job.autowalk = !timedCave(snapshot.map) && preferences().autowalk;
        job.motionFrame = motion?.frame;
        if (motion) {
            host.caveTiming?.warm(job.scene);
            job.timing = host.caveTiming?.capture(job.scene, motion, target);
        }
        submit(job, snapshot, { ...destination, stopBeforeEvent: job.eventAction === 'step',
            limit: 8, area, motion, field: true, landing: snapshot.mode === 'airship' && !job.point,
            surface: snapshot.mode !== 'walk',
            beacon: !motion && host.beacon?.enabled() === true, autowalk: job.autowalk, timingCue: !!job.timing });
    }

    function select(job, snapshot) {
        snapshot.objects = includeSavedBookmarks(snapshot, snapshot.bookmarks, quest => questDestinationCurrent(root, job.scene, quest));
        const result = browse(owner.browser, snapshot, job.changes);
        job.quest = result.target?.quest;
        job.scene._wqaQuestNavigation = !!job.quest;
        if (!result.target) return status(job, result.status);
        const { target, category } = result;
        owner.target = target;
        if (target.saved) return selectSavedBookmark(job, snapshot, target.saved, category);
        owner.remoteBookmark = null;
        if (job.action !== 'directions') return present(job, { kind: 'fieldTarget', name: target.name, category,
            dx: target.x - snapshot.x, dy: target.y - snapshot.y, outOfReach: target.outOfReach, handoff: target.handoff });
        if (!timedCave(snapshot.map)) return route(job, snapshot, target);
        const area = warningApproach(root.$gameMap, snapshot.x, snapshot.y, target.event ?? target.id);
        const motion = area ? null : captureMotion(root, host.graphics);
        if (!area && !motion) return status(job, 'Patrol timing is unavailable here');
        const terrain = captureWorld(root);
        if (!terrain) return status(job, 'Map information unavailable');
        route(job, terrain, target, area, motion);
    }

    function savedBookmark(selection) {
        return host.bookmarks?.().find(entry => entry.id === selection.id && entry.revision === selection.revision);
    }

    function selectSavedBookmark(job, snapshot, bookmark, category) {
        const sameMap = bookmark.map === snapshot.map;
        const sameMode = bookmark.mode === snapshot.mode;
        const where = (sameMap ? 'Saved here ' : 'Saved on another map, ') + MODES[bookmark.mode] + '.';
        const display = (category ? category + ', ' : '') + bookmark.name + '. ' + where;
        if (remoteBookmarkAvailable(snapshot.map, snapshot.mode, bookmark)) {
            if (owner.remoteBookmark?.id !== bookmark.id || owner.remoteBookmark.revision !== bookmark.revision)
                owner.remoteBookmark = { id: bookmark.id, revision: bookmark.revision, trail: [] };
            return job.action === 'directions' ? remoteDirections(job, snapshot, bookmark) : status(job, display);
        }
        owner.remoteBookmark = null;
        if (localLandingAvailable(snapshot.map, snapshot.mode, bookmark))
            return job.action === 'directions' ? localLandingDirections(job, snapshot, bookmark) : status(job, display);
        const reason = !sameMode ? 'Use the saved travel mode for directions.' :
            sameMap ? 'Destination currently unavailable.' : 'Entrance directions are unavailable here.';
        return status(job, job.action === 'directions' ? reason : display + ' ' + reason);
    }

    function localLandingDirections(job, snapshot, bookmark) {
        transfers.clear();
        let destination;
        if (bookmark.kind === 'point') destination = { targetX: bookmark.x, targetY: bookmark.y };
        else {
            const id = bookmark.event;
            const event = root.$gameMap._events[id];
            const entry = root.$dataMap?.events?.[id];
            const page = entry?.pages?.[event?._pageIndex];
            if (!event || event._erased || !(page?.list?.length >= 2)) return status(job, 'Saved destination is unavailable');
            if (bookmark.category === 'quests') {
                job.quest = collectQuestDestinations(root, job.scene, 'walk')?.get(id);
                if (!job.quest) return status(job, 'Saved destination is unavailable');
                job.scene._wqaQuestNavigation = true;
            } else {
                const target = eventTarget(root, 'walk', event, entry, page);
                if (target?.category !== bookmark.category) return status(job, 'Saved destination is unavailable');
                destination = destinationRequest({ ...target, id });
            }
            destination ??= { event: id, waypoint: job.quest?.waypoint === true };
        }
        const edge = snapshot.mode === 'ship' ? transfers.islandLanding() : null;
        if (snapshot.mode === 'ship' && !edge) return status(job, 'No verified boat landing');
        job.label = edge ? edge.name + ' toward ' + bookmark.name : 'Landing for ' + bookmark.name;
        job.target = edge?.event ?? destination.event;
        job.nearestLanding = !edge && !destination.event;
        job.landingBookmark = { bookmark, edge };
        job.autowalk = preferences().autowalk;
        const shipLanding = edge && { event: edge.event, x: edge.x, y: edge.y, facing: edge.facing };
        submit(job, snapshot, { ...destination, field: true, landing: snapshot.mode === 'airship', shipLanding, limit: 8,
            beacon: host.beacon?.enabled() === true, autowalk: job.autowalk });
    }

    function admitRemoteRoute(job, result) {
        const { bookmark, entrances, ground, island, state, selection } = job.remote;
        const target = result.discoveryFor ?? result.entrance;
        const entrance = island?.event === target ? island :
            entrances.find(edge => edge.event === target && edge.approach === result.approach);
        if (!entrance || !transfers.matchesState(state)) return false;
        job.target = entrance.event;
        if (result.land) {
            if (!transfers.current(entrance, 'walk') ||
                (result.discovery && !transfers.discovery(result.discovery, entrance.event))) return false;
            job.groundEntrance = entrance;
            job.label = 'Landing toward ' + bookmark.name;
            return true;
        }
        if (!transfers.current(entrance)) return false;
        if (result.discoveryFor) {
            const discovery = transfers.discovery(result.entrance, entrance.event);
            const name = discovery && worldBoundaryName(root, discovery.event);
            if (!name) return false;
            job.target = discovery.event;
            job.entrance = discovery;
            job.groundEntrance = entrance;
            job.label = name + ' toward ' + bookmark.name;
            transfers.arm(job.scene, selection, discovery);
            return true;
        }
        if (entrance === island) {
            const walking = ground.find(edge => edge.event === result.groundEntrance && edge.approach === result.groundApproach);
            if (!walking || !transfers.current(walking, 'walk')) return false;
            job.groundEntrance = walking;
        }
        job.entrance = entrance;
        if (entrance.name) job.label = entrance.name + ' toward ' + bookmark.name;
        else if (entrance.map !== bookmark.map) job.label = 'Next entrance toward ' + bookmark.name;
        transfers.arm(job.scene, selection, entrance);
        return true;
    }

    function remoteDirections(job, snapshot, bookmark) {
        transfers.clear();
        const selection = owner.remoteBookmark;
        const { entrances, ground, state } = transfers.candidates();
        const landing = snapshot.mode === 'airship';
        const current = landing ? ground : entrances;
        const island = snapshot.mode === 'ship' && ground.length ? transfers.islandLanding() : null;
        if (!current.length && !island) return status(job, 'No verified reachable entrance');
        job.label = 'Entrance for ' + bookmark.name;
        const trail = [...new Set([...selection.trail, tileKey(snapshot.map, snapshot.x, snapshot.y)])];
        job.remote = { bookmark, entrances: current, ground, island, state, selection: { ...selection, trail } };
        job.autowalk = preferences().autowalk;
        const point = bookmark.kind === 'point' ? { x: bookmark.x, y: bookmark.y } : undefined;
        const copy = ({ event, map, x, y, approach }) => ({ event, map, x, y, approach });
        const shipLanding = island && { event: island.event, x: island.x, y: island.y, facing: island.facing };
        submit(job, snapshot, { limit: 8, field: true, landing, shipLanding, autowalk: job.autowalk,
            beacon: host.beacon?.enabled() === true, transfer: { map: bookmark.map, point, state, trail,
                candidates: current.map(copy), ground: island ? ground.map(copy) : undefined,
                discoveries: transfers.discoveries(island ? ground : current) } });
    }

    function perform(job) {
        const movingReport = job.action === 'navigationReport';
        if (active !== job || job.step || job.idle || !ready(job.scene, movingReport)) return;
        if (navigationRequest(job) && inFlight) return;
        if (movingReport) return present(job, job.text, true);
        if (job.action === 'status') return status(job, job.text);
        if (job.action === 'mapName') return status(job, mapPlace(root) || 'Map name unavailable');
        if (job.action === 'mapDescription') return present(job, { kind: 'mapDescription',
            description: mapDescription(root) || 'No description is available for this map.' });
        if (job.action === 'fieldVitals') {
            // The map scene owns its attached RadialStatus. Read the glyphs
            // after this frame only while the same HUD is still presented.
            const record = fieldVitals(job.scene, host.graphics);
            if (record) present(job, record);
            else retire(job.scene);
            return;
        }
        const routing = job.action === 'directions';
        const timed = timedCave(root.$gameMap._mapId);
        const filtering = !timed && navigationRequest(job) && (!routing || job.changes.length > 0);
        const label = salt.available(job.scene) ? (id, fallback) => salt.label(job.scene, id, fallback) : undefined;
        const bookmarks = host.bookmarks?.();
        const snapshot = captureWorld(root, filtering || (routing && !timed), label, job.scene, bookmarks);
        if (!snapshot) return status(job, 'Map information unavailable');
        if (navigationRequest(job)) snapshot.bookmarks = bookmarks;
        if (filtering && snapshot.objects.length) {
            job.scene._wqaQuestNavigation = snapshot.objects.some(target => !!target.quest);
            return submit(job, snapshot, { candidates: snapshot.objects.map(destinationRequest) }, true);
        }
        job.performed = true;
        if (job.action === 'puzzleGuide') {
            const result = guideFor(job.scene)?.review(job.scene, snapshot.objects, snapshot.x, snapshot.y);
            if (!result) return retire(job.scene);
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
        transfers.clear();
        autowalk.stop();
        if (owner) retire(owner.scene);
    });
    function queue(job) {
        const { scene } = job;
        active = { ...job, sequence: ++sequence };
        // The pending command owns the next speech turn. Once its result
        // is published, keep the route lease and let a visible prompt append.
        scene._wqaInteractionDeferred = true;
        scene._wqaStepNavigation = !!(job.step || job.idle);
        scene._wqaCaveReview = timedCave(root.$gameMap._mapId);
        scene._wqaRouteActive = !scene._wqaCaveReview && !autowalk.active(scene);
        scene._wqaPresentation = true;
        if (!scene._wqaStepNavigation) afterRender();
    }

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
            transfers.clear();
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
        const reporting = action === 'navigationReport';
        const navigation = navigationRequest({ action });
        const canWaitForStep = action === 'mapName' || action === 'mapDescription' || navigation && !timedCave(root.$gameMap?._mapId);
        const idle = canWaitForStep && root.$gameMap?.inactiveTime >= 30;
        if (!ready(scene, reporting || canWaitForStep, idle) || sequence >= 0x7ffffffe) return false;
        const player = root.$gamePlayer;
        const step = canWaitForStep && (player._x !== player._realX || player._y !== player._realY) ?
            { x: player._x, y: player._y } : null;
        const puzzle = action === 'puzzleGuide' && guideFor(scene);
        const vitals = action === 'fieldVitals' && fieldVitalsVisible(scene);
        if (!BROWSE.has(action) && action !== 'currentDestination' && action !== 'directions' &&
            action !== 'status' && action !== 'mapName' && action !== 'mapDescription' && !reporting && !puzzle && !vitals) return false;
        if (BROWSE.has(action) || action === 'directions' || puzzle) {
            autowalk.stop(scene);
            host.beacon?.stop(scene);
            host.caveTiming?.cancelPlan(scene);
        }
        const changes = active?.scene === scene && !active.performed ? active.changes.slice() : [];
        if (BROWSE.has(action) && changes.length < 16) changes.push(action);
        if (owner) retire(owner.scene);
        browserOwner(scene);
        if (BROWSE.has(action) || puzzle) {
            owner.remoteBookmark = null;
            transfers.clear();
        }
        queue({ scene, action, changes, text, step, idle, retries: 0 });
        // An accepted pathfinder key is activity in the native idle detector.
        // It never supplies a game action or changes the timer directly.
        if (canWaitForStep) scene._wqaNavigationWake = true;
        return true;
    }

    function activateBookmark(scene, entry, remote = false, trail = []) {
        browserOwner(scene);
        owner.remoteBookmark = remote ? { id: entry.id, revision: entry.revision, trail } : null;
        owner.browser.category = 'bookmarks';
        owner.browser.selections.bookmarks = bookmarkId(entry.id);
        owner.target = null;
    }

    return {
        ready,
        autowalk,
        refreshBeacon, cancelBeaconRefresh,
        bookmarkContext(scene) {
            if (!ready(scene)) return null;
            const map = root.$gameMap;
            const data = root.$dataMap;
            const { _x: x, _y: y } = root.$gamePlayer;
            if (!data || !Number.isInteger(x) || x < 0 || x >= data.width ||
                !Number.isInteger(y) || y < 0 || y >= data.height) return null;
            const mode = travelMode(map, root.$gamePlayer);
            const point = { kind: 'point', map: map._mapId, mode, x, y };
            const context = { point, canSelect: entry => (point.map === entry.map && point.mode === entry.mode) ||
                remoteBookmarkAvailable(point.map, point.mode, entry) || localLandingAvailable(point.map, point.mode, entry) };
            const target = owner?.scene === scene ? owner.target : null;
            if (!Number.isInteger(target?.id) || owner.browser.category !== target.category ||
                owner.browser.selections[target.category] !== target.id) return context;
            const event = map._events?.[target.id];
            const entry = data.events?.[target.id];
            const page = entry?.pages?.[event?._pageIndex];
            if (!event || event._erased || !(page?.list?.length >= 2)) return context;
            const current = target.quest ? questDestinationCurrent(root, scene, target.quest) :
                eventTarget(root, mode, event, entry, page)?.category === target.category;
            if (current) context.entity = { kind: 'entity', map: point.map, mode, event: target.id, category: target.category };
            return context;
        },
        selectBookmark(scene, entry) {
            const map = root.$gameMap;
            const remote = map?._mapId !== entry.map;
            const mode = travelMode(map, root.$gamePlayer);
            if (scene !== host.manager._scene || !scene._wqaSettingsActive ||
                !(remote ? remoteBookmarkAvailable(map?._mapId, mode, entry) :
                    mode === entry.mode || localLandingAvailable(map?._mapId, mode, entry))) return false;
            transfers.clear();
            activateBookmark(scene, entry, remote);
            return true;
        },
        questRefresh(scene) {
            if (host.beacon?.questActive(scene)) host.beacon.stop(scene);
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
            control.vitals = settled && fieldVitalsVisible(scene);
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
        bookmarkEntranceAccepted: transfers.accepted,
        bookmarkLandingAccepted: transfers.landingAccepted,
        bookmarkTransferReserved: transfers.reserved,
        observeReady(scene) {
            if (!ready(scene)) return;
            const arrived = transfers.settle(scene);
            const bookmark = arrived && savedBookmark(arrived);
            if (bookmark && travelMode(root.$gameMap, root.$gamePlayer) === bookmark.mode)
                activateBookmark(scene, bookmark, root.$gameMap._mapId !== bookmark.map, arrived.trail);
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
        idleInput(scene) {
            scene._wqaNavigationWake = false;
            return active?.scene === scene && ready(scene, true, active.idle);
        },
        interactionReady(scene) {
            return ready(scene) && !scene._wqaInteractionDeferred;
        },
        appendInteraction(scene, record) {
            const token = speech;
            if (!token || active?.scene !== scene || !notifications.focus(token, { ...record, append: true })) return null;
            // The renderer uses one admission token per speech context.
            // Revoke that token if this appended prompt becomes stale.
            return () => {
                if (speech !== token) return;
                notifications.close(token);
                speech = 0;
            };
        },
        stepReady(scene) {
            const job = active;
            if (job?.scene !== scene || !(job.step || job.idle)) return;
            const player = root.$gamePlayer;
            if (!ready(scene) || (job.step && (player._x !== job.step.x || player._y !== job.step.y))) return retire(scene);
            scene._wqaStepNavigation = false;
            job.step = null;
            job.idle = false;
            afterRender();
        },
        changed(scene, steppedActor) {
            if (!steppedActor || steppedActor === root.$gamePlayer) autowalk.dirty(scene);
            const job = active;
            if (!steppedActor || steppedActor === root.$gamePlayer || job?.scene !== scene ||
                scene._wqaCaveReview || sequence >= 0x7ffffffe) return retire(scene);
            if (job.ambientStatus) return;
            if (!navigationRequest(job)) return retire(scene);
            if (inFlight !== job) {
                // A fresh capture already sees the next pose. Once browse
                // speech starts, ordinary ambient steps need no new result.
                if (!job.performed || job.action !== 'directions' || outsideSpokenRoute(job, steppedActor) ||
                    (job.enemyCurrent && job.enemyCurrent())) return;
                return retire(scene);
            }
            if (!ready(scene)) return retire(scene);
            // Revoke the old packet first. The next render takes one fresh
            // snapshot after the single in-flight worker has returned.
            retire(scene);
            if (job.retries >= ACTOR_RETRIES) {
                queue({ scene, action: 'status', changes: [], text: 'The map is changing. Try the pathfinder again.',
                    ambientStatus: true });
            } else {
                queue({ scene, action: job.action, changes: job.performed ? [] : job.changes, retries: job.retries + 1 });
            }
        },
        controlLost(scene) {
            autowalk.stop(scene);
            retire(scene);
            if (control?.scene === scene) control = null;
        },
        leave(scene) {
            transfers.leave(scene);
            autowalk.stop(scene);
            if (scene) scene._wqaFieldReady = false;
            retire(scene);
            if (owner?.scene === scene) owner = null;
            if (control?.scene === scene) control = null;
        }
    };
}

module.exports = { createField };
