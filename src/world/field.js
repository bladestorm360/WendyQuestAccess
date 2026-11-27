'use strict';

const { captureWorld, eventTarget, bookmarkId, includeSavedBookmarks } = require('./snapshot');
const { fieldVitals, fieldVitalsVisible } = require('../battle/party-vitals');
const { goldPaint, goldLabel } = require('../menus/shop');
const { createFieldInspection } = require('./field-inspection');
const { MODES } = require('./bookmark-records');
const { travelMode, parkedVehicle, canLand } = require('./vehicle-navigation');
const { worldBoundaryName, worldEntranceRevealed, FLOAT_FORT_ENTRANCE } = require('./world-destinations');
const { localHandoffName, handoffCaption, iceOpensPassage, chillcrestQuestExit, sunriseSequenceExit, concealedDestination,
    visibleChestBarrier, closedRuinsDoorReason, BREAKFAST_HANDOFFS, npcPassage, passiveFloorPage } = require('./local-destinations');
const { transferOptions, pageMayTransfer } = require('./transfer-events.cjs');
const { createAutowalk } = require('./autowalk');
const { readoutLimit, chunkReadout, createRouteReadout } = require('./route-readout');
const { destinationName } = require('./destination-names');
const { createEnemyWalk } = require('./enemy-walk');
const { createTransferBookmarks } = require('./transfer-bookmarks');
const { createBoatJourney } = require('./boat-journey');
const { createLocalDetour } = require('./local-detour');
const { createAirshipJourney } = require('./airship-journey');
const { tileKey, DIRECTIONS } = require('./geometry.cjs');
const { browse, createDestinationBrowser, activeMovingEnemy } = require('./destinations');
const { collectQuestDestinations, questDestinationCurrent } = require('./quest-destinations');
const { createSaltGuide } = require('./puzzles/salt-caverns');
const { CONTROLS, TERRAIN_PAGES } = require('./terrain-control-labels.cjs');
const { createTerrainJourney, BRIDGE_REASON, CRYSTAL_REASON, PULL_REASON, STONE_ISLAND } = require('./terrain-journey');
const { saltControlName } = require('./puzzles/salt-state.cjs');
const { mapPlace } = require('./map-banner');
const { mapDescription } = require('./map-descriptions');
const { createCaveGuide, timedCave, warningApproach, captureMotion, distractionForGuard,
    checkpointTarget } = require('./puzzles/cave');
