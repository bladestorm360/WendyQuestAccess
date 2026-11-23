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

    function prepareMomentum({ c, scene }) {
        c.Graphics.frameCount = 0;
        c.Clamp = (min, max, value) => Math.max(min, Math.min(max, value));
        c.RandomRange = (min, max) => (min + max) / 2;
        c.AudioManager.playSe = () => {};
        const actor = Object.assign(new c.Game_Battler(), { _momentum: 0, getMomentumMax: () => 3 });
        const field = { addChild(sprite) { this.crystal = sprite; } };
        scene._spriteset = { _battleField: field };
        const hud = scene._statusWindow = { parent: scene, worldVisible: true, worldAlpha: 1,
            offsetY: 0, bitmap: { isReady: () => true }, _momentumCurrent: 0,
            GetMomentumPosition: () => ({ x: 320, y: 120 }) };
        hud.momentumPips = [0, 1, 2].map(() => ({ baseSprite: { parent: hud, worldVisible: true,
            worldAlpha: 1, bitmap: { isReady: () => true }, _frame: { x: 0, y: 0 } } }));
        Object.assign(c.BattleHelper, { GetStatusUI: () => hud, GetFirstPartyMember: () => actor,
            GetBattleField: () => field });
        c.Sprite_MomentumCrystal.prototype.destroy = function () { field.crystal = null; };
        return {
            field,
            collect() {
                const before = actor.getMomentum();
                c.BattleHelper.SpawnMomentumCrystal(12, 24, false);
                assert.equal(actor.getMomentum(), before, 'crystal spawn alone grants nothing');
                field.crystal.phase = 2;
                field.crystal.update();
                assert.equal(actor.getMomentum(), before + 1);
                hud._momentumCurrent = actor.getMomentum();
            },
            paint() {
                for (let index = 0; index < hud.momentumPips.length; index++)
                    hud.momentumPips[index].baseSprite._frame.x = index < actor.getMomentum() ? 32 : 0;
            }
        };
    }

    const won = await enter(mapData(19), 19, true);
    arrange(won);
    const momentum = prepareMomentum(won);
    // Exercise the original crystal initialization, update/bounce and full
    // branch independently of the HUD observer or the narration mock.
    {
        const c=won.c,scene=won.scene,proto=c.Sprite_MomentumCrystal.prototype;
        c.Sprite=function(){};c.Sprite.prototype.initialize=function(bitmap){this.bitmap=bitmap;this.anchor={};};
        c.Sprite.prototype.update=()=>{};
        c.ImageManager.loadBitmap=()=>({isReady:()=>true});
        c.Sprite_MomentumCrystal=function(...args){this.initialize(...args);};c.Sprite_MomentumCrystal.prototype=proto;
        proto.setFrame=function(x,y,width,height){this._frame={x,y,width,height};};
        proto.getGlobalPosition=function(){return{x:this.x,y:this.y};};
        momentum.field.addChild=function(sprite){sprite.parent=this;this.crystal=sprite;};
        momentum.field.removeChild=()=>{};scene.toLocal=p=>p;scene.addChild=sprite=>sprite.parent=scene;
        let stars=0,seconds=1/60;const observations=[];
        c.Time={GetDeltaTime:()=>seconds};c.Sprite_StarEffect={CreateStars(...args){assert.equal(args[3],3);stars++;}};
        c.Graphics._wqaNarrationEnabled=true;c.WendyQuestAccessMomentumCrystal=(owner,sprite)=>{
            assert.equal(owner,scene);observations.push(sprite._full);return true;};
        for(const full of [false,true]){
            let collected=0;c.BattleHelper.SpawnMomentumCrystal(12,24,full);const sprite=momentum.field.crystal;
            sprite.setOnComplete(()=>collected++);seconds=1/60;sprite.update();sprite.update();
            seconds=1.3;sprite.update();assert.equal(sprite.phase,full?2:1);
            assert.equal(collected,0,'bounce does not award Momentum');
            if(full){sprite.update();assert.equal(collected,0,'the native full branch removes collection');}
            else{sprite.phase=2;sprite.update();assert.equal(collected,1);}
        }
        assert.deepEqual(observations,[false,true]);assert.equal(stars,2);
        delete c.WendyQuestAccessMomentumCrystal;c.Graphics._wqaNarrationEnabled=false;
        console.log('Verified original crystal producer once per object, normal collection versus full break/stars with no award.');
    }
    won.c.BattleManager.processVictory();
    assert.equal(won.c.BattleManager._phase, 'battleEnd');
    assert.equal(won.scene._wqaBattleWon, true);
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
    const { c, scene } = won;
    c.$dataStates = installedData('States.json');
    c.ExtractMetaData = state => JSON.parse(state.note.slice(state.note.indexOf('{')));
    let shieldCleanups = 0;
    c.BattleAnimations = { CrispyStateCleanup() { shieldCleanups++; } };
    const field = momentum.field;
    const wendySprite = Object.assign(new c.Sprite_BattleScreenParticipant(), {
        parent: field, worldVisible: true, worldAlpha: 1, _battler: { _actorId: 1 }
    });
    wendySprite.StateAnimationCleanUp(19);
    assert.equal(shieldCleanups, 1);
    const shieldSpeech = () => won.records.find(record => record.kind === 'battleLog');
    won.until(() => shieldSpeech());
    assert.equal(formatSpeech(shieldSpeech()), 'Crispy Shield ended.');
    assert.equal(shieldSpeech().append, true);
    const gains = () => won.records.filter(record => formatSpeech(record).startsWith('Momentum gained.'));
    momentum.collect();
    c.Graphics.frameCount++;
    won.tick();
    assert.equal(gains().length, 0, 'gain waits for the painted pip during victory');
    momentum.paint();
    c.Graphics.frameCount += 3;
    won.tick(false);
    assert.equal(gains().length, 0, 'the filled pip must reach postrender');
    won.frame();
    assert.equal(gains().length, 1);
    assert.equal(formatSpeech(gains()[0]), 'Momentum gained. 1 of 3.');
    assert.equal(gains()[0].epoch, won.packets()[0].epoch, 'the gain shares the reward page lease');
    assert.equal(gains()[0].append, true);
    c.Graphics.frameCount++;
    won.tick();
    assert.equal(gains().length, 1, 'a stable pip must stay silent');
    won.advance();
    won.until(() => won.packets().length === 2);
    assert.equal(formatSpeech(won.packets()[1]), labels.obtainItem.replace('%1', item.name));
    won.advance();
    assert.equal(won.epoch(), 0);
    won.until(() => won.window.openness === 0);
    momentum.collect();
    momentum.paint();
    c.Graphics.frameCount++;
    won.tick();
    assert.equal(gains().length, 2, 'a late gain can speak after the final reward page closes');
    assert.equal(formatSpeech(gains()[1]), 'Momentum gained. 2 of 3.');
    won.c.WendyQuestAccessSceneLeaving(scene);
    assert.equal(won.epoch(), 0, 'native battle handback retires the late notice');

    const lost = await enter(mapData(19), 19, true);
    arrange(lost);
    lost.c.BattleManager.processDefeat();
    assert(!lost.scene._wqaBattleWon);
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
    console.log('Verified installed victory rewards, delayed Momentum, defeat, level-up and skill pages through the native message renderer.');
    console.log('Throttled settled battle result to synthetic render and formatted receipt', receipt.toFixed(2), 'ms.');
})().catch(error => { console.error(error); process.exitCode = 1; });
