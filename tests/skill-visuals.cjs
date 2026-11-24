"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {SKILLS}=require('../src/dialogue/skill-visuals');
module.exports=(fixture,stock)=>{
 const methods=JSON.parse(execFileSync('python',['-B','tests/battle-focus-producers.py',stock,'skill-visuals'],{encoding:'utf8',timeout:7000}));
 const factories={
  'crispy-shield':'CreateCrispyShieldAnimation','spicy-surge':'SpiceBuffAnimation','rise-shine':'CreateBaconatorBuffAnimation',
  'frosty-time':'createFrostyTimeAnimation','frosty-blast':'createFrostyBlastAnimation','crispy-barrage':'CreateCrispyBarrageAnimation',
  'pigtail-whip':'CreatePigtailWhipAnimation','beef-charge':'CreateWhereIsBeefAnimation','beef-attack':'CreateWhereIsBeefAnimation',
  'nugget-strike':'CreateNuggetStrikeAnimation','bacon-blast':'CreateBaconatorBlastAnimation'
 };
 const nativeSkills=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/Skills.json'),'utf8'));
 function setup(key,id){
  const f=fixture(25,45,0);f.scene._wqaBattleStarted=true;
  f.root.$gameTroop={_interpreter:{}};const item=nativeSkills[id];
  const action={isSkill:()=>true,item:()=>item};f.root.BattleManager={_action:action};
  const scheduled=[],created=[],calls=[],field={parent:f.scene},target={x:150,y:180,scale:{},parent:field};
  const add=(parent,child)=>{child.parent=parent;(parent.children??=[]).push(child);return child;};
  for(const obj of [field,target,f.scene]){obj.addChild=child=>add(obj,child);obj.addChildAt=child=>add(obj,child);}
  const actor={parent:field,x:400,y:200,_actor:SKILLS[key][1]===1?{_actorId:1}:{id:SKILLS[key][1]},_offsetX:0,_offsetY:0,
   _frameAnimator:{SetAnimation(){}},hide(){this.visible=false;},show(){this.visible=true;},startMove(){},stepBack(){},update(){}};
  if(SKILLS[key][1]===1)f.spriteset._actorSprites=[actor];else f.spriteset._subActorSprite=actor;
  f.spriteset._battleField=field;
  class Sprite{constructor(bitmap){this.bitmap=bitmap;this.anchor={};this.scale={x:1,y:1};this.texture={valid:false};this.worldVisible=true;this.worldAlpha=1;this.worldTransform={tx:150,ty:180};created.push(this);}destroy(){this.parent=null;}addChild(child){return add(this,child);}SetAnimation(){}animationComplete(){return true;}}
  class Animated extends Sprite{constructor(file){super({isReady:()=>true});this.animator={_animationData:{fileName:file.replace(/^img\//,'').replace(/\.json$/,'')}};}}
  class Body extends Sprite{chainBegin(){return this;}chainEnd(){return this;}addTween(){return this;}destroyOnEnd(){return this;}addCoroutine(){return this;}runCoroutines(){}}
  let now=0;
  class Chain{constructor(){this.at=now;}AddFunction(fn){scheduled.push({at:this.at,fn});return this;}AddDelay(time){this.at+=time;return this;}AddCoroutine(co){if(co.fn)scheduled.push({at:this.at,fn:()=>co.fn(1)});this.at+=co.duration||0;return this;}AddOnComplete(fn){return this.AddFunction(fn);}Start(){}}
  const context=vm.createContext({...f.root,SceneManager:{_scene:f.scene},Graphics:f.graphics,BattleAnimations:{},
   a2_0x990531(){throw Error('Unresolved native skill property');},a2_0x4712(){throw Error('Unresolved native skill property');},
   Sprite,Sprite_Animated:Animated,VFXBody:Body,Bitmap:class{fillAll(){}},Point:class{constructor(x,y){this.x=x;this.y=y;}},
   CoroutineChain:Chain,OverTime:class{constructor(duration,fn){Object.assign(this,{duration,fn});}},Coroutine:class{},
   CoroutineManager:{StartAnonymousCoroutine(){}},BattleHelper:{GetBattleField:()=>field},AudioManager:{playSe(){}},ScreenShake:{CreateImpulse(){}},
   Time:{GetDeltaTime:()=>1/60},EaseFunction:{EaseOut:x=>x,EaseIn:x=>x,EaseOutBounce:x=>x},Clamp1:x=>Math.min(1,Math.max(0,x)),
   Lerp:(a,b,t)=>a+(b-a)*t,RandomRange:(a,b)=>(a+b)/2,
   SpriteEffectHelper:{Effects:new Proxy({},{get:(_t,k)=>k}),CreateParticleEffectSprite(x,y,name,parent){const filename=({SpiceBuffUnder:'SpiceBuff_Under',SpiceBuffOver:'SpiceBuff_Over'})[name]||name;const s=new Animated('img/ParticleEffects/'+filename+'.json');add(parent||f.scene,s);return s;}},
   WendyQuestAccessSkillVisual:(who,sprite,key)=>{calls.push({key,sprite,at:now});f.narration.skillAccepted(f.scene,who,sprite,key);}
  });
  vm.runInContext("Math.RandomRange=(a,b)=>(a+b)/2;Math.Lerp=(a,b,t)=>a+(b-a)*t;",context);
  f.scene.startFadeIn=()=>{};
  vm.runInContext(methods[factories[key]],context);
  const first=key==='spicy-surge'?target:actor;
  const second=['crispy-barrage','beef-charge','beef-attack'].includes(key)?[target]:target;
  context.BattleAnimations[factories[key]](first,second,{x:150,y:180});
  function advance(until){
   while(scheduled.some(e=>e.at<=until)){
    scheduled.sort((a,b)=>a.at-b.at);const task=scheduled.shift();now=task.at;task.fn();
   }
   now=until;
  }
  return{f,actor,created,calls,advance};
 }
 let total=0;
 for(const [key,spec]of Object.entries(SKILLS).filter(([key])=>key!=='guard'))for(const id of spec[0]){
  const t=setup(key,id);
  if(key==='beef-attack'){t.advance(0);for(const s of t.created)s.texture.valid=true;t.f.frame();assert.equal(t.f.played[0]?.id,'skill-beef-charge');t.f.played[0].emit('ended');}
  t.advance(key==='beef-attack'?3.7:1.3);
  const relevant=t.calls.filter(c=>c.key===key);assert(relevant.length,key+' native factory dispatches');
  t.f.frame();assert.equal(t.f.played.length,key==='beef-attack'?1:0,'unpainted effects stay silent');
  for(const sprite of t.created)sprite.texture.valid=true;
  t.f.frame(false);const before=t.f.played.length;t.f.renderer.emit('postrender');
  const played=t.f.played.find(p=>p.id==='skill-'+key);assert(played,key+' '+id+' visible native effect');
  assert(t.f.played.length>=before);const count=t.f.played.length;
  for(const call of relevant)t.f.narration.skillAccepted(t.f.scene,t.actor,call.sprite,key);
  t.f.frame();assert.equal(t.f.played.length,count,'multi-particle skill describes once per action stage');
  assert(!played.paused);t.f.narration.leave(t.f.scene);total++;
 }
 // A late charging caption must never be put ahead of the timed beef words.
 {
  const t=setup('beef-charge',38);t.advance(0);for(const s of t.created)s.texture.valid=true;t.f.frame();
  assert.equal(t.f.played[0]?.id,'skill-beef-charge');
  t.advance(1.2);assert(!t.calls.some(c=>c.key==='beef-attack'));
  t.advance(3.7);assert(t.calls.some(c=>c.key==='beef-attack'&&c.at>=3.7));
  assert(!t.f.played[0].paused);t.f.narration.leave(t.f.scene);
 }
 for(const mode of ['hidden','offscreen','detached','loading','wrong-action','disabled']){
  const t=setup('spicy-surge',28),call=t.calls[0];for(const s of t.created)s.texture.valid=true;
  if(mode==='hidden')call.sprite.worldAlpha=0;
  if(mode==='offscreen')call.sprite.worldTransform.tx=-100;
  if(mode==='detached')call.sprite.parent=null;
  if(mode==='loading')t.f.scene._wqaPreloads=new Set([{}]);
  if(mode==='wrong-action')t.f.root.BattleManager._action={};
  if(mode==='disabled')t.f.playback.narration.enabled=false;
  t.f.frame();assert.equal(t.f.played.length,0,mode);t.f.narration.leave(t.f.scene);
 }
 {
  const t=setup('frosty-blast',10),captions=[];t.advance(1);
  t.f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
  t.f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};
  t.f.root.Audio=class{constructor(){throw Error('NVDA skills must not create recorded audio');}};
  for(const s of t.created)s.texture.valid=true;t.f.frame();
  assert.equal(captions.length,1);assert.match(captions[0],/ice cream/);assert.equal(t.f.played.length,0);t.f.narration.leave(t.f.scene);
 }
 const duration=+execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1','src/dialogue/clips/skill-beef-charge.webm'],{encoding:'utf8'});
 assert(duration/.8+.25<1.2,'charge at slowest playback plus250ms decode allowance fits the native1.2s gap');
 console.log('Verified'+total+' native base/upgraded skill visual paths, actual returned particles/attachment, postrender admission, per-action stage guards and late beef attack ordering; charge duration '+duration+'seconds.');
};
