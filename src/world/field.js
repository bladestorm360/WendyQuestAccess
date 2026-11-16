'use strict';

const { captureWorld, eventTarget, bookmarkId, includeSavedBookmarks } = require('./snapshot');
const { fieldVitals, fieldVitalsVisible } = require('../battle/party-vitals');
const { MODES } = require('./bookmark-records');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { worldBoundaryName, worldEntranceRevealed, FLOAT_FORT_ENTRANCE } = require('./world-destinations');
const { localHandoffName, iceOpensPassage, chillcrestQuestExit, concealedDestination,
    visibleChestBarrier, BREAKFAST_HANDOFFS, npcPassage } = require('./local-destinations');
const { transferOptions } = require('./transfer-events.cjs');
const { createAutowalk } = require('./autowalk');
const { createTransferBookmarks } = require('./transfer-bookmarks');
const { tileKey } = require('./geometry.cjs');
const { browse, createDestinationBrowser, activeMovingEnemy } = require('./destinations');
const { collectQuestDestinations, questDestinationCurrent } = require('./quest-destinations');
const { createSaltGuide } = require('./puzzles/salt-caverns');
const { CONTROLS } = require('./terrain-control-labels.cjs');
const { createTerrainJourney, BRIDGE_REASON, CRYSTAL_REASON, PULL_REASON, STONE_ISLAND } = require('./terrain-journey');
const { saltControlName } = require('./puzzles/salt-state.cjs');
const { mapPlace } = require('./map-banner');
const { mapDescription } = require('./map-descriptions');
const { createCaveGuide, timedCave, warningApproach, captureMotion, distractionForGuard, chaseHandoff } = require('./puzzles/cave');
const { capturePatrolLine } = require('./puzzles/patrol-line-playback');
const BROWSE = new Set(['previousDestination', 'nextDestination', 'previousCategory', 'nextCategory']);
const ACTOR_RETRIES = 2;
const PATROL_HEADINGS = { 2: 'south', 4: 'west', 6: 'east', 8: 'north' };

function routeBoundary(root, eventId, spoilers, edge, mode = 'walk') {
    const map = root.$gameMap;
    const event = map._events?.[eventId];
    const entry = root.$dataMap?.events?.[eventId];
    const page = entry?.pages?.[event?._pageIndex];
    if (!page || event._erased || !spoilers && concealedDestination(map._mapId, event)) return {};
    if (map._mapId === 113 && !worldEntranceRevealed(root, eventId, spoilers))
        return { boundaryName: 'Unmarked passage' };
    const target = eventTarget(root, mode, event, entry, page, spoilers);
    const name = target?.category === 'exits' ? target.name.replace(/^(?:return to|to) /i, '') : '';
    if (name && name !== 'Exit' && name !== 'Map') return { exit: name };
    const options = edge ? [edge] : transferOptions(map._mapId, entry, page, root.$dataCommonEvents);
    const destination = options[0]?.map;
    if (destination && options.every(option => option.map === destination)) {
        const exit = destination === 113 ? 'the world map' : root.$dataMapInfos?.[destination]?.name;
        if (exit && !/^Map\d+$/i.test(exit)) return { exit };
    }
    if (target?.category === 'events' || target?.category === 'checkpoints') return { boundaryName: target.name };
    return {};
}

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

