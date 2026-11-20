'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { CUE } = require('../src/runtime/audio');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { createField } = require('../src/world/field');
const { createCaveTiming } = require('../src/world/cave-timing');
const { formatSpeech } = require('../src/services/speech-text.cjs');

function verifyCaveField(c, load, configureMotion) {
    const previousView = { width: c.Graphics.width, height: c.Graphics.height };
    Object.assign(c.Graphics, { width: c.$dataSystem.advanced.screenWidth, height: c.$dataSystem.advanced.screenHeight });
    function setup(id, x, y, viewX, viewY) {
        const run = load(id), guards = configureMotion(run, x, y, viewX, viewY);
        for (const event of run.gameMap.events()) if (event._trigger === 3 || event._trigger === 4)
            Object.assign(event, { _erased: true, _pageIndex: -1, _through: true, _trigger: null });
        return { run, guards };
    }
    const keys = ['Input', '$gameTemp', '$gameMessage', '$gameScreen', 'addEventListener',
        'WendyQuestAccessFieldMove', 'WendyQuestAccessAutowalkInput', 'WendyQuestAccessFieldEvent',
        'WendyQuestAccessCaveEventAccepted', 'WendyQuestAccessSceneLeaving', 'WendyQuestAccessFieldChanged', 'WendyQuestAccessCaveTimingMoved'];
    const saved = Object.fromEntries(keys.map(key => [key, c[key]]));
    const originalScene = c.SceneManager._scene, app = c.Graphics.app;
    const members = c.$gameParty.members, inBattle = c.$gameParty.inBattle;
    const renderer = new EventEmitter();
    const scene = { _wqaMapRestored: true, _wqaFieldReady: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0 };
    const preferences = { autowalk: true };
    const packets = [], records = [], accepted = [], diagnostics = [];
    const worker = Object.assign(new EventEmitter(), { unref() {}, postMessage: packet => packets.push(packet) });
    let field, fixture, guards, source, repeatChecked = false, pendingArrival = false;
    const computeCosts = [];
    const automaticCost = { calls: 0, total: 0, peak: 0, framePeak: 0 };
    let measureDepth = 0;
    const callbackOutliers = [];
    const guidanceCost = { calls: 0, total: 0, peak: 0 };
    const patrolCost = { calls: 0, total: 0, peak: 0, framePeak: 0 };
    let frameCost = 0, firstPingDelay = 0, delayedMove = null, closeSecondPrompt = false;
    const replyCost = { calls: 0, total: 0, peak: 0, cpuTotal: 0, cpuPeak: 0 };
    function measure(callback, label = 'callback') {
        if (measureDepth || ![196,199,200,201].includes(fixture?.id)) return callback();
        const cost = preferences.autowalk ? automaticCost : fixture.id===201 ? guidanceCost : patrolCost;
        const start=performance.now(), cpuStart=process.cpuUsage();measureDepth++;
        try { return callback(); }
        finally {
            measureDepth--;
            const elapsed=performance.now()-start;
            cost.calls++;cost.total+=elapsed;cost.peak=Math.max(cost.peak,elapsed);
            frameCost+=elapsed;
            if (elapsed>25 && callbackOutliers.length<16) {
                const cpu=process.cpuUsage(cpuStart);
                callbackOutliers.push({label,ms:elapsed,cpu:(cpu.user+cpu.system)/1000,map:fixture.id,automatic:preferences.autowalk,x:fixture.player.x,y:fixture.player.y});
            }
        }
    }
    let serial = 0, deliver, manualDrive = null, staticLeg = null, manualNext = false, pickupPrompt = null, crystalMessages = 0;
    const routeSource = path.join(__dirname, '../src/world/route-worker.cjs');
    function createRouteWorker(buffer) {
        // Execute the production worker dispatcher with deferred, cloned
        // numeric packets. Only thread transport is a fixture stand-in.
        const wire = { on(type, handler) { assert.equal(type, 'message'); deliver = handler; },
            postMessage(packet) {
                if (!preferences.autowalk && [196, 199, 200].includes(fixture.id)) {
                    const result = packet.result;
                    if (result.pickup) pickupPrompt = result.pickup;
                    if (result.status === 'ready' || result.status === 'interrupted' || result.status === 'patrolApproach' || result.status === 'patrolLineApproach') {
                        const legs = result.legs || [{ direction: result.direction, tiles: result.tiles }];
                        const moves = legs.flatMap(leg => Array(leg.tiles).fill(leg.direction));
                        if (result.boundary) moves.push(result.boundary);
                        if (result.activate) moves.push(result.activate);
                        staticLeg = { moves, index: 0, facing: result.more ? null : result.arrival?.facing ?? result.facing,
                            recheck: result.status === 'ready' };
                        manualDrive = 'static';
                    } else if (result.status === 'unsafeCrossing' && !result.exposed) {
                        manualDrive = 'wait';
                        c.Input.dir4 = 0;
                    } else if (result.status === 'timedCue' || result.status === 'timedWait' || result.status === 'patrolLineManual') manualDrive = 'timed';
                }
                const beforeReply = performance.now();
                const beforeCpu = process.cpuUsage();
                measure(() => worker.emit('message', packet), 'worker-reply');
                if ([196, 199, 200].includes(fixture.id)) {
                    const elapsed = performance.now() - beforeReply;
                    const used = process.cpuUsage(beforeCpu);
                    const cpu = (used.user + used.system) / 1000;
                    replyCost.calls++; replyCost.total += elapsed; replyCost.peak = Math.max(replyCost.peak, elapsed);
                    replyCost.cpuTotal += cpu; replyCost.cpuPeak = Math.max(replyCost.cpuPeak, cpu);
                }
            } };
        const nativeRequire = createRequire(routeSource);
        vm.runInNewContext(fs.readFileSync(routeSource, 'utf8'), {
            require: name => name === 'worker_threads' ? { parentPort: wire,
                workerData: { admission: buffer, geometryDirectory: path.resolve(process.argv[3]) } } : nativeRequire(name),
            Buffer, Uint8Array, Int32Array, Atomics
        }, { filename: routeSource });
        return worker;
    }
    c.SceneManager._scene = scene;
    c.Graphics.app = { stage: scene, renderer };
    c.$gameScreen = { _brightness: 255 };
    c.Input = { dir4: 0 };
    c.$gameTemp = { isDestinationValid: () => false, clearDestination() {}, isCommonEventReserved: () => false };
    c.$gameMessage = { isBusy: () => false };
    c.$gameParty.members = () => [4];
    c.$gameParty.inBattle = () => false;
    c.addEventListener = () => {};
    const timing = createCaveTiming(c, value => value === scene,
        { cues: CUE, isPrepared: () => true, retire() {}, play(_scene, _hrtf, cue, _gain, source, current) {
            if (!current()) return false;
            if (!preferences.autowalk && [196, 199, 200].includes(fixture?.id)) {
                if (cue === CUE.caveGo) {
                    manualDrive = 'timed';
                    const direction = source[0] ? source[0] < 0 ? 4 : 6 : source[2] < 0 ? 2 : 8;
                    if (firstPingDelay) {
                        delayedMove = { frame: c.Graphics.frameCount + firstPingDelay, direction };
                        firstPingDelay = 0;
                    } else if (!delayedMove) c.Input.dir4 = direction;
                } else if (cue === CUE.wallBump) {
                    c.Input.dir4 = 0;
                    if (pickupPrompt && c.$gamePlayer.x === 23 && c.$gamePlayer.y === 25) {
                        manualDrive = 'pickup';
                        manualNext = false;
                    } else manualNext = false;
                }
            }
            return true;
        } },
        () => ({ enabled: true, caveTiming: true, caveVolume: 70, hrtf: false }),
        (text, moving) => field.report(text, moving));
    field = createField(c, { graphics: c.Graphics, manager: c.SceneManager, hasFocus: () => true,
        screenFading: () => false, navigationPreferences: () => preferences, caveTiming: timing,
        makeWord: () => new Int32Array(new SharedArrayBuffer(4)), createRouteWorker }, {
        open(record, current) { assert(current()); records.push(record); return ++serial; }, close() {},
        arrive(record, current, _walking, detail) {
            assert(current()); records.push(record);
            if (detail) records.push(detail);
            pendingArrival = true;
            return ++serial;
        }, endArrival() {}
    }, (job, result) => diagnostics.push({ target: job.target, destination: job.caveWalk?.destination?.id, status: result?.status, frame: c.Graphics.frameCount, x: c.$gamePlayer.x, y: c.$gamePlayer.y, direction: result?.direction, tiles: result?.tiles, opening: result?.opening && {from:result.opening.from,through:result.opening.through,headings:result.opening.headings,urgent:result.opening.urgent,lead:result.opening.lead,escape:result.opening.escape}, guard: [c.$gameMap._events[4]?._x, c.$gameMap._events[4]?._y, c.$gameMap._events[4]?._moveRouteForcing, c.$gameMap._events[4]?._moveRouteIndex], gate: c.$gameSwitches.value(582) }));
    c.WendyQuestAccessFieldChanged = (owner, actor) => {
        measure(() => {
            if (actor === c.$gamePlayer) timing.pose(owner); else timing.stop(owner);
            field.changed(owner, actor);
        });
    };
    c.WendyQuestAccessCaveTimingMoved = (...args) => measure(() => timing.moved(...args));
    c.WendyQuestAccessAutowalkInput = (...args) => measure(() => field.autowalk.input(...args), 'native-input');
    c.WendyQuestAccessFieldMove = (owner, direction, succeeded) => {
        measure(() => { field.autowalk.moved(owner, direction, succeeded); field.chaseMoved(owner, direction, succeeded); });
    };
    c.WendyQuestAccessFieldEvent = (owner) => { field.autowalk.stop(owner); field.changed(owner); };
    c.WendyQuestAccessCaveEventAccepted = (owner, event) => {
        accepted.push(event._eventId);
        measure(() => field.caveEventAccepted(owner, event));
    };
    c.WendyQuestAccessSceneLeaving = (owner, eventId) => measure(() => field.leave(owner, eventId), 'native-entry');

    function start(map, x, y, viewX, viewY) {
        field.leave(scene);
        ({ run: fixture, guards } = setup(map, x, y, viewX, viewY));
        const { player, gameMap } = fixture;
        const checkThere = player.checkEventTriggerThere;
        player.checkEventTriggerThere = function(triggers) {
            checkThere.call(this, triggers);
            if (closeSecondPrompt && gameMap._events[10]?.isStarting()) {
                scene._wqaFieldReady = false;
                c.WendyQuestAccessSceneLeaving(scene);
            }
        };
        delete player.direction;
        Object.assign(player._followers, { areGathering: () => false, updateMove() {} });
        gameMap.inactiveTime = 0;
        for (const event of gameMap.events()) event.setupPage = () => {
            const page = event.page();
            Object.assign(event, { _through: page?.through ?? true, _priorityType: page?.priorityType ?? 0,
                _trigger: page?.trigger, _characterName: page?.image.characterName || '', _tileId: page?.image.tileId || 0 });
        };
        const switches = new Set();
        c.$gameSwitches.value = key => switches.has(key);
        c.$gameSwitches.setValue = (key, value) => {
            if (value) switches.add(key); else switches.delete(key);
            gameMap._needsRefresh = true;
        };
        gameMap.refreshIfNeeded = () => {
            for (const event of gameMap.events()) {
                const index = event._erased ? -1 : event.findProperPageIndex();
                if (index === event._pageIndex) continue;
                event._pageIndex = index;
                const page = event.page();
                Object.assign(event, { _through: page?.through ?? true, _priorityType: page?.priorityType ?? 0,
                    _trigger: page?.trigger, _characterName: page?.image.characterName || '',
                    _tileId: page?.image.tileId || 0 });
                if (event._trigger === 4) event._interpreter = Object.assign(new c.Game_Interpreter(), {
                    _list: page.list, _eventId: event._eventId, _mapId: map, _index: 0,
                    _branch: {}, _waitMode: '', _waitCount: 0
                });
            }
            gameMap._needsRefresh = false;
        };
        let checkpoint = 0;
        c.$gameVariables.value = () => checkpoint;
        c.$gameVariables.setValue = (id, value) => { if (id === 90) checkpoint = value; };
        source = gameMap._interpreter = Object.assign(new c.Game_Interpreter(), {
            _list: null, setup(list, id) {
                c.WendyQuestAccessSceneLeaving(scene, id);
                Object.assign(this, { _list: list, _eventId: id, _mapId: gameMap._mapId,
                    _index: 0, _branch: {}, _waitMode: '', _waitCount: 0 });
            }
        });
        c.Graphics.frameCount = 0;
        scene._wqaFieldReady = true;
        scene._wqaCaveGuideActive = false;
        c.Input.dir4 = 0;
        manualDrive = staticLeg = pickupPrompt = null; manualNext = false; pendingArrival = false; crystalMessages = 0; firstPingDelay = 0; delayedMove = null; closeSecondPrompt = false;
    }

    function render() {
        if (renderer.listenerCount('postrender')) measure(() => renderer.emit('postrender'), 'postrender');
        const packet = packets.shift();
        if (packet) {
            assert(!packets.length);
            const costStart = performance.now(), cpuStart = process.cpuUsage();
            deliver(structuredClone(packet));
            if (fixture.id === 200 && fixture.player.x === 34 && fixture.player.y === 20) {
                const cpu = process.cpuUsage(cpuStart);
                computeCosts.push({ms:performance.now()-costStart,cpu:(cpu.user+cpu.system)/1000,action:packet.request?.event});
            }
        }
    }

    function ask(action) { assert(field.command(action)); render(); }
    function select(name, category = 'Exits', point = null) {
        for (let count = 0; count < 9; count++) {
            ask('nextCategory');
            if (records[records.length - 1]?.category === category) break;
        }
        for (let count = 0; count < 16; count++) {
            ask('nextDestination');
            const record = records[records.length - 1];
            if (record?.name === name && (!point || record.dx === point[0] - fixture.player.x &&
                record.dy === point[1] - fixture.player.y)) return;
        }
        assert.fail('Missing field destination ' + name + '. Reports ' + JSON.stringify([...new Set(records.map(record => record.name))]));
    }

    function execute(interpreter) {
        if (!interpreter?._list) return;
        // Native branch, switch, route, wait and erase bodies run. Native page
        // selection drives the parallel return routes; art/audio are stand-ins.
        if (interpreter._waitCount > 0) { interpreter._waitCount--; return; }
        if (interpreter.updateWaitMode()) return;
        for (let count = 0; interpreter._list && count < 128; count++) {
            if (interpreter._index >= interpreter._list.length) { interpreter._list = null; break; }
            // The retail message-start producer closes field output without
            // an event ID. Preserve this real boundary even with art stubbed.
            if (interpreter._list[interpreter._index]?.code === 101) {
                if (fixture.id === 200 && interpreter._eventId === 5) crystalMessages++;
                c.WendyQuestAccessSceneLeaving(scene);
            }
            interpreter.executeCommand();
            if (interpreter._waitCount || interpreter._waitMode) break;
        }
    }

    function tick() {
        const { gameMap, player } = fixture;
        frameCost = 0;
        c.Graphics.frameCount++;
        if (delayedMove && c.Graphics.frameCount >= delayedMove.frame) {
            c.Input.dir4 = delayedMove.direction; delayedMove = null;
        }
        gameMap.refreshIfNeeded();
        // Retail Game_Map updates its main interpreter before event actors;
        // a crystal's newly forced guard route can jump on this same update.
        if (fixture.id === 200) {
            if (!source._list) gameMap.setupStartingMapEvent();
            execute(source);
        }
        gameMap.updateEvents();
        for (const event of gameMap.events()) if (event._trigger === 4) execute(event._interpreter);
        assert(!guards.some(guard => guard.isStarting()),
            'Guard contact on map ' + fixture.id + ' at ' + [player.x, player.y] + ' after ' + records.slice(-3).map(formatSpeech) + JSON.stringify({ frame: c.Graphics.frameCount, source: [source._eventId,source._index,source._waitMode], diagnostics }));
        const beforeX = player.scrolledX(), beforeY = player.scrolledY();
        const wasMoving = player.isMoving();
        if (!preferences.autowalk && [196, 199, 200].includes(fixture.id) && !source._list && !player.isMoving()) {
            if (manualDrive === 'timed' && /^Face (north|south|east|west) and press the action button\.$/.test(records.at(-1)?.name || '')) {
                const direction = {north: 8, south: 2, east: 6, west: 4}[records.at(-1).name.split(' ')[1]];
                c.Input.dir4 = 0;
                player.setDirection(direction);
                player.checkEventTriggerThere([0]);
                manualDrive = null;
            }
            if (manualDrive === 'pickup' && /^Face west and open the barrel/.test(records.at(-1)?.name || '')) {
                player.setDirection(pickupPrompt.facing);
                player.checkEventTriggerThere([0]);
                manualDrive = null;
            }
            if (manualDrive === 'static') {
                if (staticLeg.index < staticLeg.moves.length) c.Input.dir4 = staticLeg.moves[staticLeg.index];
                else {
                    c.Input.dir4 = 0;
                    manualDrive = null;
                    if (staticLeg.facing) {
                        player.setDirection(staticLeg.facing);
                        player.checkEventTriggerThere([0]);
                    } else if (staticLeg.recheck) manualNext = true;
                }
            }
            if (manualNext && (manualNext === true || c.Graphics.frameCount >= manualNext)) {
                manualNext = false;
                field.command('directions');
            }
        }
        const oldX = player.x, oldY = player.y;
        if (!source._list) player.moveByInput();
        if (!preferences.autowalk && [196, 199, 200].includes(fixture.id) && manualDrive === 'static' &&
            (oldX !== player.x || oldY !== player.y)) {
            assert.equal(player._direction, staticLeg.moves[staticLeg.index++]);
        }
        const tookStep = player.isMoving();
        if (tookStep) player.updateMove();
        player.updateScroll(beforeX, beforeY);
        if ((wasMoving || tookStep) && !player.isMoving() && !source._list) player.checkEventTriggerHere([1]);
        if (fixture.id !== 200) {
            if (!source._list) gameMap.setupStartingMapEvent();
            execute(source);
        }
        if (!source._list && !player.isMoving() && !(closeSecondPrompt && gameMap._events[10]?.isStarting())) {
            scene._wqaFieldReady = true;
            measure(() => field.observeReady(scene), 'field-ready');
        }
        if (field.ready(scene, true) && scene._wqaCaveCueDue && scene._wqaCaveCueDue <= c.Graphics.frameCount)
            measure(() => timing.update(scene));
        render();
        const cost=preferences.autowalk ? automaticCost : patrolCost;
        cost.framePeak=Math.max(cost.framePeak,frameCost);
    }

    try {
        // A single Directions request drives each guarded manual route.
        // The only later key in these cases deliberately tests a remaining leg.
        for (const test of [
            { map: 196, target: 20, name: 'Next cave room', category: 'Exits', point: [22, 7], from: [11, 49] },
            { map: 199, target: 25, name: 'Barrel', category: 'Objects', point: [15, 3], from: [1, 33] },
            { map: 199, target: 34, name: 'Chest', category: 'Treasure', point: [3, 7], from: [1, 33] },
            { map: 199, target: 26, name: 'Next cave room', category: 'Exits', point: [35, 16], from: [1, 33] }
        ]) {
            preferences.autowalk = false;
            records.length = accepted.length = diagnostics.length = 0;
            start(test.map, ...test.from, 0, 0);
            fixture.gameMap._displayX = Math.max(0, Math.min(test.from[0] - fixture.player.centerX(), fixture.map.width - fixture.gameMap.screenTileX()));
            fixture.gameMap._displayY = Math.max(0, Math.min(test.from[1] - fixture.player.centerY(), fixture.map.height - fixture.gameMap.screenTileY()));
            select(test.name, test.category, test.point);
            ask('directions');
            let repeated = false;
            for (let frame = 0; frame < 22000 && source._eventId !== test.target; frame++) {
                tick();
                if (!repeated && manualDrive === 'timed' && fixture.player.isMoving()) {
                    const remaining = timing.describe(scene);
                    if (/^[2-9]\d* (north|south|east|west)\.$/.test(remaining)) {
                        ask('directions');
                        assert.equal(formatSpeech(records.at(-1)), remaining);
                        repeated = true;
                    }
                }
            }
            assert.equal(source._eventId, test.target, 'Manual route reaches its destination without rechecks ' +
                JSON.stringify({test, at:[fixture.player.x,fixture.player.y], reports:records.slice(-6).map(formatSpeech), diagnostics:diagnostics.slice(-8),manualDrive,manualNext}));
            assert(repeated, 'A remaining leg was repeated during native interpolation');
            assert(!records.some(record => /check directions|request directions|patrol lane/i.test(formatSpeech(record))),
                'Guarded manual guidance contains no recheck/lane failure prose ' + JSON.stringify({test, text:records.map(formatSpeech).filter(text => /check directions|request directions|patrol lane/i.test(text))}));
        }

        // Native capture resets the distraction busy flags but retains the
        // first-use dialogue switch. Recovery routes directly to this crystal,
        // rather than resolving it as another destination's blocker.
        for (const action of ['puzzleGuide', 'directions']) {
            preferences.autowalk = false;
            records.length = accepted.length = diagnostics.length = 0;
            start(200, 9, 33, 0, 26);
            c.$gameSwitches.setValue(587, true);
            c.$gameVariables.setValue(90, 2);
            fixture.gameMap.refreshIfNeeded();
            if (action === 'directions') select('Distraction crystal', 'Objects', [15, 29]);
            ask(action);
            assert.equal(diagnostics.at(-1).target, 5, 'Recovery selects the first crystal directly');
            for (let frame = 0; frame < 1500 && !(accepted.includes(5) && !source._list && field.ready(scene)); frame++) tick();
            assert(accepted.includes(5), 'The repeat crystal is activated with native action');
            assert(!source._list, 'The no-dialogue activation finishes');
            assert.equal(crystalMessages, 0, 'The native repeat branch displays no crystal dialogue');
            assert(timing.active(scene), 'Repeat crystal activation must automatically arm the escape '+JSON.stringify({reports:records.slice(-4).map(formatSpeech),diagnostics:diagnostics.slice(-3),guard:[fixture.gameMap._events[4]._moveRouteIndex,fixture.gameMap._events[4]._jumpCount],action}));
            assert.equal(timing.describe(scene), '3 east.', 'The escape begins immediately after repeat activation');
            for (let frame = 0; frame < 800 && fixture.player.y !== 30; frame++) tick();
            assert.deepEqual([fixture.player.x, fixture.player.y], [19, 30], 'The repeat escape reaches the same protected stop');
        }

        // Source-verified guard phases at the reported exposed tiles.
        // These had no normal waiting window; escape must use current collision
        // and a complete checked route, without changing a native guard.
        for (const automatic of [true, false]) for (const [point, phase] of automatic ? [
            [[16,29],32], [[16,29],48], [[19,29],80], [[19,29],96],
            [[19,29],272], [[19,29],288], [[21,29],48], [[21,29],64],
            [[21,29],304], [[21,29],320]
        ] : [[[19,29],80], [[21,29],48]]) {
            preferences.autowalk = automatic;
            records.length = accepted.length = diagnostics.length = 0;
            start(200, 9, 33, 0, 26);
            fixture.gameMap._events[4].forceMoveRoute(fixture.map.events[5].pages[0].list[25].parameters[1]);
            for (let i=0;i<phase;i++) fixture.gameMap.updateEvents();
            fixture.player.setPosition(...point);
            fixture.gameMap._displayX = Math.max(0, point[0]-fixture.player.centerX());
            fixture.gameMap._displayY = Math.min(point[1]-fixture.player.centerY(),fixture.map.height-fixture.gameMap.screenTileY());
            fixture.gameMap.refreshIfNeeded();
            if (!automatic) firstPingDelay = 14;
            select('Barrel','Objects',[22,25]);
            ask('directions');
            const result = diagnostics.at(-1);
            assert.equal(result.status, 'timedCue', 'Exposed departure must yield an escape ' + JSON.stringify({automatic,point,phase,result}));
            assert(result.opening.urgent && result.opening.escape);
            let [x,y] = point;
            for (const heading of result.opening.headings) {
                x = fixture.gameMap.roundXWithDirection(x, DIRECTIONS[heading]);
                y = fixture.gameMap.roundYWithDirection(y, DIRECTIONS[heading]);
            }
            for (let frame=0;frame<800 && !(fixture.player.x===x && fixture.player.y===y && !fixture.player.isMoving());frame++) tick();
            assert.deepEqual([fixture.player.x,fixture.player.y], [x,y], 'The certified escape reaches its protected endpoint');
            assert(!records.some(record => /patrol lane|No .*route|No .*verified/i.test(formatSpeech(record))));
        }

        // A recovered guide or directly selected crystal must retain the
        // configured automatic mode across both native activation branches.
        for (const firstUse of [false, true]) for (const action of ['puzzleGuide', 'directions']) {
            preferences.autowalk = true;
            records.length = accepted.length = diagnostics.length = 0;
            start(200, 9, 33, 0, 26);
            c.$gameSwitches.setValue(587, !firstUse);
            c.$gameVariables.setValue(90, 2);
            fixture.gameMap.refreshIfNeeded();
            if (action === 'directions') select('Distraction crystal', 'Objects', [15, 29]);
            ask(action);
            for (let frame = 0; frame < 1800 && !(accepted.includes(5) && !source._list && field.ready(scene)); frame++) {
                tick();
                if (pendingArrival && !fixture.player.isMoving()) {
                    pendingArrival = false;
                    fixture.player.checkEventTriggerThere([0]);
                }
            }
            assert(accepted.includes(5), 'Autowalk reaches the crystal from ' + action);
            assert(!source._list, 'Native crystal activation completes');
            assert.equal(crystalMessages > 0, firstUse, 'The intended native activation branch ran');
            assert(field.autowalk.active(scene), 'Autowalk must resume after the crystal ' + JSON.stringify({action,firstUse,reports:records.slice(-3).map(formatSpeech)}));
            for (let frame = 0; frame < 800 && !(fixture.player.x === 19 && fixture.player.y === 30); frame++) tick();
            assert.deepEqual([fixture.player.x, fixture.player.y], [19, 30], 'Autowalk exits the crystal lane');
        }

        for (const automatic of [false, true]) {
            preferences.autowalk=automatic;
            records.length=accepted.length=diagnostics.length=0;
            start(200,34,20,24.5,14.875);
            c.$gameSwitches.setValue(587,true);
            c.$gameVariables.setValue(90,2);
            fixture.gameMap.refreshIfNeeded();
            select('Distraction crystal','Objects',[34,21]);
            closeSecondPrompt=true;
            ask('directions');
            for (let frame=0;frame<1000 && !(source._eventId===10 && !source._list && field.ready(scene));frame++) {
                tick();
                if (automatic && pendingArrival && !fixture.player.isMoving()) {
                    pendingArrival=false;fixture.player.checkEventTriggerThere([0]);
                }
            }
            assert.equal(source._eventId,10,'The directly selected second crystal starts natively');
            assert(!accepted.includes(10),'The early notifier remains closed');
            assert(automatic ? field.autowalk.active(scene) : timing.active(scene),'Native setup resumes the selected control mode');
            for (let frame=0;frame<800 && fixture.player.y!==14;frame++) tick();
            assert.deepEqual([fixture.player.x,fixture.player.y],[34,14],'The direct second-crystal interaction escapes north');
        }

        for (const test of [
            {target:15,name:'Checkpoint',category:'Checkpoints',point:[24,8],closed:true},
            {target:20,name:'Barrel',category:'Objects',point:[19,14],closed:true}
        ]) {
            preferences.autowalk = true;
            records.length = accepted.length = diagnostics.length = 0;
            start(200,9,33,0,26);
            c.$gameSwitches.setValue(587,true);
            c.$gameVariables.setValue(90,2);
            fixture.gameMap.refreshIfNeeded();
            select(test.name,test.category,test.point);
            closeSecondPrompt = test.closed;
            ask('directions');
            for (let frame=0; frame<14000 && source._eventId!==test.target; frame++) {
                tick();
                if (pendingArrival && !fixture.player.isMoving()) {
                    pendingArrival=false;fixture.player.checkEventTriggerThere([0]);
                }
            }
            assert(diagnostics.some(row => row.status === 'crystalReady' && row.target === 10), 'The second crystal is confirmed at native handback');
            assert(!accepted.includes(10), 'The early acceptance notifier was gated off in this regression');
            assert.equal(source._eventId,test.target, 'The second-crystal handoff retains its objective '+JSON.stringify({test,at:[fixture.player.x,fixture.player.y],accepted,diagnostics:diagnostics.slice(-8),reports:records.slice(-4).map(formatSpeech)}));
        }

        const entry = load(199).map.events[26].pages[0].list.find(command => command.code === 201).parameters;
        assert.equal(entry[1], 200);
        // Reproduce the exact report and cover both room barrels through the
        // production field owner. Selected loot is opened by the user's action,
        // matching ordinary Autowalk arrival; crystals remain prerequisites.
        for (const test of [
            { automatic: false, target: 3, point: [22, 25], from: [23, 26, 15.25, 21.25] },
            { automatic: false, target: 3, point: [22, 25] },
            { automatic: true, target: 3, point: [22, 25] },
            { automatic: false, target: 12, point: [33, 7] },
            { automatic: true, target: 12, point: [33, 7] }
        ]) {
            preferences.autowalk = test.automatic;
            records.length = accepted.length = diagnostics.length = 0;
            start(200, ...(test.from || [entry[2], entry[3], 0, 26]));
            select('Barrel', 'Objects', test.point);
            ask('directions');
            if (packets.length) render();
            assert.equal(diagnostics.at(-1).target, 5,
                'The first walking leg must target the crystal, even far from the barrel');
            if (test.from) assert(diagnostics.some(row => row.status === 'patrolBlocked'),
                'A stationary guard must select its crystal: ' + JSON.stringify(diagnostics));
            let rechecks = 0, crystalRechecked = false, checked = [fixture.player.x, fixture.player.y];
            for (let frame = 0; frame < 14000 && source._eventId !== test.target; frame++) {
                tick();
                if (!test.automatic && test.target === 3 && !accepted.includes(5) && rechecks < 3 &&
                    !fixture.player.isMoving() && field.ready(scene) &&
                    (checked[0] !== fixture.player.x || checked[1] !== fixture.player.y)) {
                    checked = [fixture.player.x, fixture.player.y];
                    ask('directions');
                    if (packets.length) render();
                    rechecks++;
                    assert.equal(diagnostics.at(-1).target, 5,
                        'Directions while approaching the crystal must keep routing to it');
                }
                if (!test.automatic && test.target === 3 && !accepted.includes(5) && !crystalRechecked &&
                    fixture.player.x === 16 && fixture.player.y === 29 && !fixture.player.isMoving() && field.ready(scene)) {
                    ask('directions');
                    if (packets.length) render();
                    crystalRechecked = true;
                    assert.equal(diagnostics.at(-1).target, 5);
                    assert.match(formatSpeech(records.at(-1)), /Face west and press the action button to activate the distraction crystal/);
                }
                if (test.automatic && pendingArrival && !fixture.player.isMoving()) {
                    pendingArrival = false;
                    fixture.player.checkEventTriggerThere([0]);
                }
            }
            assert(accepted.includes(5), 'The barrel route activates crystal 5');
            if (!test.automatic && test.target === 3) {
                assert.equal(rechecks, 3);
                assert(crystalRechecked, 'Directions at the crystal still gives its activation action');
            }
            assert.equal(source._eventId, test.target, 'The original barrel remains selected ' +
                JSON.stringify({ test, accepted, position: [fixture.player.x,fixture.player.y],
                    reports: records.slice(-5).map(formatSpeech), diagnostics: diagnostics.slice(-10), manualDrive, manualNext }));
            if (test.target === 3) {
                assert(records.some(record => /open the barrel, then move 1 north/i.test(record.guide || record.name || '')),
                    'The transient interaction includes its escape direction');
                // A finite native replay checks the reserved pickup delay and
                // the retreat. Message rendering is a stand-in, not timed speech.
                c.Input.dir4 = 0; manualDrive = null; manualNext = false;
                for (let frame = 0; frame < 90; frame++) tick();
                c.Input.dir4 = 8;
                for (let frame = 0; frame < 16; frame++) tick();
                c.Input.dir4 = 0;
                assert.deepEqual([fixture.player.x, fixture.player.y], [23, 24]);
                for (let frame = 0; frame < 240; frame++) tick();
                assert.deepEqual([fixture.player.x, fixture.player.y], [23, 24]);
            }
        }
        records.length = accepted.length = diagnostics.length = 0;
        preferences.autowalk = true;
        start(200, entry[2], entry[3], 0, 26);
        select('Chase room entrance');
        ask('directions');
        for (let frame = 0; frame < 14000 && !fixture.gameMap._events[11].isStarting(); frame++) {
            // The final exit is left to the native transfer once it starts.
            if (source._eventId === 11) break;
            tick();
            const failure = records.find(record => /^Autowalk stopped|unavailable|No crossing/i.test(record.name));
            assert(!failure, JSON.stringify({ failure, x: fixture.player.x, y: fixture.player.y, accepted }));
        }
        assert([5, 10, 19].every(id => accepted.includes(id)), 'All three distraction crystals were activated ' +
            JSON.stringify({ accepted, position: [fixture.player.x, fixture.player.y], reports: records.slice(-5), active: scene._wqaAutowalkActive, source: source._eventId, diagnostics }));
        assert(accepted.includes(11) || source._eventId === 11 || fixture.gameMap._events[11].isStarting(), 'Autowalk retained the selected exit ' + JSON.stringify({ accepted, position: [fixture.player.x,fixture.player.y], reports: records.slice(-3), diagnostics: diagnostics.slice(-8), source:source._eventId, list:source._list?.length }));

        preferences.autowalk = false;
        records.length = accepted.length = diagnostics.length = 0;
        start(200, 23, 26, 15.25, 21.25);
        select('Chase room entrance');
        ask('directions');
        for (let frame = 0; frame < 14000 && source._eventId !== 11; frame++) tick();
        assert([5, 10, 19].every(id => accepted.includes(id)), 'Manual crystal activation remained available ' + JSON.stringify({accepted, position:[fixture.player.x,fixture.player.y], reports:records.slice(-4).map(formatSpeech), diagnostics:diagnostics.slice(-6), manualDrive, manualNext}));
        assert.equal(source._eventId, 11, JSON.stringify({ accepted, position: [fixture.player.x,fixture.player.y],
            reports: records.slice(-4).map(formatSpeech), diagnostics: diagnostics.slice(-5), manualDrive, manualNext }));
        assert(records.some(record => record.distractionCrystal &&
            formatSpeech(record).includes('activate the distraction crystal')));

        for (const automatic of [true, false]) {
            preferences.autowalk = automatic;
            records.length = accepted.length = 0;
            start(201, 6, 44, 0, 39.25);
            select('Staircase passage');
            records.length = 0;
            ask('directions');
            for (let frame = 0; frame < 8000 && source._eventId !== 2; frame++) {
                if (!automatic) {
                    const last = records[records.length - 1];
                    const spoken = last && formatSpeech(last);
                    const match = /^(\d+) (north|south|east|west)\.$/.exec(spoken || '');
                    assert(match, 'Only a current two-word chase leg is spoken: ' + spoken);
                    c.Input.dir4 = { north: 8, south: 2, east: 6, west: 4 }[match[2]];
                    if (!repeatChecked && match[2] === 'east' && Number(match[1]) > 1 &&
                        fixture.player.isMoving() && fixture.player._direction === 6 && fixture.player._x > 3) {
                        assert(field.command('directions'));
                        render();
                        assert.equal(formatSpeech(records[records.length - 1]), (Number(match[1]) - 1) + ' east.');
                        repeatChecked = true;
                    }
                }
                tick();
            }
            assert.deepEqual(accepted.filter(id => id !== 2), [4, 9, 11, 13, 24, 26, 27, 28, 29]);
            assert.equal(source._eventId, 2, 'The destination remained the staircase passage');
            if (!automatic) assert(repeatChecked, 'Directions repeated a remaining leg during interpolation');
        }
    } finally {
        field.leave(scene);
        Object.assign(c, saved);
        c.SceneManager._scene = originalScene;
        c.Graphics.app = app;
        Object.assign(c.Graphics, previousView);
        c.$gameParty.members = members;
        c.$gameParty.inBattle = inBattle;
    }
    console.log('Second-crystal worker-dispatch costs', JSON.stringify(computeCosts), 'throttled wall and coarse process CPU ms; the production worker executes here in the fixture process.');
    console.log('Capped callback wall outliers',JSON.stringify(callbackOutliers),'with coarse process CPU samples; not a live-game measurement.');
    console.log('Automatic cave callback accounting',JSON.stringify(automaticCost),'ms including native action setup and nested handoff hooks, counted once.');
    console.log('Manual patrol callback accounting', JSON.stringify(patrolCost), 'ms across accepted movement, event/ready gates, render continuations and replies; worker and physical output excluded.');
    console.log('Patrol-room field reply accounting', JSON.stringify(replyCost), 'ms, excluding route-worker computation and physical output.');
    console.log('Manual chase guidance callback accounting', JSON.stringify(guidanceCost), 'ms in the bounded fixture, excluding worker computation and physical output.');
    console.log('Verified the first two patrol rooms with automatic current-leg speech, repeat crystal activation without dialogue from recovery and direct Directions, both distraction-room barrels in manual/automatic control, the reported stationary guard, pickup/retreat, all crystals and nine chase handoffs.');
}

module.exports = { verifyCaveField };
