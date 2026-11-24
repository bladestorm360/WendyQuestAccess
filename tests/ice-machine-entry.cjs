"use strict";
const assert=require('node:assert/strict');
module.exports=(fixture,commandContext)=>{
 function setup(){
  const f=fixture(27,29,0),{candidate:actor,sprite}=f.actor(29);
  Object.assign(actor,{_characterName:'~ICM',_characterIndex:5,_realX:16,_realY:0,_jumpCount:0,
   forceMoveRoute(route){this.route=route;}});sprite._characterName='~ICM';
  Object.assign(f.interpreter,{_index:1,character:()=>actor,setWaitMode(){}});f.nativeMap.refreshIfNeeded=()=>{};
  const c=commandContext(f),row=f.interpreter._list[1];assert.equal(row.code,205);
  assert.equal(row.parameters[1].wait,true);assert.deepEqual(row.parameters[1].list[0].parameters,[5,6]);
  return {f,actor,sprite,c,row};
 }
 {
  const t=setup();t.f.scene._wqaPreloads=new Set([{}]);
  t.c.Game_Interpreter.prototype.command205.call(t.f.interpreter,t.row.parameters);
  assert(t.actor.route);t.f.frame();assert.equal(t.f.played.length,0);
  t.f.scene._wqaPreloads.clear();t.f.interpreter._index=19;t.actor._jumpCount=8;
  t.f.narration.mechEntry(t.f.scene);t.f.frame(false);assert.equal(t.f.played.length,0);
  t.f.renderer.emit('postrender');assert.equal(t.f.played[0]?.id,'ice-machine-arrives');
  t.actor._jumpCount=0;t.actor._realX=21;t.actor._realY=6;t.f.interpreter._index=20;
  for(let i=0;i<8;i++){t.f.narration.mechEntry(t.f.scene);t.f.frame();}
  assert.equal(t.f.played.length,1);assert(!t.f.played[0].paused,'dialogue does not interrupt the entrance');t.f.narration.leave(t.f.scene);
 }
 for(const invalid of ['hidden','offscreen','wrong-art','loading','detached','too-late','stationary']){
  const t=setup();t.f.interpreter._index=19;t.actor._jumpCount=8;
  if(invalid==='hidden')t.sprite.worldAlpha=0;
  if(invalid==='offscreen')t.sprite.worldTransform.tx=-100;
  if(invalid==='wrong-art')t.actor._characterName='Other';
  if(invalid==='loading')t.f.scene._wqaPreloads=new Set([{}]);
  if(invalid==='detached')t.sprite.parent=null;
  if(invalid==='too-late')t.f.interpreter._index=21;
  if(invalid==='stationary')t.actor._jumpCount=0;
  t.f.narration.mechEntry(t.f.scene);t.f.frame();assert.equal(t.f.played.length,0,invalid);t.f.narration.leave(t.f.scene);
 }
 console.log('Verified native Ice Cream Machine jump request, cold portrait-load recovery, visible entry before dialogue, once-only voice and seven readiness/visibility negatives.');
};
