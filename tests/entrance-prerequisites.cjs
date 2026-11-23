'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {iceOpensPassage}=require('../src/world/local-destinations');
const {transferOptions}=require('../src/world/transfer-events.cjs');
const {transferState,gateAllows}=require('../src/world/transfer-gates.cjs');
const {routeThroughTerrain}=require('../src/world/terrain-controls.cjs');
const {solveRoute}=require('../src/world/routes.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$gameParty.inBattle=()=>false;
 // Independent semantic guard: an ordinary event before a later entrance
 // cannot hide that entrance from the detached proof to an ice block.
 const line={width:7,height:1,scrollType:0,cells:new Uint8Array(7).fill(15)};
 const ice={id:3,x:5,y:0,normal:true,through:false,rectangle:[5,0,5,0],trigger:0,action:true,meltable:true};
 const ordinary={id:1,x:1,y:0,normal:false,through:false,trigger:1,action:true};
 const entrance={id:2,x:3,y:0,normal:false,through:false,trigger:1,action:true,mapTransfer:true};
 const {routeThroughIce}=require('../src/world/terrain-controls.cjs');
 const empty={mode:'walk',terrain:[],vehicles:[],events:[entrance,ice]};
 assert.equal(routeThroughIce(line,empty,{x:0,y:0,targetX:6,targetY:0,field:true},()=>false),null);
 empty.events=[ordinary,entrance,ice];
 assert.equal(routeThroughIce(line,empty,{x:0,y:0,targetX:6,targetY:0,field:true},()=>false),null);
 empty.events=[ordinary,ice];
 assert.equal(routeThroughIce(line,empty,{x:0,y:0,targetX:6,targetY:0,field:true},()=>false).boundaryEvent,1);
 // A physical short route through removable ice wins over a clear detour.
 const square={width:7,height:2,scrollType:0,cells:new Uint8Array(14).fill(15)};
 const block={...ice,x:3,rectangle:[3,0,3,0]};
 const rq={x:0,y:0,targetX:6,targetY:0,field:true};
 const liveShort={mode:'walk',terrain:[],vehicles:[],events:[block]};
 const clear=solveRoute(square,liveShort,rq);assert.equal(clear.distance,8);
 const {shorterIceRoute,prerequisiteLanding}=require('../src/world/terrain-controls.cjs');
 const shortcut=shorterIceRoute(square,liveShort,rq,()=>false,clear.distance);
 assert.equal(shortcut.status,'iceRoute');assert.equal(shortcut.event,3);assert.equal(shortcut.plannedDistance,6);
 const scene={...ordinary,x:3,clearsOnUse:true};liveShort.events=[scene];
 const throughScene=solveRoute(square,liveShort,rq);assert.equal(throughScene.status,'interrupted');
 assert.equal(throughScene.boundaryEvent,1);assert.equal(throughScene.distance,2);
 liveShort.events=[{...scene,clearsOnUse:false}];assert.equal(solveRoute(square,liveShort,rq).distance,8);
 liveShort.events=[{...scene,mapTransfer:true}];assert.equal(solveRoute(square,liveShort,rq).distance,8);
 // A certified moving NPC opens only its own passage, including graph proofs.
 const lane={width:7,height:1,scrollType:0,cells:new Uint8Array(7).fill(15)};
 liveShort.events=[{id:7,x:3,y:0,normal:true,through:false,trigger:0,action:true}];
 liveShort.npcPassage={event:7,clears:[7]};
 assert(prerequisiteLanding(lane,liveShort,0,0).reached[6]);
 liveShort.npcPassage=null;assert(!prerequisiteLanding(lane,liveShort,0,0).reached[6]);
 const prior=c.$gameParty.members,actors=c.$gameParty._actors;c.$gameParty.members=()=>[1,4];c.$gameParty._actors=[1,4];
 let checks=0;const found=[];
 try{
 for(const info of read('MapInfos.json').filter(Boolean)){
  const data=read('Map'+String(info.id).padStart(3,'0')+'.json');
  const frozen=data.events.filter(e=>e&&e.pages.some(p=>iceOpensPassage(e,p)));
  if(!frozen.length)continue;
  const f=load(info.id,{self:frozen.map(e=>`${info.id},${e.id},A`)});f.player.setPosition(0,0);
  for(const e of frozen){const box=e.pages[0].list.find(r=>r.code===357&&r.parameters[1]==='SetBlocker')?.parameters[3];
   if(box)f.gameMap.event(e.id).SetBlocker(+box.minX,+box.minY,+box.maxX,+box.maxY);}
  const live=captureWorld(c,true,undefined,undefined,[],true).live,g=transferState(c);
  const exits=data.events.flatMap(e=>e?transferOptions(info.id,e,f.gameMap.event(e.id).page(),c.$dataCommonEvents)
    .filter(edge=>gateAllows(edge.gate,g)).map(edge=>({...edge,event:e.id})):[]);
  for(const edge of exits){
   let witness;
   const target=live.events.find(e=>e.id===edge.event),bump=target.normal&&target.trigger===1;
   const ending={event:edge.event,field:true,entryDirection:bump?undefined:edge.approach,
    bumpDirections:bump?15:undefined,stopBeforeEvent:target.trigger===1&&!target.normal};
   const seen=new Set();
   for(const ice of live.events.filter(e=>e.meltable)){
    const[l,t,r,b]=ice.rectangle;
    for(const [x,y]of [[l-1,t],[r+1,b],[l,t-1],[r,b+1]]){
     const key=x+','+y;if(seen.has(key)||x<0||y<0||x>=f.geometry.width||y>=f.geometry.height)continue;seen.add(key);
     const request={x,y,...ending};checks++;
     const direct=solveRoute(f.geometry,live,request);if(!['unreachable','approachBlocked'].includes(direct.status))continue;
     const route=routeThroughTerrain(f.geometry,live,request,undefined,()=>false);
     if(!route||!['iceRoute','controlRoute','interrupted'].includes(route.status))continue;
     witness={request,route};break;
    }
    if(witness)break;
   }
   if(!witness)continue;
   found.push({map:info.id,exit:edge.event,x:witness.request.x,y:witness.request.y,status:witness.route.status,first:witness.route.event||witness.route.boundaryEvent});
   if(process.argv.includes('--baseline-entrance-prerequisites')){
    await verifyWorker(f,{x:witness.request.x,y:witness.request.y,field:true,transfer:{map:edge.map,state:g,candidates:[edge]}},live,
      reply=>console.log('BASELINE',info.id,edge.event,witness.route.status,'versus remote',reply.status));
   }else for(const autowalk of [false,true]){
    await verifyWorker(f,{x:witness.request.x,y:witness.request.y,field:true,autowalk,transfer:{map:edge.map,state:g,candidates:[edge]}},live,reply=>{
     assert.equal(reply.status,witness.route.status,`remote entrance prerequisite ${info.id}/${edge.event}`);
     assert.equal(reply.event||reply.boundaryEvent,witness.route.event||witness.route.boundaryEvent);
     if(autowalk)assert.equal(reply.course.length,reply.distance);
     let{x,y}=witness.request;for(const leg of reply.legs)for(let n=0;n<leg.tiles;n++){
      assert(f.player.canPass(x,y,leg.direction),`native prerequisite prefix ${info.id}/${x},${y}`);
      x=f.gameMap.roundXWithDirection(x,leg.direction);y=f.gameMap.roundYWithDirection(y,leg.direction);
     }
    });
   }
  }
 }
 }finally{c.$gameParty.members=prior;c.$gameParty._actors=actors;}
 assert(found.length>0,'at least one real native exit needs ice');
 console.log(JSON.stringify({checks,cases:found}));
};
