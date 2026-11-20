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
    let field, fixture, guards, source, repeatChecked = false;
    const guidanceCost = { calls: 0, total: 0, peak: 0 };
    function measure(callback) {
        if (preferences.autowalk || fixture?.id !== 201) return callback();
        const start = performance.now();
        const result = callback();
        const elapsed = performance.now() - start;
        guidanceCost.calls++; guidanceCost.total += elapsed; guidanceCost.peak = Math.max(guidanceCost.peak, elapsed);
        return result;
    }
    let serial = 0, deliver, manualDrive = null, staticLeg = null, manualNext = false;
    const routeSource = path.join(__dirname, '../src/world/route-worker.cjs');
    function createRouteWorker(buffer) {
        // Execute the production worker dispatcher with deferred, cloned
        // numeric packets. Only thread transport is a fixture stand-in.
        const wire = { on(type, handler) { assert.equal(type, 'message'); deliver = handler; },
            postMessage(packet) {
                if (!preferences.autowalk && fixture.id === 200) {
                    const result = packet.result;
                    if (result.status === 'ready' || result.status === 'interrupted' || result.status === 'patrolApproach') {
                        const legs = result.legs || [{ direction: result.direction, tiles: result.tiles }];
                        const moves = legs.flatMap(leg => Array(leg.tiles).fill(leg.direction));
                        if (result.boundary) moves.push(result.boundary);
                        staticLeg = { moves, index: 0, facing: result.arrival?.facing };
                        manualDrive = 'static';
                    } else if (result.status === 'unsafeCrossing' && !result.exposed) {
                        manualDrive = 'retry';
                        manualNext = c.Graphics.frameCount + 18;
                    } else if (result.status === 'timedCue' || result.status === 'timedWait') manualDrive = 'timed';
                }
                worker.emit('message', packet);
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
    c.$gameTemp = { isDestinationValid: () => false, clearDestination() {} };
    c.$gameMessage = { isBusy: () => false };
    c.$gameParty.members = () => [4];
    c.$gameParty.inBattle = () => false;
    c.addEventListener = () => {};
    const timing = createCaveTiming(c, value => value === scene,
        { cues: CUE, isPrepared: () => true, retire() {}, play(_scene, _hrtf, cue, _gain, source, current) {
            if (!current()) return false;
            if (!preferences.autowalk && fixture?.id === 200) {
                if (cue === CUE.caveGo) {
                    manualDrive = 'timed';
                    c.Input.dir4 = source[0] ? source[0] < 0 ? 4 : 6 : source[2] < 0 ? 2 : 8;
                } else if (cue === CUE.wallBump) {
                    c.Input.dir4 = 0;
                    manualNext = true;
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
        arrive(record, current) { assert(current()); records.push(record); return ++serial; }, endArrival() {}
    }, (job, result) => diagnostics.push({ target: job.target, destination: job.caveWalk?.destination?.id, status: result?.status, frame: c.Graphics.frameCount, x: c.$gamePlayer.x, y: c.$gamePlayer.y, direction: result?.direction, tiles: result?.tiles, guard: [c.$gameMap._events[4]?._x, c.$gameMap._events[4]?._y, c.$gameMap._events[4]?._moveRouteForcing, c.$gameMap._events[4]?._moveRouteIndex], gate: c.$gameSwitches.value(582) }));
    c.WendyQuestAccessFieldChanged = (owner, actor) => {
        if (actor === c.$gamePlayer) timing.pose(owner); else timing.stop(owner);
        field.changed(owner, actor);
    };
    c.WendyQuestAccessCaveTimingMoved = timing.moved;
    c.WendyQuestAccessAutowalkInput = field.autowalk.input;
    c.WendyQuestAccessFieldMove = (owner, direction, succeeded) => {
        measure(() => { field.autowalk.moved(owner, direction, succeeded); field.chaseMoved(owner, direction, succeeded); });
    };
    c.WendyQuestAccessFieldEvent = (owner) => { field.autowalk.stop(owner); field.changed(owner); };
    c.WendyQuestAccessCaveEventAccepted = (owner, event) => {
        accepted.push(event._eventId);
        measure(() => field.caveEventAccepted(owner, event));
    };
    c.WendyQuestAccessSceneLeaving = (owner, eventId) => field.leave(owner, eventId);

    function start(map, x, y, viewX, viewY) {
        field.leave(scene);
        ({ run: fixture, guards } = setup(map, x, y, viewX, viewY));
        const { player, gameMap } = fixture;
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
        manualDrive = staticLeg = null; manualNext = false;
    }

    function render() {
        if (renderer.listenerCount('postrender')) measure(() => renderer.emit('postrender'));
        const packet = packets.shift();
        if (packet) {
            assert(!packets.length);
            deliver(structuredClone(packet));
        }
    }

    function ask(action) { assert(field.command(action)); render(); }
    function select(name) {
        for (let count = 0; count < 9; count++) {
            ask('nextCategory');
            if (records[records.length - 1]?.category === 'Exits') break;
        }
        for (let count = 0; count < 16; count++) {
            ask('nextDestination');
            if (records[records.length - 1]?.name === name) return;
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
            interpreter.executeCommand();
            if (interpreter._waitCount || interpreter._waitMode) break;
        }
    }

    function tick() {
        const { gameMap, player } = fixture;
        c.Graphics.frameCount++;
        gameMap.refreshIfNeeded();
        gameMap.updateEvents();
        for (const event of gameMap.events()) if (event._trigger === 4) execute(event._interpreter);
        assert(!guards.some(guard => guard.isStarting()),
            'Guard contact on map ' + fixture.id + ' at ' + [player.x, player.y] + ' after ' + records.slice(-3).map(formatSpeech) + JSON.stringify({ frame: c.Graphics.frameCount, source: [source._eventId,source._index,source._waitMode], diagnostics }));
        const beforeX = player.scrolledX(), beforeY = player.scrolledY();
        const wasMoving = player.isMoving();
        if (!preferences.autowalk && fixture.id === 200 && !source._list && !player.isMoving()) {
            if (manualDrive === 'static') {
                if (staticLeg.index < staticLeg.moves.length) c.Input.dir4 = staticLeg.moves[staticLeg.index];
                else {
                    c.Input.dir4 = 0;
                    manualDrive = null;
                    if (staticLeg.facing) {
                        player.setDirection(staticLeg.facing);
                        player.checkEventTriggerThere([0]);
                    } else manualNext = true;
                }
            }
            if (manualNext && (manualNext === true || c.Graphics.frameCount >= manualNext)) {
                manualNext = false;
                field.command('directions');
            }
        }
        const oldX = player.x, oldY = player.y;
        if (!source._list) player.moveByInput();
        if (!preferences.autowalk && fixture.id === 200 && manualDrive === 'static' &&
            (oldX !== player.x || oldY !== player.y)) {
            assert.equal(player._direction, staticLeg.moves[staticLeg.index++]);
        }
        const tookStep = player.isMoving();
        if (tookStep) player.updateMove();
        player.updateScroll(beforeX, beforeY);
        if ((wasMoving || tookStep) && !player.isMoving() && !source._list) player.checkEventTriggerHere([1]);
        if (!source._list) gameMap.setupStartingMapEvent();
        execute(source);
        if (!source._list && !player.isMoving()) {
            scene._wqaFieldReady = true;
            if (c.Graphics._wqaCaveChasePending) measure(() => field.observeReady(scene));
            else field.observeReady(scene);
        }
        if (field.ready(scene, true) && scene._wqaCaveCueDue && scene._wqaCaveCueDue <= c.Graphics.frameCount)
            timing.update(scene);
        render();
    }

    try {
        const entry = load(199).map.events[26].pages[0].list.find(command => command.code === 201).parameters;
        assert.equal(entry[1], 200);
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
        assert(records.some(record => record.guide?.includes('Press the action button')));

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
        c.$gameParty.members = members;
        c.$gameParty.inBattle = inBattle;
    }
    console.log('Manual chase guidance callback accounting', JSON.stringify(guidanceCost), 'ms in the bounded fixture, excluding worker computation and physical output.');
    console.log('Verified the production field owner through all distraction crystals and nine chase handoffs in automatic and concise manual control.');
}

module.exports = { verifyCaveField };
