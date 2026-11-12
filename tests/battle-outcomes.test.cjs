'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enter } = require('./dialogue.test.cjs');
const { mapData } = require('./map-lifecycle.test.cjs');
const { formatSpeech } = require('../src/services/speech-text.cjs');


async function verifyBattleOutcomes() {
    const installedData = name => JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', name), 'utf8'));
    const system = installedData('System.json');
    const item = installedData('Items.json').find(item => item?.name);
    const labels = system.terms.messages;

    function arrange(f) {
        const { c, scene, settings } = f;
        scene._fadeDuration = scene._fadeOpacity = 0;
        c.$gameMessage._texts = [];
        c.$gameMessage.allText = c.Game_Message.prototype.allText;
        settings.faceReady = true;
        settings.hasText = () => c.$gameMessage._texts.length > 0;
        settings.isBusy = settings.hasText;
        settings.clear = () => { c.$gameMessage._texts.length = 0; };
        Object.assign(c.TextManager, labels, { exp: system.terms.basic[8], currencyUnit: system.currencyUnit });
        c.$gameActors = { _data: [null, { equips: () => [{ traits: [{ code: 23, dataId: 9, value: 1.5 }] }] }] };
        c.$gameParty = { name: () => 'Fixture party', removeBattleStates() {}, performVictory() {} };
        c.$gameSystem.onBattleWin = () => {};
        c.$gameTemp.clearCommonEventReservation = () => {};
        c.AudioManager.stopBgm = () => {};
        Object.assign(c.BattleManager, {
            _phase: 'turn', _canLose: true, cancelActorInput() {}, playVictoryMe() {}, playDefeatMe() {}, replayBgmAndBgs() {},
            makeRewards() { this._rewards = { exp: 20, gold: 12, items: [item] }; },
            gainRewards() { assert.equal(this._rewards.gold, 12); }
        });
        c.BattleManager._logWindow.push = action => { if (action === 'waitForTime') settings.battleLogBusy = true; };
    }

    const won = await enter(mapData(19), 19, true);
    arrange(won);
    won.c.BattleManager.processVictory();
    assert.equal(won.c.BattleManager._phase, 'battleEnd');
    assert.equal(won.scene._wqaBattleInterpreter, undefined);
    won.settings.battleBusy = true;
    won.until(() => won.window.pause);
    assert.equal(won.packets().length, 0, 'native sprite work withholds result speech');
    won.settings.battleBusy = false;
    const started = performance.now();
    won.tick(false);
    assert.equal(won.packets().length, 0, 'result must have reached postrender');
    won.frame();
    const receipt = performance.now() - started;
    assert.equal(won.c.BattleManager._wqaDialogueBusy, true, 'native log wait remains active');
    assert.equal(formatSpeech(won.packets()[0]), [
        labels.victory,
        labels.obtainExp.replace('%1', '30').replace('%2', system.terms.basic[8]),
        labels.obtainGold.replace('%1', '12').replace('\\G', system.currencyUnit)
    ].join(' ').replace(/\s+/g, ' '));
    won.advance();
    won.until(() => won.packets().length === 2);
    assert.equal(formatSpeech(won.packets()[1]), labels.obtainItem.replace('%1', item.name));
    won.advance();
    assert.equal(won.epoch(), 0);

    const lost = await enter(mapData(19), 19, true);
    arrange(lost);
    lost.c.BattleManager.processDefeat();
    lost.until(() => lost.packets().length === 1);
    assert.equal(formatSpeech(lost.packets()[0]), labels.defeat);
    lost.settings.battleLogBusy = false;
    lost.tick();
    assert.equal(lost.epoch(), 0, 'native battle end retires the visible result before the scene changes');
    return receipt;
}

async function verifyLevelUp() {
    const f = await enter(mapData(19));
    const { c, scene, settings } = f;
    const data = name => JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw', 'data', name), 'utf8'));
    const actor = data('Actors.json')[1];
    const currentClass = data('Classes.json')[actor.classId];
    const learning = currentClass.learnings.find(entry => entry.level === 5);
    assert(learning);
    const skill = data('Skills.json')[learning.skillId];

    c.$gameMessage._texts = [];
    c.$gameMessage.allText = c.Game_Message.prototype.allText;
    settings.faceReady = true;
    settings.hasText = () => c.$gameMessage._texts.length > 0;
    settings.isBusy = settings.hasText;
    settings.clear = () => { c.$gameMessage._texts.length = 0; };
    c.$gamePlayer._interactIcon = null;
    let canMove = false;
    c.$gamePlayer.canMove = () => canMove;
    c.a23_0x243974 = () => { throw Error('Unresolved level-up property'); };
    c.AudioManager.playMe = () => {};
    scene.serializeAllEvents = scene.deserializeAllEvents = () => {};
    scene._spriteset = { _characterSprites: [] };
    let nativeSaves = 0;
    scene.executeAutosave = () => { c.SceneManager._wqaNativeAutosaves = ++nativeSaves; };
    let coroutine = null;
    c.CoroutineManager = { StartAnonymousCoroutine(task) { coroutine = task(); } };
    const wendy = Object.assign(new c.Game_Actor(), { _level: learning.level, mhp: 40, mmp: 20, didLevelUp: true,
        currentClass: () => currentClass, getMomentumMax: () => 2, setMomentum() {}, clearStates() {} });

    wendy.displayLevelUp([skill]);
    assert(coroutine);
    for (let step = 0; step < 12; step++) assert.equal(coroutine.next().done, false);
    assert.equal(c.$gameMessage._texts.length, 0, 'native level-up waits for map control');
    canMove = true;
    assert.equal(coroutine.next().done, true);
    assert.equal(wendy.didLevelUp, false);
    assert.equal(nativeSaves, 1);
    f.until(() => f.window.pause);
    assert.deepEqual(f.packets(), [], 'level-up speech waits for native autosave');
    c.SceneManager._wqaNativeAutosaves = 0;
    f.until(() => f.packets().length === 1);
    assert.match(formatSpeech(f.packets()[0]), /Wendy is now level 5/);
    assert.match(formatSpeech(f.packets()[0]), /Health increased|Freshness increased/);
    f.advance();
    f.until(() => f.packets().length === 2);
    const message = formatSpeech(f.packets()[1]);
    assert(message.includes(skill.name));
    assert(message.includes('momentum pip'));
}

(async () => {
    const receipt = await verifyBattleOutcomes();
    await verifyLevelUp();
    console.log('Verified the installed victory, rewards, defeat, level-up and skill pages through the native message renderer.');
    console.log('Throttled settled battle result to synthetic render and formatted receipt', receipt.toFixed(2), 'ms.');
})().catch(error => { console.error(error); process.exitCode = 1; });
