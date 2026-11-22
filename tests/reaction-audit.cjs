'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const cues=require('../src/dialogue/narration-cues.json');
module.exports=function(fixture,commandContext,stock,methods){
 const common=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/CommonEvents.json')));
 let direct=0,children=0;
 function verify(id,beat,child=false){
  const [m,e,p,call,cid,index,actorId,visual]=child?beat:[beat[0],beat[1],beat[2],beat[3],null,beat[3],beat[4],beat[6]];
  const f=fixture(m,e,p),{candidate,sprite}=f.actor(actorId);
  const anchor=cues[id].balloonAnchors?.some(key=>key.join('/')===[m,e,p,call].join('/'));
  if(anchor){candidate._characterName=sprite._characterName='';sprite.texture.valid=false;sprite.worldVisible=false;}
  f.interpreter._index=child?call+1:index;f.root.$dataCommonEvents=common;
  const interpreter=child?{_mapId:m,_eventId:e,_list:common[cid].list,_index:index}:f.interpreter;
  if(child)f.interpreter._childInterpreter=interpreter;
  const c=commandContext(f);c.$gameTemp={requestBalloon(){}};
  for(const method of methods)vm.runInContext(method,c);
  interpreter.character=()=>candidate;interpreter.setWaitMode=()=>{};
  const row=interpreter._list[index];assert.equal(row.code,213);
  assert(c.Game_Interpreter.prototype.command213.call(interpreter,row.parameters));
  f.frame();assert.equal(f.played.length,0,'native request alone is silent');
  f.balloon(visual,candidate,sprite);const balloon=f.spriteset._balloonSprites.at(-1);balloon.worldTransform={tx:100,ty:100};
  balloon.worldVisible=false;f.frame();assert.equal(f.played.length,0);balloon.worldVisible=true;
  f.frame(false);assert.equal(f.played.length,0);f.renderer.emit('postrender');assert.equal(f.played[0]?.id,id,[m,e,p,index].join('/'));
  f.narration.leave(f.scene);assert(f.played[0].paused);
 }
 for(const [id,cue]of Object.entries(cues)){
  for(const beat of cue.beats)if([1,8,10].includes(beat[6])){verify(id,beat);direct++;}
  for(const beat of cue.commonBeats||[]){verify(id,beat,true);children++;}
 }
 // Every native map exclamation/ellipsis/Zzz request has an exact locator.
 const recorded=new Set(Object.values(cues).flatMap(cue=>cue.beats).filter(b=>[1,8,10].includes(b[6])).map(b=>b.slice(0,4).join('/')));
 let native=0;
 for(const file of fs.readdirSync(path.join(stock,'package.nw/data')).filter(name=>/^Map\d+\.json$/.test(name))){
  const m=Number(file.slice(3,6)),map=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data',file)));
  for(const event of map.events||[])if(event)for(const[p,page]of event.pages.entries())for(const[i,row]of page.list.entries())
   if(row.code===213&&[1,8,10].includes(row.parameters[1])){assert(recorded.has([m,event.id,p,i].join('/')));native++;}
 }
 assert.equal(native,89);assert.equal(direct,89);assert.equal(children,54);
 // A descending actor remains offscreen beyond the ordinary balloon window.
 {
  const f=fixture(16,39,0),{candidate,sprite}=f.actor(39);candidate._realX=candidate._realY=0;
  sprite.worldTransform.ty=-80;f.interpreter._index=6;f.interpreter.character=()=>candidate;f.interpreter.isOnCurrentMap=()=>true;
  f.nativeMap.refreshIfNeeded=()=>{};candidate.forceMoveRoute=()=>{};f.interpreter.setWaitMode=()=>{};
  const c=commandContext(f),row=f.interpreter._list[6];assert(c.Game_Interpreter.prototype.command205.call(f.interpreter,row.parameters));
  candidate._realY=1;for(let i=0;i<70;i++)f.frame();assert.equal(f.played.length,0,'offscreen approach is silent');
  sprite.worldTransform.ty=100;f.frame();assert.equal(f.played[0]?.id,'mechs-descend');f.narration.leave(f.scene);
 }
 // The beach script switches to its next autorun page before first paint.
 // Execute native setup/load ordering: playback closes, inert receipts wait.
 {
  const f=fixture(13,5,2),wendy=f.actor(-1),elder=f.actor(5);
  const c=commandContext(f);c.$gameTemp={requestBalloon(){}};
  c.WendyQuestAccessNarrationEventEntry=f.narration.entry;
  for(const method of methods)vm.runInContext(method,c);
  f.interpreter.character=id=>id===-1?wendy.candidate:elder.candidate;f.interpreter.setWaitMode=()=>{};
  for(const i of [4,7]){f.interpreter._index=i;const row=f.interpreter._list[i];c.Game_Interpreter.prototype.command213.call(f.interpreter,row.parameters);}
  assert(f.scene._wqaReactionReceipts);assert(!f.scene._wqaNarrationActive);
  f.nativeMap.mapId=()=>13;f.interpreter.clear=c.Game_Interpreter.prototype.clear;
  f.interpreter.loadImages=()=>{assert(!f.scene._wqaNarrationActive);f.scene._wqaPreloads=new Set([{}]);};
  c.Game_Interpreter.prototype.setup.call(f.interpreter,f.root.$dataMap.events[5].pages[1].list,5);
  f.balloon(1,wendy.candidate,wendy.sprite);f.balloon(1,elder.candidate,elder.sprite);
  f.frame();assert.equal(f.played.length,0,'nothing executes during native image loading');
  f.scene._wqaPreloads.clear();f.frame();assert.equal(f.played[0]?.id,'startled-wendy');
  assert.equal(f.played.length,1);f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id,'startled-elder-tater');
  f.narration.leave(f.scene);assert(f.played[1].paused);assert(!f.scene._wqaReactionReceipts);
 }
 // An admitted but not yet painted balloon must also survive event setup.
 {
  const f=fixture(13,5,2),source=f.actor(-1);f.interpreter._index=4;
  f.narration.accepted(f.scene,f.interpreter,source.candidate,undefined,1);
  f.balloon(1,source.candidate,source.sprite);const balloon=f.spriteset._balloonSprites[0];balloon.worldVisible=false;
  f.frame();assert.equal(f.played.length,0);assert(f.scene._wqaNarrationActive);
  f.narration.entry(f.scene);f.interpreter._list=f.root.$dataMap.events[5].pages[3].list;
  assert(!f.scene._wqaNarrationActive);balloon.worldVisible=true;f.frame();assert.equal(f.played[0]?.id,'startled-wendy');
  f.narration.leave(f.scene);
 }
 // The actual beach waiting page reenters every frame but loads no images.
 {
  const f=fixture(13,5,2),source=f.actor(-1),c=commandContext(f);
  f.interpreter._index=4;f.narration.accepted(f.scene,f.interpreter,source.candidate,undefined,1);
  f.nativeMap.mapId=()=>13;f.interpreter.clear=c.Game_Interpreter.prototype.clear;
  f.interpreter.loadImages=c.Game_Interpreter.prototype.loadImages;
  c.WendyQuestAccessNarrationEventEntry=f.narration.entry;
  c.ImageManager={loadFace(){throw Error('The wait-only page must not load an image');}};
  const wait=f.root.$dataMap.events[5].pages[3].list;
  c.Game_Interpreter.prototype.setup.call(f.interpreter,wait,5);
  f.balloon(1,source.candidate,source.sprite);f.frame();assert.equal(f.played[0]?.id,'startled-wendy');
  for(let n=0;n<30;n++){c.Game_Interpreter.prototype.setup.call(f.interpreter,wait,5);f.frame();assert(!f.played[0].paused,'same ready wait must not truncate playback');}
  f.interpreter.loadImages=()=>{};
  c.Game_Interpreter.prototype.setup.call(f.interpreter,f.root.$dataMap.events[5].pages[1].list,5);
  assert(f.played[0].paused,'a genuine different entry still retires playback before image work');
 }
 console.log('Reaction audit: all89 native map surprise/ellipsis/Zzz locators and54 exact common-event callers; named blank anchors; visible balloons; native script/image-load handoff; delayed Mech Double descent; cancellation.');
};
