"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm');
module.exports=(fixture,commandContext,methods)=>{
 function setup(){
  const f=fixture(32,5,0),{candidate,sprite}=f.actor(-1);
  Object.assign(f.interpreter,{_index:2,character:()=>candidate,setWaitMode(mode){this._waitMode=mode;}});
  const row=f.interpreter._list[2];assert.equal(row.code,213);
  assert.deepEqual(row.parameters,[-1,1,true]);
  assert.equal(f.interpreter._list[12].code,401);
  const c=commandContext(f);c.$gameTemp={requestBalloon(){}};
  for(const method of methods)vm.runInContext(method,c);
  return {f,candidate,sprite,c,row};
 }
 for(const cold of [true,false]){
  const {f,candidate,sprite,c,row}=setup();
  if(cold)f.scene._wqaPreloads=new Set([{}]);
  c.Game_Interpreter.prototype.command213.call(f.interpreter,row.parameters);
  f.interpreter._index=3;f.balloon(1,candidate,sprite);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,cold?0:1);
  if(cold)f.scene._wqaPreloads.clear();
  f.narration.questionsPresent(f.scene);f.frame(false);
  if(cold)assert.equal(f.played.length,0,'wait for actual paint');
  f.renderer.emit('postrender');assert.equal(f.played[0]?.id,'startled-wendy');
  for(let i=0;i<10;i++){f.narration.questionsPresent(f.scene);f.frame();}
  assert.equal(f.played.length,1,'native receipt and visible recovery share one balloon');
  f.played[0].emit('ended');f.frame();
  // A later actual activation is a different rendered balloon.
  f.spriteset._balloonSprites=[];f.balloon(1,candidate,sprite);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,2);
  f.narration.leave(f.scene);
 }
 for(const invalid of ['hidden','wrong-balloon','wrong-actor','wrong-page','wrong-map','late','loading']){
  const {f,candidate,sprite}=setup();f.interpreter._index=3;
  f.balloon(invalid==='wrong-balloon'?2:1,candidate,sprite);
  if(invalid==='hidden')f.spriteset._balloonSprites[0].worldVisible=false;
  if(invalid==='wrong-actor')f.root.$gamePlayer={};
  if(invalid==='wrong-page')f.interpreter._list=[];
  if(invalid==='wrong-map')f.nativeMap._mapId=31;
  if(invalid==='late')f.interpreter._index=13;
  if(invalid==='loading')f.scene._wqaPreloads=new Set([{}]);
  f.narration.questionsPresent(f.scene);f.frame();assert.equal(f.played.length,0,invalid);
  f.narration.leave(f.scene);
 }
 console.log('Verified Frostyna path-scene native Wendy surprise, warm/cold readiness recovery, actual paint, shared balloon identity/replay and seven negatives.');
};
