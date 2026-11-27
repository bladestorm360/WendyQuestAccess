'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const { createBattleLog } = require('../src/battle/action-log');
const { battleScenePresented } = require('../src/battle/presentation');
const { recordCollapse, recordFoldedEnemy, recordCondition, recordResistance, recordMomentum } = require('../src/battle/outcomes');
const { abilitySource } = require('../src/battle/damage-popup');
const { formatSpeech } = require('../src/services/speech-text.cjs');

const methods = JSON.parse(execFileSync('python', ['-W', 'ignore::SyntaxWarning',
    path.join(__dirname, 'battle-focus-producers.py'), process.argv[2], 'log'],
{ encoding: 'utf8', timeout: 7000, maxBuffer: 64 * 1024 }));
const renderer = new EventEmitter();
const scene = { _active: true, _started: true, _wqaBattleStarted: false, _fadeDuration: 0, _fadeOpacity: 0,
    _windowLayer: {}, isActive: () => true, isBusy: () => false, updateBattleProcess() { battle.isBusy(); } };
let spritesBusy = false;
let append = false;
let delta = 1 / 60;
let opened = 0;
let observations = 0;
const lines = [];
const painted = [];
const active = new Map();
const battle = { _phase: 'action', _spriteset: { isBusy: () => spritesBusy }, _logWindow: { isBusy: () => true } };
const c = vm.createContext({
    Game_Battler: function () {}, Game_Interpreter: function () {}, Scene_Battle: function () {}, Scene_Message: function () {}, Window_BattleActionLog: function () {},
    Window_Base: function () {}, Window_BattleLog: function () {}, Sprite_Enemy: function () {},
    Point: function(x,y){this.x=x;this.y=y;}, BattleHelper: { IsBattleScene: () => true }, BattleAnimations: {}, Sprite_BattleScreenParticipant: function () {},
    a2_0x990531() { throw Error('Unresolved battle property'); },
    SceneManager: { _scene: scene }, Graphics: { app: { stage: scene, renderer }, frameCount: 0, height: 540 }, BattleManager: battle,
    $dataStates: JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw/data/States.json'), 'utf8')),
    $gameMessage: { isBusy: () => false }, $gameTroop: { _interpreter: {} }, $gameTemp: { _animationQueue: [] },
    $gameTimer: { update() {} }, $gameScreen: { update() {} }, $gameVariables: { value: () => 23 },
    TextManager: { currencyUnit: 'gold' }, Utils: { containsArabic: () => false },
    ImageManager: { iconWidth: 32, iconHeight: 32, loadSystem: () => ({}) },
    ColorManager: { textColor: () => '#ffffff' },
    Rectangle: function (x, y, width, height) { Object.assign(this, { x, y, width, height }); },
    Time: { GetDeltaTime: () => delta },
    Clamp1: value => Math.min(1, Math.max(0, value)),
    InverseLerp: (start, end, value) => (value - start) / (end - start),
    Approach: (from, to, step) => from < to ? Math.min(from + step, to) : Math.max(from - step, to),
    Lerp: (start, end, amount) => start + (end - start) * amount
});
c.Window_Base.prototype.update = () => {};
Object.setPrototypeOf(c.Window_BattleActionLog.prototype, c.Window_Base.prototype);
for (const method of methods) vm.runInContext(method, c, { timeout: 100 });
Object.setPrototypeOf(scene, c.Scene_Battle.prototype);
const log = scene._actionLogWindow = Object.assign(new c.Window_BattleActionLog(), {
    parent: scene._windowLayer, visible: true, worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255,
    width: 640, height: 200, items: [], itemQueue: [], cooldown: 0, contents: {
        width: 640, height: 176, isReady: () => true, clear() {}, drawText(text) { painted.push(text); }, blt() {}
    },
    resetFontSettings() {}, drawBackground() {}, changeTextColor() {},
    textWidth: text => text.length * 6, lineHeight: () => 24, calcTextHeight: () => 24
});
c.Scene_Message.prototype.update = () => log.update();

