'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
module.exports=(fixture,commandContext,stock)=>{
 const extract=mode=>JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),mode],{encoding:'utf8',timeout:6000}));
 const admission=extract('narration-ready'),pages=extract('elder-pages');let cases=0,peak=0,total=0;
 function setup(event,cold,nvda){
  const f=fixture(106,event,0,!cold),a=f.actor(11),bar=f.actor(1),spoken=[];
  f.spriteset._tilemap.worldVisible=true;f.root.$gameTroop={};
  f.nativeMap.mapId=()=>106;f.nativeMap.refreshIfNeeded=()=>{};
  f.root.$gameSwitches.setValue=(id,on)=>on?f.switches.add(id):f.switches.delete(id);
  f.root.$gameSelfSwitches={value:()=>false};
  if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  const c=commandContext(f);c.$gameTroop={};c.Game_Event=function(){};
  c.$gameSelfSwitches=f.root.$gameSelfSwitches;
  for(const source of pages)vm.runInContext(source,c);
  function publish(actor,id,paint){
   actor.candidate.event=()=>f.root.$dataMap.events[id];
   Object.assign(actor.candidate,{_mapId:106,_eventId:id,meetsConditions:c.Game_Event.prototype.meetsConditions});
   actor.candidate._pageIndex=c.Game_Event.prototype.findProperPageIndex.call(actor.candidate);
   actor.candidate._characterName=actor.candidate.event().pages[actor.candidate._pageIndex].image.characterName;
   if(paint)actor.sprite._characterName=actor.candidate._characterName;
  }
  publish(a,11,true);publish(bar,1,true);
  c.WendyQuestAccessNarrationEventEntry=f.narration.entry;
  c.WendyQuestAccessNarrationPresent=f.narration.present;
  c.ImageManager={loadPicture(){throw Error('No picture preload in this page');},loadFace(){
   assert(c.ImageManager._wqaInterpreterPreload);
   if(cold){f.narration.pause(f.scene);(f.scene._wqaPreloads ||= new Set()).add('portrait');}
  }};
  f.interpreter.clear=c.Game_Interpreter.prototype.clear;
  f.interpreter.loadImages=c.Game_Interpreter.prototype.loadImages;
  const update=vm.runInContext('(function(){'+admission+'})',c);
  function frame(paint=true){f.graphics.frameCount++;update.call(f.scene);if(paint)f.renderer.emit('postrender');}
  return {...f,a,bar,spoken,c,frame,publish,count:()=>spoken.length+f.played.length};
 }
 for(const event of [3,6,7,8])for(const cold of [false,true])for(const nvda of [false,true])for(const early of [false,true]){
  const f=setup(event,cold,nvda),list=f.interpreter._list;
  const index=list.findIndex(row=>row.code===121&&row.parameters.join(',')==='115,115,0');assert(index>0);
  f.interpreter._index=index;
  f.c.Game_Interpreter.prototype.command121.call(f.interpreter,list[index].parameters);
  f.publish(f.a,11,false);f.publish(f.bar,1,false);
  if(early){f.publish(f.a,11,true);f.publish(f.bar,1,true);f.frame();}
  f.c.Game_Interpreter.prototype.clear.call(f.interpreter);
  f.c.Game_Interpreter.prototype.setup.call(f.interpreter,f.root.$dataMap.events[11].pages[1].list,11);
  f.interpreter._index=6; // Native first Show Text has consumed rows2–5.
  if(cold){const admitted=f.count();for(let n=0;n<30;n++)f.frame();
   assert.equal(f.count(),admitted,'resource phase admits no new description');f.scene._wqaPreloads.clear();}
  f.publish(f.a,11,true);f.publish(f.bar,1,true);const at=performance.now();f.frame(false);f.frame(false);
  const before=f.count();f.renderer.emit('postrender');assert.equal(f.count(),1,'native release→autorun handoff recovers one visible cell opening');
  const cost=performance.now()-at;peak=Math.max(peak,cost);total+=cost;
  if(!early)assert.equal(before,0,'a newly recovered release waits for actual postrender');
  assert(before<=1,'never duplicate a parent caption');
  if(nvda)assert.deepEqual(f.spoken,['The cell opens, freeing Elder Tater.']);
  else {assert.equal(f.played[0].id,'elder-tater-freed');f.played[0].emit('ended');}
  for(let n=0;n<30;n++)f.frame();assert.equal(f.count(),1,'one effect across both native interpreters');
  f.narration.leave(f.scene);cases++;
 }
 const invalids=['switch-off','barred-still-drawn','free-hidden','free-offscreen','actor-replaced','foreign-map',
  'wrong-page','late','new-list','unpainted','tilemap-hidden','disabled','wrong-bar-page','stale-free-graphic'];
 for(const invalid of invalids){
  const f=setup(7,false,false);f.switches.add(115);
  f.c.Game_Interpreter.prototype.setup.call(f.interpreter,f.root.$dataMap.events[11].pages[1].list,11);
  f.interpreter._index=6;f.publish(f.a,11,true);f.publish(f.bar,1,true);
  if(invalid==='switch-off')f.switches.delete(115);
  if(invalid==='barred-still-drawn')f.bar.sprite._characterName='~ELDERTATERBEHINDBARS';
  if(invalid==='free-hidden')f.a.sprite.worldVisible=false;
  if(invalid==='free-offscreen')f.a.sprite.worldTransform.tx=800;
  if(invalid==='actor-replaced')f.nativeMap._events[11]={...f.a.candidate};
  if(invalid==='foreign-map')f.nativeMap._mapId=107;
  if(invalid==='wrong-page')f.interpreter._list=f.root.$dataMap.events[11].pages[2].list;
  if(invalid==='late')f.interpreter._index=7;
  if(invalid==='new-list')f.interpreter._list=[];
  if(invalid==='tilemap-hidden')f.spriteset._tilemap.worldVisible=false;
  if(invalid==='disabled')f.playback.narration.enabled=false;
  if(invalid==='wrong-bar-page')f.bar.candidate._pageIndex=0;
  if(invalid==='stale-free-graphic')f.a.sprite._characterName='';
  f.frame(invalid!=='unpainted');f.frame(invalid!=='unpainted');assert.equal(f.count(),0,invalid);f.narration.leave(f.scene);
 }
 console.log(`Elder release: ${cases} native switch/page/clear/setup/preload handoffs, four entrances, recorded/NVDA, warm/cold, parent/child no-repeat and${invalids.length} negatives pass. Throttled ready/paint episodes ${total.toFixed(2)}ms aggregate/${peak.toFixed(2)}ms peak; physical audio/game responsiveness remain separate.`);
};
