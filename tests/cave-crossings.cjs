'use strict';

const assert = require('node:assert/strict');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { captureWorld } = require('../src/world/snapshot');
const { distractionForGuard } = require('../src/world/puzzles/cave');
const { CHASE_LEGS, chaseHandoff } = require('../src/world/puzzles/cave-progression');
const { previewCrossing } = require('../src/world/puzzles/crossing.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { TIMING_CUE } = require('../src/world/puzzles/patrol-motion.cjs');
const { createAutowalk } = require('../src/world/autowalk');
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

    async function follow(run, guards, event, observe = () => {}) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const request = { ...motionRequest(run, guards), event, field: true, patrolGuidance: true, timingCue: true };
            request.motion.dash = true;
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
            move(run, guards, steps, delay, opening?.pace === 'dash');
        }
        assert.fail(`Patrol route stalled on map ${run.id} at ${run.player.x},${run.player.y}`);
    }

    function move(run, guards, steps, delay = 0, dash = false) {
        const frames = delay + steps.length * (dash ? 8 : 16);
        assert.equal(verifyMotion(run, guards, frames, steps, delay, dash ? (1 << steps.length) - 1 : 0), frames,
            `Guard contact in map ${run.id} at ${run.player.x},${run.player.y}`);
    }

    function activate(run, guards, id, direction, dash = false) {
        if (direction) move(run, guards, [DIRECTIONS.indexOf(direction)], 0, dash);
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

    const line = setup(199, 1, 33, 0, 28.25);
    const paces = new Set();
    const observePace = async (result, request, live) => {
        const { opening } = result;
        if (!opening?.pace || paces.has(opening.pace)) return;
        paces.add(opening.pace);
        assert.match(formatSpeech({ kind: 'timedCue', ...opening }), new RegExp('On the ping, ' + opening.pace));
        await verifyWorker(line.run, request, live, packet => assert.deepEqual(packet, result));
    };
    await follow(line.run, line.guards, 24, observePace);
    assert.deepEqual(paces, new Set(['walk', 'dash']));
    const trigger = activate(line.run, line.guards, 24);
    line.run.gameMap._events[22].setPosition(0, 0);
    for (const command of trigger.list())
        if (command.code === 205) line.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
    erase(trigger);
    const exit = await follow(line.run, line.guards, 26);
    assert.deepEqual(exit.arrival, { x: 35, y: 16, facing: null });

    await verifyLineLoot();

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
    assert.match(chaseHandoff(c, 4), /Dash 5 north, then 4 west, then 2 north/);
    const triggers = [4, 9, 11, 13, 24, 26, 27, 28, 29, 2];
    let nativeStep = first.boundary;
    for (let i = 0; i < triggers.length - 1; i++) {
        const event = activate(chase.run, chase.guards, triggers[i], nativeStep, true);
        const command = event.list().find(item => item.code === 205);
        chase.run.gameMap._events[command.parameters[0]].forceMoveRoute(command.parameters[1]);
        erase(event);
        const steps = expand(CHASE_LEGS[triggers[i]].map(([direction, tiles]) => ({ direction, tiles })));
        // Read each next stretch ahead of time and cross it at Dash pace.
        nativeStep = DIRECTIONS[steps.pop()];
        move(chase.run, chase.guards, steps, 0, true);
    }
    activate(chase.run, chase.guards, 2, nativeStep, true);
    console.log('Verified western refuges, patrol-line exit, distraction prerequisites and nine native chase handoffs.');

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
        c.$gameTemp = { isDestinationValid: () => false, clearDestination() {} };
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