const observer = createBattleLog(c, { manager: c.SceneManager, graphics: c.Graphics, hasFocus: () => true,
    screenFading: () => false }, {
    open(record, live) { active.set(++opened, live); lines.push(formatSpeech(record)); return opened; },
    focus(id, record) { assert(active.get(id)()); lines.push(formatSpeech(record)); },
    close(id) { active.delete(id); }
}, (_scene, record) => { if (append) lines.push(formatSpeech(record)); return append; });
c.WendyQuestAccessBattleLogReady = (scene, window) => { observations++; observer.observe(scene, window); };
c.WendyQuestAccessBattleLogLeaving = observer.retire;
c.WendyQuestAccessBattleLogBlocked = observer.suspend;
function frame() { c.Graphics.frameCount++; scene.update(); renderer.emit('postrender'); }

log.pushMessage('Synthetic damage, \\V[1].', 6);
frame();
assert.equal(observations, 0);
assert(painted.includes('Synthetic damage, 23.'), 'the installed text renderer resolved the native value');
scene._wqaBattleStarted = true;
spritesBusy = true;
frame();
assert.equal(observations, 0, 'the spriteset can own native work while a log row paints');
spritesBusy = false;
const start = performance.now();
scene.update();
assert.equal(lines.length, 0);
renderer.emit('postrender');
const first = performance.now() - start;
assert.equal(lines[0], 'Synthetic damage, 23.');
assert.equal(battle._wqaDialogueBusy, true, 'a native message wait alone does not suppress the visible action log');

for (let frameIndex = 0; frameIndex < 100; frameIndex++) frame();
assert.equal(observations, 1, 'stable native repaint does not invoke another observer');
const observedDraw = log.drawItem;
function measure(draw) {
    log.drawItem = draw;
    const start = performance.now();
    for (let index = 0; index < 250; index++) frame();
    return performance.now() - start;
}
delta = 0;
const baseline = measure(log.fixtureNativeDraw);
const stable = measure(observedDraw);
delta = 1 / 60;
assert.equal(observations, 1);
log.pushMessage('Synthetic damage, \\V[1].', 6);
frame();
assert.deepEqual(lines, ['Synthetic damage, 23.', 'Synthetic damage, 23.']);
assert.equal(opened, 1, 'two native events can share a speech context');
assert.equal(observer.latest(scene).lines.length, 2);

log.cooldown = 0;
log.pushMessage('After animation.', 6);
scene.update();
assert.equal(renderer.listenerCount('postrender'), 1);
const legacyLog = battle._logWindow = Object.assign(new c.Window_BattleLog(), {
    isBusy: () => true, showNormalAnimation() {
        assert.equal(active.size, 0);
        c.$gameTemp._animationQueue.push({});
    }
});
scene._logWindow = legacyLog;
legacyLog.showAnimation({}, [], 5);
renderer.emit('postrender');
frame();
assert.equal(lines.length, 2, 'pending animation cancels queued action log paint');
c.$gameTemp._animationQueue.length = 0;
append = true;
battle._phase = 'input';
frame();
assert.equal(lines.at(-1), 'After animation.');
assert.equal(opened, 1, 'a settled command can append the result');
assert.equal(observer.latest(scene).lines.length, 3);
observer.retire(scene);
assert(observer.repeat(scene), 'the current battle history survives a presentation suspension');
assert.equal(lines.at(-1), 'Synthetic damage, 23. Synthetic damage, 23. After animation.');
observer.leave(scene);
assert.equal(observer.latest(scene), null);
assert.equal(active.size, 0);

append = false;
const field = {};
const bitmap = { width: 512, height: 768, isReady: () => true };
const sprite = Object.assign(new c.Sprite_Enemy(), {
    parent: field, bitmap, x: 200, worldVisible: true, worldAlpha: 1, _appeared: true,
    startEffect(effect) { this._effectType = effect; this._effectDuration = 1; this._appeared = false; },
    updateInstantCollapse() { this.worldAlpha = 0; }
});
scene._spriteset = { _battleField: field, _enemySprites: [sprite] };
let effect = '';
let alive = true;
let added = [c.$dataStates[13], c.$dataStates[15]];
let removed = [];
const enemy = sprite._enemy = {
    name: () => 'Fixture enemy', isActor: () => false, isAlive: () => alive,
    isHidden: () => false, isEffectRequested: () => !!effect,
    effectType: () => effect, clearEffect() { effect = ''; }, deathStateId: () => 1,
    result: () => ({ addedStateObjects: () => added, removedStateObjects: () => removed })
};
const icon = sprite._stateIconSprite = { _battler: enemy, parent: sprite, bitmap,
    worldVisible: true, worldAlpha: 1, _iconIndex: 72, _frame: { width: 32, height: 32, x: 256, y: 128 } };
