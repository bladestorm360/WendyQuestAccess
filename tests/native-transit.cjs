'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {createLocalDetour}=require('../src/world/local-detour');
const {createBoatJourney}=require('../src/world/boat-journey');
module.exports=async(c,load,read,verifyWorker,transferFactory=createTransferBookmarks)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
 c.$gameParty.members=()=>[4];c.$gameParty._actors=[1,3,4,5];
 const state={switches:[11,23,33,38,39,51,52,77,250,462,503],variables:{10:4},self:['134,10,A']};
 const host={graphics:c.Graphics,navigationPreferences:()=>({spoilers:true})};
 const copy=({event,map,x,y,approach})=>({event,map,x,y,approach});
 function handoff(tr,source,scene,edge,selection,boards=false){
  const player=source.player,ownerMap=source.gameMap;
  tr.arm(scene,selection,edge);ownerMap._interpreter={_eventId:edge.event,_list:edge.list};
  tr.accepted(scene,ownerMap.event(edge.event));if(edge.craft){player._vehicleGettingOff=true;edge.craft._driving=false;}tr.reserved(scene,player,edge.map,edge.x,edge.y,edge.direction);
  const next={};Object.assign(player,{_transferring:true,_newMapId:edge.map,_newX:edge.x,_newY:edge.y});
  tr.leave(next); // Destination construction/preload used to discard the ticket.
  const f=load(edge.map,state);Object.assign(ownerMap,f.gameMap);c.$gameMap=ownerMap;c.$gamePlayer=player;
  Object.assign(player,{_transferring:false,_vehicleGettingOff:false,_vehicleType:boards?'ship':'walk'});player.setPosition(boards?18:edge.x,edge.y);
  if(boards)Object.assign(ownerMap.ship(),{_mapId:113,_x:18,_y:6,_driving:true});
  f.gameMap=ownerMap;f.player=player;tr.leave(next);
  const arrived=tr.settle(next);assert(arrived,'exact reserved ticket survives destination preload');
  return {f,scene:next,arrived};
 }
 for(const [start,targetId,firstExit,nextExit]of [[48,14,3,7],[48,15,3,7],[59,3,2,4]]){
  const tr=transferFactory(c,host),det=createLocalDetour(c,tr),f=load(start,state);
  const [x,y]=start===48?[57,18]:[50,16];f.player.setPosition(x,y);
  const snap=captureWorld(c),target=snap.objects.find(t=>t.id===targetId),job={action:'directions',map:start};
  const request={x,y,event:targetId,field:true,detour:det.prepare(job,snap,target)};
  let result;await verifyWorker(f,request,snap.live,r=>result=r);assert.equal(result.entrance,firstExit);
  assert(det.accept(job,result));const edge=tr.candidates().entrances.find(e=>e.event===firstExit);
  const moved=handoff(tr,f,{},edge,job.remote.selection);assert(det.settle(moved.arrived));
  let remote;assert(det.resume({},captureWorld(c),(_job,_snapshot,bookmark,ticket)=>remote={bookmark,ticket},()=>assert.fail('must cross the other map')));
  const now=captureWorld(c),cs=tr.candidates();
  await verifyWorker(moved.f,{x:now.x,y:now.y,field:true,transfer:{...remote.bookmark,
   candidates:cs.entrances.map(copy),state:cs.state,trail:remote.ticket.trail}},now.live,r=>{
    assert.equal(r.entrance??r.viaEntrance,nextExit,'choose a different mine/town exit, never the return loop');
    assert(['ready','enemyBlocked'].includes(r.status));
  });
  // An unrelated reservation/position cannot retain a ticket.
  tr.clear();det.clear();
 }
 for(const autowalk of [false,true])for(const id of [28,94,514,43]){
  const tr=transferFactory(c,host),boat=createBoatJourney(c,tr),f=load(113,state);
  f.player.setPosition(12,17);Object.assign(f.gameMap.ship(),{_mapId:113,_x:18,_y:6,_driving:false});
  const snap=captureWorld(c),target=snap.objects.find(t=>t.id===id),job={action:'directions',map:113,scene:{},autowalk};
  assert(target);const fallback=boat.prepare(job,snap,target);assert(fallback);
  let result;await verifyWorker(f,{x:12,y:17,event:id===514?undefined:id,vehicle:target.vehicle,
   entryDirection:target.entryDirection,field:true,autowalk,boatFallback:fallback},snap.live,r=>result=r);
  assert(result.boatFallback);assert.equal(result.entrance,21);assert(boat.accept(job,result));
  const edge=tr.candidates().entrances.find(e=>e.event===21);
  let moved=handoff(tr,f,job.scene,edge,{...job.remote.selection,autowalk});assert(boat.settle(moved.arrived));
  let routed;const route=(job,snapshot,t)=>{routed={snapshot,t};job.autowalk=autowalk;};
  job.scene=moved.scene;
  assert(boat.resume(job,captureWorld(c),()=>assert.fail('already at port'),route,()=>assert.fail('boarding exists'),()=>{}));
  assert.equal(routed.t.id,5);assert.equal(moved.f.gameMap.event(5).isStarting(),false,'boarding remains player owned');
  await verifyWorker(moved.f,{x:moved.f.player._x,y:moved.f.player._y,event:5,field:true,stopBeforeEvent:true,autowalk},routed.snapshot.live,r=>{
   assert(['ready','interrupted'].includes(r.status));if(r.status==='interrupted')assert.equal(r.boundaryEvent,5);
  });
  const boarding=tr.candidates().entrances.find(e=>e.event===5);assert(boarding?.boards);
  moved=handoff(tr,moved.f,moved.scene,boarding,{...moved.arrived,autowalk},true);assert(boat.settle(moved.arrived));
  let status;job.scene=moved.scene;routed=null;
  assert(boat.resume(job,captureWorld(c),()=>assert.fail('already aboard'),route,(_job,text)=>status=text,()=>{}));
  if(id===514)assert.equal(status,'Arrived.');
  else {
   assert.equal(routed.t.id,id===28||id===43?31:51);
   await verifyWorker(moved.f,{x:18,y:6,event:routed.t.id,field:true,entryDirection:routed.t.entryDirection,surface:true,autowalk},routed.snapshot.live,r=>{
    assert(['ready','interrupted'].includes(r.status),'the sea leg is genuinely navigable');
    if(r.status==='interrupted')assert.equal(r.boundaryEvent,routed.t.id);
   });
   if(id===43) {
    const port=tr.candidates().entrances.find(e=>e.event===31);
    const landed=handoff(tr,moved.f,moved.scene,port,{...moved.arrived,boat:{...moved.arrived.boat,phase:'land'},autowalk});
    assert(boat.settle(landed.arrived));let onward;
    assert(boat.resume(job,captureWorld(c),(_j,_s,b,t)=>onward={b,t},()=>assert.fail(),()=>assert.fail(),()=>{}));
    assert(onward?.b.points?.length);const now=captureWorld(c),cs=tr.candidates();
    await verifyWorker(landed.f,{x:now.x,y:now.y,field:true,autowalk,transfer:{...onward.b,state:cs.state,
      trail:onward.t.trail,candidates:cs.entrances.map(copy)}},now.live,r=>{
      assert(['ready','iceRoute','controlRoute','enemyBlocked','interrupted'].includes(r.status));
      assert.notEqual(r.entrance,undefined,'native port has an onward walking exit');
    });
   }
   if(id===94) {
    const island=tr.islandLanding();assert(island?.sameScene);
    moved.f.player.setPosition(island.sourceX,island.sourceY);moved.f.player.setDirection(6);
    tr.accepted(moved.scene,moved.f.gameMap.event(51));tr.leave(moved.scene);
    moved.f.player._vehicleType='walk';moved.f.gameMap.ship()._driving=false;
    moved.f.player.setPosition(island.x,island.y);
    const arrived=tr.settle(moved.scene);assert(arrived);assert(boat.settle(arrived));
    routed=null;assert(boat.resume(job,captureWorld(c),()=>assert.fail(),route,()=>assert.fail(),()=>{}));
    assert.equal(routed.t.id,94);
    await verifyWorker(moved.f,{x:island.x,y:island.y,event:94,entryDirection:4,field:true,autowalk},routed.snapshot.live,r=>{
      assert.equal(r.status,'ready');assert.equal(r.arrival.x,45);assert.equal(r.arrival.y,2);if(autowalk)assert.equal(r.autowalkStop,4);
    });
   }
  }
  boat.clear();tr.clear();
 }
 // No Chomps: the one-use glitch is a manual prerequisite, not a graph wall.
 for(const [x,y,exit]of [[43,28,56],[43,30,52]]){
  const f=load(113,state);f.player.setPosition(x,y);const tr=transferFactory(c,host),det=createLocalDetour(c,tr);
  const snap=captureWorld(c),target=snap.objects.find(t=>t.id===43),job={action:'directions',map:113};
  await verifyWorker(f,{x,y,event:43,field:true,detour:det.prepare(job,snap,target)},snap.live,r=>{
   assert.equal(r.status,'ready');assert.equal(r.entrance,exit);
  });
 }
 {
  const f=load(113,state);f.player.setPosition(44,21);const snap=captureWorld(c);
  assert(snap.live.events.find(e=>e.id===189).clearsOnUse);
  await verifyWorker(f,{x:44,y:21,event:43,field:true},snap.live,r=>{assert.equal(r.status,'interrupted');assert.equal(r.boundaryEvent,189);});
 }
 console.log('Verified three multi-exit native mine/town tickets through destination loading, eight manual/Autowalk boat prerequisites/boarding/sea continuations and three no-Chomps cauldron approaches.');
};
