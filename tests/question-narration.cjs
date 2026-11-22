"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const cues=require('../src/dialogue/narration-cues.json');
module.exports=function(fixture,commandContext,stock,methods){
 const common=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/CommonEvents.json')));
 const cases=[];
 for(const[id,cue]of Object.entries(cues)){
  for(const b of cue.beats)if(b[6]===2)cases.push({id,m:b[0],e:b[1],p:b[2],i:b[3],a:b[4],anchor:!!cue.balloonAnchors?.some(k=>k.join('/')===b.slice(0,4).join('/'))});
  for(const b of cue.commonBeats||[])if(b[7]===2)cases.push({id,m:b[0],e:b[1],p:b[2],i:b[5],a:b[6],cid:b[4],call:b[3]});
 }
 assert.equal(cases.length,46);
 for(const entry of cases)for(const cold of [false,true]){
  const f=fixture(entry.m,entry.e,entry.p),subject=f.actor(entry.a),c=commandContext(f);
  for(const method of methods)vm.runInContext(method,c);
  subject.candidate._eventId=entry.a;
  if(entry.anchor){subject.candidate._characterName=subject.sprite._characterName='';subject.sprite.texture.valid=false;subject.sprite.worldVisible=false;}
  f.root.$dataCommonEvents=common;
  const script=entry.cid?{_mapId:entry.m,_eventId:entry.e,_list:common[entry.cid].list,_index:entry.i}:f.interpreter;
  if(entry.cid){f.interpreter._childInterpreter=script;f.interpreter._index=entry.call+1;}
  else f.interpreter._index=entry.i;
  script.character=()=>subject.candidate;script.setWaitMode=()=>{};
  c.$gameTemp={requestBalloon(actor,id){assert.equal(actor,subject.candidate);assert.equal(id,2);}};
  if(cold){
   f.scene._wqaPreloads=new Set([{}]);f.nativeMap._needsTilemapRefresh=true;
   if(entry.cid){
    c.ImageManager={loadFace(){},loadPicture(name){assert.equal(name,'white');f.scene._wqaPreloads.add({});}};
    c.Game_Interpreter.prototype.loadImages.call(script);
   }
  }
  assert(c.Game_Interpreter.prototype.command213.call(script,script._list[entry.i].parameters));
  f.balloon(2,subject.candidate,subject.sprite);const balloon=f.spriteset._balloonSprites[0];balloon.worldTransform={tx:100,ty:100};
  if(cold){
   f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,0,'no work during actual preload/tile gates');
   f.scene._wqaPreloads.clear();f.nativeMap._needsTilemapRefresh=false;f.interpreter._list=null;
  }
  balloon.worldVisible=false;f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,0);
  balloon.worldVisible=true;f.narration.questionsPresent(f.scene);f.frame(false);assert.equal(f.played.length,0);
  f.renderer.emit('postrender');assert.equal(f.played[0]?.id,entry.id);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,1,'native receipt and ready-frame observation share balloon identity');
  f.played[0].emit('ended');f.frame();f.spriteset._balloonSprites=[];
  f.balloon(2,subject.candidate,subject.sprite);f.spriteset._balloonSprites[0].worldTransform={tx:100,ty:100};
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,2,'a different real balloon is a new event');
  f.narration.leave(f.scene);
 }
 for(const e of [54,55]){
  const f=fixture(16,e,0),c=commandContext(f),wendy=f.actor(-1),chest=f.actor(52);
  for(const method of methods)vm.runInContext(method,c);
  f.root.$dataCommonEvents=common;f.interpreter._index=1;
  const child=f.interpreter._childInterpreter={_mapId:16,_eventId:e,_list:common[200].list,_index:8,
   character:()=>wendy.candidate,setWaitMode(){}};
  c.$gameTemp={requestBalloon(){}};
  assert(c.Game_Interpreter.prototype.command213.call(child,child._list[8].parameters));
  f.balloon(2,wendy.candidate,wendy.sprite);f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played[0]?.id,'puzzled-wendy');
  child._index=20;f.root.$gameSwitches.setValue=(key,value)=>value?f.switches.add(key):f.switches.delete(key);
  assert(c.Game_Interpreter.prototype.command121.call(child,child._list[20].parameters));assert(f.switches.has(544));
  child._index=22;f.status._pictures={44:{_name:'white',_opacity:255}};
  chest.candidate._pageIndex=0;chest.candidate._characterName=chest.sprite._characterName='';
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,1,'switch alone is not a rendered chest');
  const page=f.root.$dataMap.events[52].pages[1];chest.candidate._pageIndex=1;
  chest.candidate._characterName=chest.sprite._characterName=page.image.characterName;
  f.narration.questionsPresent(f.scene);for(let n=0;n<25;n++)f.frame();assert.equal(f.played.length,1,'the opaque white flash still hides it');
  f.status._pictures[44]._opacity=100;f.frame();assert.equal(f.played.length,1,'appearance queues behind an active description');assert(!f.played[0].paused);
  f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id,'assistance-chest');assert(f.scene._wqaAssistanceReveal);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,2);f.narration.leave(f.scene);
 }
 {
  const f=fixture(16,54,0),unknown=f.actor(10);unknown.candidate._eventId=10;f.balloon(2,unknown.candidate,unknown.sprite);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,0,'unregistered actors do not inherit a name');
 }
 // A cold chest image can finish while Dave's offer is already displayed.
 {
  const f=fixture(16,54,0),chest=f.actor(52);f.root.$dataCommonEvents=common;f.interpreter._index=1;
  f.interpreter._childInterpreter={_list:common[200].list,_index:28};f.switches.add(544);
  chest.candidate._pageIndex=1;chest.candidate._characterName=chest.sprite._characterName='TREASURE CHEST SPECIAL';
  f.scene._wqaPreloads=new Set([{}]);f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,0);
  f.scene._wqaPreloads.clear();f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played[0]?.id,'assistance-chest');f.narration.leave(f.scene);
 }
 // Fixed worst-case native balloon collection, followed by240 ready frames.
 {
  const f=fixture(113,11,0),entries=cases.filter(row=>row.m===113),subjects=new Map();f.interpreter._list=null;
  for(let i=0;i<32;i++){
   const id=entries[i%entries.length].a;let subject=subjects.get(id);
   if(!subject){subject=f.actor(id);subject.candidate._eventId=id;subject.candidate._characterName=subject.sprite._characterName='';subject.sprite.worldVisible=false;subject.sprite.texture.valid=false;subjects.set(id,subject);}
   f.balloon(2,subject.candidate,subject.sprite);f.spriteset._balloonSprites.at(-1).worldTransform={tx:100,ty:100};
  }
  const started=performance.now();f.narration.questionsPresent(f.scene);f.frame();const first=performance.now()-started;
  let t=performance.now();for(let n=0;n<240;n++)f.frame();const baseline=performance.now()-t;
  t=performance.now();for(let n=0;n<240;n++){f.narration.questionsPresent(f.scene);f.frame();}const observed=performance.now()-t;
  assert.equal(f.played.length,1,'collection does not interrupt its active clip');f.narration.leave(f.scene);
  console.log('Throttled32-balloon collection/paint',first.toFixed(2),'ms;240 ready frames',baseline.toFixed(2),'ms baseline,',observed.toFixed(2),'ms with observation.');
 }
 // Idle's question has a separate native owner and wake cancellation.
 {
  const f=fixture(16,54,0),player=f.actor(-1);f.interpreter._list=null;f.nativeMap.inactiveTime=30.25;
  f.balloon(2,player.candidate,player.sprite);f.narration.idle(f.scene);f.narration.questionsPresent(f.scene);f.frame();
  assert.equal(f.played[0]?.id,'idle-question');assert.equal(f.played.length,1);
  f.nativeMap.inactiveTime=0;f.narration.questionsPresent(f.scene);f.frame();assert(f.played[0].paused,'story-question observation must not take ownership of idle');
  assert.equal(f.played.length,1);f.narration.leave(f.scene);
 }
 console.log('Question audit: all44 map requests and both common200 callers, warm and cold/tile-handoff recovery, actual visible balloon identity/postrender, repeated distinct events, unknown actors, and both rendered assistance chest reveals queued after Wendy.');
};