legacyLog._lines = [];
legacyLog.wait = () => {};
legacyLog.push = (method, text, caster) => { if (method === 'addText') legacyLog.addText(text, caster); };
vm.runInContext("String.prototype.format = function(name) { return this.replace('%1', name); };", c);
c.WendyQuestAccessBattleCondition = (window, target, state, added, speak) => {
    assert.equal(window, legacyLog);
    recordCondition(c, scene, target, state, added, speak);
};
c.WendyQuestAccessEnemyCollapse = target => recordCollapse(scene, target);
legacyLog.displayAddedStates(enemy);
log.cooldown = 0;
frame();
assert.match(lines.at(-1), /Fixture enemy is frosted!/);
assert.match(lines.at(-1), /Enemy, Regeneration/);
removed = [c.$dataStates[15]];
legacyLog.displayRemovedStates(enemy);
frame();
assert.doesNotMatch(lines.at(-1), /ended/);
icon._iconIndex = 0;
for (let n = 0; n < 6; n++) frame();
assert.match(lines.at(-1), /Regeneration ended/);
effect = 'instantCollapse';
alive = false;
sprite.updateEffect();
assert.equal(sprite.worldAlpha, 0);
frame();
assert.match(lines.at(-1), /Enemy defeated/);
const afterKo = lines.length;
sprite.updateEffect();
frame();
assert.equal(lines.length, afterKo, 'an already collapsed enemy never produces a second KO');
assert.match(observer.latest(scene).lines.at(-1), /Enemy defeated/);
observer.leave(scene);

