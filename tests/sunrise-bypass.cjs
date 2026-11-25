'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {solveRoute}=require('../src/world/routes.cjs');
const {createAutowalk}=require('../src/world/autowalk');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$gameParty.members=()=>[4];c.$gameParty._actors=[1,3,4,5];
 const forbidden=[50,51,76,77,79],scene=c.SceneManager._scene;scene._wqaFieldReady=true;
 c.Input={dir4:0};c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};c.$gameMessage={isBusy:()=>false};
 function loadState(skip,stage=0,met=false){
  const state={switches:[11,23,33,38,39,51,52,53,77,...skip?[462,463]:[],...met?[90]:[],...stage===6?[464]:[]],
   variables:{5:0,10:4,14:stage}};
  const f=load(76,state);
  // The sixth warning has no forced retreat; Wendy remains on its tile.
  if(stage===6){assert.equal(f.map.events[53].pages[6].trigger,1);assert.equal(f.map.events[53].pages[6].list[0].code,214);}
  f.player.setPosition(stage===6?16:12,stage===6?6:48);f.player._followers={areGathering:()=>false,updateMove(){}};
  // These exact native glitch pages each erase themselves on completion.
  for(const id of [95,96]){assert(f.map.events[id].pages[0].list.some(r=>r.code===214));f.gameMap._events[id]._erased=true;}
  return f;
 }
 for(const auto of [false,true])for(let stage=0;stage<=6;stage++){
  const f=loadState(true,stage),snap=captureWorld(c);
  assert.deepEqual(snap.live.avoidScenes,stage===6?[50,51]:forbidden);
  let route;await verifyWorker(f,{x:f.player._x,y:f.player._y,event:2,field:true,autowalk:auto,stopBeforeEvent:true},snap.live,r=>route=r);
  assert.equal(route.status,'interrupted');assert.equal(route.boundaryEvent,stage===6?2:53);
  const check=()=>{assert(!forbidden.some(id=>f.gameMap.event(id).pos(f.player._x,f.player._y)),
   'the real walking course must not enter an Eggward scene');};
  if(auto){
   const reports=[],walk=createAutowalk(c,()=>true,()=>({autowalk:true}),(_s,r,_f,arrived)=>reports.push({r,arrived}));
   c.WendyQuestAccessAutowalkInput=walk.input;c.WendyQuestAccessFieldMove=walk.moved;c.WendyQuestAccessFieldChanged=()=>{};
   assert(walk.start({scene,map:76,x:f.player._x,y:f.player._y,mode:'walk',target:2},route,{kind:'routeDirections',activate:route.boundary}));
   for(let n=0;walk.active(scene)&&n<160;n++){f.player.moveByInput();f.player._realX=f.player._x;f.player._realY=f.player._y;check();}
   assert(!walk.active(scene));assert(reports.at(-1)?.arrived);
  }else for(const leg of route.legs)for(let n=0;n<leg.tiles;n++){
   assert(f.player.canPass(f.player._x,f.player._y,leg.direction));f.player.moveStraight(leg.direction);
   f.player._realX=f.player._x;f.player._realY=f.player._y;check();
  }
  assert.deepEqual([f.player._x,f.player._y],[route.arrival.x,route.arrival.y]);
  assert(!f.gameMap.events().some(e=>e.isStarting()),'required warnings/exits wait for player activation');
  assert.equal(c.$gameSwitches.value(90),false);assert.equal(c.$gameVariables.value(14),stage);
 }
 for(const [skip,met]of [[false,false],[true,true]]){
  const f=loadState(skip,0,met),snap=captureWorld(c);assert.equal(snap.live.avoidScenes,undefined);
  assert.deepEqual(solveRoute(f.geometry,snap.live,{x:12,y:48,event:2,field:true}),
   solveRoute(f.geometry,{...snap.live,avoidScenes:undefined},{x:12,y:48,event:2,field:true}));
 }
 for(const id of forbidden){
  const f=loadState(true),snap=captureWorld(c);
  const r=solveRoute(f.geometry,snap.live,{x:12,y:48,event:id,field:true,stopBeforeEvent:true});
  assert.equal(r.status,'interrupted');assert(forbidden.includes(r.boundaryEvent),'explicit scene targets retain their real approach or native prerequisite');
 }
 console.log('Sunrise Bay:14 native manual/Autowalk journeys avoid Eggward across all seven warning states; explicit scene selection, native prerequisites, player-owned activation and normal/met-Eggward negatives pass.');
};
