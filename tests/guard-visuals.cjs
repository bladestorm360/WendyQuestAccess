"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock,art)=>{
 const methods=JSON.parse(execFileSync('python',['-B','tests/battle-focus-producers.py',stock,'guard-visual'],{encoding:'utf8',timeout:10000}));
 const data=JSON.parse(fs.readFileSync(path.join(art,'package.nw/img/sv_actors/Wendy_Combat.json'),'utf8'));
 const guard=data.animations.find(a=>a.name==='guard');assert.equal(data.fileName,'sv_actors/Wendy_Combat');
 assert.deepEqual(guard.frames,[{x:0,y:3},{x:1,y:3},{x:2,y:3}]);
 function setup(){
  const f=fixture(25,45,0);f.scene._wqaBattleStarted=true;f.root.$gameTroop={_interpreter:{}};
  const action={isSkill:()=>true,item:()=>({id:2})};f.root.BattleManager={_action:action};
  const field=f.spriteset._battleField={parent:f.scene},actor={parent:field,_actor:{_actorId:1},_battlerName:'Wendy_Combat'};
  const bitmap={isReady:()=>true};const sprite={parent:actor,anchor:{},bitmap,worldVisible:true,worldAlpha:1,visible:true,
   texture:{valid:true},worldTransform:{tx:400,ty:200},setFrame(x,y,width,height){this._frame={x,y,width,height};}};
  actor._mainSprite=sprite;f.spriteset._actorSprites=[actor];let calls=0;
  const context=vm.createContext({Graphics:f.graphics,Time:{GetDeltaTime:()=>1/60},AnimationCache:{},ReadJsonFile:()=>data,
   DEFAULT_ANIMATION:'wait',ImageManager:{loadBitmap:()=>bitmap},a18_0x52f0af(){throw Error('Unresolved frame property');},
   a2_0x990531(){throw Error('Unresolved motion property');},Sprite_Actor:function(){},
   WendyQuestAccessSkillVisual(who,s,key){calls++;assert.equal(key,'guard');f.narration.skillAccepted(f.scene,who,s,key);}});
  vm.runInContext('Sprite_Actor.MOTIONS={guard:{},guardDamage:{}};'+methods.frame+';globalThis.fixtureAnimator=FrameAnimator;'+methods.motion,context);
  actor._frameAnimator=new context.fixtureAnimator('img/sv_actors/Wendy_Combat.json',sprite);
  actor.startMotion=context.Sprite_Actor.prototype.startMotion;
  actor.startMotion('guard');assert.equal(calls,1);assert.equal(f.played.length,0,'motion request is not a painted frame');
  return{f,actor,sprite,context,calls:()=>calls};
 }
 {
  const t=setup();t.f.frame();assert.equal(t.f.played.length,0,'old body frame remains silent');
  t.actor._frameAnimator.Update();t.f.frame();assert.equal(t.f.played[0]?.id,'skill-guard');
  for(let i=0;i<6;i++){t.actor.startMotion('guard');t.f.narration.skillAccepted(t.f.scene,t.actor,t.sprite,'guard');t.f.frame();}
  assert.equal(t.f.played.length,1);assert.equal(t.calls(),1,'native looping pose does not redispatch');
  assert(!t.f.played[0].paused);t.f.narration.leave(t.f.scene);
 }
 for(const invalid of ['hidden','wrong-frame','wrong-art','wrong-motion','wrong-action','loading']){
  const t=setup();t.actor._frameAnimator.Update();
  if(invalid==='hidden')t.sprite.worldAlpha=0;
  if(invalid==='wrong-frame')t.sprite._frame.y=0;
  if(invalid==='wrong-art')t.actor._battlerName='Other';
  if(invalid==='wrong-motion')t.actor._frameAnimator._currentAnimation={name:'guard_damage'};
  if(invalid==='wrong-action')t.f.root.BattleManager._action={};
  if(invalid==='loading')t.f.scene._wqaPreloads=new Set([{}]);
  t.f.frame();assert.equal(t.f.played.length,0,invalid);t.f.narration.leave(t.f.scene);
 }
 {
  const t=setup(),captions=[];t.actor._frameAnimator.Update();t.f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
  t.f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};
  t.f.frame();assert.deepEqual(captions,['Wendy braces behind her crossed spatulas.']);assert.equal(t.f.played.length,0);t.f.narration.leave(t.f.scene);
 }
 console.log('Verified native Guard motion/frame rendering, one caption per action, empty help unchanged, six visibility/phase negatives and NVDA.');
};