const gameData = name => JSON.parse(fs.readFileSync(path.join(process.argv[2], 'package.nw/data', name), 'utf8'));
// Original native effect/state writers with the real OrEggAmi frame catalog.
// The small animator adapter publishes that catalog's first selected frame;
// postrender/texture and life-cycle negatives remain independent checks.
{
    const game=process.argv[3]||process.argv[2];
    const art=JSON.parse(fs.readFileSync(path.join(game,'package.nw/img/sv_enemies/OrEggAmi.json'),'utf8'));
    assert.equal(art.fileName,'animated/OrEggAmi');
    const dead=art.animations.find(a=>a.name==='dead');assert.deepEqual(dead.frames,[{x:2,y:5}]);
    const definition=gameData('Enemies.json')[19];assert.equal(definition.name,'OrEggAmi');
    assert(JSON.parse(definition.note.split('METADATA')[1]).postMortem);
    assert(definition.traits.some(t=>t.code===63&&t.dataId===3));
    c.ACTION_STATE={NONE:0,OVERRIDE:1};c.EnemyAnimationState={default:'_default',dead:'dead',die:'die',hurt:'hurt'};
    c.Graphics.width=640;c.Graphics.height=540;
    let alive=true,described=0;
    Object.assign(enemy,{_enemyId:19,hp:1,originalName:()=>definition.name});
    Object.assign(sprite,{_actionState:0,animationStateDefaultOverride:'',worldAlpha:1,visible:true,
        texture:{valid:true},worldTransform:{tx:200,ty:200},_effectDuration:0,_effectType:null,_appeared:true});
    sprite._frameAnimator={_animationData:art,HasAnimation:name=>art.animations.some(a=>a.name===name),
        SetAnimation(name){this._currentAnimation=art.animations.find(a=>a.name===name);
            const cell=this._currentAnimation.frames[0];sprite._frame={x:cell.x*art.frameWidth,y:cell.y*art.frameHeight,width:art.frameWidth,height:art.frameHeight};}};
    c.WendyQuestAccessFoldedEnemy=s=>{described++;recordFoldedEnemy(scene,s,c.Graphics.frameCount);};
    enemy.isAlive=()=>alive;effect='';sprite.updateEffect();sprite.UpdateAnimationState();
    assert.equal(described,0);
    alive=false;enemy.hp=0;sprite.updateEffect();
    frame();assert(!lines.at(-1).includes('flat heap'),'unpainted default pose cannot speak');
    sprite.UpdateAnimationState();const before=lines.length;scene.update();assert.equal(lines.length,before);
    renderer.emit('postrender');assert.equal(lines.at(-1),'OrEggAmi collapses into a flat heap of egg.');
    for(let i=0;i<12;i++){sprite.updateEffect();sprite.UpdateAnimationState();frame();}
    assert.equal(described,1);assert.equal(lines.length,before+1);
    alive=true;enemy.hp=10;sprite.updateEffect();sprite.UpdateAnimationState();frame();
    alive=false;enemy.hp=0;sprite.updateEffect();sprite.UpdateAnimationState();frame();assert.equal(described,2);
    assert.equal(lines.at(-1),'OrEggAmi collapses into a flat heap of egg.');
    observer.leave(scene);
    for(const mode of ['hidden','untextured','offscreen','revived','replaced','expired']){
        enemy.hp=1;sprite.updateEffect();enemy.hp=0;sprite.updateEffect();sprite.UpdateAnimationState();
        const before=lines.length;
        if(mode==='hidden')sprite.worldVisible=false;
        if(mode==='untextured')sprite.texture.valid=false;
        if(mode==='offscreen')sprite.worldTransform.tx=-1;
        if(mode==='revived')enemy.hp=1;
        if(mode==='replaced')sprite._enemy={...enemy};
        if(mode==='expired')c.Graphics.frameCount+=91;
        frame();assert.equal(lines.length,before,mode);observer.leave(scene);
        sprite.worldVisible=true;sprite.texture.valid=true;sprite.worldTransform.tx=200;sprite._enemy=enemy;
    }
    delete c.WendyQuestAccessFoldedEnemy;
    const actors=Array.from({length:8},()=>Object.assign(new c.Sprite_Enemy(),{_appeared:true,_effectDuration:0,
        _enemy:{_enemyId:19,hp:10,isAlive:()=>true,isHidden:()=>false,isEffectRequested:()=>false}}));
    function effectFrames(method){const start=performance.now();let peak=0;
        for(let i=0;i<240;i++){const frame=performance.now();for(const actor of actors)actor[method]();peak=Math.max(peak,performance.now()-frame);}
        return {total:performance.now()-start,peak};}
    effectFrames('fixtureNativeEffect');effectFrames('updateEffect');
    console.log('Eight-enemy native effect episode,240 throttled frames: '+JSON.stringify({baseline:effectFrames('fixtureNativeEffect'),observed:effectFrames('updateEffect')}));
    console.log('OrEggAmi native no-collapse death pose: painted heap, source-cycle replay after revival, no duplicate and six stale/visibility negatives pass.');
}
const baconator = gameData('Actors.json')[2];
const companion = scene._spriteset._subActorSprite = { _actor: baconator, _battlerName: baconator.battlerName };
companion._mainSprite = { parent: companion, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } };
c.WendyQuestAccessAbilitySource = (item, format) => abilitySource(scene, item, format);
const ability = gameData('Skills.json')[31];
c.fixtureAbility = ability;
c.fixtureLog = legacyLog;
vm.runInContext("fixtureLog.displayItemMessage(fixtureAbility.message1, {name: () => 'Wendy'}, fixtureAbility);", c);
log.cooldown = 0;
frame();
assert(painted.includes(ability.message1), 'the native text remains intact');
assert.match(lines.at(-1), /Baconator uses Rise and Shine/);

// Run the installed floating-text producer, then release its visible glyphs.
const chain = { chainBegin() { return this; }, addTween() { return this; }, addDelay() { return this; },
    chainEnd() { return this; }, start() {}, addChild(child) { child.parent = this; } };
c.VFXBody = function () {
    Object.assign(this, chain, { worldVisible: true, worldAlpha: 1, scale: { x: 0, y: 0 } });
};
c.Sprite_Text = function () {
    Object.assign(this, { worldVisible: true, worldAlpha: 1, _dirty: false, worldTransform: { tx: 60, ty: 80 } });
};
c.Sprite_Text.prototype.setText = function (text) {
    this._currentString = text;
    this.children = [...text].map(() => ({ parent: this, worldVisible: true, worldAlpha: 1,
        bitmap, scale: { x: 1, y: 1 } }));
    return this;
};
for (const method of ['setBitmapFont', 'setDrawColour', 'setShadow', 'setShadowDraw']) {
    c.Sprite_Text.prototype[method] = function () { return this; };
}
c.EaseFunction = { EaseOut() {}, EaseOutOver() {} };
field.addChild = effect => { effect.parent = field; };
let popup;
c.WendyQuestAccessResisted = (effect, text) => {
    popup = effect;
    recordResistance(scene, effect, text, c.Graphics.frameCount);
};
c.Graphics.width = 640;
const beforeResistance = lines.length;
c.BattleAnimations.StatusTextAtPosition(field, 'Resisted!', { x: 60, y: 80 });
frame();
assert.equal(lines.length, beforeResistance, 'an unpainted status popup is silent');
popup.scale.x = popup.scale.y = 1;
frame();
assert.equal(lines.at(-1), 'Wendy resisted a status effect.');
frame();
assert.equal(lines.length, beforeResistance + 1);
c.BattleAnimations.StatusTextAtPosition(field, 'Resisted!', { x: 60, y: 80 });
popup.scale.x = popup.scale.y = 1;
frame();
assert.equal(lines.length, beforeResistance + 2, 'a second native resistance remains audible');

