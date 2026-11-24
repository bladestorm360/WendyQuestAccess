'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { captureWorld } = require('../src/world/snapshot');
const { distractionForGuard, captureMotion } = require('../src/world/puzzles/cave');
const { createCaveTiming } = require('../src/world/cave-timing');
const { CUE } = require('../src/runtime/audio');
const { bearing } = require('../src/world/spatial-direction');
const { REACTION_FRAMES, MANUAL_PAUSE_FRAMES } = require('../src/world/puzzles/patrol-line-state.cjs');
const { CHASE_LEGS, chaseHandoff } = require('../src/world/puzzles/cave-progression');
const { previewCrossing } = require('../src/world/puzzles/crossing.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { TIMING_CUE } = require('../src/world/puzzles/patrol-motion.cjs');
const { createAutowalk } = require('../src/world/autowalk');
const { verifyCaveField } = require('./cave-field.cjs');
const { capturePatrolLine } = require('../src/world/puzzles/patrol-line-playback');


async function verifyCaveCrossings(c, load, configureMotion, motionRequest, verifyMotion, verifyWorker) {
    const liveState = () => captureWorld(c, true, undefined, undefined, [], true).live;
    const expand = legs => legs.flatMap(({ direction, tiles }) => Array(tiles).fill(DIRECTIONS.indexOf(direction)));

    function erase(event) {
        // Match the native erased page's cleared collision and trigger.
        Object.assign(event, { _erased: true, _pageIndex: -1, _through: true, _trigger: null });
    }

    function setup(id, x, y, displayX, displayY) {
        const run = load(id);
        const guards = configureMotion(run, x, y, displayX, displayY);
        for (const event of run.gameMap.events()) {
            if (event._trigger === 3 || event._trigger === 4) erase(event);
        }
        return { run, guards };
    }

    async function follow(run, guards, event, observe = () => {}, floorTriggers = []) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const request = { ...motionRequest(run, guards), event, field: true, patrolGuidance: true, timingCue: true };
            const live = liveState();
            const result = previewCrossing(run.geometry, live, request);
            await observe(result, request, live);
            if (result.status === 'patrolBlocked' ||
                (result.status === 'ready' || result.status === 'interrupted') && result.distance === 0) return result;
            const { opening } = result;
            let steps;
            let delay = opening?.from ?? 0;
            if (opening) steps = opening.headings || expand([opening]);
            else if (result.legs) steps = expand(result.legs);
            else if (result.status === 'patrolApproach') steps = expand([result]);
            else {
                assert.equal(result.status, 'timedWait');
                steps = [];
                delay = TIMING_CUE.interval;
            }
            if (opening?.turnGrace === TIMING_CUE.earlyTurnGrace) delay += TIMING_CUE.lead;
            // The simulated movement below skips event dispatch. Stop at the first
            // equivalent line trigger so the fixture can exercise the native handoff.
            let x = request.x;
            let y = request.y;
            let trigger;
            const handoff = floorTriggers.length ? steps.findIndex(heading => {
                x = run.gameMap.roundXWithDirection(x, DIRECTIONS[heading]);
                y = run.gameMap.roundYWithDirection(y, DIRECTIONS[heading]);
                trigger = floorTriggers.find(id => run.gameMap._events[id].pos(x, y));
                return trigger !== undefined;
            }) : -1;
            if (handoff !== -1) steps = steps.slice(0, handoff + 1);
            move(run, guards, steps, delay, opening?.turnGrace ?? 0);
            if (trigger !== undefined) return { trigger };
        }
        assert.fail(`Patrol route stalled on map ${run.id} at ${run.player.x},${run.player.y}`);
    }

    function move(run, guards, steps, delay = 0, turnPause = 0) {
        const turns = steps.filter((heading, index) => index > 0 && heading !== steps[index - 1]).length;
        const frames = delay + steps.length * 16 + turns * turnPause;
        assert.equal(verifyMotion(run, guards, frames, steps, delay, 0, turnPause), frames,
            `Guard contact in map ${run.id} at ${run.player.x},${run.player.y}`);
    }

    function activate(run, guards, id, direction) {
        if (direction) move(run, guards, [DIRECTIONS.indexOf(direction)]);
        const event = run.gameMap._events[id];
        assert.deepEqual([run.player.x, run.player.y], [event.x, event.y]);
        run.player.checkEventTriggerHere([1]);
        assert(event.isStarting());
        event._starting = false;
        return event;
    }

    const west = setup(196, 15, 24, 7.75, 19.25);
    let westCrossings = 0;
    const approach = await follow(west.run, west.guards, 20, async (result, request, live) => {
        if (request.x !== 4 || request.y !== 18 && request.y !== 13) return;
        assert.equal(result.status, 'timedCue');
        assert.deepEqual(result.opening.headings, request.y === 18 ? [1, 3, 3, 3, 3, 3, 2] : [1, 3, 3, 3, 2]);
        await verifyWorker(west.run, request, live, packet => assert.deepEqual(packet, result));
        westCrossings++;
    });
    assert.equal(westCrossings, 2);
    assert.equal(approach.boundaryEvent, 21);
    const checkpoint = activate(west.run, west.guards, 21, approach.boundary);
    assert.equal(liveState().events.find(event => event.id === 21).action, true);
    let index = 0;
    const oldSetValue = c.$gameVariables.setValue;
    c.$gameVariables.value = () => index;
    c.$gameVariables.setValue = (id, value) => { assert.equal(id, 90); index = value; };
    const interpreter = Object.assign(new c.Game_Interpreter(), { _mapId: 196, _list: checkpoint.list(), _index: 1 });
    assert(interpreter.executeCommand());
    assert.equal(index, 1);
    assert.equal(liveState().events.find(event => event.id === 21).action, false);
    assert.deepEqual((await follow(west.run, west.guards, 20)).arrival, { x: 22, y: 7, facing: null });
    c.$gameVariables.setValue = oldSetValue;

    for (const target of [24, 22]) {
        const line = setup(199, 1, 33, 0, 28.25);
        let lineCrossings = 0;
        let shortTurn = false;
        const approach = await follow(line.run, line.guards, target, async (result, request, live) => {
            if (!result.opening) return;
            assert.notEqual(result.opening.pace, 'dash');
            lineCrossings++;
            if (request.x === 18 && request.y === 22) {
                assert.equal(result.opening.turnGrace, TIMING_CUE.earlyTurnGrace);
                assert.equal(result.stopAtPocket, true);
                shortTurn = true;
            }
            await verifyWorker(line.run, request, live, packet => assert.deepEqual(packet, result));
        }, [22, 24]);
        assert(lineCrossings && shortTurn);
        assert.equal(approach.trigger, 24);
        const trigger = activate(line.run, line.guards, approach.trigger);
        line.run.gameMap._events[22].setPosition(0, 0);
        for (const command of trigger.list())
            if (command.code === 205) line.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
        erase(trigger);
        const exit = await follow(line.run, line.guards, 26);
        assert.deepEqual(exit.arrival, { x: 35, y: 16, facing: null });
    }
    console.log('Verified both selected patrol-line routes reach the native west trigger from the south entry.');

    await verifyLineLoot();
    await verifyManualLine();
    verifyRefugeRecovery();
    verifyAutomaticChains();
    verifyCaveField(c, load, configureMotion);

    const distraction = setup(200, 23, 26, 15.25, 21.25);
    const firstBlocker = await follow(distraction.run, distraction.guards, 15);
    assert.deepEqual(firstBlocker, { status: 'patrolBlocked', guard: 4 });
    const crystal = distractionForGuard(c, firstBlocker.guard);
    assert.equal(crystal.id, 5);
    assert.deepEqual((await follow(distraction.run, distraction.guards, crystal.id)).arrival, { x: 16, y: 29, facing: 4 });
    const route = distraction.run.gameMap._events[5].list()[25].parameters[1];
    const guard = distraction.run.gameMap._events[4];
    guard.forceMoveRoute(route);
    // The native first command sets the busy switch before control resumes.
    guard._moveRouteIndex = 1;
    c.$gameSwitches.value = id => id === 582;
    const nextBlocker = await follow(distraction.run, distraction.guards, 15);
    assert.deepEqual(nextBlocker, { status: 'patrolBlocked', guard: 9 });
    assert.equal(distractionForGuard(c, 9).id, 10);
    for (const id of [16, 17, 18]) assert.equal(distractionForGuard(c, id).id, 19);

    const chase = setup(201, 6, 44, 0, 39.25);
    const first = await follow(chase.run, chase.guards, 2);
    assert.equal(first.boundaryEvent, 4);
    assert.match(chaseHandoff(c, 4), /Walk 5 north, then 4 west, then 2 north/);
    const triggers = [4, 9, 11, 13, 24, 26, 27, 28, 29, 2];
    let nativeStep = first.boundary;
    for (let i = 0; i < triggers.length - 1; i++) {
        const event = activate(chase.run, chase.guards, triggers[i], nativeStep);
        const command = event.list().find(item => item.code === 205);
        chase.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
        erase(event);
        const steps = expand(CHASE_LEGS[triggers[i]].map(([direction, tiles]) => ({ direction, tiles })));
        // Read each next stretch ahead of time and walk it continuously.
        nativeStep = DIRECTIONS[steps.pop()];
        move(chase.run, chase.guards, steps);
    }
    activate(chase.run, chase.guards, 2, nativeStep);
    console.log('Verified western refuges, patrol-line exit, distraction prerequisites and nine native chase handoffs.');

    function verifyRefugeRecovery() {
        for (const [x, y, phase] of [[14, 16, 0], [18, 16, 45], [22, 16, 30], [23, 16, 45]]) {
            const { run, guards } = setup(199, 5, 17, 0, 12.25);
            const { gameMap, player } = run;
            const trigger = gameMap._events[24];
            for (const command of trigger.list())
                if (command.code === 205) gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
            erase(trigger);
            gameMap._events[22].setPosition(0, 0);
            for (let frame = 0; frame < phase; frame++) gameMap.updateEvents();
            player.setPosition(x, y);
            gameMap._displayX = Math.max(0, Math.min(17, x - 9.5));
            c.Graphics.frameCount = phase;
            const motion = captureMotion(c, c.Graphics);
            const plan = previewCrossing(run.geometry, liveState(), { ...motionRequest(run, guards), motion,
                event: 25, field: true, patrolGuidance: true, timingCue: true, lineNavigation: 'manual' });
            assert.equal(plan.status, 'timedCue');
            assert(plan.stopAtPocket && plan.opening.escape);
            assert.equal(plan.opening.from, 0);
            const { direction, tiles, headings, pace } = plan.opening;
            assert.match(formatSpeech({ kind: 'timedCue', direction, tiles, headings, pace, escape: true,
                stopAtPocket: true }), /Leave the patrol lane on the ping/);
            const frames = 1 + headings.length * (16 + 30);
            assert.equal(verifyMotion(run, guards, frames, headings), frames);
            assert.equal(player.y, 15);
        }
        console.log('Verified routes to safe pockets from all four positions in the latest patrol-lane log.');
    }

    function verifyAutomaticChains() {
        const scene = c.SceneManager._scene;
        const saved = { Input: c.Input, $gameTemp: c.$gameTemp, $gameMessage: c.$gameMessage,
            WendyQuestAccessFieldMove: c.WendyQuestAccessFieldMove,
            WendyQuestAccessAutowalkInput: c.WendyQuestAccessAutowalkInput };
        const reports = [];
        const auto = createAutowalk(c, value => value === scene, () => ({ autowalk: true }),
            (_scene, record, failed, arrived) => reports.push({ record, failed, arrived }));
        const playerVariable = c.$gameVariables.value;
        const switchValue = c.$gameSwitches.value;
        const timing = createCaveTiming(c, value => value === scene, null, null);
        c.Input = { dir4: 0 };
        c.$gameTemp = { isDestinationValid: () => false, clearDestination() {}, isCommonEventReserved: () => false };
        c.$gameMessage = { isBusy: () => false };
        scene._wqaFieldReady = true;
        c.WendyQuestAccessFieldMove = auto.moved;
        c.WendyQuestAccessAutowalkInput = auto.input;

        function attach(run, guards) {
            const { gameMap, player } = run;
            delete player.direction;
            Object.assign(player._followers, { areGathering: () => false, updateMove() {} });
            c.Graphics.frameCount = 0;
            return () => {
                c.Graphics.frameCount++;
                gameMap.updateEvents();
                assert(!guards.some(guard => guard.isStarting()), 'native guard contact in Autowalk');
                const beforeX = player.scrolledX();
                const beforeY = player.scrolledY();
                player.moveByInput();
                if (player.isMoving()) player.updateMove();
                player.updateScroll(beforeX, beforeY);
            };
        }

        function walk(run, tick, target, steps, opts = {}) {
            const { gameMap, player } = run;
            let x = player.x, y = player.y;
            for (const heading of steps) {
                x = gameMap.roundXWithDirection(x, DIRECTIONS[heading]);
                y = gameMap.roundYWithDirection(y, DIRECTIONS[heading]);
            }
            const job = { scene, mode: 'walk', target, x: player.x, y: player.y, ...opts.job,
                caveWalk: { destination: target } };
            let gateResult;
            const gate = opts.gate && (() => (gateResult = opts.gate()));
            scene._wqaCaveReview = true;
            assert(auto.start(job, { distance: steps.length, course: Uint8Array.from(steps),
                arrival: { x, y, facing: opts.facing ?? null }, gate },
            { kind: 'routeDirections', legs: [], facing: opts.facing }));
            assert(!scene._wqaCaveReview, 'the automatic native step does not invalidate its own field job');
            const begin = c.Graphics.frameCount;
            do { tick(); } while ((auto.active(scene) || player.isMoving()) && c.Graphics.frameCount - begin < 640);
            if (opts.manualFloor) {
                assert(reports.at(-1)?.record?.activate, "manual floor has a current handoff");
                const direction = reports.at(-1).record.activate;
                assert(!gameMap.event(opts.floor).isStarting(), 'manual checkpoint or exit stays unactivated');
                player.moveStraight(direction); // Explicit fixture player input, never the mod.
                while (player.isMoving()) tick();
            }
            assert.deepEqual([player.x, player.y], [x, y],
                'Autowalk completed the verified stretch from ' + [job.x, job.y] + ' ' +
                JSON.stringify({ steps, report: reports.at(-1), gate: gateResult }));

            if (opts.floor) player.checkEventTriggerHere([1]);
        }

        try {
            const westAuto = setup(196, 15, 24, 7.75, 19.25);
            const { run, guards } = westAuto;
            const tick = attach(run, guards);
            let crossings = 0;
            let checkpoint = 0;
            c.$gameVariables.value = () => checkpoint;
            for (let segment = 0; segment < 75; segment++) {
                const motion = captureMotion(c, c.Graphics);
                const plan = previewCrossing(run.geometry, liveState(), { ...motionRequest(run, guards), motion,
                    field: true, patrolGuidance: true, timingCue: true, autowalk: true, event: 20 });
                let steps = plan.opening?.headings || expand(plan.legs || (plan.opening ? [plan.opening] : plan.tiles ? [plan] : []));
                if (!steps.length && plan.status === 'timedWait') {
                    for (let i = 0; i < 18; i++) tick();
                    continue;
                }
                const exit = run.gameMap._events[20];
                const floor = plan.boundaryEvent || (plan.opening?.terminal || plan.terminal ||
                    plan.arrival?.x === exit.x && plan.arrival?.y === exit.y ? 20 : undefined);
                if (plan.boundaryEvent) steps = [...steps, DIRECTIONS.indexOf(plan.boundary)];
                if (plan.status === 'ready' && !plan.distance) break;
                assert(steps.length, plan.status);
                const gate = plan.opening && timing.automaticGate(timing.capture(scene, motion, { id: 20 }, true), plan.opening);
                if (plan.opening) { assert(gate); crossings++; }
                walk(run, tick, 20, steps, { gate, floor, manualFloor: !!floor,
                    job: { caveFloor: floor, caveAction: (event,automatic) => !automatic && event._eventId === floor } });
                if (floor) {
                    const event = run.gameMap._events[floor];
                    assert(event.isStarting());
                    event._starting = false;
                    if (floor === 20) break;
                    assert.equal(floor, 21);
                    checkpoint = 1;
                }
            }
            assert.equal(checkpoint, 1);
            assert(crossings >= 2);
            assert.deepEqual([run.player.x, run.player.y], [22, 7]);

            const distraction = setup(200, 16, 29, 15.25, 21.25);
            const crystalTick = attach(distraction.run, distraction.guards);
            const crystal = distraction.run.gameMap._events[5];
            c.$gameSwitches.value = () => false;
            const { acceptedAction, chaseContinuation } = require('../src/world/puzzles/cave-progression');
            let crystalAction;
            distraction.run.gameMap.refreshIfNeeded = () => {};
            distraction.run.gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
                setup(list, id) { this._list=list;this._eventId=id; }
            });
            walk(distraction.run, crystalTick, 5, [], { facing: 4,
                job: { caveCrystal: true, caveAction: event => !!(crystalAction = acceptedAction(c, scene, event)) } });
            assert.equal(crystalAction?.event, crystal);
            assert(!crystal.isStarting(), 'The known working native handoff consumes the crystal start');
            assert.equal(distraction.run.gameMap._interpreter._eventId,5);
            for(let idle=0;idle<120;idle++)crystalTick();
            assert(!crystal.isStarting(),'idle never repeats native crystal acceptance');
            assert.equal(distraction.run.gameMap._interpreter._eventId,5);
            assert.equal(distraction.run.gameMap._interpreter._list,crystal.list());
            distraction.run.gameMap._interpreter._list=null;
            const command = crystal.list()[25];
            distraction.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
            assert.equal(distractionForGuard(c, 9).id, 10);

            const chase = setup(201, 6, 44, 0, 39.25);
            const chaseTick = attach(chase.run, chase.guards);
            const first = previewCrossing(chase.run.geometry, liveState(), { ...motionRequest(chase.run, chase.guards),
                field: true, patrolGuidance: true, timingCue: true, event: 2 });
            const path = expand(first.legs || []);
            path.push(DIRECTIONS.indexOf(first.boundary));
            let action;
            walk(chase.run, chaseTick, 2, path, { floor: 4,
                job: { caveFloor: 4, caveAction: event => !!(action = acceptedAction(c, scene, event)) } });
            for (const id of [4, 9, 11, 13, 24, 26, 27, 28, 29]) {
                assert.equal(action.event._eventId, id);
                assert(action.event.isStarting());
                const command = action.list[action.chase];
                chase.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
                action.event._starting = false;
                erase(action.event);
                const next = chaseContinuation(c, action);
                assert(next);
                chaseTick(); // accept the next stage after the native handoff
                walk(chase.run, chaseTick, 2, expand(next.legs), { floor: next.next,
                    job: { caveFloor: next.next, caveAction: event => !!(action = acceptedAction(c, scene, event)) } });
            }
            assert.equal(action.event._eventId, 2);
            assert(action.event.isStarting());
            assert(!reports.some(report => report.failed));
        } finally {
            auto.stop(scene);
            Object.assign(c, saved);
            c.$gameVariables.value = playerVariable;
            c.$gameSwitches.value = switchValue;
        }
        console.log('Verified native Autowalk through the first room checkpoint, timed crossings, crystal interaction and nine chase legs.');
    }

    async function verifyManualLine() {
        const saved = { Input: c.Input, $gameTemp: c.$gameTemp, $gameMessage: c.$gameMessage,
            WendyQuestAccessCaveTimingMoved: c.WendyQuestAccessCaveTimingMoved,
            WendyQuestAccessCaveTimingInput: c.WendyQuestAccessCaveTimingInput,
            WendyQuestAccessFieldMove: c.WendyQuestAccessFieldMove };
        const savedApp = c.Graphics.app;
        const scene = c.SceneManager._scene;
        const renderer = new EventEmitter();
        c.Graphics.app = { renderer };
        c.Input = { dir4: 0 };
        c.$gameTemp = { isDestinationValid: () => false, clearDestination() {}, isCommonEventReserved: () => false };
        c.$gameMessage = { isBusy: () => false };
        const reports = [];
        const sounds = [];
        let cueListener = null;
        let replayedReportedStop = false;
        const timing = createCaveTiming(c, owner => owner === scene, {
            cues: CUE, isPrepared: () => true, retire() {},
            play(_scene, _hrtf, cue, _gain, place, ready) {
                assert(ready());
                sounds.push({ cue, place, frame: c.Graphics.frameCount });
                cueListener?.(sounds.at(-1));
                return true;
            }
        }, () => ({ enabled: true, caveTiming: true, caveVolume: 60, hrtf: false }), (text, keepCaveTiming) => {
            timing.cancelPlan(scene, keepCaveTiming);
            reports.push(text);
        });
        c.WendyQuestAccessCaveTimingMoved = timing.moved;
        c.WendyQuestAccessCaveTimingInput = () => assert.fail('Manual guidance intercepted native movement');
        c.WendyQuestAccessFieldMove = () => assert(!scene._wqaAutowalkActive);
        scene._wqaFieldReady = true;

        try {
            for (const [trigger, phase, response, targets] of [
                [24, 0, 1, [25, 34, 26]], [22, 372, REACTION_FRAMES, [34, 25, 26]]
            ]) {
                const { run, guards } = setup(199, 5, 17, 0, 12.25);
                const { gameMap, player } = run;
                const event = gameMap._events[trigger];
                gameMap._events[trigger === 22 ? 24 : 22].setPosition(0, 0);
                for (const command of event.list())
                    if (command.code === 205) gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
                erase(event);
                delete player.direction;
                Object.assign(player._followers, { areGathering: () => false, updateMove() {} });
                c.Graphics.frameCount = 0;
                let refresh = null;
                for (let i = 0; i < phase; i++) tick();

                function tick() {
                    c.Graphics.frameCount++;
                    gameMap.updateEvents();
                    assert(!guards.some(guard => guard.isStarting()), 'no native guard contact in manual navigation');
                    const beforeX = player.scrolledX();
                    const beforeY = player.scrolledY();
                    player.moveByInput();
                    if (player.isMoving()) player.updateMove();
                    player.updateScroll(beforeX, beforeY);
                    if (scene._wqaCaveCueDue && c.Graphics.frameCount >= scene._wqaCaveCueDue) timing.update(scene);
                    renderer.emit('postrender');
                    if (refresh) {
                        const runRefresh = refresh;
                        refresh = null;
                        runRefresh();
                    }
                }

                for (const target of targets) {
                    const nativeTarget = gameMap._events[target];
                    let arrived = false;
                    for (let attempt = 0; attempt < 16; attempt++) {
                        const request = { ...motionRequest(run, guards), event: target, field: true,
                            patrolGuidance: true, timingCue: true, lineNavigation: 'manual', motion: captureMotion(c, c.Graphics) };
                        const live = liveState();
                        const plan = previewCrossing(run.geometry, live, request);
                        if (!attempt) await verifyWorker(run, request, live, packet => assert.deepEqual(packet, plan));
                        if (plan.status === 'patrolLineApproach') {
                            assert(plan.legs.length);
                            const steps = expand(plan.legs);
                            move(run, guards, steps);
                            c.Graphics.frameCount += steps.length * 16;
                        } else if (plan.stopAtPocket) {
                            const { direction, tiles, headings, pace } = plan.opening || plan;
                            const origin = [player.x, player.y];
                            const expected = headings.map(heading => DIRECTIONS[heading]);
                            const captured = timing.capture(scene, request.motion, { id: target });
                            assert(timing.start(captured, ...origin, plan.opening, {
                                direction, tiles, pace, stopAtPocket: true,
                                refresh(state) {
                                    refresh = () => {
                                        const motion = captureMotion(c, c.Graphics);
                                        const revised = previewCrossing(run.geometry, liveState(), { ...request, motion,
                                            timingDirection: direction, timingTiles: tiles, timingHeadings: headings,
                                            timingPace: pace, timingPocket: true });
                                        timing.refreshResult(state, timing.capture(scene, motion, { id: target }), revised.opening);
                                    };
                                    return true;
                                }
                            }));
                            const begin = c.Graphics.frameCount;
                            let at = 0;
                            let respondAt = Infinity;
                            let releaseAt = Infinity;
                            cueListener = receipt => {
                                if (receipt.cue === CUE.wallBump) {
                                    assert.equal(at, expected.length - 1, 'the stop cue marks the last committed tile only');
                                    assert(player.isMoving(), 'the cue leaves time to release before the next tile');
                                    assert.deepEqual(receipt.place, [0, 0, 1]);
                                    releaseAt = receipt.frame + 6;
                                } else if (!at && respondAt === Infinity) {
                                    respondAt = receipt.frame + (phase === 0 ? 25 : 1);
                                }
                            };
                            while (at < expected.length && c.Graphics.frameCount - begin < 1600) {
                                if (c.Graphics.frameCount + 1 >= respondAt && !player.isMoving()) c.Input.dir4 = expected[at];
                                const before = [player.x, player.y];
                                tick();
                                if (player.x !== before[0] || player.y !== before[1]) {
                                    at++;
                                    if (at === 2) {
                                        assert(timing.repeatDirections(scene));
                                        assert.match(reports.at(-1), /^Keep moving/);
                                    }
                                }
                            }
                            assert.equal(at, expected.length, 'all continuous steps from ' + origin);
                            const pocket = [player.x, player.y];
                            const lastReport = reports.length;
                            assert(Number.isFinite(releaseAt), 'continuous crossing plays a stop cue');
                            for (let i = 0; i < 82; i++) {
                                if (c.Graphics.frameCount + 1 === releaseAt) c.Input.dir4 = 0;
                                tick();
                            }
                            assert.deepEqual([player.x, player.y], pocket, 'releasing on the cue leaves Wendy in the pocket');
                            assert.equal(reports.length, lastReport, 'the stop does not announce the safe tile');
                            cueListener = null;
                            c.Input.dir4 = 0;
                            tick();
                            continue;
                        } else {
                            assert.equal(plan.status, 'patrolLineManual');
                            const spoken = formatSpeech({ ...plan, kind: plan.status });
                            assert.match(spoken, /Wait for a ping before each leg/);
                            const barrelApproach = target === 25 && player.x === 24 && player.y === 5;
                            if (barrelApproach) {
                                replayedReportedStop = true;
                                assert.equal(plan.firstPause, MANUAL_PAUSE_FRAMES);
                                assert.deepEqual(plan.legs, [{ direction: 8, tiles: 1 }, { direction: 4, tiles: 4 },
                                    { direction: 4, tiles: 4 }, { direction: 8, tiles: 1 }]);
                                assert.match(spoken, /1 north, wait\. 4 west, wait\. 4 west, wait\. 1 north, stop\./);
                            }
                            const captured = timing.capture(scene, request.motion, { id: target });
                            const track = capturePatrolLine(c, request.motion, target);
                            assert(timing.startManual(captured, track, player.x, player.y, plan, 'Reached the planned stop.'));
                            let index = 0;
                            let respondAt;
                            let releaseAt;
                            let nextPingAfter = -1;
                            let recheckAt = -1;
                            const begin = c.Graphics.frameCount;
                            cueListener = receipt => {
                                assert(index < plan.legs.length);
                                if (receipt.cue === CUE.wallBump) {
                                    assert.deepEqual(receipt.place, [0, 0, 1]);
                                    assert.equal(c.Input.dir4, plan.legs[index].direction);
                                    assert(player.isMoving(), 'the stop cue precedes the end of the leg');
                                    releaseAt = receipt.frame + 6;
                                    nextPingAfter = receipt.frame + 16 + (index === 0 ? plan.firstPause : 0);
                                    if (barrelApproach && index === 1) recheckAt = nextPingAfter - 1;
                                    index++;
                                    respondAt = undefined;
                                } else if (receipt.cue === CUE.caveGo && !respondAt) {
                                    assert(receipt.frame >= nextPingAfter, 'the landing includes a quiet pause before the next go ping');
                                    assert.deepEqual(receipt.place, bearing(8, plan.legs[index].direction));
                                    respondAt = receipt.frame + response;
                                }
                            };
                            const reportCount = reports.length;
                            while (timing.active(scene) && reports.length === reportCount && c.Graphics.frameCount - begin < 1701) {
                                if (releaseAt === c.Graphics.frameCount + 1) c.Input.dir4 = 0;
                                if (respondAt === c.Graphics.frameCount + 1) c.Input.dir4 = plan.legs[index].direction;
                                const before = [player.x, player.y];
                                const count = sounds.length;
                                const legIndex = index;
                                tick();
                                if (c.Graphics.frameCount === recheckAt) {
                                    assert(timing.repeatDirections(scene), 'rechecking the second wait leaves its next ping armed');
                                    assert.equal(reports.length, reportCount, 'the recheck is silent in the lane');
                                }
                                if (player.x !== before[0] || player.y !== before[1]) {
                                    assert.equal(sounds.length, count + 1, 'each accepted step emits a ping or a stop cue');
                                    assert.equal(sounds.at(-1).cue, index === legIndex ? CUE.caveGo : CUE.wallBump);
                                }
                            }
                            cueListener = null;
                            assert.equal(index, plan.legs.length, 'Manual legs at ' + [player.x, player.y] + '. ' + reports.at(-1));
                            assert.equal(reports.at(-1), 'Reached the planned stop.');
                            const pocket = [player.x, player.y];
                            for (let i = 0; i < 80; i++) tick();
                            assert.deepEqual([player.x, player.y], pocket);
                            c.Input.dir4 = 0;
                            tick();
                        }
                        if (plan.more) continue;
                        if (target === 26) {
                            assert.equal(plan.activate, 6);
                            c.Input.dir4 = plan.activate;
                            tick();
                            c.Input.dir4 = 0;
                            while (player.isMoving()) tick();
                            player.checkEventTriggerHere([1]);
                        } else {
                            player.setDirection(plan.facing);
                            player.checkEventTriggerThere([0]);
                        }
                        assert(nativeTarget.isStarting());
                        nativeTarget._starting = false;
                        arrived = true;
                        break;
                    }
                    assert(arrived, 'manual route reaches every target');
                }
            }

            const { run } = setup(199, 5, 17, 0, 12.25);
            const { player } = run;
            const position = [player.x, player.y];
            assert(replayedReportedStop, "the reported barrel approach was replayed");
            const direction = DIRECTIONS.find(heading => player.canPass(...position, heading));
            assert(direction);
            const current = timing.capture(scene, captureMotion(c, c.Graphics), { id: 25 });
            assert(timing.start(current, ...position, null, { direction, tiles: 2, stopAtPocket: true, refresh: () => false }));
            Object.assign(player._followers, { areGathering: () => false, updateMove() {} });
            c.Input.dir4 = direction;
            player.moveByInput();
            assert.notDeepEqual([player.x, player.y], position, 'a legal step before a ping still reaches the native collider');
            assert(!timing.active(scene), 'stepping before the opening retires cue tracking');
        } finally {
            timing.stop(scene);
            c.Graphics.app = savedApp;
            Object.assign(c, saved);
        }
        console.log('Verified manual barrel, chest and exit in both orders, audio releases, and native movement during an active wait.');
    }

    async function verifyLineLoot() {
        const saved = { Input: c.Input, $gameTemp: c.$gameTemp, $gameMessage: c.$gameMessage,
            WendyQuestAccessFieldMove: c.WendyQuestAccessFieldMove,
            WendyQuestAccessAutowalkInput: c.WendyQuestAccessAutowalkInput };
        const scene = c.SceneManager._scene;
        const prefs = { autowalk: true };
        const reports = [];
        let testedPause = false;
        const auto = createAutowalk(c, () => true, () => prefs,
            (_scene, record, failed, arrived) => reports.push({ record, failed, arrived }));
        c.Input = { dir4: 0 };
        c.$gameTemp = { isDestinationValid: () => false, clearDestination() {}, isCommonEventReserved: () => false };
        c.$gameMessage = { isBusy: () => false };
        c.WendyQuestAccessFieldMove = auto.moved;
        c.WendyQuestAccessAutowalkInput = auto.input;
        scene._wqaFieldReady = true;
        try {
            for (const [trigger, phase, targets] of [[24, 0, [25, 34, 26]], [22, 372, [34, 25, 26]]]) {
                const { run, guards } = setup(199, 5, 17, 0, 12.25);
                const { gameMap, player } = run;
                const event = gameMap._events[trigger];
                gameMap._events[trigger === 22 ? 24 : 22].setPosition(0, 0);
                for (const command of event.list()) {
                    if (command.code !== 205) continue;
                    const [id, route] = command.parameters;
                    gameMap._events[id].forceMoveRoute(phase ? JSON.parse(JSON.stringify(route)) : route);
                }
                erase(event);
                delete player.direction;
                Object.assign(player._followers, { areGathering: () => false, updateMove() {} });
                c.Graphics.frameCount = 0;
                for (let i = 0; i < phase; i++) tick();
                const point = () => [player.x, player.y];
                function tick() {
                    c.Graphics.frameCount++;
                    gameMap.updateEvents();
                    assert(!guards.some(guard => guard.isStarting()), 'the native patrols never touch Wendy');
                    const beforeX = player.scrolledX();
                    const beforeY = player.scrolledY();
                    player.moveByInput();
                    if (player.isMoving()) player.updateMove();
                    player.updateScroll(beforeX, beforeY);
                }
                for (const target of targets) {
                    const live = liveState();
                    const req = { ...motionRequest(run, guards), event: target, field: true, patrolGuidance: true,
                        lineNavigation: true };
                    req.motion.frame = c.Graphics.frameCount;
                    const track = capturePatrolLine(c, req.motion, target);
                    assert(track, 'capture is tied to the authored trigger and route');
                    let result;
                    await verifyWorker(run, req, live, packet => { result = packet; });
                    assert.equal(result.status, 'patrolLine');
                    testedPause ||= result.moves.some((move, i) => i && move.frame > result.moves[i - 1].frame + 16);
                    const job = { scene, mode: 'walk', target, x: player.x, y: player.y, line: track };
                    const record = { kind: 'routeDirections', legs: [], activate: result.activate,
                        facing: result.arrival.facing, guideAction: target !== 26 };
                    for (let i = 0; i < 12; i++) tick(); // worker replies after the patrols have advanced
                    assert(auto.start(job, result, record));
                    if (phase === 0 && target === 25) {
                        const guard = track.refs[0].actor;
                        const original = guard._originalMoveRoute;
                        guard._originalMoveRoute = {};
                        while (c.Graphics.frameCount < result.moves[0].frame) tick();
                        assert(!auto.active(scene), 'a changed patrol prevents the first native step');
                        assert.deepEqual(point(), [5, 17]);
                        assert(reports.at(-1).failed);
                        guard._originalMoveRoute = original;
                        req.motion = { ...motionRequest(run, guards).motion, frame: c.Graphics.frameCount };
                        job.line = capturePatrolLine(c, req.motion, target);
                        result = previewCrossing(run.geometry, liveState(), req);
                        assert(auto.start(job, result, record));
                    }
                    const start = c.Graphics.frameCount;
                    while (auto.active(scene) && c.Graphics.frameCount - start < 2301) tick();
                    assert.deepEqual(point(), [result.arrival.x, result.arrival.y]);
                    assert(reports.at(-1).arrived);
                    const nativeTarget = gameMap._events[target];
                    if (target === 26) {
                        assert.equal(result.activate, 6);
                        assert.deepEqual(point(), [34, 16]);
                        const boundary = record.activate;
                        c.Input.dir4 = boundary;
                        while (player.x !== nativeTarget.x) tick();
                        c.Input.dir4 = 0;
                        while (player.isMoving()) tick();
                        player.checkEventTriggerHere([1]);
                    } else {
                        assert.equal(player._direction, result.arrival.facing);
                        player.checkEventTriggerThere([0]);
                    }
                    assert(nativeTarget.isStarting(), 'the planned handoff accepts the original native event');
                    nativeTarget._starting = false;
                }
            }
        } finally {
            auto.stop(scene);
            Object.assign(c, saved);
        }
        assert(testedPause, 'the routes include waiting between native moves');
        console.log('Verified both loot orders, both guard triggers, timed pauses, native interaction and exit handoff.');
    }
}

module.exports = { verifyCaveCrossings };
