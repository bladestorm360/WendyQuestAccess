'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {createAutowalk}=require('../src/world/autowalk');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');
 const state={switches:[11,23,33,51,52,53],variables:{5:0,10:4}};
 const proof=load(49,state),list=proof.map.events[3].pages[0].list;
 assert.deepEqual(list,proof.map.events[6].pages[0].list,'covered exits have the exact same native script');
 for(const [d,x,y]of [[2,27,6],[4,28,7],[6,26,7],[8,27,8]]){
  proof.player.setPosition(x,y);assert.equal(proof.player.canPass(x,y,d),d===8);
 }
 assert.equal(proof.gameMap.event(6)._x,27);assert.equal(proof.gameMap.event(6)._y,8);
 assert.equal(proof.gameMap.event(6)._trigger,1);
 const scene=c.SceneManager._scene;scene._wqaFieldReady=true;
 c.Input={dir4:0};c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};c.$gameMessage={isBusy:()=>false};
 for(const auto of [false,true])for(const id of [4,5,6,7,8,9,10]){
  const f=load(49,state);f.player.setPosition(21,9);
  f.player._followers={areGathering:()=>false,updateMove(){}};
  const snap=captureWorld(c);
  assert(!snap.objects.some(t=>t.id===3));assert(snap.objects.some(t=>t.id===id&&t.category==='exits'));
  let route;await verifyWorker(f,{x:21,y:9,event:id,field:true,autowalk:auto,stopBeforeEvent:true},snap.live,r=>route=r);
  assert.equal(route.status,'interrupted');assert.equal(route.boundaryEvent,id);
  if(auto){
   const reports=[],walk=createAutowalk(c,()=>true,()=>({autowalk:true}),(_scene,r,_failed,arrived)=>reports.push({r,arrived}));
   c.WendyQuestAccessAutowalkInput=walk.input;c.WendyQuestAccessFieldMove=walk.moved;
   c.WendyQuestAccessFieldChanged=()=>{};
   assert(walk.start({scene,map:49,x:21,y:9,mode:'walk',target:id},route,{kind:'routeDirections',activate:route.boundary}));
   for(let n=0;walk.active(scene)&&n<60;n++){
    f.player.moveByInput();f.player._realX=f.player._x;f.player._realY=f.player._y;
   }
   assert(!walk.active(scene));assert(reports.at(-1)?.arrived);
   assert.deepEqual([f.player._x,f.player._y],[route.arrival.x,route.arrival.y]);
   assert(!f.gameMap.events().some(e=>e.isStarting()),'world exit remains player activated');
  }
 }
 console.log('Breaded Bay: exact covered-exit equivalence and four native approach tests; all seven usable east exits route manually and walk to their interaction boundary without automatic activation.');
};