const hud = scene._statusWindow = { parent: scene, offsetY: 0, bitmap, worldVisible: true,
    worldAlpha: 1, _momentumCurrent: 0, momentumPips: [] };
hud.momentumPips = [0, 1, 2].map(() => ({ baseSprite: {
    parent: hud, bitmap, worldVisible: true, worldAlpha: 1, _frame: { x: 0, y: 0 }
} }));
c.WendyQuestAccessMomentumChanged = (owner, window) => recordMomentum(owner, window, c.Graphics.frameCount, true);
const beforeMomentum = lines.length;
frame();
hud._momentumCurrent = 1;
frame();
assert.equal(lines.length, beforeMomentum, 'a native target change waits for the visible pip');
hud.momentumPips[0].baseSprite._frame.x = 32;
for (let n = 0; n < 4; n++) frame();
assert.equal(lines.at(-1), 'Momentum gained. 1 of 3.');
assert.equal(lines.length, beforeMomentum + 1);
hud._momentumCurrent = 0;
hud.momentumPips[0].baseSprite._frame.x = 0;
frame();
assert.equal(lines.length, beforeMomentum + 1, 'spending must be silent');
hud._momentumCurrent = 3;
for (const pip of hud.momentumPips) pip.baseSprite._frame.x = 32;
scene.update();
assert.equal(lines.length, beforeMomentum + 1);
renderer.emit('postrender');
assert.equal(lines.at(-1), 'Momentum gained. 3 of 3.');
frame();
assert.equal(lines.length, beforeMomentum + 2, 'stable repaint must be silent');
assert.equal(observer.latest(scene).lines.at(-1), 'Momentum gained. 3 of 3.');

// Both native Freezer Burn skills transfer only their own row to the actual
// animation-entry producer. A later identical cast is a separate event.
const skills=gameData('Skills.json');
const freezer=Object.assign(new c.Sprite_BattleScreenParticipant(),{parent:field,worldVisible:true,worldAlpha:1,
    x:80,y:100,width:64,height:64,anchor:{x:.5,y:1},_enemy:{originalName:()=> 'Mech Freezer'}});