function createField(root, host, notifications, routeDiagnostics = () => {}) {
    let shoreJourney = null;
    const salt = createSaltGuide(root);
    const cave = createCaveGuide(root, host.graphics);
    const transfers = createTransferBookmarks(root, host);
    const terrainJourney = createTerrainJourney(root);
    const selectionSites = new WeakMap();
    let browser = createDestinationBrowser();
    let owner = null;
    let active = null;
    let worker = null;
    let admission = null;
    let inFlight = null;
    let sequence = 0;
    let speech = 0;
    let arrivalScene = null;
    let renderOwner = null;
    let control = null;
    let iceRoute = null;
    const preferences = host.navigationPreferences;
    const autowalk = createAutowalk(root, ready, preferences, (scene, record, failed, arrived) => {
        if (failed) host.beacon?.stop(scene);
        if (arrived) {
            const previousSpeech = speech;
            speech = 0;
            retire(scene);
            // The native move-by-input hook has verified the settled tile.
            // Admit arrival before this frame's automatic render callbacks.
            scene._wqaArrivalSpeech = notifications.arrive({ kind: 'fieldStatus', name: 'Arrived.' },
                () => ready(scene, true), previousSpeech, record);
            if (scene._wqaArrivalSpeech) arrivalScene = scene;
        } else if (record && scene === host.manager._scene) command('navigationReport', record);
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
            (waking || map?.inactiveTime < 30) && (!map?._needsRefresh || scene._wqaNonPageRefreshOnly) &&
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

    function retainIceRoute(scene, eventId) {
        const map = root.$gameMap;
        const block = map._events[eventId];
        const entry = root.$dataMap.events[eventId];
        const page = entry?.pages[block?._pageIndex];
        if (!block || block._erased || block._trigger !== 0 || !iceOpensPassage(entry, page)) return false;
        // Preserve the original selection across the native melt. Route work
        // retires at entry and resumes from a fresh settled observation.
        iceRoute = { scene, map, block, browser: owner.browser, started: false };
        scene._wqaIceRoute = true;
        return true;
    }

    function clearIceRoute(scene) {
        if (iceRoute?.scene !== scene) return;
        scene._wqaIceRoute = false;
        iceRoute = null;
    }

    function retire(scene, stepping = false) {
        if (!owner || owner.scene !== scene) return;
        if (admission) Atomics.store(admission, 0, 0);
        host.caveTiming?.cancelPlan?.(scene, stepping);
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
        if ((job.action === 'directions' || job.action === 'puzzleGuide') && record.kind === 'routeDirections') {
            const speakDestination = job.beaconStarted && job.controller && job.action === 'directions' &&
                preferences().speakBeaconDestination;
            record = { ...record, name: speakDestination ? job.label : record.name, directionsOnly: !speakDestination };
        }
        speech = notifications.open(record, () => active === job && ready(job.scene, moving) &&
            (!job.quest || questDestinationCurrent(root, job.scene, job.quest)) &&
            (!job.questExit || chillcrestQuestExit(root)) &&
            (!job.breakfastObjective || root.$gameParty?.getNav?.() === job.breakfastObjective) &&
            (!job.enemyCurrent || job.enemyCurrent()) &&
            (!job.npcCurrent || job.npcCurrent()) &&
            (!job.entrance || transfers.current(job.entrance)) &&
            (!job.groundEntrance || transfers.current(job.groundEntrance, 'walk')) &&
            (!job.scene._wqaPreviewUntil || host.graphics.frameCount < job.scene._wqaPreviewUntil));
    }

    function status(job, name) { present(job, { kind: 'fieldStatus', name }); }

    function navigationRequest(job) {
        return job && (job.action === 'directions' || job.action === 'currentDestination' ||
            job.action === 'puzzleGuide' && !!guideFor(job.scene) || BROWSE.has(job.action));
    }

    function follow(job, result, record, walkingJob = job) {
        if (job.progress && (result.status === 'ready' || result.status === 'enemyBlocked')) {
            const first = result.legs[0];
            if (first) owner.routeProgress = { ...job.progress, x: job.x, y: job.y, ...first };
            else if (result.status === 'ready') owner.routeProgress = null;
        }
        if (job.autowalk && autowalk.start(walkingJob, result, record)) {
            // The movement owner now watches native outcomes. Ordinary
            // position notifications must leave its path narration admitted.
            job.scene._wqaRouteActive = false;
            if (result.distance > 0 && !(result.autowalkStop && result.distance === 1))
                present(job, { kind: 'fieldStatus', name: 'Walking.' }, true);
            if (speech && preferences().speakAutowalkPath) {
                if (result.autowalkStop) {
                    const legs = record.legs.slice();
                    if (!record.more) {
                        const last = legs.pop();
                        if (last?.tiles > 1) legs.push({ ...last, tiles: last.tiles - 1 });
                    }
                    notifications.focus(speech, { ...record, legs, more: result.autowalkMore, activate: result.autowalkStop,
                        directionsOnly: true, append: true });
                } else notifications.focus(speech, { ...record, directionsOnly: true, append: true });
            }
            return;
        }
        // A distant event can move before the speech helper reads this
        // route. Keep spoken directions admitted when the move could not
        // reach the spoken portion or its final interaction.
        if (job.mode === 'walk' && root.$dataMap?.scrollType === 0 && !job.area && !job.remote && !job.vehicle &&
            !job.autowalk && !host.beacon?.enabled() && !timedCave(job.map) && !result.reenter)
            job.spokenBounds = spokenRouteBounds(job.x, job.y, record.legs);
        presentRoute(job, record);
    }

    function presentRoute(job, record) {
        present(job, job.beaconStarted && !preferences().speakBeaconPath ? { ...record, beaconOnly: true } : record);
    }

    function bridgeReason(result) {
        return BRIDGE_REASON + (result.afterIce ? ' An ice block also blocks the approach.' : '');
    }

    function terrainExit(job, result) {
        const gate = result.gate;
        const approach = job.terrainApproach;
        const edge = approach?.entrances.find(item => item.event === result.entrance && item.approach === result.approach);
        if (gate === 'pull' ? root.$gameVariables?.value?.(4) !== 2 : gate && root.$gameSwitches?.value?.(gate) !== false)
            return status(job, 'The passage changed. Request directions again.');
        if (approach && result.entrance && (!edge || !transfers.matchesState(approach.state) || !transfers.current(edge)))
            return status(job, 'The exit changed. Request directions again.');
        if (gate === 97 && !edge) return status(job, BRIDGE_REASON + ' No verified route to an exit from here.');
        const event = edge?.event ?? result.event;
        const exit = routeBoundary(root, event, preferences().spoilers === true, edge).exit ||
            CONTROLS[job.map]?.[event] || 'exit';
        const text = gate === 145 ? CRYSTAL_REASON : gate === 97 ? bridgeReason(result) : gate === 'pull' ? PULL_REASON : job.guide;
        const blocked = result.needsEncounter === true;
        if (blocked && !currentEnemy(root, result)) return status(job, 'The enemy moved. Request directions again.');
        if (gate && !job.journey)
            terrainJourney.begin(gate, job.map, job.destination, edge?.map ?? (gate === 'pull' ? 57 : 27), { x: job.x, y: job.y }, edge && { x: edge.x, y: edge.y });
        else if (edge) terrainJourney.advance(job.map, edge.map, { x: edge.x, y: edge.y });
        job.entrance = edge;
        const handoff = result.boundaryEvent && result.boundaryEvent !== event &&
            localHandoffName(job.map, result.boundaryEvent);
        const bump = gate === 'pull' && !handoff || !!edge && edge.action && root.$gameMap._events[event]?._trigger === 1;
        if (blocked) job.enemyCurrent = () => currentEnemy(root, result);
        startBeaconApproach(job, result, event);
        return presentRoute(job, { kind: 'routeDirections', name: job.label, guide: text,
            legs: result.legs, facing: result.arrival.facing, more: result.more === true,
            exit: handoff || blocked ? undefined : exit, useExit: true, boundary: result.boundary,
            boundaryName: handoff, manualHandoff: !!handoff, enemyBlocked: blocked,
            bump, enter: edge?.action && !bump, reenter: result.reenter === true, takeExit: !!edge || bump });
    }

    function startBeaconApproach(job, result, event) {
        if (!result.distance || !host.beacon?.enabled()) return;
        // For a forced boundary, stop on the clear tile before activation.
        // For a switch, retain the verified action position and facing.
        const { x, y, facing } = result.arrival;
        job.beaconStarted = host.beacon.start(job.scene, event, job.x, job.y, result, null, undefined,
            { point: true, request: { targetX: x, targetY: y, field: true, beacon: true, refreshFacing: facing, limit: 8 } });
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
        if (job.caveRefresh) {
            const { state, captured } = job.caveRefresh;
            host.caveTiming.refreshResult(state, captured, packet.result?.opening);
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
                    return (available === 1 || available === 2) &&
                        (!target.quest || questDestinationCurrent(root, job.scene, target.quest));
                });
                job.performed = true;
                return select(job, snapshot);
            }
            if ((job.quest && !questDestinationCurrent(root, job.scene, job.quest)) ||
                (job.questExit && !chillcrestQuestExit(root)) ||
                (job.breakfastObjective && root.$gameParty?.getNav?.() !== job.breakfastObjective)) {
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
            if (result?.guideEvent !== undefined) {
                const chosen = job.guideOptions?.find(({ target }) => target.id === result.guideEvent);
                const event = root.$gameMap._events?.[result.guideEvent];
                if (!chosen || !event || event._erased || event._x !== chosen.target.x || event._y !== chosen.target.y)
                    return status(job, 'The next step changed. Request guidance again.');
                const { target, hint } = chosen;
                job.label = target.name;
                job.target = target.id;
                job.eventAction = target.eventAction;
                job.guide = hint;
                if (job.timing && result.status === 'timedCue')
                    job.timing = host.caveTiming.capture(job.scene, job.timing.motion, target);
                selectGuideTarget(target);
            }
            routeDiagnostics(job, result);
            if (job.action === 'directions' && !job.journey && (job.map === 45 || job.map === 59) &&
                job.destination?.category === 'treasure' && job.target === 3 &&
                ['unreachable', 'approachBlocked'].includes(result?.status)) {
                terrainJourney.begin('nuggedorMine', job.map, job.destination, 48);
                job.performed = false;
                return afterRender();
            }
            if (job.action === 'directions' &&
                ['terrainExit', 'terrainGate', 'unreachable', 'approachBlocked'].includes(result?.status)) {
                const barrier = visibleChestBarrier(root, job.map, job.request?.event, preferences().spoilers === true);
                if (barrier) return status(job, barrier);
            }
            if (result?.status === 'terrainExit' || job.terrainOnward && result?.entrance &&
                ['ready', 'interrupted', 'enemyBlocked'].includes(result.status))
                return terrainExit(job, result);
            if (result?.status === 'terrainGate')
                return status(job, (result.gate === 97 ? bridgeReason(result) : CRYSTAL_REASON) + ' No verified route to an exit from here.');
            if (job.terrainOnward && ['unreachable', 'unavailable'].includes(result?.status))
                return status(job, [job.guide, 'No verified route to an exit from here.'].filter(Boolean).join(' '));
            if (job.remote && result?.status === 'ready' && !admitRemoteRoute(job, result))
                return status(job, 'The entrance changed. Request directions again.');
            if (result?.status === 'patrolLine') {
                const { activate } = result;
                const record = { kind: 'routeDirections', name: job.label, legs: [], facing: result.arrival.facing,
                    activate, takeExit: !!activate, exit: activate ? job.label : undefined, guideAction: !activate };
                if (!autowalk.start(job, result, record))
                    return status(job, 'Guard timing changed. Request directions again.');
                job.scene._wqaRouteActive = false;
                return present(job, { kind: 'fieldStatus', name: 'Walking.' }, true);
            }
            if (result?.status === 'patrolLineApproach') {
                const { legs, more, facing, activate } = result;
                return present(job, { kind: 'routeDirections', name: job.label, legs, facing, more, activate,
                    takeExit: !!activate, exit: activate ? job.label : undefined, guideAction: !more && !activate });
            }
            if (result?.status === 'patrolLineManual') {
                if (!job.timing)
                    return status(job, host.graphics._wqaCaveTimingEnabled ?
                        'Cave timing audio is unavailable. Request directions again.' :
                        'This crossing uses Cave timing cues in Audio. Turn them on and request directions.');
                const { legs, more, activate, facing } = result;
                const endText = more ? 'Safe to stop. Request directions again.' : activate ?
                    'Move ' + PATROL_HEADINGS[activate] + ' to take ' + job.label + '.' :
                    'Face ' + PATROL_HEADINGS[facing] + ' and press the action button.';
                if (!host.caveTiming.startManual(job.timing, job.line, job.x, job.y, result, endText))
                    return status(job, 'Guard timing changed. Request directions again.');
                job.scene._wqaRouteActive = false;
                return present(job, { kind: 'patrolLineManual', legs });
            }
            if (result?.status === 'timedCue' || result?.status === 'timedWait') {
                const opening = result.opening;
                const direction = opening?.direction ?? result.direction;
                const tiles = opening?.tiles ?? result.tiles;
                const headings = opening?.headings ?? result.headings;
                const pace = opening?.pace ?? result.pace;
                const target = result.guideEvent === undefined ? job.destination :
                    job.guideOptions?.find(item => item.target.id === result.guideEvent)?.target;
                const repeat = opening?.escape ? undefined :
                    { direction, tiles, pace, refresh: state => refreshCaveTiming(job, state, target, direction, tiles, headings, pace) };
                if (job.timing && host.caveTiming.start(job.timing, job.x, job.y, opening, repeat))
                    return present(job, { kind: 'timedCue', direction, tiles, headings, pace,
                        terminal: opening?.terminal ?? result.terminal, escape: opening?.escape,
                        waiting: !opening || job.motionFrame + opening.from > host.graphics.frameCount, guide: job.guide });
                return present(job, { kind: 'patrolWait', direction, guide: job.guide });
            }
            if (result?.status === 'patrolBlocked') {
                const target = !job.caveBlocker && distractionForGuard(root, result.guard);
                const motion = target && captureMotion(root, host.graphics);
                const snapshot = motion && captureWorld(root, true, undefined, undefined, [], true);
                if (snapshot) {
                    job.caveBlocker = result.guard;
                    job.guideOptions = null;
                    job.readyGuide = '';
                    job.guide = 'Activate the distraction crystal to move the guard, then request directions again.';
                    return route(job, snapshot, target, undefined, motion);
                }
                return status(job, 'Blocked by a stationary Mech Guard.');
            }
            if (result?.status === 'unsafeCrossing') return status(job, result.exposed ?
                'You are in a patrol lane. No clear move verified.' : 'No crossing to a safe stopping point is verified here.');
            if (result?.status === 'patrolApproach')
                return present(job, { kind: 'patrolApproach', direction: result.direction, tiles: result.tiles,
                    terminal: result.terminal, guide: job.guide });
            else if (result?.status === 'ready') {
                if (job.readyGuide) job.guide = job.readyGuide;
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
                if (!job.request.motion && !result.reenter && host.beacon?.enabled()) {
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
                    job.beaconStarted = host.beacon.start(job.scene, job.target, job.x, job.y, result, job.area ? () =>
                        warningApproach(root.$gameMap, player._x, player._y, job.target) : null, job.vehicle?.type,
                        { quest: job.quest, point: job.point, request: { ...request, limit: 8, refreshFacing: fixed ? facing : undefined },
                            destinationReady, enemyCurrent: obstacle => currentEnemy(root, obstacle) });
                }
                const exit = !result.land && !job.entrance?.sameScene &&
                    (job.entrance || job.destination?.category === 'exits' || job.questExit || job.breakfastObjective === 'quest26') &&
                    routeBoundary(root, job.target, preferences().spoilers === true, job.entrance, job.mode).exit;
                const exitEvent = exit && root.$gameMap._events?.[job.target];
                const bump = job.eventAction === 'bump' || !!exitEvent && exitEvent._trigger === 1 && exitEvent._priorityType === 1;
                follow(job, result, { kind: 'routeDirections', name: job.label, guide: job.guide,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    reenter: result.reenter === true, enter: job.entrance?.action ?? exitEvent?._trigger === 0,
                    exit, takeExit: !!exit, onward: job.onward,
                    sailing: job.mode === 'ship' || job.mode === 'boat',
                    bump,
                    conversation: job.eventAction === 'talk',
                    board: !!job.vehicle, land: result.land === true,
                    guideAction: job.eventAction === 'interact' ||
                        job.action === 'puzzleGuide' && !!result.arrival.facing && !!saltControlName(job.target),
                    discovery: result.discovery && worldBoundaryName(root, result.discovery, preferences().spoilers === true) });
            }
            else if (result?.status === 'iceRoute') {
                if (!retainIceRoute(job.scene, result.event))
                    return status(job, 'The ice changed. Request directions again.');
                if (host.beacon?.enabled()) job.beaconStarted = host.beacon.start(job.scene, result.event, job.x, job.y, result,
                    null, undefined, { request: { event: result.event, field: true, beacon: true, limit: 8 } });
                follow(job, result, { kind: 'routeDirections', name: 'Ice block', legs: result.legs,
                    facing: result.arrival.facing, more: result.more === true, prerequisite: 'the ice block',
                    resumeIce: true }, { ...job, target: result.event, quest: null, point: false });
            }
            else if (result?.status === 'controlRoute') {
                const prerequisite = CONTROLS[job.map]?.[result.event];
                if (!prerequisite || result.gate && root.$gameSwitches?.value?.(result.gate) !== false)
                    return status(job, 'The passage changed. Request directions again.');
                const reason = {
                    103: 'The office entrance opens after the scene with Chomps.',
                    115: 'The return opens after the rescue encounter.',
                    119: 'Speak to Elder Tater to open the way.',
                    145: 'The crystal opens the passage.'
                }[result.gate];
                startBeaconApproach(job, result, result.event);
                presentRoute(job, { kind: 'routeDirections', name: job.label, legs: result.legs, facing: result.arrival.facing,
                    guide: reason, more: result.more === true, prerequisite,
                    prerequisiteMove: result.step ? result.boundary : undefined });
            }
            else if (result?.status === 'saltRoute') {
                const event = result.actions?.[0];
                const kind = result.prerequisiteKind;
                const prerequisite = saltControlName(event) || (kind === 'encounter' ? 'an encounter' :
                    event === 105 ? 'the torch reminder' : event === 18 ? 'the cave conversation' : '');
                if (!prerequisite) return status(job, 'Crystal directions unavailable');
                startBeaconApproach(job, result, event);
                presentRoute(job, { kind: 'routeDirections', name: job.label, guide: job.guide,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    prerequisite, prerequisiteMove: kind !== 'action' ? result.boundary : undefined,
                    remainingActions: result.actions.length - 1 });
            }
            else if (result?.status === 'npcBlocked') {
                const gate = npcPassage(root.$gameMap);
                if (gate?.event !== result.npc)
                    return status(job, 'The passage changed. Request directions again.');
                job.npcCurrent = () => npcPassage(root.$gameMap) === gate;
                startBeaconApproach(job, result, gate.event);
                follow(job, result, { kind: 'routeDirections', name: job.label, legs: result.legs,
                    npcBlocker: gate.name, facing: result.arrival.facing, more: result.more === true },
                { ...job, target: gate.event, point: false });
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
                const terrain = result.terrain;
                const next = terrain?.status === 'iceRoute' ? 'the ice block' : CONTROLS[job.map]?.[terrain?.event];
                if (terrain?.status === 'iceRoute' && !retainIceRoute(job.scene, terrain.event))
                    return status(job, 'The ice changed. Request directions again.');
                if (host.beacon?.enabled()) {
                    const request = next ? { event: terrain.event, field: true, beacon: true, limit: 8 } :
                        { ...job.request, autowalk: false, beacon: true };
                    job.beaconStarted = host.beacon.start(job.scene, next ? terrain.event : job.target, job.x, job.y, result,
                        null, undefined, { quest: job.quest, point: job.point, request,
                            enemyCurrent: obstacle => currentEnemy(root, obstacle), alreadyReported: true });
                }
                job.enemyCurrent = () => currentEnemy(root, result);
                const record = { kind: 'routeDirections', name: job.label, legs: result.legs,
                    enemyBlocked: true, boundary: result.boundary, more: result.more === true, afterEnemy: next };
                follow(job, result, record);
            }
            else if (result?.status === 'interrupted') {
                const regional = BREAKFAST_HANDOFFS[job.map]?.[result.boundaryEvent];
                const handoff = regional || (job.request.handoffs?.includes(result.boundaryEvent) || !job.eventAction) &&
                    localHandoffName(job.map, result.boundaryEvent);
                const { exit, boundaryName } = routeBoundary(root, result.boundaryEvent, preferences().spoilers === true,
                    undefined, job.mode);
                if (!job.request.motion) startBeaconApproach(job, result, result.boundaryEvent);
                // The east and south world-map approaches are in a separate
                // walking component. Carry the selection through the town
                // only when both the west exit and the fort are open.
                const throughChillcrest = job.map === 113 && job.mode === 'walk' && job.target === FLOAT_FORT_ENTRANCE &&
                    result.boundaryEvent === 19 && (result.boundary === 4 || result.boundary === 8) &&
                    root.$gameSwitches?.value?.(33) === true && root.$gameSwitches.value(38) === true && !!exit;
                if (throughChillcrest)
                    terrainJourney.begin('floatFort', 113, job.destination, 25);
                const useExit = !!exit && (throughChillcrest || job.target === result.boundaryEvent ||
                    job.request.handoffs?.includes(result.boundaryEvent));
                const activate = job.eventAction === 'step' && job.target === result.boundaryEvent ? result.boundary : undefined;
                follow(job, result, { kind: 'routeDirections', name: job.label, legs: result.legs, boundary: result.boundary,
                    guide: job.guide, activate, exit, useExit,
                    onward: throughChillcrest ? 'Then take the west exit to the world map.' : undefined,
                    chase: chaseHandoff(root, result.boundaryEvent),
                    boundaryName: handoff || boundaryName || (!job.eventAction && worldBoundaryName(root, result.boundaryEvent, preferences().spoilers === true)),
                    manualHandoff: !!handoff || !!boundaryName && (job.action === 'puzzleGuide' || job.mode === 'ship' || timedCave(job.map)),
                    more: result.more === true });
            }
            else if (job.remote && ['unreachable', 'approachBlocked', 'unavailable'].includes(result?.status))
                status(job, 'No verified reachable entrance');
            else if (['unreachable', 'approachBlocked'].includes(result?.status)) {
                if (job.guide) return status(job, job.guide + ' No verified route from here.');
                if (job.map === 87 && job.target === 79)
                    return status(job, 'This cave mouth is separate from the main cavern. It is reached from the east side of Cracked Cove.');
                if (job.map === 191 && job.target === 2)
                    return status(job, 'The west cave entrance is on a separate shore.');
                const reason = job.mode === 'walk' ? 'Not currently reachable' : job.mode === 'airship' ?
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
                    if (dropped?.caveRefresh) host.caveTiming.stop(dropped.scene);
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
            else if (job.caveRefresh) host.caveTiming.stop(job.scene);
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

    function routeProgress(job, snapshot, target, event) {
        if (job.action !== 'directions' || job.autowalk || job.journey ||
            snapshot.mode !== 'walk' || snapshot.scrollType || !event) return undefined;
        job.progress = { event, category: target.category, targetX: target.x, targetY: target.y };
        const previous = owner.routeProgress;
        if (!previous || Object.keys(job.progress).some(key => previous[key] !== job.progress[key])) {
            owner.routeProgress = null;
            return undefined;
        }
        const [dx, dy] = HEADINGS[previous.direction];
        const x = snapshot.x - previous.x;
        const y = snapshot.y - previous.y;
        const distance = x * dx + y * dy;
        if (x * dy === y * dx && distance >= 0 && distance <= previous.tiles)
            return distance > 0 ? previous.direction : undefined;
        owner.routeProgress = null;
        return undefined;
    }

    function route(job, snapshot, target, area, motion) {
        job.label = target.name;
        job.destination = target;
        job.area = area;
        const destination = destinationRequest(target);
        job.target = destination.event;
        job.eventAction = target.eventAction;
        job.questExit = target.questExit === true;
        job.point = target.point === true;
        job.vehicle = target.vehicle && { type: target.vehicle, x: target.x, y: target.y };
        job.nearestLanding = target.nearestLanding === true;
        job.autowalk = job.action !== 'puzzleGuide' && !job.journey && !timedCave(snapshot.map) && preferences().autowalk;
        job.motionFrame = motion?.frame;
        job.line = capturePatrolLine(root, motion, job.target);
        const lineNavigation = job.line && (preferences().autowalk ?
            (job.target !== 26 || snapshot.y <= 6) : 'manual');
        if (motion) {
            host.caveTiming?.warm(job.scene);
            job.timing = host.caveTiming?.capture(job.scene, motion, target);
        }
        const terrainTransfer = snapshot.live?.terrainGate === false && !job.journey &&
            snapshot.live.terrainSwitch === 97 ? terrainTransferRequest(job, STONE_ISLAND) : undefined;
        const guideOptions = motion && job.guideOptions?.map(({ target }) => destinationRequest(target));
        const followedDirection = !motion && !area ? routeProgress(job, snapshot, target, destination.event) : undefined;
        submit(job, snapshot, { ...destination, terrainTransfer, guideOptions, followedDirection,
            stopBeforeEvent: job.eventAction === 'step',
            limit: 8, area, motion, field: true, landing: snapshot.mode === 'airship' && !job.point,
            surface: snapshot.mode !== 'walk', patrolGuidance: !!motion,
            beacon: !motion && host.beacon?.enabled() === true, autowalk: job.autowalk, timingCue: !!job.timing,
            lineNavigation });
    }

    function terrainTransferRequest(job, map, breakfast = false, point, trail) {
        const { entrances, state } = transfers.candidates();
        const copy = ({ event, map, x, y, approach }) => ({ event, map, x, y, approach });
        job.terrainApproach = { entrances, state };
        return { map, state, breakfast, point, trail, candidates: entrances.map(copy), discoveries: transfers.discoveries(entrances),
            handoffs: Object.keys(BREAKFAST_HANDOFFS[root.$gameMap._mapId] || {}).map(Number) };
    }

    function resumeTerrainJourney(job, snapshot) {
        const next = terrainJourney.next(snapshot);
        if (!next) return false;
        if (next.restore && next.target) {
            const { category, id } = next.target;
            owner.browser.category = category;
            owner.browser.selections[category] = id;
        }
        if (next.restore) return false;
        job.journey = true;
        job.guide = next.text;
        if (next.transfer) {
            job.label = 'Next exit';
            job.terrainOnward = true;
            return submit(job, snapshot, { field: true, limit: 8, beacon: host.beacon?.enabled() === true,
                transfer: terrainTransferRequest(job, next.transfer, next.breakfast, next.point, next.trail) }), true;
        }
        if (!next.target) return status(job, next.unavailable ||
            (next.text ? next.text + ' The next action is unavailable.' : 'The next exit is unavailable.')), true;
        job.onward = next.onward;
        if (next.map) terrainJourney.advance(snapshot.map, next.map);
        route(job, snapshot, next.target);
        return true;
    }

    function select(job, snapshot) {
        snapshot.objects = includeSavedBookmarks(snapshot, snapshot.bookmarks, quest => questDestinationCurrent(root, job.scene, quest));
        if (job.action === 'directions' && !job.changes.length) {
            if (resumeShoreJourney(job, snapshot) || resumeTerrainJourney(job, snapshot)) return;
        }
        const selected = owner.browser.selections[owner.browser.category];
        const result = browse(owner.browser, snapshot, job.changes);
        job.quest = result.target?.quest;
        job.scene._wqaQuestNavigation = !!job.quest;
        if (!result.target) {
            if (job.action === 'directions') routeDiagnostics({ ...job, map: snapshot.map, mode: snapshot.mode,
                x: snapshot.x, y: snapshot.y, request: { event: selected },
                destination: { category: owner.browser.category } }, { status: result.status });
            return status(job, result.status);
        }
        const { target, category } = result;
        owner.target = target;
        if (target.saved) return selectSavedBookmark(job, snapshot, target.saved, category);
        owner.remoteBookmark = null;
        job.breakfastObjective = target.breakfastObjective;
        if (target.breakfastRegion) {
            if (job.action !== 'directions') return status(job, target.name);
            job.label = target.name;
            job.terrainOnward = true;
            return submit(job, snapshot, { field: true, limit: 8, beacon: host.beacon?.enabled() === true,
                transfer: terrainTransferRequest(job, STONE_ISLAND) });
        }
        // Guards are moving hazards. Directions reads their current bearing
        // without making contact with them a route goal.
        if (job.action !== 'directions' || target.patrol) return present(job, { kind: 'fieldTarget',
            name: job.action === 'directions' && target.patrol ? '' : target.name, category,
            patrolBearing: job.action === 'directions' && target.patrol,
            dx: target.x - snapshot.x, dy: target.y - snapshot.y, outOfReach: target.outOfReach, handoff: target.handoff });
        if (target.shoreMap) {
            job.destination = target;
            return remoteDirections(job, snapshot, { map: target.shoreMap, name: target.name },
                { shore: { event: target.id, map: target.shoreMap, name: target.name }, trail: [] });
        }
        if (snapshot.map === 113 && snapshot.mode === 'walk' && target.id === FLOAT_FORT_ENTRANCE &&
            root.$gameSwitches?.value?.(38) === false)
            return status(job, 'The road to Float Fort opens after you obtain the Frosty Stone.');
        if (!timedCave(snapshot.map)) return route(job, snapshot, target);
        return timedRoute(job, snapshot, target);
    }

    function refreshCaveTiming(command, state, target, direction, tiles, headings, pace) {
        const { scene } = command;
        if (active !== command || inFlight || !target || sequence >= 0x7ffffffe || !ready(scene)) return false;
        const motion = captureMotion(root, host.graphics);
        const captured = motion && host.caveTiming.capture(scene, motion, target);
        const snapshot = captured && captureWorld(root, true, undefined, undefined, [], true);
        if (!snapshot) return false;
        const job = { scene, sequence: ++sequence, caveRefresh: { state, captured } };
        submit(job, snapshot, { ...destinationRequest(target), field: true, motion, patrolGuidance: true,
            timingCue: true, timingDirection: direction, timingTiles: tiles, timingHeadings: headings, timingPace: pace });
        return inFlight === job;
    }

    function timedRoute(job, snapshot, target) {
        const area = warningApproach(root.$gameMap, snapshot.x, snapshot.y, target.event ?? target.id);
        const motion = area ? null : captureMotion(root, host.graphics);
        if (!area && !motion) return status(job, [job.guide, 'Patrol timing is unavailable here.'].filter(Boolean).join(' '));
        const terrain = snapshot.live ? snapshot : captureWorld(root);
        if (!terrain) return status(job, 'Map information unavailable');
        route(job, terrain, target, area, motion);
    }

    function selectGuideTarget(target) {
        owner.browser.category = target.category;
        owner.browser.selections[target.category] = target.id;
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
                const target = eventTarget(root, 'walk', event, entry, page, preferences().spoilers === true);
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
            const name = discovery && worldBoundaryName(root, discovery.event, preferences().spoilers === true);
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

    function resumeShoreJourney(job, snapshot) {
        if (!shoreJourney) return false;
        const { player, map, ticket } = shoreJourney;
        if (player !== root.$gamePlayer || map !== snapshot.map || snapshot.mode !== 'walk') {
            shoreJourney = null;
            return false;
        }
        if (snapshot.map !== 113) {
            remoteDirections(job, snapshot, ticket.shore, ticket);
            return true;
        }
        shoreJourney = null;
        const target = snapshot.objects.find(item => item.id === ticket.shore.event && item.category === 'exits');
        if (!target) {
            status(job, 'The walking entrance is unavailable.');
            return true;
        }
        owner.browser.category = 'exits';
        owner.browser.selections.exits = target.id;
        route(job, snapshot, target);
        return true;
    }

    function remoteDirections(job, snapshot, bookmark, selection = owner.remoteBookmark) {
        transfers.clear();
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
        const filtering = preferences().reachableOnly === true && !timed && navigationRequest(job) &&
            job.action !== 'puzzleGuide' && (!routing || job.changes.length > 0);
        const label = salt.available(job.scene) ? (id, fallback) => salt.label(job.scene, id, fallback) : undefined;
        const bookmarks = host.bookmarks?.();
        const puzzleGuide = job.action === 'puzzleGuide';
        const questExitId = job.changes.length ? undefined : owner.browser.selections.quests;
        const snapshot = captureWorld(root, filtering || routing && !timed || puzzleGuide, label, job.scene, bookmarks,
            false, preferences().spoilers === true, questExitId);
        if (!snapshot) return status(job, 'Map information unavailable');
        if (navigationRequest(job)) snapshot.bookmarks = bookmarks;
        if (filtering && snapshot.objects.length) {
            job.scene._wqaQuestNavigation = snapshot.objects.some(target => !!target.quest);
            return submit(job, snapshot, { candidates: snapshot.objects.map(destinationRequest) }, true);
        }
        job.performed = true;
        if (puzzleGuide) {
            const result = guideFor(job.scene)?.review(job.scene, snapshot.objects, snapshot.x, snapshot.y);
            if (!result) return retire(job.scene);
            if (!result.target) return status(job, result.text);
            selectGuideTarget(result.target);
            job.guide = result.text;
            job.readyGuide = result.readyText;
            job.guideOptions = result.options;
            return timed ? timedRoute(job, snapshot, result.target) : route(job, snapshot, result.target);
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

    function retireArrival(scene, keepOrder) {
        if (!scene || arrivalScene !== scene) return;
        notifications.endArrival(scene._wqaArrivalSpeech, keepOrder);
        scene._wqaArrivalSpeech = 0;
        arrivalScene = null;
    }

    for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => {
        retireArrival(arrivalScene, false);
        transfers.clear();
        terrainJourney.clear();
        shoreJourney = null;
        autowalk.stop();
        if (owner) { clearIceRoute(owner.scene); retire(owner.scene); }
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
    function command(action, text, controller = false) {
        const scene = host.manager._scene;
        if (action === 'beaconStop') {
            if (!ready(scene, true)) return false;
            const waitingForIce = iceRoute?.scene === scene;
            terrainJourney.clear();
            shoreJourney = null;
            clearIceRoute(scene);
            const walking = autowalk.stop(scene) || pendingAutowalk(scene);
            const beaming = host.beacon?.stop(scene);
            if (!walking && !beaming && !waitingForIce) return false;
            transfers.clear();
            command('navigationReport', { kind: 'fieldStatus', name: walking ? 'Autowalk stopped.' : beaming ? 'Beacon stopped.' : 'Directions stopped.' });
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
        const navigation = navigationRequest({ action, scene });
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
            clearIceRoute(scene);
            autowalk.stop(scene);
            host.beacon?.stop(scene);
            host.caveTiming?.cancelPlan(scene);
        }
        const changes = active?.scene === scene && !active.performed ? active.changes.slice() : [];
        if (BROWSE.has(action) && changes.length < 16) changes.push(action);
        retireArrival(scene, false);
        if (owner) retire(owner.scene);
        browserOwner(scene);
        if (BROWSE.has(action) || puzzle) {
            owner.remoteBookmark = owner.routeProgress = null;
            terrainJourney.clear();
            shoreJourney = null;
            transfers.clear();
        }
        queue({ scene, action, changes, text, step, idle, controller, retries: 0 });
        // An accepted pathfinder key is activity in the native idle detector.
        // It never supplies a game action or changes the timer directly.
        if (canWaitForStep) scene._wqaNavigationWake = true;
        return true;
    }

    function activateBookmark(scene, entry, remote = false, trail = []) {
        clearIceRoute(scene);
        browserOwner(scene);
        owner.remoteBookmark = remote ? { id: entry.id, revision: entry.revision, trail } : null;
        owner.browser.category = 'bookmarks';
        owner.browser.selections.bookmarks = bookmarkId(entry.id);
        owner.target = owner.routeProgress = null;
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
            if (!event || event._erased || !(page?.list?.length >= 2) ||
                !preferences().spoilers && concealedDestination(map._mapId, event)) return context;
            const current = target.quest ? questDestinationCurrent(root, scene, target.quest) :
                eventTarget(root, mode, event, entry, page, preferences().spoilers === true)?.category === target.category;
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
            if (!settled && !ready(scene, true)) return null;
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
        clearIceRoute,
        iceEventStarted(scene, event) {
            if (iceRoute?.scene !== scene) return;
            if (iceRoute.block === event && !event._erased && event._trigger === 0) iceRoute.started = true;
            else clearIceRoute(scene);
        },
        iceRouteReady(scene) {
            if (iceRoute?.scene !== scene || !ready(scene)) return;
            const { map, block, browser: selection, started } = iceRoute;
            if (map !== root.$gameMap || browser !== selection) return clearIceRoute(scene);
            if (!started || !block._erased) return;
            clearIceRoute(scene);
            command('directions');
        },
        observeReady(scene) {
            if (!ready(scene)) return;
            const arrived = transfers.settle(scene);
            if (arrived?.shore) {
                const map = root.$gameMap._mapId;
                shoreJourney = map !== arrived.shore.map ? { player: root.$gamePlayer, map, ticket: arrived } : null;
            }
            const bookmark = arrived && !arrived.shore && savedBookmark(arrived);
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
            return ready(scene) && !scene._wqaInteractionDeferred && !autowalk.active(scene);
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
                scene._wqaCaveReview || sequence >= 0x7ffffffe) return retire(scene, steppedActor === root.$gamePlayer);
            if (job.ambientStatus || job.line?.refs.some(ref => ref.actor === steppedActor)) return;
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
            retireArrival(scene, true);
            autowalk.stop(scene);
            retire(scene);
            if (control?.scene === scene) control = null;
        },
        leave(scene, mapEventId) {
            retireArrival(scene, true);
            if (!(iceRoute?.scene === scene && iceRoute.started && iceRoute.block._eventId === mapEventId))
                clearIceRoute(scene);
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
