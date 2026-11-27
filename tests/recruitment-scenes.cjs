'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {JUMPS}=require('../src/dialogue/recruitment-visuals');
module.exports=function(fixture,stock,commandContext){
 const original=fs.readFileSync(path.join(stock,'package.nw/js/rmmz_objects.js'),'utf8');
 const dx=(x,d)=>x+(d===6?1:d===4?-1:0),dy=(y,d)=>y+(d===2?1:d===8?-1:0);
 const native=vm.createContext({Game_CharacterBase:function(){},$gameMap:{roundX:x=>x,roundY:y=>y,
  xWithDirection:dx,yWithDirection:dy,roundXWithDirection:dx,roundYWithDirection:dy}});
 for(const name of ['jump','updateJump','jumpHeight','setDirection','resetStopCount','straighten','hasWalkAnime','hasStepAnime','isDirectionFixed',
  'moveStraight','updateMove','isMoving','distancePerFrame','realMoveSpeed','isDashing','setMovementSuccess','isMovementSucceeded','reverseDir']){
  const start=original.indexOf(`\nGame_CharacterBase.prototype.${name} = function(`),end=original.indexOf('\n};',start)+3;
  assert(start>=0,name);vm.runInContext(original.slice(start,end),native);
 }
 const proto=native.Game_CharacterBase.prototype;let cases=0,total=0,peak=0;
 for(const mode of ['recorded','nvda','cold','unpainted','hidden','blocked','wrong-page','later','changed-route']) {
  const f=fixture(14,5,1,mode!=='cold'),a=f.actor(35),actor=a.candidate,spoken=[];
  const entry=f.root.$dataMap.events[35];Object.setPrototypeOf(actor,proto);
  Object.assign(actor,{_characterName:'~Frygor',_x:entry.x,_y:entry.y,_realX:entry.x,_realY:entry.y,_moveSpeed:4,
   _direction:2,_walkAnime:true,canPass:()=>true,refreshBushDepth(){},increaseSteps(){},forceMoveRoute(route){this._moveRoute=route;}});
  a.sprite._characterName='~Frygor';a.sprite.worldTransform.tx=-60;f.spriteset._tilemap.worldVisible=true;
  const origin=entry.x;f.nativeMap.refreshIfNeeded=()=>{};
  Object.assign(f.interpreter,{_index:37,character:()=>actor,isOnCurrentMap:()=>true,setWaitMode(){}});
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});f.host.describeNarration=t=>spoken.push(t);}
  const c=commandContext(f),row=f.interpreter._list[37];
  assert(c.Game_Interpreter.prototype.command205.call(f.interpreter,row.parameters));f.interpreter._index=38;
  assert(f.scene._wqaRecruitmentPending);
  if(mode==='wrong-page')f.root.$dataMap={...f.root.$dataMap,events:[]};
  if(mode==='later')f.interpreter._index=86;
  if(mode==='hidden')a.sprite.worldVisible=false;
  if(mode==='changed-route')actor._moveRoute={};
  for(let tile=0;tile<4;tile++) {
   if(mode!=='blocked')actor.moveStraight(4);
   for(let frame=0;frame<16;frame++) {
    actor.updateMove();a.sprite.worldTransform.tx=(origin-actor._realX)*32-60;
    f.frame(mode!=='unpainted');
    if(tile===0)assert.equal(f.played.length+spoken.length,0,'offscreen arrival stays silent');
   }
  }
  if(mode==='blocked')a.sprite.worldTransform.tx=100;
  f.frame(mode!=='unpainted');if(mode==='cold')f.frame();
  assert.equal(f.played.length+spoken.length,['recorded','nvda','cold'].includes(mode)?1:0,'Frygor '+mode);
  f.narration.cancel(f.scene);cases++;
 }
 for(const nvda of [false,true])for(const cold of [false,true])for(const site of JUMPS){
  const [m,e,p,index,id,dx,dy,cue,x,y]=site,f=fixture(m,e,p,!cold),a=f.actor(id),spoken=[];
  const actor=a.candidate;Object.setPrototypeOf(actor,proto);
  const data=f.root.$dataMap.events[id].pages[0];actor._characterName=a.sprite._characterName=data.image.characterName;
  Object.assign(actor,{_x:x-dx,_y:y-dy,_realX:x-dx,_realY:y-dy,_direction:2,_moveSpeed:4,_walkAnime:true,
   refreshBushDepth(){},forceMoveRoute(){this.jump(dx,dy);}});
  f.spriteset._tilemap.worldVisible=true;
  if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});f.host.describeNarration=t=>spoken.push(t);}
  f.nativeMap.refreshIfNeeded=()=>{};Object.assign(f.interpreter,{_index:index,character:()=>actor,
   isOnCurrentMap:()=>true,setWaitMode(mode){this._waitMode=mode;}});
  f.scene._wqaPreloads=new Set(cold?[{}]:[]);
  const c=commandContext(f),row=f.interpreter._list[index];
  assert(c.Game_Interpreter.prototype.command205.call(f.interpreter,row.parameters));
  f.interpreter._index=index+1;
  assert(f.scene._wqaRecruitmentPending,`${m}:${e}:${index} exact native action retains inert metadata`);
  let firstVisible=0;
  for(let frame=1;frame<=45;frame++){
   const begin=performance.now();
   if(actor._jumpCount>0)actor.updateJump();
   a.sprite.worldTransform.ty=dy===13?(actor._realY-8)*32+32-actor.jumpHeight():100-actor.jumpHeight();
   if(a.sprite.worldTransform.ty>=0&&!firstVisible)firstVisible=frame;
   if(frame===5)f.scene._wqaPreloads.clear();
   f.frame(false);
   if(frame<firstVisible||f.scene._wqaPreloads.size)assert.equal(f.played.length+spoken.length,0);
   f.renderer.emit('postrender');const elapsed=performance.now()-begin;total+=elapsed;peak=Math.max(peak,elapsed);
  }
  if(dy===13)assert(firstVisible>20,'the real long jump enters the view after the old unpainted deadline');
  assert.equal(nvda?spoken[0]:f.played[0]?.id,nvda?require('../src/dialogue/narration-cues.json')[cue].text:cue);
  const count=f.played.length+spoken.length;
  f.interpreter._index=index;f.narration.accepted(f.scene,f.interpreter,actor);f.interpreter._index=index+1;f.frame();
  assert.equal(f.played.length+spoken.length,count,'one accepted native action cannot repeat');
  f.narration.cancel(f.scene);cases++;
 }
 for(const mode of ['normal','nvda','cold','unpainted','hidden','wrong-actor','later','expired','blocked','wrong-page','wrong-map','reloaded','resource-pause','leaving']){
  const site=JUMPS[0],f=fixture(77,25,0,mode!=='cold'),a=f.actor(26),spoken=[];
  Object.assign(a.candidate,{_characterName:'~Tatoria',_x:40,_y:13,_realX:40,_realY:13,_jumpCount:0});a.sprite._characterName='~Tatoria';
  f.spriteset._tilemap.worldVisible=true;f.interpreter._index=76;
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});f.host.describeNarration=t=>spoken.push(t);}
  if(mode==='wrong-page')f.interpreter._list=[];
  if(mode==='wrong-map')f.interpreter._mapId=78;
  f.narration.accepted(f.scene,f.interpreter,a.candidate);f.interpreter._index=77;
  if(mode==='reloaded')f.root.$dataMap={...f.root.$dataMap,events:[]};
  if(mode==='resource-pause'||mode==='leaving'){
   f.frame(false);f.narration.pause(f.scene);
   if(mode==='leaving'){f.narration.retireRecruitment(f.scene);assert(!f.scene._wqaRecruitmentPending);}
  }
  if(mode==='hidden')a.sprite.worldVisible=false;
  if(mode==='wrong-actor')f.nativeMap._events[26]={...a.candidate};
  if(mode==='later')f.interpreter._index=125;
  if(mode==='expired')f.graphics.frameCount+=601;
  if(mode==='blocked')a.candidate._x=39;
  f.frame(mode!=='unpainted');
  if(mode==='cold')f.frame();
  assert.equal(f.played.length+spoken.length,['normal','nvda','cold','resource-pause'].includes(mode)?1:0,mode);
  f.narration.cancel(f.scene);cases++;
 }
 const common=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/CommonEvents.json'),'utf8'));
 for(const mode of ['recorded','nvda','cold','unpainted','hidden','staged-only','other-companions','actor-absent','wrong-source','map-change']){
  const f=fixture(77,25,0,mode!=='cold'),spoken=[];f.root.$dataCommonEvents=common;
  f.root.$gameParty={_actors:[1,5,3,4],addActor(id){this._actors.push(id);}};f.spriteset._tilemap.worldVisible=true;
  const images=new Map(),actors=new Map();
  for(const id of [2,3,4,5])actors.set(id,{setCharacterImage(name){images.set(id,name);},setFaceImage(){},setBattlerImage(){}});
  f.root.$gameActors={actor:id=>actors.get(id)};let refreshes=0;f.root.$gamePlayer.refresh=()=>refreshes++;
  const c=commandContext(f);c.WendyQuestAccessDepartureAccepted=f.narration.departureAccepted;
  for(const row of common[64].list.filter(row=>row.code===322))
   assert(c.Game_Interpreter.prototype.command322.call(f.interpreter,row.parameters));
  assert.equal(refreshes,4);assert.equal(images.get(2),'~Baconator');
  assert(c.Game_Interpreter.prototype.command129.call(f.interpreter,f.interpreter._list[220].parameters));
  assert.deepEqual(f.root.$gameParty._actors,[1,5,3,4,2]);
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});f.host.describeNarration=t=>spoken.push(t);}
  const bacon=f.actor(101),other=f.actor(102);
  Object.assign(bacon.candidate,{_memberIndex:4,_characterName:images.get(2)});bacon.sprite._characterName=images.get(2);
  Object.assign(other.candidate,{_memberIndex:1,_characterName:images.get(3)});other.sprite._characterName=images.get(3);
  f.interpreter._index=mode==='wrong-source'?220:221;f.interpreter.isOnCurrentMap=()=>true;
  f.interpreter.setupChild=list=>f.interpreter._childInterpreter={_list:list};
  f.scene._fadeDuration=12;f.status._brightness=0;
  assert(c.Game_Interpreter.prototype.command117.call(f.interpreter,[38]));f.frame();
  assert.equal(f.played.length+spoken.length,0,'bookkeeping in black is silent');
  f.interpreter._list=null;f.scene._fadeDuration=0;f.status._brightness=255;
  if(mode==='hidden')bacon.sprite.worldVisible=false;
  if(mode==='staged-only')bacon.candidate._memberIndex=0;
  if(mode==='other-companions')bacon.candidate._characterName=bacon.sprite._characterName='~SirChicken';
  if(mode==='actor-absent')f.root.$gameParty._actors.pop();
  if(mode==='map-change')f.nativeMap._mapId=78;
  f.frame(mode!=='unpainted');
  if(mode==='cold')f.frame();
  assert.equal(f.played.length+spoken.length,['recorded','nvda','cold'].includes(mode)?1:0,mode);
  f.narration.cancel(f.scene);cases++;
 }
 // Consecutive actions retain native command order while earlier speech plays.
 {
  const f=fixture(77,25,0);f.spriteset._tilemap.worldVisible=true;
  const t=f.actor(26),b=f.actor(27);
  for(const [a,name,x]of [[t,'~Tatoria',40],[b,'~Baconator',39]]){
   Object.assign(a.candidate,{_characterName:name,_x:x,_y:13,_realX:x,_realY:13,_jumpCount:0});a.sprite._characterName=name;
  }
  f.interpreter._index=76;f.narration.accepted(f.scene,f.interpreter,t.candidate);f.interpreter._index=77;f.frame();
  assert.equal(f.played[0]?.id,'bacon-bridge-landing');
  f.interpreter._index=108;f.narration.accepted(f.scene,f.interpreter,b.candidate);f.interpreter._index=109;f.frame();
  assert.equal(f.played.length,1);assert(!f.played[0].paused);
  f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id,'baconator-landing');f.narration.cancel(f.scene);
 }
 assert.match(require('../src/dialogue/narration-cues.json')['baconator-landing'].text,/^A large man leaps into view/);
 const landing=fixture(77,25,0).interpreter._list[114];
 assert.equal(landing.code,357);assert.equal(landing.parameters[1],'CreateImpulse');assert.equal(landing.parameters[3].Power,'4');
 console.log(`Recruitment narration: ${cases} native jump/cold/recorded/NVDA/paint/one-use/party-regroup and negative cases pass; anonymous landing and FIFO preserved. Throttled frame callbacks total ${total.toFixed(2)} ms, peak ${peak.toFixed(2)} ms; actual game/audio remain separate.`);
};