freezer._battler=freezer._enemy;scene._spriteset._enemySprites=[freezer];
c.BattleHelper.GetBattlerSprite=()=>({GetTargetPosition:()=>({x:300,y:80})});
let spikes=0;c.BattleAnimations.CreateIceSpikesAnimation=()=>{spikes++;};
c.WendyQuestAccessAbilitySource=(item,format)=>observer.abilityTicket(scene,item,format)||abilitySource(scene,item,format);
c.WendyQuestAccessAbilityAnimation=(action,sprite)=>observer.startAbility(scene,action,sprite);
vm.runInContext("String.prototype.format=function(...args){return this.replace(/%([12])/g,(_,n)=>args[+n-1]);};",c);
for(const id of [102,103,102]) {
    battle._phase='action';append=false;
    const item=skills[id],action={item:()=>item,isSkill:()=>true,subject:()=>freezer._battler};battle._action=action;
    c.fixtureAbility=item;c.fixtureSubject={name:()=> 'Mech Freezer'};
    vm.runInContext('fixtureLog.displayItemMessage(fixtureAbility.message1,fixtureSubject,fixtureAbility);',c);
    const before=lines.length;const pauses=freezer.ActionTargetAnimation(action,'FreezerBurn',{});
    assert.deepEqual(Array.from(pauses),[60,120]);assert.equal(lines.length,before);
    renderer.emit('postrender');assert.equal(lines.at(-1),'Mech Freezer uses Freezer Burn.');
    const afterStart=lines.length;log.cooldown=0;battle._phase='input';for(let n=0;n<100;n++)frame();
    assert.equal(lines.length,afterStart,'the same cast cannot speak again on Wendy’s turn');
}
assert.equal(spikes,3,'native effects remain unchanged');
const staleItem=skills[102],stale={item:()=>staleItem,isSkill:()=>true,subject:()=>freezer._battler};
battle._phase='action';battle._action=stale;const beforeStale=lines.length;
freezer.ActionTargetAnimation(stale,'FreezerBurn',{});battle._action={};renderer.emit('postrender');assert.equal(lines.length,beforeStale);
console.log('Verified both Freezer Burn variants at native animation entry, unchanged waits/effects, repeated casts, action-identity row ownership and stale-cast cancellation.');
console.log('Verified native Momentum retirement, displayed count, and battle review.');
console.log('Verified native log paint, repeated events, animation cancellation, written and icon-only conditions, enemy KO, and review.');
console.log('Throttled battle log paint through synthetic postrender and formatted receipt', first.toFixed(2), 'ms.');
console.log('Throttled 250 stable paint frames', baseline.toFixed(2), 'ms native,', stable.toFixed(2), 'ms enabled.');
for (const [id, animation, expected, waits] of [
    [112, 'BigMechPunch', 'BigMech punches.', [10, 80]],
    [113, 'BigMechGun', 'BigMech fires its gun.', [120, 120]],
    [115, 'BigMechBoosterBash', 'Big Booster uses Booster Bash.', [15, 60]],
    [112, 'BigMechPunch', 'BigMech punches.', [10, 80]]
]) {
    freezer._enemy.originalName = () => id === 115 ? 'Big Booster' : 'BigMech';
    let nativeCalls = 0;c.BattleAnimations[animation] = () => nativeCalls++;
    const item = skills[id], action = { item: () => item, isSkill: () => true, subject: () => freezer._battler };
    battle._phase = 'action';battle._action = action;
    const before = lines.length, actual = freezer.ActionTargetAnimation(action, animation, {});
    assert.equal(nativeCalls, 1);if (waits) assert.deepEqual(Array.from(actual), waits);
    assert.equal(lines.length, before);renderer.emit('postrender');assert.equal(lines.at(-1), expected);
    const after = lines.length;observer.startAbility(scene, action, freezer);renderer.emit('postrender');assert.equal(lines.length, after);
}
console.log('Verified missing BigMech punch/gun and Big Booster callouts at native animation entry, repeated actions, exact action ownership and unchanged effects/waits.');

