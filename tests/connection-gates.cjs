'use strict';
const assert=require('node:assert/strict');
const {transferOptions,catalogTransferOptions}=require('../src/world/transfer-events.cjs');
const {transferState,gateAllows}=require('../src/world/transfer-gates.cjs');
const {captureWorld}=require('../src/world/snapshot');
const {routeApproachPoints}=require('../src/world/routes.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');
 let gates=0,jobs=0,native=0;
 const states=[{}, {switches:[9]}, {switches:[11]}, {switches:[23]}, {switches:[39]},
  {switches:[517]}, {switches:[39,517]}, {switches:[424]}, {variables:{5:3}}, {variables:{5:4}},
  {variables:{5:5}}, {variables:{16:4}}, {variables:{16:5}}, {switches:[404]}, {switches:[405]},
  {switches:[103]}, {self:['134,10,A']}, {switches:[477]}];
 for(const [map,ids]of [[13,[16]],[16,[20,21]],[17,[7]],[59,[1,2,6,7,31,32,33,34,35,36,37]],
  [58,[3,4,27,28]],[94,[12,27]],[97,[18]],[134,[10]],[139,[1]],[141,[1]],[143,[1]],[145,[1]],[154,[1]],[155,[1]],[156,[1]],[183,[3]]]) {
  for(const state of states){
   const f=load(map,state),g=transferState(c);
   for(const id of ids){
    const e=f.gameMap.event(id),entry=f.map.events[id];
    const live=transferOptions(map,entry,e.page(),c.$dataCommonEvents).filter(edge=>gateAllows(edge.gate,g));
    const catalog=catalogTransferOptions(map,entry,c.$dataCommonEvents).filter(edge=>gateAllows(edge.gate,g));
    assert.equal(catalog.length,live.length,`native active page/graph ${map}/${id}, page ${e._pageIndex}`);
    for(const edge of catalog)assert(live.some(actual=>actual.map===edge.map&&actual.x===edge.x&&actual.y===edge.y));
    gates++;
   }
  }
 }
 const before={battle:c.$gameParty.inBattle,message:c.$gameMessage};
 try{
  c.$gameParty.inBattle=()=>false;c.$gameMessage={isBusy:()=>false};
  for(const [map,id,state]of [[14,2,{}],[14,3,{}],[49,12,{}],[63,14,{switches:[54,276]}],[97,18,{switches:[103]}],
   [105,11,{}],[106,12,{switches:[115]}],[106,13,{switches:[115]}],[116,8,{}],[134,10,{self:['134,10,A']}],[181,3,{}],
   [196,22,{}],[202,4,{}],[128,11,{}],[58,3,{}],[58,4,{}],[58,27,{}],[58,28,{}],[94,12,{variables:{16:5}}],[94,27,{variables:{16:5}}]]){
   const f=load(map,state),e=f.gameMap.event(id),p=f.player;p._direction=2;delete p.direction;
   if(map===63||map===106)for(const command of f.map.events[map===63?13:3].pages[0].list) {
    if(command.code!==357||command.parameters[0]!=='Tyruswoo_TileControl'||command.parameters[1]!=='set_tile')continue;
    const a=command.parameters[3],v=JSON.parse(a.coordinates),r=JSON.parse(a.relativity);
    f.gameMap.setTileId(+v.x,+v.y,+v.z,a.tileId,r.clearUpperLayers,r.allowAutotiling);
   }
   p._followers={updateMove(){},areGathering:()=>false};p.setPosition(e.x,e.y);
   const page=e.page(),edge=transferOptions(map,f.map.events[id],page,c.$dataCommonEvents)[0];assert(edge,`wrapper ${map}/${id}`);
   const live=captureWorld(c).live,req={event:id,field:true,stopBeforeEvent:page.trigger===1&&page.priorityType===0,
    bumpDirections:page.trigger===1&&page.priorityType===1?15:undefined};
   const approaches=routeApproachPoints(f.geometry,live,req,()=>false);assert(approaches.length,`native approach ${map}/${id}`);
   const start=approaches[0];p.setPosition(start.x,start.y);
   for(const autowalk of [false,true]){
    p._transferring=false;e._starting=false;
    await verifyWorker(f,{...req,x:start.x,y:start.y,autowalk,limit:8},live,result=>{
     assert(['ready','interrupted'].includes(result.status));if(autowalk)assert.equal(result.course.length,result.distance);
     if(result.status==='interrupted')assert.equal(result.boundaryEvent,id);
     const end=result.arrival;p.setPosition(end.x,end.y);if(end.facing)p.setDirection(end.facing);
     if(result.boundary){p.moveStraight(result.boundary);p.checkEventTriggerHere([1,2]);}
     else if(page.trigger===0){p.checkEventTriggerHere([0]);if(!e.isStarting())p.checkEventTriggerThere([0]);}
     else{p.moveStraight(end.facing);p.checkEventTriggerTouchFront(end.facing);}
     assert(e.isStarting(),`native wrapper activation ${map}/${id}`);
     const it=Object.assign(new c.Game_Interpreter(),{_mapId:map,_eventId:id,_list:e.list(),_index:0,_branch:{}});
     f.gameMap._interpreter=it;const row=page.list.find(row=>row.code===201);assert(it.command201(row.parameters));
     assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[edge.map,edge.x,edge.y,edge.direction]);jobs++;native++;
    });
   }
  }
 }finally{c.$gameParty.inBattle=before.battle;c.$gameMessage=before.message;}
 assert.equal(jobs,40);assert.equal(native,40);
 console.log(`Verified ${gates} original native conditional page states and ${jobs} packaged manual/automatic wrapper approaches/native reservations.`);
};
