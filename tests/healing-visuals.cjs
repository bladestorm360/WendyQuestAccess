'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const methods=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'battle-focus-producers.py'),stock,'healing'],{encoding:'utf8',timeout:7000}));
 for(const mode of ['field','battle','inventory','nvda','cold','hidden','wrong-effect','wrong-hud','loading','unpainted']){
  const f=fixture(107,3,4,mode!=='nvda'&&mode!=='cold'),spoken=[];
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  f.interpreter._list=null;
  if(mode==='battle')f.scene._wqaBattleStarted=true;
  if(mode==='inventory'){f.scene._wqaMapRestored=false;f.scene._wqaMenuActive=true;}
  const hud={parent:f.scene,battler:{_actorId:1,hp:100,mhp:100},HPRoutineID:10,currentHPFill:.3,fillMaskX:30,fillMaskY:30,
   worldVisible:mode!=='hidden',worldAlpha:1,texture:{valid:true},colourGreen:[],colourWhite:[],colourRed:[],
   fillSprite:{setBlendColor(){}},_numberSprite:{setText(){}},LerpColorArray:()=>[],addChild(child){child.parent=this;}};
  f.scene._statusWindow=hud;f.scene._wqaMenuStatus=hud;
  const effects=[];
  function SpriteAnimated(name){Object.assign(this,{texture:{valid:true},worldVisible:true,worldAlpha:1,
   animator:{_animationData:{fileName:mode==='wrong-effect'?'ParticleEffects/Other':'ParticleEffects/Heal'}}});effects.push(this);}
  SpriteAnimated.prototype.SetAnimation=function(){};
  const c=vm.createContext({...f.root,Graphics:f.graphics,SceneManager:{_scene:f.scene},SpriteEffectHelper:{Effects:{Heal:'Heal'}},Sprite_Animated:SpriteAnimated,
   RadialStatus:function(){},Sprite_Gauge:function(){},a18_0x52f0af(){throw Error('Unresolved property');},a23_0x243974(){throw Error('Unresolved property');},
   Time:{GetDeltaTime:()=>1/60},RandomRange:(a,b)=>(a+b)/2,Lerp:(a,b,t)=>a+(b-a)*t,EaseFunction:{EaseOut:t=>t},
   WendyQuestAccessHealing:f.narration.healingAccepted});
  for(const method of methods)vm.runInContext(method,c);
  if(mode==='wrong-hud')f.scene._statusWindow={};
  if(mode==='loading')f.scene._wqaPreloads=new Set(['portrait']);
  let routine=c.RadialStatus.prototype.AddHPRoutine.call(hud,1);
  for(let n=0;n<32;n++){routine.next();f.frame(mode!=='unpainted');}
  const positive=['field','battle','inventory','nvda','cold'].includes(mode);
  assert.equal(f.played.length+spoken.length,positive?1:0,mode);
  if(positive){assert.equal(mode==='nvda'?spoken[0]:f.played[0].id,mode==='nvda'?'Sparkles circle the HP meter as it fills.':'hp-healing-sparkles');
   if(mode!=='nvda')f.played[0].emit('ended');
   hud.HPRoutineID++;routine=c.RadialStatus.prototype.AddHPRoutine.call(hud,1);
   for(let n=0;n<32;n++){routine.next();f.frame();}
   assert.equal(f.played.length+spoken.length,2,'another native routine may repeat the same caption');}
  f.narration.leave(f.scene);
 }
 const troops=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/Troops.json'),'utf8'));
 for(const mode of ['recorded','nvda','stationary','hidden','wrong-page','unpainted']){
  const f=fixture(107,3,4,mode!=='nvda'),spoken=[];f.scene._wqaBattleStarted=true;
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  f.root.$dataTroops=troops;f.root.$gameTroop={_troopId:150,_interpreter:{_index:54,_list:troops[150].pages[mode==='wrong-page'?0:6].list}};
  const actor={parent:f.spriteset._battleField={}},gauge={parent:actor,_value:10,_maxValue:100,_targetValue:100,_targetMaxValue:100,_duration:20,
   texture:{valid:true},bitmap:{isReady:()=>true},worldVisible:mode!=='hidden',worldAlpha:1,redraw(){}};
  actor._gaugeSprite=gauge;f.spriteset._enemySprites=[actor];
  const c=vm.createContext({SpriteEffectHelper:{},RadialStatus:function(){},Sprite_Gauge:function(){}});
  for(const method of methods)vm.runInContext(method,c);
  f.narration.healingAccepted(f.scene);
  for(let n=0;n<25;n++){if(mode!=='stationary')c.Sprite_Gauge.prototype.updateGaugeAnimation.call(gauge);f.frame(mode!=='unpainted');}
  assert.equal(f.played.length+spoken.length,['recorded','nvda'].includes(mode)?1:0,mode);f.narration.leave(f.scene);
 }
 console.log('Healing: original HP coroutine/particle factory in field, battle, inventory, cold/recorded/NVDA, true-repeat and negatives; native enemy gauge tween before Wendy question passes.');
};
