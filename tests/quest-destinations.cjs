'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { captureWorld } = require('../src/world/snapshot');
const { questDestinationCurrent } = require('../src/world/quest-destinations');
const { browse, createDestinationBrowser } = require('../src/world/destinations');
const { solveRoute } = require('../src/world/routes.cjs');

const PLUGIN = 'Ayatam_HighQualityQuestSystem';

function questRegistry(game) {
    const registry = fs.readFileSync(path.join(game, 'package.nw', 'js', 'plugins.js'), 'utf8');
    const plugins = JSON.parse(registry.slice(registry.indexOf('=') + 1).trim().replace(/;$/, ''));
    return JSON.parse(plugins.find(entry => entry.name === PLUGIN).parameters.QuestDatabase).map(JSON.parse);
}

async function verifyQuestDestinations(c, game, read, load, verifyRoute, verifyWorker) {
    const registry = questRegistry(game);
    const records = Object.fromEntries(registry.map((quest, index) => {
        const id = 'quest' + (index + 1);
        const objectives = JSON.parse(quest.QuestObjectiveSettings || '[]').map((value, index) => {
            const objective = JSON.parse(value);
            const set = 'set' + (index + 1);
            const amount = objective.ObjectiveFinishAmount === '' ? 1 : Number(objective.ObjectiveFinishAmount);
            return [set, { _id: set, _target: 0, _finishAmount: amount,
                _contentType: objective.ObjectiveTypes, _contentId: JSON.parse(objective.ObjectiveID).TargetEventName }];
        });
        return [id, { _id: id, _questName: quest.QuestName, _questObjectives: Object.fromEntries(objectives),
            _questLocationInformation: JSON.parse(quest.LocationInformation || '[]') }];
    }));
    let reported = false;
    let refreshNotice = null;
    Object.assign(c, {
        Spriteset_Map: function () {}, Sprite: function () {},
        Sprite_AyatamQuestIcon: function (record) { this.initialize(record); },
        Bitmap: function () { this.clear = () => {}; this.blt = () => {}; },
        Rectangle: function (x, y, width, height) {
            this.x = x; this.y = y; this.width = width; this.height = height;
            this.contains = (px, py) => px >= x && py >= y && px < x + width && py < y + height;
        },
        Vector2: function (x, y) { this.x = x; this.y = y; },
        WaitUntil: function (ready, complete) { this.ready = ready; this.complete = complete; this.isCompleted = () => true; },
        AyatamQuestSystemName: PLUGIN, a1_0x4e0759() {},
        Ayatam: { QUEST: { QuestDatabase: registry, needsRefresh: false, imgCashes: { UI: { iconMarkers: {} } } } },
        $dataMapInfos: read('MapInfos.json'),
        $gameQuest: {
            _questData: records, _manualQuestIcons: [], _objectiveQuestEvents: {}, imageLoader: { IsDoneLoading: () => true },
            parseQuest(value) {
                return records[value] || records['quest' + Number.parseInt(value, 10)] ||
                    Object.values(records).find(record => record._questName === value);
            },
            findQuest: id => records[id],
            getObjective: (id, set) => records[id]?._questObjectives[set],
            isReported: () => reported,
            canReport: id => Object.values(records[id]._questObjectives).every(row => row._target >= row._finishAmount),
            getFirstUnclearedObjectiveId: id => Object.values(records[id]._questObjectives)
                .find(row => row._target < row._finishAmount)?._id
        },
        WendyQuestAccessQuestNavigationLeaving(scene) { refreshNotice?.(scene); }
    });
    Object.assign(c.Sprite.prototype, { initialize() {
        Object.assign(this, { anchor: {}, renderable: true, worldVisible: true, worldAlpha: 1, texture: { valid: true } });
    }, update() {} });
    Object.setPrototypeOf(c.Sprite_AyatamQuestIcon.prototype, c.Sprite.prototype);
    Object.assign(c.$gameParty, {
        getNav() { return this._questNav; },
        getQuestMapIcon() { return this._mapIcons.length ? this._mapIcons : null; },
        clearQuestMapIcon() { this._mapIcons = []; },
        questObjectives: (id, set) => records[id]?._questObjectives[set]
    });
    const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
        path.join(__dirname, 'quest-marker-producers.py'), game], { encoding: 'utf8', timeout: 6000, maxBuffer: 40000 }));
    for (const method of methods) vm.runInContext(method, c, { timeout: 100 });

    function stage(fixture, nav) {
        const { gameMap } = fixture;
        const parent = { addChild(sprite) { sprite.parent = this; }, removeChild(sprite) { sprite.parent = null; } };
        const spriteset = Object.assign(new c.Spriteset_Map(), { _tilemap: { parent } });
        const scene = c.SceneManager._scene = { _spriteset: spriteset };
        c.$gameParty._questNav = nav;
        c.$gameParty.clearQuestMapIcon();
        c.$gameQuest._manualQuestIcons = [];
        c.$gameQuest._objectiveQuestEvents = {};
        gameMap._exitLocations = {};
        for (const event of gameMap.events()) if (event.page()) {
            event.screenX = () => event._x * 32;
            event.screenY = () => event._y * 32;
            event.setupFlagIcons();
        }
        spriteset.createQuestFlagIcons();
        c.Ayatam.QUEST.needsRefresh = false;
        return scene;
    }

    const targets = (scene, routing = false) => captureWorld(c, routing, undefined, scene);
    const quests = scene => targets(scene).objects.filter(row => row.category === 'quests');

    const chest = load(13);
    chest.player.setPosition(17, 21);
    const chestScene = stage(chest, 'quest4');
    const chestTargets = targets(chestScene, true);
    const chestTarget = chestTargets.objects.find(row => row.category === 'quests' && row.id === 14);
    assert.match(chestTarget.name, /^(?:Chest|Treasure)$/, 'quest treasure retains a type-only label');
    assert(chestTargets.objects.some(row => row.category === 'treasure' && row.id === 14));
    assert(questDestinationCurrent(c, chestScene, chestTarget.quest));
    const floor = chest.gameMap._events[14];
    const originalName = chest.map.events[14].name;
    const originalImage = floor.page().image.characterName;
    const originalTrigger = floor._trigger;
    const originalPriority = floor._priorityType;
    // Use the native marker binding to exercise precedence on a floor trigger.
    chest.map.events[14].name = 'Floor scene';
    floor.page().image.characterName = '';
    floor._trigger = 1;
    floor._priorityType = 0;
    assert(targets(chestScene).objects.some(row => row.id === 14 && row.category === 'quests' && row.eventAction === 'step'));
    assert(!targets(chestScene).objects.some(row => row.id === 14 && row.category === 'events'));
    chest.map.events[14].name = originalName;
    floor.page().image.characterName = originalImage;
    floor._trigger = originalTrigger;
    floor._priorityType = originalPriority;
    const browser = createDestinationBrowser();
    browser.category = 'quests';
    assert.equal(browse(browser, chestTargets, []).target.id, 14);
    const chestRoute = { x: 17, y: 21, event: 14, field: true };
    verifyRoute(chest, chestRoute, solveRoute(chest.geometry, chestTargets.live, chestRoute));
    await verifyWorker(chest, chestRoute, chestTargets.live);
    // The render notification must precede removal and the native asset waiter.
    chestScene._wqaQuestNavigation = true;
    refreshNotice = scene => {
        assert.equal(scene, chestScene);
        assert(questDestinationCurrent(c, chestScene, chestTarget.quest));
        assert.equal(scene._spriteset.iconLoadWaiter, undefined);
    };
    chestScene._spriteset.refreshIcons();
    assert(!questDestinationCurrent(c, chestScene, chestTarget.quest));
    assert.equal(quests(chestScene).length, 0);
    const waiter = chestScene._spriteset.iconLoadWaiter;
    assert(waiter.ready());
    waiter.complete();
    assert(quests(chestScene).some(row => row.id === 14));
    refreshNotice = null;
    const afterChest = load(13, { self: ['13,14,A'] });
    afterChest.player.setPosition(17, 21);
    assert.equal(afterChest.gameMap._events[14]._pageIndex, 1);
    assert(!quests(stage(afterChest, 'quest4')).some(row => row.id === 14));

    const locked = load(15);
    locked.player.setPosition(24, 17);
    const lockedScene = stage(locked, 'quest10');
    const markers = lockedScene._spriteset._ayatamQuestIconSprite;
    assert(markers.some(marker => marker._active && marker._generated && marker._eventIds.includes(31)));
    assert(!quests(lockedScene).some(row => [31, 32, 33].includes(row.id)),
        'a generated icon can know a future switch page, which is still unavailable');
    const open = load(15, { switches: [18] });
    open.player.setPosition(24, 17);
    const openScene = stage(open, 'quest10');
    assert.deepEqual(quests(openScene).filter(row => [31, 32, 33].includes(row.id)).map(row => row.id), [31, 32, 33]);
    const buttons = targets(openScene, true).objects.filter(row => row.category === 'objects' && [31, 32, 33].includes(row.id));
    assert.deepEqual(buttons.map(({ id, name, showBlocked }) => ({ id, name, showBlocked })), [31, 32, 33].map(id =>
        ({ id, name: 'Gate switch', showBlocked: true })));
    for (const button of buttons) assert.equal(open.gameMap._events[button.id]._trigger, 0);
    assert(!targets(openScene).objects.some(row => row.category === 'events' && [31, 32, 33].includes(row.id)));
    const selected = quests(openScene).find(row => row.id === 31);
    open.gameMap._events[31]._pageIndex = 0;
    assert(!questDestinationCurrent(c, openScene, selected.quest), 'the worker lease carries the effective event page');
    assert(!quests(openScene).some(row => row.id === 31));

    const completed = records.quest10._questObjectives.set1;
    completed._target = completed._finishAmount;
    const prop = load(15, { switches: [18] });
    prop.player.setPosition(24, 17);
    const propScene = stage(prop, 'quest10');
    const propTargets = targets(propScene, true);
    const marker = propTargets.objects.find(row => row.category === 'quests' && row.id === 29);
    assert(marker.quest.waypoint);
    assert.equal(marker.name, 'Quest marker near Fry Stone');
    assert(!propTargets.objects.some(row => row.category === 'quests' && [31, 32, 33].includes(row.id)));
    const propRoute = { x: 24, y: 17, event: 29, field: true, waypoint: true, autowalk: true, limit: 8 };
    await verifyWorker(prop, propRoute, propTargets.live, result => {
        assert.equal(result.status, 'ready');
        assert.equal(result.arrival.facing, null);
        assert.equal(result.autowalkStop, undefined);
        assert.equal(Math.abs(result.arrival.x - 24) + Math.abs(result.arrival.y - 15), 1);
        verifyRoute(prop, { ...propRoute, event: undefined, targetX: result.arrival.x, targetY: result.arrival.y }, result);
    });
    c.$gameParty._questNav = 'quest9';
    assert(!questDestinationCurrent(c, propScene, marker.quest));
    c.$gameParty._questNav = 'quest10';
    reported = true;
    assert(!quests(stage(prop, 'quest10')).some(row => row.id === 29));
    reported = false;

    const steadyScene = stage(prop, 'quest10');
    const repeat = scene => {
        const start = performance.now();
        for (let index = 0; index < 120; index++) targets(scene);
        return performance.now() - start;
    };
    const without = repeat(undefined);
    const connected = repeat(steadyScene);
    console.log('Verified authored quest chest, gated switch pages and marked stone approach with installed producers.');
    console.log('120 synthetic Map 15 browse snapshots, bypassed %s ms, connected %s ms.', without.toFixed(2), connected.toFixed(2));
}

module.exports = { verifyQuestDestinations };
