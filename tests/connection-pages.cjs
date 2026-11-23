"use strict";
// Every qualified active native page is exercised with its own conditions.
// Conditional branch equivalence is checked separately by connection-gates.
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {transferOptions,catalogTransferOptions}=require('../src/world/transfer-events.cjs');
const {solveRoute,routeApproachPoints}=require('../src/world/routes.cjs');
const {DIRECTIONS}=require('../src/world/geometry.cjs');
module.exports=async(c,load,read)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$gameParty.inBattle=()=>false;
 c.$gameMessage={isBusy:()=>false};let pages=0,edges=0,handoffs=0;
 const covered=new Set(),blocked=[],shadowed=[],maps=new Set(), verifiedDestinations=new Set();
 for(const info of read('MapInfos.json').filter(Boolean)){
  const data=read('Map'+String(info.id).padStart(3,'0')+'.json');
  for(const entry of data.events.filter(Boolean))for(const [pi,page]of entry.pages.entries()){
   if(!transferOptions(info.id,entry,page,c.$dataCommonEvents).length)continue;
   const q=page.conditions,state={switches:[],self:[],variables:{}};
   if(q.switch1Valid)state.switches.push(q.switch1Id);if(q.switch2Valid)state.switches.push(q.switch2Id);
   if(q.selfSwitchValid)state.self.push(`${info.id},${entry.id},${q.selfSwitchCh}`);
   if(q.variableValid)state.variables[q.variableId]=q.variableValue;
   const f=load(info.id,state),e=f.gameMap.event(entry.id),p=f.player;
   if(e._pageIndex!==pi){shadowed.push([info.id,entry.id,pi,e._pageIndex]);continue;}
   const key=[info.id,entry.id,pi].join('/');if(covered.has(key))continue;covered.add(key);pages++;maps.add(info.id);
   p._direction=2;delete p.direction;p._followers={updateMove(){},areGathering:()=>false};
   p.setPosition(entry.x,entry.y);
   const live=captureWorld(c).live;
   const options=transferOptions(info.id,entry,e.page(),c.$dataCommonEvents);
   for(const edge of options){
    edges++;
    const bump=page.priorityType===1&&page.trigger===1;
    const request={event:entry.id,field:true,stopBeforeEvent:page.priorityType===0&&page.trigger===1,
      entryDirection:bump?undefined:edge.approach,bumpDirections:bump?(edge.approach?1<<DIRECTIONS.indexOf(edge.approach):15):undefined};
    const approaches=routeApproachPoints(f.geometry,live,request,()=>false);
    let witness;
    for(const point of approaches){
     for(const direction of DIRECTIONS){
      const x=f.gameMap.roundXWithDirection(point.x,10-direction),y=f.gameMap.roundYWithDirection(point.y,10-direction);
      if(!p.canPass(x,y,direction))continue;
      const result=solveRoute(f.geometry,live,{...request,x,y});
      if(result.status==='ready'||result.status==='interrupted'&&result.boundaryEvent===entry.id){witness={x,y,result};break;}
     }if(witness)break;
    }
    if(!witness){blocked.push([info.id,entry.id,pi,edge.map,edge.x,edge.y]);continue;}
    verifiedDestinations.add([info.id,edge.map,edge.x,edge.y].join('/'));
    assert(page.list.some(row=>row.code===201&&row.parameters[0]===0&&row.parameters[1]===edge.map&&
      row.parameters[2]===edge.x&&row.parameters[3]===edge.y)||page.list.some(row=>row.code===117),`literal native destination ${key}`);
    // Replay the same native movement/input semantics for manual directions
    // and the accepted automatic course. No teleport bypasses the approach.
    for(const automatic of [false,true]){
     p._transferring=false;p.setPosition(witness.x,witness.y);for(const actor of f.gameMap.events())actor._starting=false;
     for(const leg of witness.result.legs)for(let n=0;n<leg.tiles;n++){
      assert(p.canPass(p.x,p.y,leg.direction),`native edge ${key}`);p.moveStraight(leg.direction);
     }
     if(witness.result.boundary){p.moveStraight(witness.result.boundary);p.checkEventTriggerHere([1,2]);}
     else if(page.trigger===0){if(witness.result.arrival.facing)p.setDirection(witness.result.arrival.facing);
      p.checkEventTriggerHere([0]);if(!e.isStarting())p.checkEventTriggerThere([0]);}
     else if(bump){p.moveStraight(witness.result.arrival.facing);p.checkEventTriggerTouchFront(witness.result.arrival.facing);}
     else p.checkEventTriggerHere([1,2]);
     assert(e.isStarting(),`native ${automatic?'automatic':'manual'} activation ${key}`);
     const it=Object.assign(new c.Game_Interpreter(),{_mapId:info.id,_eventId:entry.id,_list:e.list(),_index:0,_branch:{}});
     f.gameMap._interpreter=it;assert(it.command201([0,edge.map,edge.x,edge.y,edge.direction,0]));
     assert.deepEqual([p._newMapId,p._newX,p._newY],[edge.map,edge.x,edge.y]);handoffs++;
    }
   }
  }
 }
 console.log(JSON.stringify({pages,edges,maps:maps.size,handoffs,blocked,shadowed}));
 assert.equal(pages,837);assert.equal(edges,821);assert.equal(handoffs,1512);assert.equal(blocked.length,65);
 const specialized=new Set(['45/12','87/73','103/6','104/7','113/83','113/108','113/121','113/135','199/26']);
 let equivalent=0,prototype=0,owned=0;
 for(const [map,event,,target,x,y]of blocked){
  if(map===7){prototype++;continue;}
  if(specialized.has(map+'/'+event)){owned++;continue;}
  assert(verifiedDestinations.has([map,target,x,y].join('/')),`unverified connection ${map}/${event}`);equivalent++;
 }
 assert.deepEqual([equivalent,prototype,owned],[45,11,9]);
 console.log('Accounted for all65 non-independent approaches:45 redundant exit-band tiles,11 prototype edges and9 native prerequisite/vehicle/patrol cases covered by their dedicated suites.');
};
