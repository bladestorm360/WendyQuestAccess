const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {solveRoute}=require('../src/world/routes.cjs');
const {routeThroughTerrain}=require('../src/world/terrain-controls.cjs');
const {iceMeltChanges}=require('../src/world/local-destinations');
module.exports=async function verify(c,load,snapshot,read,verifyWorker){
 c.$gameParty.inBattle=()=>false;
 const ids=[44,47,48,57];
 function prepared(){const f=load(12,{switches:[1,16],self:ids.map(id=>`12,${id},A`)});
  for(const id of ids)f.gameMap.event(id).SetBlocker(-1,-1,1,0);return f;}
 for(const [x,y] of [[15,36],[30,16]])for(const target of [7,26,58]) {
  const f=prepared();f.player.setPosition(x,y);const view=captureWorld(c);
  const request={x,y,event:target,field:true,limit:8};
  assert.equal(solveRoute(f.geometry,view.live,request).status,'unreachable');
  for(const autowalk of [false,true])await verifyWorker(f,{...request,autowalk},view.live,result=>{
   assert.equal(result.status,'iceRoute');assert.equal(result.event,target===58?57:47);
   if(autowalk)assert.equal(result.course.length,result.distance);
  });
 }
 const f=prepared(),ice=f.gameMap.event(57),changes=iceMeltChanges(f.map.events[57],f.map.events[57].pages[1]);
 assert.deepEqual(changes.relocate,[58,44,9]);
 const script=Object.assign(new c.Game_Interpreter(),{_mapId:12,_eventId:57});
 script.command203(f.map.events[57].pages[3].list[0].parameters);
 Object.assign(ice,{_erased:true,_through:true,_priorityType:0});
 f.player.setPosition(42,9);
 await verifyWorker(f,{x:42,y:9,event:58,field:true,autowalk:true},captureWorld(c).live,result=>assert.equal(result.status,'ready'));
 // An unrelated hard collider is never discarded to justify a button chain.
 const {composeWorld}=require('../src/world/geometry.cjs');
 const live=captureWorld(c).live;live.events.push({id:500,x:42,y:16,normal:false,through:false,rectangle:[0,0,51,42],trigger:3,action:false});
 assert.equal(routeThroughTerrain(f.geometry,live,{x:15,y:36,event:7,field:true},[[56,[[824,15],[825,15],[826,15]]]],()=>false),null);
 assert.equal(routeThroughTerrain(f.geometry,live,{x:15,y:36,event:7,field:true},[[56,[[824,15]]]],()=>true).status,'cancelled');
 console.log('Verified all3 Russetwood chests at both logged positions with12 manual/automatic worker jobs, full courses, original northern-chest relocation, native post-melt approach and hard-gate/cancellation negatives.');
};