// Execute the authored forced-action command and native forced-action setup.
// The interpreter remains active throughout the attack; normal target/menu
// admission must stay closed while action/log output becomes available.
{
    const troops=c.$dataTroops=gameData('Troops.json'),item=skills[55];
    const subject=Object.assign(new c.Game_Battler(),{_enemyId:9,_lastTargetIndex:0,
        originalName:()=> 'Mech Double',name:()=> 'Mech Double',isDeathStateAffected:()=>false,
        clearActions(){this._actions=[];},removeCurrentAction(){this._actions.shift();}});
    c.Game_Action=function(owner,forced){this._forcing=forced;this.subject=()=>owner;this.isSkill=()=>true;
        this.setSkill=id=>this.item=()=>skills[id];this.setTarget=id=>this.targetIndex=id;};
    const script=Object.assign(new c.Game_Interpreter(),{_list:troops[14].pages[0].list,_index:11,
        currentCommand(){return this._list[this._index];},
        iterateBattler(kind,index,visit){assert.deepEqual([kind,index],[0,0]);visit(subject);},
        setWaitMode(mode){this._waitMode=mode;}});
    c.$gameTroop={_troopId:14,_interpreter:script};
    battle._subject=null;battle._phase='turn';battle.forceAction=battler=>battle._actionForcedBattler=battler;
    battle.startAction=()=>{battle._action=battle._subject._actions[0];battle._phase='action';};
    assert(script.executeCommand());assert.equal(script._index,12);assert.equal(script._waitMode,'action');
    battle.processForcedAction();const action=battle._action;
    assert.equal(action._forcing,true);assert.equal(action.item(),item);assert.equal(action.targetIndex,0);
    freezer._enemy=freezer._battler=subject;scene._spriteset._enemySprites=[freezer];
    c.BattleHelper.GetBattlerSprite=()=>({x:300,y:80,width:32,height:64,anchor:{x:.5,y:1},GetTargetPosition:()=>({x:300,y:80})});
    const host={manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false};
    assert.equal(battleScenePresented(c,host,scene),false,'target/menu admission remains closed');
    assert.equal(battleScenePresented(c,host,scene,true),true);
    c.fixtureAbility=item;c.fixtureSubject=subject;
    vm.runInContext('fixtureLog.displayItemMessage(fixtureAbility.message1,fixtureSubject,fixtureAbility);',c);
    let effects=0;c.BattleAnimations.MechDoubleLaserBlast=()=>effects++;
    const before=lines.length,waits=freezer.ActionTargetAnimation(action,'MechDoubleLaser',{});
    assert.deepEqual(Array.from(waits),[160,100]);assert.equal(effects,1);assert.equal(lines.length,before);
    renderer.emit('postrender');assert.equal(lines.at(-1),'Mech Double uses Double Laser.');
    const announced=lines.length;observer.startAbility(scene,action,freezer);renderer.emit('postrender');assert.equal(lines.length,announced);
    // Check that identical data without the exact native story ownership
    // cannot admit the line or bypass a native/loading boundary.
    for(const change of [()=>c.$gameTroop._troopId=15,()=>script._index=13,()=>script._waitMode='message',
        ()=>action._forcing=false,()=>scene._fadeDuration=1]){
        const save={troop:c.$gameTroop._troopId,index:script._index,mode:script._waitMode,forcing:action._forcing};
        change();assert.equal(battleScenePresented(c,host,scene,true),false);
        Object.assign(c.$gameTroop,{_troopId:save.troop});Object.assign(script,{_index:save.index,_waitMode:save.mode});
        action._forcing=save.forcing;scene._fadeDuration=0;
    }
    log.cooldown=0;for(let n=0;n<100;n++)frame();assert.deepEqual(lines.slice(announced),[],'the painted native row belongs to the one already-announced action');
    // The real startAction writes its native heading through displayAction
    // and the legacy method queue. Its showAnimation calls ActionAnimation,
    // which does not start the per-target laser effect. The number/laser
    // dispatch happens later, so the heading can finish painting first.
    const target={x:300,y:80,width:32,height:64,anchor:{x:.5,y:1},GetTargetPosition:()=>({x:300,y:80})};
    c.BattleHelper.GetBattlerSprite=owner=>owner===subject?freezer:target;
    c.SkillUtility={ExtractMetaData:entry=>JSON.parse(entry.note.slice(entry.note.indexOf('{')))};
    c.DataManager={isSkill:entry=>skills.includes(entry)};
    subject.performActionStart=subject.performAction=()=>{};
    Object.assign(legacyLog,{_methods:[],push:c.Window_BattleLog.prototype.push,
        showAnimation:c.Window_BattleLog.prototype.fixtureStoryAnimation,
        setWaitMode(){},showAttackAnimation(){},waitForTime(value){assert.equal(value,0);}});
    vm.runInContext('Array.prototype.clone=function(){return this.slice();};',c);
    for(let cast=0;cast<2;cast++) {
        subject.forceAction(55,-2);battle._action=subject._actions[0];
        c.fixtureAction=battle._action;const beforeCast=lines.length;
        vm.runInContext('fixtureLog.startAction(fixtureSubject,fixtureAction,[{}]);',c);
        let budget=16;while(legacyLog._methods.length&&budget-->0)legacyLog.callNextMethod();
        assert(budget>0);log.cooldown=0;for(let n=0;n<100;n++)frame();
        assert.deepEqual(lines.slice(beforeCast),['Mech Double uses Double Laser.'],'the actual native queue can paint before per-target FX');
        freezer.ActionTargetAnimation(battle._action,'MechDoubleLaser',{});renderer.emit('postrender');
        assert.deepEqual(lines.slice(beforeCast),['Mech Double uses Double Laser.'],'one heading for the same action in either producer order');
    }
    c.$gameTroop={_interpreter:{}};battle._action=null;
    console.log('Verified original Troop14 command339/forced-action dispatch, Double Laser at native animation entry, exact message label, unchanged160/100 waits/effect, native-log-first and animation-first single headings, distinct repeated casts, and closed ordinary menu/target gates.');
}