const { acceptedAction, chaseContinuation, activeDistraction, automaticCaveMap, automaticCaveAction } = require('./puzzles/cave-progression');
const { createChaseGuide } = require('./puzzles/cave-chase');
const {createCaveSolver,caveSolverMap,solverActionAllowed} = require('./puzzles/cave-solver');
const { caveLootAction } = require('./puzzles/cave-loot');
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
    const publicName=target&&destinationName(map,eventId,target.name);
    const name = target?.category === 'exits' ? publicName.replace(/^(?:return to|to) /i, '') : '';
    if (name && name !== 'Exit' && name !== 'Map') return { exit: name };
    const options = edge ? [edge] : transferOptions(map._mapId, entry, page, root.$dataCommonEvents);
    const destination = options[0]?.map;
    if (destination && options.every(option => option.map === destination)) {
        const exit = destination === 113 ? 'the world map' : root.$dataMapInfos?.[destination]?.name;
        if (exit && !/^Map\d+$/i.test(exit)) return { exit };
    }
    if (target?.category === 'events' || target?.category === 'checkpoints') return { boundaryName: publicName };
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
    const chaseGuide = createChaseGuide(root, host.graphics);
    const transfers = createTransferBookmarks(root, host);
    const localDetour = createLocalDetour(root, transfers);
    const boatJourney = createBoatJourney(root,transfers);
    const airshipJourney = createAirshipJourney(root, { transfers, bookmarks: () => host.bookmarks?.() || [],
        spoilers: () => preferences().spoilers === true });
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
    const inspection=createFieldInspection(root,host,(scene,moving)=>ready(scene,moving,true),notifications,(scene,action,probe)=>{
        if(action==='fieldVitals')return probe?fieldVitalsVisible(scene):fieldVitals(scene,host.graphics);
        if(action==='fieldGold') {
            const painted=goldPaint(scene,(scene,window)=>!!window&&window.parent===scene._windowLayer&&
                window.worldVisible&&window.worldAlpha>0&&window.openness===255&&window.contentsOpacity>0&&window.contents?.isReady?.());
            const name=goldLabel(painted);
            return name&&(probe?true:{kind:'fieldStatus',name});
        }
        if(action==='mapName')return probe||{kind:'fieldStatus',name:mapPlace(root)||'Map name unavailable'};
        if(action==='mapDescription')return probe||{kind:'mapDescription',description:mapDescription(root)||'No description is available for this map.'};
        return false;
    });
    let arrivalScene = null;
    let renderOwner = null;
    let control = null;
    let iceRoute = null;
    let caveEvent = null;
    let caveResume = null;
    let cleanupWalk = null;
    let manualAction = null;
    let manualWait = null;
    let manualCrossing = null;
    const preferences = host.navigationPreferences;
    const readout=createRouteReadout(root,host,ready,controller=>command('directions',undefined,controller,false,true));
    const enemyWalk=createEnemyWalk(root,host,preferences);
    const solver = createCaveSolver(root,host.graphics,preferences);
    const autowalk = createAutowalk(root, ready, preferences, (scene, record, failed, arrived, job) => {
        if(record?.enemyBlocked)enemyWalk.park(scene,job,record,owner);
        if(record?.manualAutowalkStop)solver.stop();
        else if(arrived && job?.caveWalk?.solverToken)solver.wake();
        if (arrived && job?.caveWalk?.pickupEscape) {
            retire(scene);
            return;
        }
        if (arrived && job?.caveContinue) {
            resumeCaveWalk(job, job.caveExit);
            return;
        }
        if(arrived&&job?.remote&&job.mode==='walk'&&(job.entrance||record?.resumeIce)) {
            retire(scene);
            if(record)command('navigationReport',record);
            return;
        }
        if (job?.controlPrerequisite && !arrived) clearIceRoute(scene);
        if (arrived && job?.controlPrerequisite) {
            // This is an intermediate interaction, not the selected arrival.
            // Keep the original selection while the player activates the
            // control. Native completion and readiness own continuation.
            retire(scene);
            if (record) command('navigationReport', record);
            return;
        }
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
    }, (scene, held) => (root.$gameMap?._needsRefresh || held) && ready(scene, true, false, true), rerouteAutowalk, cleanupAutowalk, (scene,player,direction) => {
        const blocked=enemyWalk.cancel();
        if(blocked){owner={...blocked.owner,scene};retire(scene);return blocked.job;}
        const solving=solver.active();
        if(solving)solver.stop();
        const pending=cleanupWalk;
        const transfer=transfers.automatic(scene);
        const ice=iceRoute?.scene===scene&&iceRoute.remote&&iceRoute.autowalk?iceRoute:null;
        const cave=caveEvent?.scene===scene&&!caveEvent.accepted?caveEvent:null;
        // An explicit player step onto this exact cave trigger accepts the
        // handoff. Keep its inert continuation for the native acceptance hook;
        // any other movement cancels it normally.
        if(cave && [1,2].includes(cave.event._trigger) &&
            cave.event.pos(root.$gameMap.roundXWithDirection(player._x,direction),
                root.$gameMap.roundYWithDirection(player._y,direction))) return null;
        if ((!pending||pending.scene!==scene)&&!transfer&&!ice&&!cave) return solving?{scene}:null;
        if(pending?.scene===scene)owner=pending.owner;
        else if(ice)owner=ice.owner;
        const job=pending?.scene===scene?pending.job:ice?.job||cave||{scene};
        clearCleanupWalk();clearIceRoute(scene);if(transfer)transfers.cancelAutomatic(scene);if(cave)clearCaveEvent();
        retire(scene);
        return job;
    });

    function guideFor(scene) {
        if (salt.available(scene)) return salt;
        return cave.available(scene) ? cave : null;
    }

    function ready(scene, moving = false, waking = false, refreshing = false) {
        const player = root.$gamePlayer;
        const map = root.$gameMap;
        const nativeField = scene?._wqaFieldReady || (waking || refreshing) && scene?._wqaMapRestored && scene._mapLoaded &&
            scene._started && scene._prevCanMove && scene.srcWendy && scene.srcStones;
        return !!(nativeField && !scene._wqaSettingsActive &&
            scene === host.manager._scene && host.graphics.app?.stage === scene &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !host.screenFading() && host.hasFocus() && !scene._wqaTerrainWork &&
            !scene._wqaPreloads?.size && !scene._wqaPreloadOverflow &&
            scene._active && scene._fadeDuration === 0 && scene._fadeOpacity === 0 && root.$gameScreen?._brightness === 255 &&
            (waking || map?.inactiveTime < 30) && (!map?._needsRefresh || scene._wqaNonPageRefreshOnly || refreshing) &&
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

    function retainIceRoute(scene, eventId, job) {
        const map = root.$gameMap;
        const block = map._events[eventId];
        const entry = root.$dataMap.events[eventId];
        const page = entry?.pages[block?._pageIndex];
        if (!block || block._erased || block._trigger !== 0 || !iceOpensPassage(entry, page)) return false;
        // Preserve the original selection across the native melt. Route work
        // retires at entry and resumes from a fresh settled observation.
        iceRoute = { scene, map, block, browser: owner.browser, started: false,job,owner,
            remote:!!job?.remote,autowalk:!!job?.autowalk };
        scene._wqaIceRoute = true;
        if(iceRoute.remote&&iceRoute.autowalk)scene._wqaAutowalkCleanup=true;
        return true;
    }

    function retainControlRoute(job, result) {
        const map = root.$gameMap, block = map._events[result.event];
        if (!job.autowalk || !block || block._erased || ![0,1].includes(block._trigger)) return null;
        // Reuse the existing narrowly gated native interaction continuation.
        // The browser remains on the original destination throughout the detour.
        iceRoute = { kind: 'control', scene: job.scene, map, block, browser: owner.browser,
            job,owner,remote:!!job.remote,autowalk:true,
            player: root.$gamePlayer, page: block._pageIndex, list: block.list(), gate: result.gate,
            source: TERRAIN_PAGES[job.map]?.[result.event]?.[0] ?? result.event,
            pullStage: [53,55].includes(job.map) ? root.$gameVariables?.value?.(4) : undefined,
            controller: job.controller, quest: job.quest, started: false };
        job.scene._wqaIceRoute = true;
        if(iceRoute.remote)job.scene._wqaAutowalkCleanup=true;
        return iceRoute;
    }

    function controlRouteCurrent(scene, eventId) {
        const route = iceRoute;
        if (route?.kind !== 'control' || route.scene !== scene || route.map !== root.$gameMap ||
            route.player !== root.$gamePlayer || route.player._transferring || host.manager._nextScene) return false;
        const id = eventId ?? route.map._interpreter?._eventId;
        return route.started && (id === route.block._eventId || id === route.source) &&
            (eventId !== undefined || route.block.isStarting() || route.map._interpreter?._list === route.list);
    }

    function clearIceRoute(scene) {
        if (iceRoute?.scene !== scene) return;
        scene._wqaIceRoute = false;
        const remote=iceRoute.remote&&iceRoute.autowalk;
        iceRoute = null;
        if(remote)scene._wqaAutowalkCleanup=cleanupWalk?.scene===scene;
    }

    function retire(scene, stepping = false, keepSpeech = false) {
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
        if (speech && !keepSpeech) notifications.close(speech);
        speech = 0;
    }

    function puzzleSpeech(job, record) {
        if(!record || !['routeDirections','timedDirections','patrolApproach','patrolWait','timedCue','patrolLineManual'].includes(record.kind))return record;
        if(job.action!=='puzzleGuide' && !job.caveWalk && !timedCave(root.$gameMap?._mapId) &&
            !(salt.available(job.scene)&&salt.active(job.scene)))return record;
        // Mark copied speech only: routes, native inputs and patrol safety
        // never depend on verbosity. Pickup retreats are current-step actions.
        return {...record,puzzleGuidance:true,verbosePuzzleGuidance:preferences().verbosePuzzleGuidance!==false,
            guideRequired:record.guideRequired===true || job.essentialGuide===true};
    }

    function present(job, record, moving = false) {
        if (active !== job) return;
        moving = moving || Number.isInteger(job.readoutToken);
        job.scene._wqaInteractionDeferred = false;
        if (!ready(job.scene, moving)) return;
        // Arrival and stop reports have their own command owner. Only
        // the requested route omits its heading in speech.
        if ((job.action === 'directions' || job.action === 'puzzleGuide') && record.kind === 'routeDirections') {
            const speakDestination = job.beaconStarted && job.controller && job.action === 'directions' &&
                preferences().speakBeaconDestination;
            record = { ...record, name: speakDestination ? job.label : record.name, directionsOnly: !speakDestination };
        }
        record = puzzleSpeech(job,record);
        const publish=job.autoReadout && notifications.continue ? notifications.continue : notifications.open;
        speech = publish(record, () => (active === job || readout.current(job.readoutToken)) && ready(job.scene, moving) &&
            (!job.quest || questDestinationCurrent(root, job.scene, job.quest)) &&
            (!job.questExit || chillcrestQuestExit(root)) &&
            (!job.sunriseExit || sunriseSequenceExit(root)) &&
            (!job.breakfastObjective || root.$gameParty?.getNav?.() === job.breakfastObjective) &&
            (!job.enemyCurrent || job.enemyCurrent()) &&
            (!job.npcCurrent || job.npcCurrent()) &&
            (!job.entrance || transfers.current(job.entrance)) &&
            (!job.groundEntrance || transfers.current(job.groundEntrance, 'walk')) &&
            (!job.scene._wqaPreviewUntil || host.graphics.frameCount < job.scene._wqaPreviewUntil));
    }

    function status(job, name) {
        if(job.solverToken || job.caveWalk?.solverToken)solver.stop();
        present(job, { kind: 'fieldStatus', name });
    }

    function navigationRequest(job) {
        return job && (job.action === 'directions' || job.action === 'currentDestination' ||
            job.action === 'puzzleGuide' && !!guideFor(job.scene) || BROWSE.has(job.action));
    }

    function follow(job, result, record, walkingJob = job) {
        record = puzzleSpeech(job,record);
        if (job.progress && (result.status === 'ready' || result.status === 'enemyBlocked')) {
            const first = result.legs[0];
            if (first) owner.routeProgress = { ...job.progress, x: job.x, y: job.y, ...first };
            else if (result.status === 'ready') owner.routeProgress = null;
        }
        if (job.autowalk && autowalk.start(walkingJob, result, record)) {
            // The movement owner now watches native outcomes. Ordinary
            // position notifications must leave its path narration admitted.
            job.scene._wqaRouteActive = false;
            if (job.caveWalk) announceCaveWalk(job);
            else if (!job.quietAutowalk && (result.distance > 0 || walkingJob.controlPrerequisite) &&
                !(result.autowalkStop && result.distance === 1))
                present(job, { kind: 'fieldStatus', name: 'Walking.' }, true);
            if (!job.quietAutowalk && speech && preferences().speakAutowalkPath) {
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
            job.scene._wqaInteractionDeferred = false;
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
        if(job.action==='directions'&&!job.autowalk&&!job.caveWalk&&!timedCave(job.map)) {
            record=chunkReadout(record,preferences());
            if(job.mode==='walk'&&!job.area) {
                const holder=owner,selection=browser,category=browser.category,id=browser.selections[category];
                const actor=root.$gameMap._events?.[job.target],page=actor?._pageIndex,x=actor?._x,y=actor?._y;
                job.readoutToken=readout.follow(job,record,()=>owner===holder&&browser===selection&&
                    browser.category===category&&browser.selections[category]===id&&
                    (!actor||root.$gameMap._events[job.target]===actor&&!actor._erased&&actor._pageIndex===page&&actor._x===x&&actor._y===y));
            }
        }
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
        const publicName = handoff && routeBoundary(root,result.boundaryEvent,preferences().spoilers === true,
            undefined,job.mode).boundaryName;
        const bump = gate === 'pull' && !handoff || !!edge && edge.action && root.$gameMap._events[event]?._trigger === 1;
        if (blocked) job.enemyCurrent = () => currentEnemy(root, result);
        startBeaconApproach(job, result, event);
        return follow(job, result, { kind: 'routeDirections', name: job.label, guide: text,
            legs: result.legs, facing: result.arrival.facing, more: result.more === true,
            exit: handoff || blocked ? undefined : exit, useExit: true, boundary: result.boundary,
            boundaryName: handoffCaption(handoff,publicName,preferences().spoilers === true),
            manualHandoff: !!handoff, enemyBlocked: blocked, enemy:result.enemy,
            bump, enter: edge?.action && !bump, reenter: result.reenter === true, takeExit: !!edge || bump },
            {...job,target:event,point:false,quest:null});
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
        if (autowalk.active(state.scene)) automaticSnapshot(snapshot, state.request?.event);
        const job = { scene: state.scene, sequence: ++sequence, beaconState: state, revision: state.revision };
        state.waiting = true;
        submit(job, snapshot, state.request);
        return true;
    }

    // A regional quest has no local coordinates. Preview only its checked
    // next entrance; never run the route's autowalk/beacon handoff on browse.
    function regionalSelection(job, result) {
        const { name, category } = job.regionalSelection;
        const edge = job.terrainApproach?.entrances.find(item => item.event === result?.entrance &&
            item.approach === result.approach);
        const event = edge && root.$gameMap._events?.[edge.event];
        const exit = event && !event._erased && transfers.current(edge) &&
            routeBoundary(root, edge.event, preferences().spoilers === true, edge).exit;
        if (!exit || !Number.isInteger(event._x) || !Number.isInteger(event._y))
            return present(job, { kind: 'fieldTarget', category, name: name + ', on another map' }, true);
        job.entrance = edge;
        return present(job, { kind: 'fieldTarget', category, name: name + ' via ' + exit,
            dx: event._x - root.$gamePlayer._x, dy: event._y - root.$gamePlayer._y }, true);
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
        if (job.regionalSelection) {
            // Movement changes the bearing, not the verified exit identity.
            // Compute the offset at reply time, and retain all native gates.
            if (active === job && ready(job.scene, true) && root.$gameMap._mapId === job.map &&
                travelMode(root.$gameMap, root.$gamePlayer) === job.mode &&
                root.$gameParty?.getNav?.() === job.breakfastObjective)
                regionalSelection(job, packet.result);
            else if (active !== job && navigationRequest(active) && ready(active.scene)) afterRender();
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
                (job.sunriseExit && !sunriseSequenceExit(root)) ||
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
            if (result?.airshipBoarding) {
                if (job.remote && !transfers.matchesState(job.remote.state))
                    return status(job, 'The entrance changed. Request directions again.');
                const aircraft = airshipJourney.board(job, result);
                if (!aircraft) return status(job, 'The airship route changed. Request directions again.');
                job.remote = job.landingBookmark = job.entrance = undefined;
                const destination = setRouteTarget(job, aircraft);
                job.request = { ...job.request, ...destination, event: undefined, transfer: undefined,
                    detour: undefined, stopBeforeEvent: false };
                job.airshipBoarding = true;
            }
            if(result?.boatFallback && !boatJourney.accept(job,result))return status(job,'Not currently reachable');
            if (result?.detourPoints && !localDetour.accept(job, result))
                return status(job, 'The entrance changed. Request directions again.');
            if (job.remote && result?.status === 'ready' && !admitRemoteRoute(job, result))
                return status(job, 'The entrance changed. Request directions again.');
            if (result?.status === 'patrolLine') {
                const { activate } = result;
                const record = { kind: 'routeDirections', name: job.label, legs: [], facing: result.arrival.facing,
                    activate, takeExit: !!activate, exit: activate ? job.label : undefined, guideAction: !activate };
                if (!autowalk.start(job, result, puzzleSpeech(job,record)))
                    return job.caveWalk ? waitCaveWalk(job) : status(job, 'Guard timing changed. Request directions again.');
                job.scene._wqaRouteActive = false;
                // Only verified cave puzzle events take an automatic final step.
                // Checkpoints and room exits retain their player-owned boundary.
                if (job.caveWalk && activate) job.caveContinue = false;
                announceCaveWalk(job);
                return;
            }
            if (job.caveWalk && result?.status === 'patrolLineApproach' && result.more)
                return startCaveSegment(job, result.legs);
            if (result?.status === 'patrolLineApproach') {
                const { legs, more, facing, activate } = result;
                if (more && manualApproach(job, legs)) return;
                return present(job, { kind: 'routeDirections', name: job.label, legs, facing, more, activate,
                    takeExit: !!activate, exit: activate ? job.label : undefined, guideAction: !more && !activate });
            }
            if (result?.status === 'patrolLineManual') {
                if (!job.timing)
                    return status(job, host.graphics._wqaCaveTimingEnabled ?
                        'Cave timing audio is unavailable. Request directions again.' :
                        'This crossing uses Cave timing assist in Secret Island settings. Turn it on and request directions.');
                const { legs, more, activate, facing } = result;
                const endText = more ? undefined : activate ?
                    '1 ' + PATROL_HEADINGS[activate] + '.' :
                    'Face ' + PATROL_HEADINGS[facing] + ' and press the action button.';
                if (!host.caveTiming.startManual(job.timing, job.line, job.x, job.y, result, endText, manualFollow(job, more)))
                    return status(job, 'Guard timing changed. Request directions again.');
                cave.trackTiming(job.scene);
                job.scene._wqaRouteActive = false;
                return present(job, { kind: 'fieldStatus', name: host.caveTiming.describe(job.scene) });
            }
            if (result?.status === 'timedCue' || result?.status === 'timedWait') {
                const opening = result.opening;
                if (job.caveWalk) {
                    const gate = opening && host.caveTiming.automaticGate(job.timing, opening);
                    if (!gate) return waitCaveWalk(job, opening?.urgent === true);
                    const headings = opening.headings || Array(opening.tiles).fill(DIRECTIONS.indexOf(opening.direction));
                    if (result.pickup) {
                        const course = Uint8Array.from(headings);
                        let { x, y } = job;
                        for (const heading of headings) {
                            x = root.$gameMap.roundXWithDirection(x, DIRECTIONS[heading]);
                            y = root.$gameMap.roundYWithDirection(y, DIRECTIONS[heading]);
                        }
                        return follow(job, { status: 'ready', distance: course.length, course, gate,
                            arrival: { x, y, facing: result.pickup.facing } }, { kind: 'routeDirections',
                            legs: [{ direction: opening.direction, tiles: opening.tiles }], facing: result.pickup.facing,
                            guide: 'Open the barrel, then move 1 ' + PATROL_HEADINGS[result.pickup.retreat] + '.' });
                    }
                    return startCaveSegment(job, headings.map(heading => ({ direction: DIRECTIONS[heading], tiles: 1 })),
                        gate, opening.terminal);
                }
                const direction = opening?.direction ?? result.direction;
                const tiles = opening?.tiles ?? result.tiles;
                const headings = opening?.headings ?? result.headings;
                const pace = opening?.pace ?? result.pace;
                const target = result.guideEvent === undefined ? job.destination :
                    job.guideOptions?.find(item => item.target.id === result.guideEvent)?.target;
                const stopAtPocket = result.stopAtPocket === true;
                const repeat = opening?.escape && !stopAtPocket ? undefined : { direction, tiles, headings, pace, stopAtPocket,
                    endText: result.pickup ? 'Face ' + PATROL_HEADINGS[result.pickup.facing] +
                        ' and open the barrel, then move 1 ' + PATROL_HEADINGS[result.pickup.retreat] + '.' : undefined,
                    refresh: opening?.escape ? null :
                        state => refreshCaveTiming(job, state, target, direction, tiles, headings, pace, stopAtPocket) };
                if (job.timing && host.caveTiming.start(job.timing, job.x, job.y, opening, repeat, manualFollow(job, !result.pickup))) {
                    cave.trackTiming(job.scene);
                    if (opening?.terminal || result.terminal)
                        manualTerminal(job, headings || Array(tiles).fill(DIRECTIONS.indexOf(direction)));
                    return present(job, { kind: 'fieldStatus', name: host.caveTiming.describe(job.scene) });
                }
                return present(job, { kind: 'patrolWait', direction, guide: job.guide });
            }
            if (result?.status === 'patrolBlocked') {
                const target = !job.caveBlocker && distractionForGuard(root, result.guard);
                const motion = target && captureMotion(root, host.graphics);
                const snapshot = motion && captureWorld(root, true, undefined, undefined, [], true);
                if (snapshot) {
                    job.caveCrystal = !!job.caveWalk;
                    if (!job.caveWalk) {
                        setManualAction({ scene: job.scene, map: root.$gameMap, player: root.$gamePlayer,
                            eventId: target.id, destination: job.destination, action: null, isCrystal: true,
                            resume: true, nextAction: job.action, controller: job.controller });
                        cave.arm(job.scene);
                    }
                    job.caveBlocker = result.guard;
                    job.guideOptions = null;
                    job.readyGuide = '';
                    // The actual route now ends at the crystal. Its action
                    // instruction follows the walking legs, not a barrel route.
                    job.guide = undefined;
                    return route(job, snapshot, target, undefined, motion);
                }
                return status(job, 'Blocked by a stationary Mech Guard.');
            }
            if (result?.status === 'unsafeCrossing' && job.map === 200 && !result.exposed) {
                if (job.caveWalk) return waitCaveWalk(job);
                return waitManual(job);
            }
            if (result?.status === 'unsafeCrossing' && result.exposed) return retire(job.scene);
            if (result?.status === 'unsafeCrossing') return status(job, 'No crossing to a safe stopping point is verified here.');
            if (job.caveWalk && result?.status === 'patrolApproach')
                return startCaveSegment(job, [{ direction: result.direction, tiles: result.tiles }],
                    null, result.terminal);
            if (result?.status === 'patrolApproach' && manualApproach(job,
                [{ direction: result.direction, tiles: result.tiles }], result.terminal)) return;
            if (result?.status === 'patrolApproach')
                return present(job, { kind: 'patrolApproach', direction: result.direction, tiles: result.tiles,
                    terminal: result.terminal, guide: job.guide });
            else if (result?.status === 'ready') {
                if (result.pickup) {job.guide = 'Open the barrel, then move 1 ' + PATROL_HEADINGS[result.pickup.retreat] + '.';job.essentialGuide=true;}
                if (job.readyGuide) job.guide = job.readyGuide;
                if (result.land && !canLand(root.$gameMap, result.arrival.x, result.arrival.y))
                    return status(job, 'Landing site changed. Request directions again.');
                if (result.land) airshipJourney.landing(job, result);
                else airshipJourney.discovery(job);
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
                if (job.caveWalk && result.autowalkStop && !result.more &&
                    caveAction(job.scene, root.$gameMap._events[job.target]))
                    return startCaveSegment(job, result.legs, null, true, job.target, true);
                const exit = !result.land && !job.entrance?.sameScene &&
                    (job.entrance || job.destination?.category === 'exits' || job.questExit || job.sunriseExit || job.breakfastObjective === 'quest26') &&
                    routeBoundary(root, job.target, preferences().spoilers === true, job.entrance, job.mode).exit;
                const exitEvent = exit && root.$gameMap._events?.[job.target];
                const bump = job.eventAction === 'bump' || !!exitEvent && exitEvent._trigger === 1 && exitEvent._priorityType === 1;
                follow(job, result, { kind: 'routeDirections', name: job.label, guide: job.guide,
                    distractionCrystal: !!job.caveBlocker,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    reenter: result.reenter === true, enter: job.entrance?.action ?? exitEvent?._trigger === 0,
                    exit, takeExit: !!exit, onward: job.onward,
                    sailing: job.mode === 'ship' || job.mode === 'boat',
                    bump,
                    conversation: job.eventAction === 'talk',
                    board: !!job.vehicle, boardName: job.airshipBoarding ? 'airship' : undefined, land: result.land === true,
                    guideAction: job.eventAction === 'interact' ||
                        job.action === 'puzzleGuide' && !!result.arrival.facing && !!saltControlName(job.target),
                    discovery: result.discovery && worldBoundaryName(root, result.discovery, preferences().spoilers === true) });
            }
            else if (result?.status === 'iceRoute') {
                if (!retainIceRoute(job.scene, result.event, job))
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
                    115: 'The return opens after the rescue encounter.',
                    119: 'Speak to Elder Tater to open the way.',
                    145: 'The crystal opens the passage.'
                }[result.gate];
                startBeaconApproach(job, result, result.event);
                const retained = retainControlRoute(job, result);
                // Numeric terrain gate IDs are not timed-patrol callbacks.
                // Keep that completion condition only on the inert handoff.
                follow(job, { ...result, gate: undefined }, { kind: 'routeDirections', name: job.label,
                    legs: result.legs, facing: result.arrival.facing, guide: reason,
                    more: result.more === true, prerequisite,
                    prerequisiteMove: result.step ? result.boundary : undefined },
                { ...job, target: result.event, quest: null, point: false, vehicle: undefined,
                    nearestLanding: false, controlPrerequisite: !!retained });
            }
            else if (result?.status === 'saltRoute') {
                const event = result.actions?.[0];
                const kind = result.prerequisiteKind;
                const prerequisite = saltControlName(event) || (kind === 'encounter' ? 'an encounter' :
                    event === 105 ? 'the torch reminder' : event === 18 ? 'the cave conversation' : '');
                if (!prerequisite) return status(job, 'Crystal directions unavailable');
                startBeaconApproach(job, result, event);
                follow(job, result, { kind: 'routeDirections', name: job.label, guide: job.guide,
                    legs: result.legs, facing: result.arrival.facing, more: result.more === true,
                    prerequisite, prerequisiteMove: kind !== 'action' ? result.boundary : undefined,
                    remainingActions: result.actions.length - 1 },
                    {...job,target:event,point:false,vehicle:undefined});
            }
            else if (result?.status === 'npcBlocked') {
                const gate = npcPassage(root.$gameMap);
                if (gate?.event !== result.npc)
                    return status(job, 'The passage changed. Request directions again.');
                job.npcCurrent = () => npcPassage(root.$gameMap) === gate;
                // A warning conversation is a player-owned stopping point.
                startBeaconApproach(job, result, gate.event);
                follow(job, result, { kind: 'routeDirections', name: job.label, legs: result.legs,
                    npcBlocker: destinationName(root.$gameMap,gate.event,gate.name), facing: result.arrival.facing, more: result.more === true },
                { ...job, target: gate.event, point: false, controlPrerequisite:false });
            }
            else if (result?.status === 'enemyBlocked') {
                if (!currentEnemy(root, result)) {
                    if (job.autowalk || job.retries < ACTOR_RETRIES) {
                        if (!job.autowalk) job.retries++;
                        job.performed = false;
                        return afterRender();
                    }
                    return status(job, 'The enemy moved. Request directions again.');
                }
                const terrain = result.terrain;
                const next = terrain?.status === 'iceRoute' ? 'the ice block' : CONTROLS[job.map]?.[terrain?.event];
                if (terrain?.status === 'iceRoute' && !retainIceRoute(job.scene, terrain.event, job))
                    return status(job, 'The ice changed. Request directions again.');
                if (host.beacon?.enabled()) {
                    const request = next ? { event: terrain.event, field: true, beacon: true, limit: 8 } :
                        { ...job.request, autowalk: false, beacon: true };
                    job.beaconStarted = host.beacon.start(job.scene, next ? terrain.event : job.target, job.x, job.y, result,
                        null, undefined, { quest: job.quest, point: job.point, request,
                            enemyCurrent: obstacle => currentEnemy(root, obstacle), alreadyReported: true });
                }
                job.enemyCurrent = () => currentEnemy(root, result);
                const record = { kind: 'routeDirections', name: job.label, legs: result.legs, enemy:result.enemy,
                    enemyBlocked: true, boundary: result.boundary, more: result.more === true, afterEnemy: next };
                // A remote goal has no local event until its final entrance
                // is admitted. This certified prefix ends before the enemy,
                // not at that entrance. Keep the remote journey intact and
                // walk the owned point course; moving blockers still recapture
                // the original destination through the normal silent reroute.
                follow(job, result, record, job.remote || job.terrainOnward ? { ...job, target: undefined, point: true, quest: null } : job);
            }
            else if (result?.status === 'interrupted') {
                if (!job.autowalk && job.map === 201) {
                    const leg = chaseGuide.approach(job.scene, result);
                    if (leg) return present(job, leg);
                }
                // A route can expose only its first eight legs. Its event
                // boundary is still farther away; walk this safe prefix and
                // recapture before adding the final interaction step.
                if(job.caveWalk && result.more)return startCaveSegment(job,result.legs,null,false,undefined,true);
                if (job.caveWalk && result.boundary && caveAction(job.scene, root.$gameMap._events[result.boundaryEvent]))
                    return startCaveSegment(job, [...result.legs, { direction: result.boundary, tiles: 1 }],
                        null, true, result.boundaryEvent, true);
                if (!job.caveWalk && result.boundary && caveAction(job.scene, root.$gameMap._events[result.boundaryEvent]) &&
                    manualApproach(job, [...result.legs, { direction: result.boundary, tiles: 1 }], true)) return;
                const regional = BREAKFAST_HANDOFFS[job.map]?.[result.boundaryEvent];
                const handoff = regional || (job.request.handoffs?.includes(result.boundaryEvent) || !job.eventAction) &&
                    localHandoffName(job.map, result.boundaryEvent);
                const { exit, boundaryName } = routeBoundary(root, result.boundaryEvent, preferences().spoilers === true,
                    undefined, job.mode);
                if (!job.request.motion) startBeaconApproach(job, result, result.boundaryEvent);
                const useExit = !!exit && (job.target === result.boundaryEvent ||
                    job.request.handoffs?.includes(result.boundaryEvent));
                const activate = job.eventAction === 'step' && job.target === result.boundaryEvent ? result.boundary : undefined;
                const record={ kind: 'routeDirections', name: job.label, legs: result.legs, boundary: result.boundary,
                    guide: job.guide, activate, exit, useExit,
                    boundaryName: handoffCaption(handoff,boundaryName,preferences().spoilers === true,!!activate) ||
                        (!activate && !job.eventAction && worldBoundaryName(root, result.boundaryEvent, preferences().spoilers === true)),
                    manualHandoff: !!handoff || !!boundaryName && (job.sunriseExit || job.action === 'puzzleGuide' || job.mode === 'ship' || timedCave(job.map)),
                    more: result.more === true };
                follow(job,result,record,(job.remote||job.terrainOnward)&&!job.target?{...job,target:undefined,point:true,quest:null}:job);
            }
            else if (job.remote && ['unreachable', 'approachBlocked', 'unavailable'].includes(result?.status))
                status(job, 'No verified reachable entrance');
            else if (['unreachable', 'approachBlocked'].includes(result?.status)) {
                if (job.guide) return status(job, job.guide + ' No verified route from here.');
                if (job.map === 87 && job.target === 79)
                    return status(job, 'This cave mouth is separate from the main cavern. It is reached from the east side of Cracked Cove.');
                if (job.map === 191 && job.target === 2)
                    return status(job, 'The west cave entrance is on a separate shore.');
                const closedDoor = job.mode === 'walk' && closedRuinsDoorReason(root, job.target);
                if (closedDoor) return status(job, closedDoor);
                const reason = job.mode === 'walk' ? 'Not currently reachable' : job.mode === 'airship' ?
                    'No connected landing' : 'No sailing route';
                status(job, job.nearestLanding ? 'No landing site is available' : reason);
            }
            else if (result?.status === 'unavailable') status(job, 'Directions unavailable');
            else retire(job.scene);
        } else if (navigationRequest(active) && ready(active.scene)) afterRender();
    }

    function submit(job, snapshot, request, filtering = false) {
        if(!filtering&&job.action==='directions'&&!job.autowalk&&!job.caveWalk&&!job.area&&!timedCave(snapshot.map))
            request={...request,limit:readoutLimit(preferences())};
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
                        if (dropped.regionalSelection) regionalSelection(dropped);
                        else status(dropped, dropped.filter ? 'Reachable destinations unavailable' : 'Directions service unavailable');
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
            else if (job.regionalSelection) regionalSelection(job);
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

    function setRouteTarget(job, target) {
        job.label = target.name;
        job.destination = target;
        const destination = destinationRequest(target);
        job.target = destination.event;
        job.eventAction = target.eventAction;
        job.questExit = target.questExit === true;
        job.sunriseExit = target.sunriseExit === true;
        job.point = target.point === true;
        job.vehicle = target.vehicle && { type: target.vehicle, x: target.x, y: target.y };
        job.nearestLanding = target.nearestLanding === true;
        return destination;
    }

    function automaticSnapshot(snapshot, selectedEvent) {
        // Only numeric copied rows are altered. Bookkeeping floor triggers do
        // not block the worker's automatic course; the native input owner
        // still stops at each touch and resumes after its exact event ends.
        // The explicitly selected touch remains an action: even a flag-only
        // page can activate an encounter through a separate native autorun.
        if (snapshot.mode !== 'walk' || timedCave(snapshot.map)) return;
        const manualSteps=new Set();
        for(const item of snapshot.objects||[])if(['step','bump'].includes(item.eventAction))manualSteps.add(item.id);
        for (const row of snapshot.live?.events || []) {
            if (row.id === selectedEvent || !row.action || row.normal || ![1, 2].includes(row.trigger)) continue;
            // A named scene/encounter is a real interaction even when its
            // first page only sets a flag for a separate native autorun.
            if(manualSteps.has(row.id))continue;
            const event = root.$gameMap._events[row.id];
            const page = root.$dataMap?.events[row.id]?.pages[event?._pageIndex];
            if (event?._x === row.x && event._y === row.y && passiveFloorPage(page)) row.action = false;
        }
    }

    function route(job, snapshot, target, area, motion) {
        const destination = setRouteTarget(job, target);
        job.area = area;
        job.autowalk = (job.action !== 'puzzleGuide' || snapshot.map===19) && preferences().autowalk;
        if (job.autowalk) automaticSnapshot(snapshot, destination.event);
        job.caveAll=job.autowalk && solver.enabled() && caveSolverMap(snapshot.map);
        if (job.autowalk && (automaticCaveMap(snapshot.map) || job.caveAll)) {
            job.caveWalk ||= { destination: target, attempt: 0, acted: new Set(), announced: false };
            if (job.caveWalk.x !== snapshot.x || job.caveWalk.y !== snapshot.y)
                Object.assign(job.caveWalk, { x: snapshot.x, y: snapshot.y, attempt: 0, replans: 0 });
            job.caveAction = (event, automatic) => expectCaveAction(job, event, automatic);
            const action = caveAction(job.scene, root.$gameMap._events[job.target]);
            job.caveLoot = !!action?.loot;
            job.caveCrystal = !!action?.crystal && !action.blocked;
        }
        // Capture recovery can select a crystal itself. It then bypasses the
        // stationary-blocker branch, but still needs a fresh continuation on
        // every accepted activation, including the branch with no dialogue.
        if (!job.caveWalk && motion && snapshot.map === 200 && manualAction?.eventId !== job.target) {
            const action = caveAction(job.scene, root.$gameMap._events[job.target]);
            if (action?.crystal && !action.blocked) {
                setManualAction({ scene: job.scene, map: root.$gameMap, player: root.$gamePlayer,
                    eventId: job.target, destination: target, action: null, isCrystal: true,
                    resume: true, nextAction: 'puzzleGuide', controller: job.controller });
                cave.arm(job.scene);
            }
        }
        job.motionFrame = motion?.frame;
        job.line = capturePatrolLine(root, motion, job.target);
        const lineNavigation = job.line && (job.caveWalk ? true : 'manual');
        if (motion) {
            host.caveTiming?.warm(job.scene);
            job.timing = host.caveTiming?.capture(job.scene, motion, target, !!job.caveWalk);
        }
        const terrainTransfer = snapshot.live?.terrainGate === false && !job.journey &&
            snapshot.live.terrainSwitch === 97 ? terrainTransferRequest(job, STONE_ISLAND) : undefined;
        const guideOptions = motion && job.guideOptions?.map(({ target }) => destinationRequest(target));
        const followedDirection = !motion && !area ? routeProgress(job, snapshot, target, destination.event) : undefined;
        const detour = localDetour.prepare(job, snapshot, target);
        const boatFallback = boatJourney.prepare(job,snapshot,target);
        submit(job, snapshot, { ...destination, detour, boatFallback, terrainTransfer, guideOptions, followedDirection,
            saltTerrainOnly: snapshot.map===19 && (job.saltTerrainOnly || salt.active(job.scene) && [3,4,5,6].includes(job.target)),
            stopBeforeEvent: job.eventAction === 'step',
            limit: 8, area, motion, field: true, landing: snapshot.mode === 'airship' && !job.point,
            surface: snapshot.mode !== 'walk', patrolGuidance: !!motion,
            beacon: !motion && host.beacon?.enabled() === true, autowalk: job.autowalk, timingCue: !!job.timing,
            recoverPatrolLane: snapshot.map === 200,
            distractionCrossing: snapshot.map === 200 &&
                (!!job.caveWalk?.distractionCrossing || manualCrossing?.scene === job.scene &&
                    manualCrossing.map === root.$gameMap && manualCrossing.player === root.$gamePlayer) &&
                snapshot.x === 34 && snapshot.y === 14,
            pickupEscape: job.caveWalk?.pickupEscape === true,
            lineNavigation });
    }

    function announceCaveWalk(job) {
        if (!job.caveWalk.announced) {
            job.caveWalk.announced = true;
            present(job, { kind: 'fieldStatus', name: 'Walking.' }, true);
        }
    }

    function clearCleanupWalk() {
        if (cleanupWalk) cleanupWalk.scene._wqaAutowalkCleanup =
            !!(iceRoute?.scene===cleanupWalk.scene&&iceRoute.remote&&iceRoute.autowalk);
        cleanupWalk = null;
    }

    function cleanupCurrent(pending) {
        return pending && pending.scene === host.manager._scene && pending.map === root.$gameMap &&
            pending.player === root.$gamePlayer && !host.manager._nextScene && !pending.player._transferring &&
            (pending.prerequisite && pending.accepted || pending.player._x === pending.x && pending.player._y === pending.y) &&
            pending.map._events[pending.event._eventId] === pending.event && preferences().autowalk &&
            travelMode(pending.map, pending.player) === pending.job.mode &&
            (!pending.job.quest || questDestinationCurrent(root, pending.scene, pending.job.quest));
    }

    function cleanupAutowalk(job, event, page, x, y) {
        if (!ready(job.scene) || !preferences().autowalk ||
            event.list() !== page.list || root.$dataMap?.events?.[event._eventId]?.pages[event._pageIndex] !== page) return false;
        const prerequisite=job.prerequisiteFloor===event._eventId;
        if (prerequisite && pageMayTransfer(page,root.$dataCommonEvents)) return false;
        // Retain one exact same-map event identity, not a movement lease.
        // A proved prerequisite may move Wendy natively before completion;
        // explicit manual takeover cancels this token before it can resume.
        // Native event acceptance closes all work gates as usual. Nothing is
        // resumed until the same scene publishes normal field readiness.
        job.scene._wqaAutowalkCleanup = true;
        cleanupWalk = { scene: job.scene, map: root.$gameMap, player: root.$gamePlayer,
            event, list: page.list, owner, job, x, y, prerequisite, accepted: false };
        return true;
    }

    function rerouteAutowalk(job) {
        const { scene } = job;
        if (!preferences().autowalk || !ready(scene)) return false;
        enemyWalk.cancel();
        retire(scene);
        host.beacon?.stop(scene);
        // Preserve the selected destination and journey owners. Timed caves
        // still use their native-state patrol solver, never an ordinary route.
        queue({ scene, action: 'directions', changes: [], retries: 0, controller: job.controller,
            quietAutowalk: true, caveWalk: job.caveWalk });
        return true;
    }

    function resumeCaveWalk(job, chase) {
        const { scene, caveWalk } = job;
        if (!preferences().autowalk) return retire(scene);
        if (!ready(scene)) {
            // Native refresh completes independently. Keep only the owned
            // request, and recapture after the established ready boundary.
            if (root.$gameMap?._mapId === 200 && root.$gameMap._needsRefresh) {
                caveResume = { scene, map: root.$gameMap, player: root.$gamePlayer, job };
                host.graphics._wqaCaveAutoPending = true;
            }
            return retire(scene);
        }
        if(caveWalk?.solverToken)browserOwner(scene);
        queue({ scene, action: 'directions', caveWalk, chase, changes: [] });
    }

    function caveAction(scene, event) {
        if (!event || event._erased) return null;
        const expanded=solver.enabled() && root.$gameMap?._mapId===206 && event._eventId===11;
        if(!automaticCaveMap(root.$gameMap?._mapId) && !expanded)return null;
        if(expanded && !solverActionAllowed(root,scene,event))return null;
        const map = root.$gameMap;
        const list = event.list();
        if (list !== root.$dataMap.events[event._eventId]?.pages[event._pageIndex]?.list) return null;
        return acceptedAction(root, scene, event) || caveLootAction(root, scene, event) ||
            (checkpointTarget(map._mapId, event._eventId, event._pageIndex, event._trigger) ?
                { scene, origin: map._mapId, event, list, checkpoint:true } : null);
    }

    function setManualAction(value) {
        manualAction = value;
        host.graphics._wqaCaveManualPending = !!value?.action;
    }

    function sameCaveAction(pending, scene, eventId) {
        const action = pending?.action || pending;
        const map = root.$gameMap;
        if (!action?.event || pending.scene !== scene || pending.map !== map || pending.player !== root.$gamePlayer ||
            map._events[action.event._eventId] !== action.event || root.$gamePlayer._transferring || host.manager._nextScene)
            return false;
        if (eventId === action.event._eventId) return true;
        // Text and cold native resources retire all active output without an
        // event ID. Keep only this inert accepted token during its own script;
        // the usual ready gate must still admit any later route or speech.
        const main = map._interpreter;
        return eventId === undefined && main?._eventId === action.event._eventId && main._list === action.list;
    }

    function queuedCaveInteraction(pending, scene) {
        const map = root.$gameMap;
        if (!pending || pending.scene !== scene || pending.map !== map || pending.player !== root.$gamePlayer ||
            scene !== host.manager._scene || host.manager._nextScene || root.$gamePlayer._transferring) return false;
        const event = pending.event || map._events[pending.eventId];
        const action = caveAction(scene, event);
        return !!(event?.isStarting() && (!pending.list || event.list() === pending.list) &&
            action);
    }

    function expectCaveAction(job, event, automatic = false) {
        const action = caveAction(job.scene, event);
        if (!action || automatic && !(job.caveAll && solver.enabled()) && !automaticCaveAction(action)) return false;
        if(job.caveWalk?.solverToken && !solver.current(job.caveWalk.solverToken))return false;
        if(solver.active())solver.prepare(action);
        if (!job.caveArrives) {
            if (job.caveWalk.acted.has(event._eventId)) return false;
            job.caveWalk.acted.add(event._eventId);
            if (action.origin === 200 && action.crystal && event._eventId === 10) job.caveWalk.distractionCrossing = true;
            caveEvent = { ...action, map: root.$gameMap, player: root.$gamePlayer, caveWalk: job.caveWalk,
                requestedAt: host.graphics.frameCount };
            host.graphics._wqaCaveAutoPending = true;
        }
        return true;
    }

    function clearCaveEvent() {
        caveEvent = null;
        host.graphics._wqaCaveAutoPending = !!caveResume;
    }

    function clearCaveResume() {
        caveResume = null;
        host.graphics._wqaCaveAutoPending = !!caveEvent?.accepted;
    }

    function waitCaveWalk(job, urgent = false) {
        const limit = urgent ? 8 : job.map === 200 ? 60 : 30;
        if (++job.caveWalk.attempt > limit || !autowalk.wait(job, urgent ? 1 : 18))
            return urgent ? retire(job.scene) : status(job, 'Autowalk stopped. No safe opening verified. Request directions again.');
        job.caveContinue = true;
        announceCaveWalk(job);
    }

    function startCaveSegment(job, legs, gate = null, terminal = false, expectedFloor, ordinary = false) {
        let { x, y } = job;
        const length = legs.reduce((total, leg) => total + leg.tiles, 0);
        if (!Number.isInteger(length) || length <= 0 || length > 128)
            return status(job, 'Autowalk stopped. The crossing changed.');
        const course = new Uint8Array(length);
        const map = root.$gameMap;
        let at = 0;
        for (const { direction, tiles } of legs) {
            const heading = DIRECTIONS.indexOf(direction);
            if (heading < 0) return status(job, 'Autowalk stopped. The crossing changed.');
            for (let i = 0; i < tiles; i++) {
                x = map.roundXWithDirection(x, direction);
                y = map.roundYWithDirection(y, direction);
                course[at++] = heading;
            }
        }
        if (terminal) {
            const floor = root.$gamePlayer.findEventsAt(x, y).find(event =>
                root.$gamePlayer.canTriggerEvent(event, [1, 2], false) && event.list()?.length > 1);
            if (!caveAction(job.scene, floor) || expectedFloor && floor._eventId !== expectedFloor)
                return status(job, 'Autowalk stopped. The crossing ends at an unverified event.');
            job.caveFloor = floor._eventId;
            job.caveArrives = floor._eventId === (job.caveWalk.destination.event ?? job.caveWalk.destination.id);
        }
        job.caveContinue = !terminal && !job.caveWalk.pickupEscape;
        if (!autowalk.start(job, { status: ordinary ? 'ready' : undefined,
            distance: course.length, course, gate, arrival: { x, y, facing: null } },
            puzzleSpeech(job,{ kind: 'routeDirections', name: job.label, legs, guide: terminal ? job.guide : undefined })))
            return status(job, 'Autowalk stopped. The crossing changed. Request directions again.');
        announceCaveWalk(job);
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
            job.autowalk=preferences().autowalk;
            if(job.autowalk)automaticSnapshot(snapshot);
            return submit(job, snapshot, { field: true, limit: 8, autowalk:job.autowalk, beacon: host.beacon?.enabled() === true,
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
            if (boatJourney.resume(job,snapshot,remoteDirections,route,status,target=>{owner.browser.category=target.category;owner.browser.selections[target.category]=target.id;}) ||
                localDetour.resume(job, snapshot, remoteDirections, route,()=>status(job,'Destination no longer available.')) ||
                resumeShoreJourney(job, snapshot) || resumeTerrainJourney(job, snapshot)) return;
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
        job.destination = target;
        if (target.saved) return selectSavedBookmark(job, snapshot, target.saved, category);
        owner.remoteBookmark = null;
        job.breakfastObjective = target.breakfastObjective;
        if (target.breakfastRegion) {
            if (job.action !== 'directions') {
                job.regionalSelection = { name: target.name, category };
                // A preceding filter may have transferred its terrain buffer.
                // This preview owns a fresh routing snapshot for its own send.
                const local = captureWorld(root, true, undefined, undefined, [], true);
                if (!local) return regionalSelection(job);
                return submit(job, local, { field: true, limit: 8, transfer: terrainTransferRequest(job, STONE_ISLAND) });
            }
            job.label = target.name;
            job.terrainOnward = true;
            job.autowalk=preferences().autowalk;
            if(job.autowalk)automaticSnapshot(snapshot);
            return submit(job, snapshot, { field: true, limit: 8, autowalk:job.autowalk, beacon: host.beacon?.enabled() === true,
                transfer: terrainTransferRequest(job, STONE_ISLAND) });
        }
        // Guards are moving hazards. Directions reads their current bearing
        // without making contact with them a route goal.
        if (job.action !== 'directions' || target.patrol) return present(job, { kind: 'fieldTarget',
            name: job.action === 'directions' && target.patrol ? '' : target.name, category,
            directionsObtained: target.directionsObtained === true,
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

    function refreshCaveTiming(command, state, target, direction, tiles, headings, pace, pocket) {
        const { scene } = command;
        if (!host.caveTiming.current(state) || inFlight || !target || sequence >= 0x7ffffffe || !ready(scene)) return false;
        const motion = captureMotion(root, host.graphics);
        const captured = motion && host.caveTiming.capture(scene, motion, target);
        const snapshot = captured && captureWorld(root, true, undefined, undefined, [], true);
        if (!snapshot) return false;
        const job = { scene, sequence: ++sequence, caveRefresh: { state, captured } };
        submit(job, snapshot, { ...destinationRequest(target), field: true, motion, patrolGuidance: true,
            timingCue: true, timingDirection: direction, timingTiles: tiles, timingHeadings: headings,
            timingPace: pace, timingPocket: pocket });
        return inFlight === job;
    }

    function manualFollow(job, resume = true) {
        if (job.caveWalk || ![196, 199, 200].includes(job.map)) return undefined;
        cave.arm(job.scene);
        return { complete: resume ? () => {
            if (ready(job.scene) && !preferences().autowalk)
                command(job.action === 'puzzleGuide' ? 'puzzleGuide' : 'directions', undefined, job.controller);
        } : undefined };
    }

    function waitManual(job) {
        const map = root.$gameMap, player = root.$gamePlayer;
        if (!manualWait || manualWait.scene !== job.scene || manualWait.map !== map || manualWait.player !== player ||
            manualWait.target !== job.target || manualWait.x !== job.x || manualWait.y !== job.y)
            manualWait = { scene: job.scene, map, player, target: job.target, x: job.x, y: job.y, attempts: 0 };
        if (++manualWait.attempts > 60) return retire(job.scene);
        const captured = job.timing || host.caveTiming.capture(job.scene, job.request.motion, job.destination, true);
        if (!host.caveTiming.wait(captured, job.x, job.y, manualFollow(job))) retire(job.scene);
    }

    function manualTerminal(job, headings) {
        if (!headings || job.caveWalk) return;
        const map = root.$gameMap;
        let { x, y } = job;
        for (const heading of headings) {
            x = map.roundXWithDirection(x, DIRECTIONS[heading]);
            y = map.roundYWithDirection(y, DIRECTIONS[heading]);
        }
        const event = root.$gamePlayer.findEventsAt(x, y).find(item =>
            root.$gamePlayer.canTriggerEvent(item, [1, 2], false) && caveAction(job.scene, item));
        if (!event) return;
        setManualAction({ scene: job.scene, map, player: root.$gamePlayer, eventId: event._eventId,
            destination: job.destination, action: null, isCrystal: false,
            resume: job.action === 'puzzleGuide' || job.destination?.id !== event._eventId,
            nextAction: job.action, controller: job.controller });
    }

    function manualApproach(job, legs, terminal = false) {
        const follow = manualFollow(job);
        if (!follow) return false;
        const captured = job.timing || host.caveTiming.capture(job.scene, job.request.motion, job.destination, true);
        if (!host.caveTiming.startApproach(captured, job.x, job.y, legs, follow)) return false;
        if (terminal) manualTerminal(job, legs.flatMap(leg => Array(leg.tiles).fill(DIRECTIONS.indexOf(leg.direction))));
        present(job, { kind: 'fieldStatus', name: host.caveTiming.describe(job.scene) });
        return true;
    }

    function timedRoute(job, snapshot, target) {
        if (snapshot.map === 200 && snapshot.x === 20 && snapshot.y === 18) manualCrossing = null;
        if (snapshot.map === 201 && !preferences().autowalk) chaseGuide.arm(job.scene);
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
            transfers.arm(job.scene, {...selection,autowalk:job.autowalk&&job.mode==='walk'}, discovery);
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
        transfers.arm(job.scene, {...selection,autowalk:job.autowalk&&job.mode==='walk'}, entrance);
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
        if(job.autowalk)automaticSnapshot(snapshot);
        const point = bookmark.kind === 'point' ? { x: bookmark.x, y: bookmark.y } : undefined;
        const copy = ({ event, map, x, y, approach }) => ({ event, map, x, y, approach });
        const shipLanding = island && { event: island.event, x: island.x, y: island.y, facing: island.facing };
        submit(job, snapshot, { limit: 8, field: true, landing, shipLanding, autowalk: job.autowalk,
            beacon: host.beacon?.enabled() === true, transfer: { map: bookmark.map, point, points: bookmark.points, state, trail,
                world: bookmark.world, worldMap: bookmark.worldMap, verifiedOnly: bookmark.verifiedOnly, worldEntries: bookmark.worldEntries,
                candidates: current.map(copy), ground: island ? ground.map(copy) : undefined,
                discoveries: transfers.discoveries(island ? ground : current) } });
    }

    function perform(job) {
        const movingReport = job.action === 'navigationReport';
        if (active !== job || job.step || job.idle || !ready(job.scene, movingReport)) return;
        if (navigationRequest(job) && inFlight) return;
        if (movingReport) return present(job, job.text, true);
        if (job.action === 'status') return status(job, job.text);
        const routing = job.action === 'directions';
        if (job.caveWalk) {
            if(job.caveWalk.solverToken && !solver.current(job.caveWalk.solverToken))return retire(job.scene);
            const snapshot = captureWorld(root, true);
            if (!snapshot) return status(job, 'Map information unavailable.');
            job.performed = true;
            if (snapshot.map === 200 && snapshot.x === 20 && snapshot.y === 18) job.caveWalk.distractionCrossing = false;
            if (job.chase) {
                Object.assign(job, { map: snapshot.map, mode: snapshot.mode, x: snapshot.x, y: snapshot.y,
                    label: job.caveWalk.destination.name, target: job.caveWalk.destination.event ?? job.caveWalk.destination.id,
                    caveAction: (event, automatic) => expectCaveAction(job, event, automatic) });
                return startCaveSegment(job, job.chase.legs, null, true, job.chase.next);
            }
            return timedCave(snapshot.map) ? timedRoute(job, snapshot, job.caveWalk.destination) :
                route(job, snapshot, job.caveWalk.destination);
        }
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
        airshipJourney.decorate(job.scene, snapshot, browser);
        if (navigationRequest(job)) snapshot.bookmarks = bookmarks;
        if (filtering && snapshot.objects.length) {
            job.scene._wqaQuestNavigation = snapshot.objects.some(target => !!target.quest);
            return submit(job, snapshot, { candidates: snapshot.objects.map(destinationRequest) }, true);
        }
        job.performed = true;
        if (puzzleGuide && solver.enabled() && solver.available()) {
            if(!solver.active() && !solver.start())return retire(job.scene);
            cave.arm(job.scene);
            if(solver.waitingNative())return retire(job.scene);
            const next=solver.next(snapshot.objects);
            if(next?.complete || next?.declined) {
                job.solverToken=undefined;
                return status(job,next.complete ? 'Chase complete.'+(next.remaining ? ` ${next.remaining} earlier cave pickup${next.remaining===1?' remains':'s remain'}.` : '') : 'Cave solving stopped.');
            }
            if(!next?.target) {solver.stop();return status(job,'The next cave step is not currently reachable.');}
            selectGuideTarget(next.target);
            job.action='directions';job.solverToken=next.token;
            job.caveWalk={destination:next.target,attempt:0,acted:new Set(),announced:next.announced,solverToken:next.token};
            solver.announced();
            if(next.chase) {
                Object.assign(job,{map:snapshot.map,mode:snapshot.mode,x:snapshot.x,y:snapshot.y,
                    label:next.target.name,target:next.target.id,caveAll:true,
                    caveAction:(event,automatic)=>expectCaveAction(job,event,automatic)});
                return startCaveSegment(job,next.chase.legs,null,true,next.chase.next);
            }
            return timed ? timedRoute(job,snapshot,next.target) : route(job,snapshot,next.target);
        }
        if (puzzleGuide) {
            const result = guideFor(job.scene)?.review(job.scene, snapshot.objects, snapshot.x, snapshot.y);
            if (!result) return retire(job.scene);
            if (!result.target) return status(job, result.text);
            // Shift+G shares the configured movement mode in every cave room.
            // Its room exit retains the verified prerequisite/event route;
            // manual guide alternatives must not silently override Autowalk.
            // The separate full-solve toggle owns pickups and automatic exits.
            const nextRoom={196:20,199:26,200:11,201:2,202:4}[snapshot.map];
            const automaticExit = preferences().autowalk && nextRoom &&
                snapshot.objects.find(target => target.id === nextRoom && target.category === 'exits');
            if (automaticExit) {
                selectGuideTarget(automaticExit);
                job.action = 'directions';
                return timed ? timedRoute(job, snapshot, automaticExit) : route(job,snapshot,automaticExit);
            }
            selectGuideTarget(result.target);
            job.guide = result.text;
            job.saltTerrainOnly = result.terrainOnly===true;
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
        clearCleanupWalk();
        chaseGuide.stop();
        setManualAction(null); manualCrossing = manualWait = null;
        clearCaveResume();
        retireArrival(arrivalScene, false);
        transfers.clear();
        localDetour.clear();boatJourney.clear();
        terrainJourney.clear();
        shoreJourney = null;
        clearCaveEvent();
        autowalk.stop();
        if (iceRoute?.kind === 'control') clearIceRoute(iceRoute.scene);
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

    function reportChaseLeg(leg) {
        if (!command('navigationReport', leg, false, true)) return false;
        active.chaseLeg = { x: root.$gamePlayer._x, y: root.$gamePlayer._y };
        return true;
    }

    function pendingAutowalk(scene) {
        return active?.scene === scene && active.action === 'directions' && preferences().autowalk;
    }
    function command(action, text, controller = false, keepCaveTiming = false, automaticReadout = false) {
        if(['fieldVitals','fieldGold','mapName','mapDescription'].includes(action))
            return inspection.request(host.manager._scene,action);
        if(BROWSE.has(action)||['directions','puzzleGuide','puzzleStop','beaconStop'].includes(action))enemyWalk.cancel();
        const stoppedReadout=!automaticReadout&&readout.cancel();
        if (BROWSE.has(action) || ['directions', 'puzzleGuide', 'puzzleStop'].includes(action)) clearCleanupWalk();
        const scene = host.manager._scene;
        const stoppedSolver=(action==='beaconStop'||action==='puzzleStop'||BROWSE.has(action)) && solver.stop();
        if ((action === 'beaconStop' || action === 'puzzleStop') && caveResume) {
            clearCaveResume();
            return true;
        }
        if ((action === 'directions' || action === 'puzzleGuide') && !preferences().autowalk && ready(scene, true)) {
            const leg = chaseGuide.repeat(scene);
            if (leg) return reportChaseLeg(leg);
        }
        if (BROWSE.has(action) && !ready(scene, true, true)) return false;
        if (action === 'beaconStop' || action === 'puzzleStop' || BROWSE.has(action)) {
            setManualAction(null); manualCrossing = manualWait = null;
        }
        if ((action === 'beaconStop' || action === 'puzzleStop' || BROWSE.has(action)) && chaseGuide.stop(scene)) {
            retire(scene);
            if (!BROWSE.has(action)) return true;
        }
        if (action === 'directions' && host.caveTiming?.repeatDirections?.(scene)) return true;
        if ((action === 'beaconStop' || action === 'puzzleStop') && caveEvent) {
            clearCaveEvent();
            return true;
        }
        if (action === 'beaconStop') {
            if (!ready(scene, true)) return false;
            const cleaning = cleanupCurrent(cleanupWalk);
            clearCleanupWalk();
            const waitingForIce = iceRoute?.scene === scene;
            const automaticIce=waitingForIce&&iceRoute.remote&&iceRoute.autowalk;
            localDetour.clear();boatJourney.clear();
            airshipJourney.clear();
            terrainJourney.clear();
            shoreJourney = null;
            clearIceRoute(scene);
            const walking = autowalk.stop(scene) || pendingAutowalk(scene) || cleaning || transfers.automatic(scene) ||
                !!automaticIce || stoppedSolver;
            const beaming = host.beacon?.stop(scene);
            if (!walking && !beaming && !waitingForIce && !stoppedReadout) return false;
            transfers.clear();
            command('navigationReport', { kind: 'fieldStatus', name: walking ? 'Autowalk stopped.' : beaming ? 'Beacon stopped.' : 'Directions stopped.' });
            return true;
        }
        if (action === 'puzzleStop') {
            if (!host.hasFocus()) return false;
            const pending = active?.scene === scene && active.action === 'puzzleGuide';
            const guidedMap = timedCave(root.$gameMap._mapId) || salt.active(scene);
            const stopped = salt.stop(scene) || cave.stop(scene);
            const timing = host.caveTiming?.stop(scene);
            const walking = guidedMap && autowalk.stop(scene);
            const waiting = active?.scene === scene && active.action === 'directions' && guidedMap;
            if (!stoppedSolver && !pending && !stopped && !timing && !waiting && !walking) return false;
            if (pending || waiting) retire(scene);
            if (stopped && timedCave(root.$gameMap._mapId)) host.beacon?.stop(scene);
            if (!active && ready(scene)) command('status', 'Puzzle guidance stopped');
            return true;
        }
        const reporting = action === 'navigationReport';
        const navigation = navigationRequest({ action, scene });
        const canWaitForStep = action === 'mapName' || action === 'mapDescription' || navigation && (!timedCave(root.$gameMap?._mapId) || action==='puzzleGuide');
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
            clearCaveEvent();
            clearIceRoute(scene);
            autowalk.stop(scene);
            host.beacon?.stop(scene);
            host.caveTiming?.cancelPlan(scene);
        }
        const changes = active?.scene === scene && !active.performed ? active.changes.slice() : [];
        if (BROWSE.has(action) && changes.length < 16) changes.push(action);
        retireArrival(scene, false);
        if (owner) retire(owner.scene, keepCaveTiming, automaticReadout);
        browserOwner(scene);
        if (BROWSE.has(action) || puzzle) {
            owner.remoteBookmark = owner.routeProgress = null;
            localDetour.clear();boatJourney.clear();
            airshipJourney.clear();
            terrainJourney.clear();
            shoreJourney = null;
            transfers.clear();
        }
        queue({ scene, action, changes, text, step, idle, controller, retries: 0, autoReadout:automaticReadout });
        // An accepted pathfinder key is activity in the native idle detector.
        // It never supplies a game action or changes the timer directly.
        if (canWaitForStep) scene._wqaNavigationWake = true;
        return true;
    }

    function activateBookmark(scene, entry, remote = false, trail = []) {
        localDetour.clear();boatJourney.clear();
        clearIceRoute(scene);
        browserOwner(scene);
        owner.remoteBookmark = remote ? { id: entry.id, revision: entry.revision, trail } : null;
        owner.browser.category = 'bookmarks';
        owner.browser.selections.bookmarks = bookmarkId(entry.id);
        owner.target = owner.routeProgress = null;
    }

    return {
        ready,
        cancelRouteReadout:readout.cancel,
        readoutLanded:readout.landed,
        stopCaveSolver:solver.stop,
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
            airshipJourney.clear();
            activateBookmark(scene, entry, remote);
            return true;
        },
        questRefresh(scene) {
            clearCleanupWalk();
            airshipJourney.questChanged();
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
            control.vitals = fieldVitalsVisible(scene);
            control.puzzle = !!guideFor(scene);
            control.puzzleActive = salt.active(scene) || cave.active(scene) || !!host.caveTiming?.active(scene) ||
                (active?.scene === scene && active.action === 'directions' && timedCave(root.$gameMap._mapId));
            control.autowalkActive = autowalk.active(scene) || pendingAutowalk(scene) || !!cleanupCurrent(cleanupWalk);
            control.beaconActive = control.autowalkActive || host.beacon?.active(scene);
            return control;
        },
        dialoguePresented(scene, paint) { guideFor(scene)?.presented(scene, paint); },
        puzzleActive(scene) { return salt.active(scene) || cave.active(scene); },
        caveEventAccepted(scene, event) {
            solver.accepted(root.$gameMap?._mapId,event._eventId);
            chaseGuide.accepted(scene, event);
            if (manualAction?.scene === scene && manualAction.map === root.$gameMap &&
                manualAction.eventId === event._eventId) {
                manualAction.action = caveAction(scene, event);
                setManualAction(manualAction);
            }
            cave.accepted(scene, event);
            if (caveEvent?.scene === scene && caveEvent.event === event) {
                caveEvent.accepted = true; caveEvent.acceptance = 'event';
                host.graphics._wqaCaveAutoPending = true;
            }
        },
        bookmarkEntranceAccepted: transfers.accepted,
        bookmarkLandingAccepted: transfers.landingAccepted,
        bookmarkTransferReserved: transfers.reserved,
        clearIceRoute,
        iceEventStarted(scene, event) {
            if (iceRoute?.scene !== scene) return;
            if (iceRoute.block === event && !event._erased &&
                (event._trigger === 0 || iceRoute.kind === 'control' && event._trigger === 1)) iceRoute.started = true;
            else if (!controlRouteCurrent(scene, event._eventId)) clearIceRoute(scene);
        },
        iceRouteReady(scene) {
            if (iceRoute?.scene !== scene || !ready(scene)) return;
            const { map, block, browser: selection, started } = iceRoute;
            if (map !== root.$gameMap || browser !== selection) return clearIceRoute(scene);
            if (!started) return;
            if (iceRoute.kind === 'control') {
                if (!preferences().autowalk || iceRoute.player !== root.$gamePlayer ||
                    iceRoute.quest && !questDestinationCurrent(root, scene, iceRoute.quest)) return clearIceRoute(scene);
                const complete = iceRoute.npcGate ? npcPassage(map)!==iceRoute.npcGate : iceRoute.gate ? root.$gameSwitches?.value?.(iceRoute.gate) === true :
                    iceRoute.pullStage !== undefined ? root.$gameVariables?.value?.(4) > iceRoute.pullStage :
                    block._erased || block._pageIndex !== iceRoute.page;
                if (!complete) return;
                const controller = iceRoute.controller;
                clearIceRoute(scene);
                // Native work is over. The existing worker now plans from
                // current terrain, with no intermediate Arrived or Walking.
                browserOwner(scene);
                return rerouteAutowalk({ scene, controller });
            }
            if (!block._erased) return;
            const job=iceRoute.remote&&iceRoute.autowalk?iceRoute.job:null;
            clearIceRoute(scene);
            if(job&&preferences().autowalk){browserOwner(scene);return rerouteAutowalk(job);}
            command('directions');
        },
        chaseMoved(scene, direction, succeeded) {
            if (!scene?._wqaCaveChaseActive || preferences().autowalk || !ready(scene, true)) return;
            const leg = chaseGuide.moved(scene, direction, succeeded);
            if (leg) reportChaseLeg(leg);
        },
        observeReady(scene) {
            if (!ready(scene) || solver.active() && solver.waitingNative()) return;
            if(!autowalk.active(scene)) {
                const blocked=enemyWalk.settle(scene);
                if(blocked){browserOwner(scene);if(browser===blocked.owner.browser){owner={...blocked.owner,scene};return rerouteAutowalk({scene,controller:blocked.job.controller});}}
            }
            if (cleanupWalk) {
                const pending = cleanupWalk;
                if (cleanupCurrent(pending) && !pending.accepted) return;
                clearCleanupWalk();
                if (pending.accepted && cleanupCurrent(pending)) {
                    owner = pending.owner;
                    return rerouteAutowalk(pending.job);
                }
            }
            if (manualAction?.action) {
                const manual = manualAction;
                setManualAction(null);
                if (manual.scene === scene && manual.map === root.$gameMap && manual.player === root.$gamePlayer &&
                    (!manual.isCrystal || !manual.action.blocked && activeDistraction(root.$gameMap, root.$dataMap, manual.eventId))) {
                    if (manual.isCrystal && manual.eventId === 10) manualCrossing = { scene, map: manual.map, player: manual.player };
                    // Keep the original selection through checkpoints, guard
                    // scripts and crystal dialogue. Replan only at native ready.
                    if (manual.resume) command(manual.nextAction === 'puzzleGuide' ? 'puzzleGuide' : 'directions', undefined, manual.controller);
                }
            }
            if (caveResume) {
                const pending = caveResume;
                clearCaveResume();
                if (pending.scene === scene && pending.map === root.$gameMap && pending.player === root.$gamePlayer)
                    resumeCaveWalk(pending.job);
            }
            const leg = chaseGuide.settle(scene);
            if (leg && !preferences().autowalk) reportChaseLeg(leg);
            if (caveEvent?.accepted) {
                const action = caveEvent;
                clearCaveEvent();
                if (action.accepted && action.scene === scene && action.map === root.$gameMap &&
                    action.player === root.$gamePlayer && preferences().autowalk) {
                    if (action.crystal) {
                        const guardId = action.list[action.crystal[0]]?.parameters?.[0];
                        const guard = root.$gameMap._events[guardId];
                        // Record copied handoff facts only after field readiness.
                        routeDiagnostics({ scene, action: 'directions', map: action.origin, mode: 'walk',
                            x: root.$gamePlayer._x, y: root.$gamePlayer._y, target: action.event._eventId,
                            request: { event: action.event._eventId }, destination: action.caveWalk.destination },
                        { status: 'crystalReady', interaction: { acceptedBy: action.acceptance,
                            frames: host.graphics.frameCount - action.requestedAt,
                            guard: guard && [guardId, guard._x, guard._y, guard._moveRouteIndex, guard._jumpCount] } });
                    }
                    if (action.loot) {
                        // The native common event has consumed the pickup and
                        // closed its message. Replan an escape from this fresh
                        // pose rather than route to the now-missing barrel.
                        if (!action.event._erased && action.event._pageIndex === 0) return;
                        action.caveWalk.pickupEscape = true;
                        action.caveWalk.destination = { point: true, category: 'objects', name: 'Pickup retreat',
                            x: root.$gamePlayer._x, y: root.$gamePlayer._y };
                    }
                    const chase = chaseContinuation(root, action);
                    if (action.chase !== undefined && !chase)
                        return command('status', 'Autowalk stopped. The chase changed.');
                    if(action.checkpoint && action.caveWalk.solverToken && solver.current(action.caveWalk.solverToken))solver.wake();
                    else resumeCaveWalk(action, chase);
                }
            }
            const arrived = transfers.settle(scene);
            if (arrived?.shore) {
                const map = root.$gameMap._mapId;
                shoreJourney = map !== arrived.shore.map ? { player: root.$gamePlayer, map, ticket: arrived } : null;
            }
            const airship = airshipJourney.settle(arrived);
            const boat = boatJourney.settle(arrived);
            const detour = localDetour.settle(arrived);
            const bookmark = arrived && !airship && !detour && !boat && !arrived.shore && savedBookmark(arrived);
            if (bookmark && travelMode(root.$gameMap, root.$gamePlayer) === bookmark.mode)
                activateBookmark(scene, bookmark, root.$gameMap._mapId !== bookmark.map, arrived.trail);
            if(arrived?.autowalk&&preferences().autowalk&&(detour||bookmark||boat)&&
                (boat||travelMode(root.$gameMap,root.$gamePlayer)==='walk')) {
                browserOwner(scene);
                return rerouteAutowalk({scene});
            }
            if(arrived?.manualReadout && preferences().autoRouteReadout && !preferences().autowalk &&
                (detour||bookmark||boat))return command('directions',undefined,false,false,true);
            // Only native-ready progress changes requeue the active Salt guide.
            // Ordinary roaming steps do not repeat speech or assume presses.
            if (salt.observe(scene) && !active && !autowalk.active(scene)) return command('puzzleGuide');
            if (cave.recover(scene) && (!active || active.scene !== scene))
                command('puzzleGuide');
            const outcome = cave.settleProgress(scene);
            if (solver.active()) {
                if(solver.pending() && !autowalk.active(scene) && !inFlight && !caveEvent && !caveResume && !cleanupWalk &&
                    (!active || active.action==='status' || active.action==='navigationReport')) {
                    if(active)retire(scene);
                    browserOwner(scene);
                    queue({scene,action:'puzzleGuide',changes:[],controller:false,retries:0});
                }
            } else if (outcome && !active) command('status', outcome);
        },
        command,
        cancelAutowalk(scene) {
            enemyWalk.cancel();
            solver.stop();
            clearCleanupWalk();
            if (iceRoute?.kind === 'control'||iceRoute?.remote&&iceRoute.autowalk) clearIceRoute(scene);
            transfers.cancelAutomatic(scene);
            // Revoke pending directions as well as movement, without a second stop announcement.
            const pending = pendingAutowalk(scene);
            clearCaveResume();
            clearCaveEvent();
            autowalk.stop(scene);
            if (pending) retire(scene);
        },
        report(text, keepCaveTiming = false) {
            const scene = host.manager._scene;
            const handled = autowalk.active(scene) || keepCaveTiming ?
                command('navigationReport', { kind: 'fieldStatus', name: text }, false, keepCaveTiming) :
                command('status', text);
            if (handled && keepCaveTiming && active) active.chaseLeg = { x: root.$gamePlayer._x, y: root.$gamePlayer._y };
            return handled;
        },
        idleInput(scene) {
            const waking = scene._wqaNavigationWake;
            scene._wqaNavigationWake = false;
            const inspected=waking&&inspection.activity(scene);
            // Automatic movement and scheduled waits are player activity.
            // Let updateInactive own its timer reset at the native input site.
            return inspected || (autowalk.active(scene) || solver.active()) && ready(scene, true, true) ||
                waking && active?.scene === scene && ready(scene, true, active.idle);
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
            const following=readout.changed(scene,steppedActor);
            if(following&&steppedActor===root.$gamePlayer)return retire(scene,true,true);
            if (cleanupWalk && !cleanupCurrent(cleanupWalk)) clearCleanupWalk();
            if (!steppedActor || steppedActor === root.$gamePlayer) autowalk.dirty(scene);
            const job = active;
            // Manual takeover is reported before native movement. Its own
            // accepted step must not cancel that one pending announcement.
            if (steppedActor===root.$gamePlayer && job?.scene===scene && job.action==='navigationReport' &&
                job.text?.manualAutowalkStop && ready(scene,true)) return;
            if (steppedActor && job?.scene === scene && job.chaseLeg &&
                job.chaseLeg.x === root.$gamePlayer._x && job.chaseLeg.y === root.$gamePlayer._y && ready(scene, true)) return;
            if (!steppedActor || steppedActor === root.$gamePlayer || job?.scene !== scene ||
                scene._wqaCaveReview || sequence >= 0x7ffffffe) return retire(scene, steppedActor === root.$gamePlayer);
            if (job.ambientStatus || job.line?.refs.some(ref => ref.actor === steppedActor)) return;
            if (!navigationRequest(job)) return retire(scene);
            // Actor motion must not starve an automatic route worker. Every
            // resulting step rechecks native collision; a moved destination
            // or newly occupied tile silently starts one fresh worker route.
            if (job.autowalk || job.quietAutowalk) return;
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
        holdNativeRefresh(scene) {
            return !!(root.$gameMap?._needsRefresh && ready(scene, true, false, true));
        },
        controlLost(scene) {
            inspection.cancel();
            enemyWalk.leave(scene);
            readout.cancel();
            if(scene?._wqaSettingsActive)solver.stop();
            retireArrival(scene, true);
            const refresh = root.$gameMap?._needsRefresh && ready(scene, true, false, true);
            if (!autowalk.holdRefresh(scene)) autowalk.stop(scene);
            retire(scene, refresh);
            if (control?.scene === scene) control = null;
        },
        leave(scene, mapEventId) {
            inspection.cancel();
            enemyWalk.leave(scene,mapEventId);
            readout.cancel();
            if(mapEventId!==undefined)solver.accepted(root.$gameMap?._mapId,mapEventId);
            solver.leave(scene,!!(caveEvent || caveResume || cleanupWalk || mapEventId>0));
            if (cleanupWalk) {
                const pending = cleanupWalk;
                const child = mapEventId === 0 && pending.accepted && pending.map._interpreter?._list === pending.list;
                if (!cleanupCurrent(pending) || pending.scene !== scene ||
                    (mapEventId !== undefined && mapEventId !== pending.event._eventId && !child) ||
                    (!pending.accepted && pending.event.list() !== pending.list) ||
                    (mapEventId === undefined && !pending.event.isStarting() &&
                        pending.map._interpreter?._list !== pending.list)) clearCleanupWalk();
                else if (mapEventId === pending.event._eventId) pending.accepted = true;
            }
            // Interpreter.setup is the definitive native acceptance site.
            // A cold resource/prompt gate may suppress the earlier field-ready
            // notification; preserve only this exact verified cave action.
            if (caveEvent && !caveEvent.accepted &&
                sameCaveAction(caveEvent, scene, mapEventId) && caveEvent.event.list() === caveEvent.list) {
                caveEvent.accepted = true;
                caveEvent.acceptance = 'interpreter';
                host.graphics._wqaCaveAutoPending = true;
            }
            if (manualAction && !manualAction.action && manualAction.scene === scene &&
                manualAction.map === root.$gameMap && manualAction.player === root.$gamePlayer &&
                manualAction.eventId === mapEventId && scene === host.manager._scene &&
                !host.manager._nextScene && !root.$gamePlayer._transferring) {
                const action = caveAction(scene, root.$gameMap._events[mapEventId]);
                if (action?.crystal) { manualAction.action = action; setManualAction(manualAction); }
            }
            chaseGuide.leave(scene, mapEventId);
            // Native resource entry can occur after Event.start but before
            // Interpreter.setup. Retain only that exact verified cave token;
            // it is still unaccepted and cannot resume until setup confirms it.
            const queuedManual = mapEventId === undefined && queuedCaveInteraction(manualAction, scene);
            const queuedAutomatic = mapEventId === undefined && queuedCaveInteraction(caveEvent, scene);
            if (!queuedManual && !sameCaveAction(manualAction, scene, mapEventId)) setManualAction(null);
            if (root.$gameMap?._mapId !== 200 || !mapEventId) manualCrossing = null;
            clearCaveResume();
            if (caveEvent?.scene === scene && !queuedAutomatic && (!caveEvent.accepted || !sameCaveAction(caveEvent, scene, mapEventId)))
                clearCaveEvent();
            retireArrival(scene, true);
            if (!(iceRoute?.scene === scene && iceRoute.started && iceRoute.block._eventId === mapEventId) &&
                !controlRouteCurrent(scene, mapEventId)) clearIceRoute(scene);
            transfers.leave(scene, mapEventId);
            autowalk.stop(scene);
            if (scene) scene._wqaFieldReady = false;
            retire(scene);
            if (owner?.scene === scene) owner = null;
            if (control?.scene === scene) control = null;
        }
    };
}

module.exports = { createField };
