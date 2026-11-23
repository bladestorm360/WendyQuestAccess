'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {routeApproachPoints,solveRoute}=require('../src/world/routes.cjs');
const {transferOptions}=require('../src/world/transfer-events.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 const common=c.$dataCommonEvents=read('CommonEvents.json');
 assert.deepEqual(common[37].list.map(r=>r.code),[250,0],'door prefix is native sound only');
 const before={members:c.$gameParty.members,hasItem:c.$gameParty.hasItem,inBattle:c.$gameParty.inBattle,message:c.$gameMessage};
 let family=0,jobs=0,native=0;
 try {
  c.$gameParty.inBattle=()=>false;c.$gameMessage={isBusy:()=>false};
  for(const info of read('MapInfos.json')) {
   if(!info)continue;const map=read('Map'+String(info.id).padStart(3,'0')+'.json');
   for(const e of map.events)if(e)for(const [pageIndex,page]of e.pages.entries()) {
    const rows=page.list.filter(r=>![0,108,408].includes(r.code)&&
     !(r.code===357&&r.parameters[0]==='Ayatam_HighQualityQuestSystem'&&r.parameters[1]==='disableAutoMarker'));
    if(rows.length!==2||rows[0].code!==117||rows[0].parameters[0]!==37||rows[1].code!==201)continue;
    if(![0,1].includes(page.trigger)||page.through||page.moveType!==0)continue;
    const q=page.conditions,states={switches:[],self:[],variables:{}};
    for(const k of ['switch1','switch2'])if(q[k+'Valid'])states.switches.push(q[k+'Id']);
    if(q.selfSwitchValid)states.self.push([info.id,e.id,q.selfSwitchCh].join(','));
    if(q.variableValid)states.variables[q.variableId]=q.variableValue;
    c.$gameParty.members=()=>q.actorValid?[q.actorId]:[];
    c.$gameParty.hasItem=item=>q.itemValid&&item.id===q.itemId;
    const f=load(info.id,states),p=f.player;delete p.direction;p._direction=2;p._followers={updateMove(){},areGathering:()=>false};
    const actor=f.gameMap.event(e.id);p.setPosition(actor.x,actor.y);assert.equal(actor._pageIndex,pageIndex,'native active page matches selected family');
    const edges=transferOptions(info.id,e,actor.page(),common);assert.equal(edges.length,1);
    const [,target,x,y,direction]=rows[1].parameters;
    assert.deepEqual([edges[0].map,edges[0].x,edges[0].y,edges[0].direction],[target,x,y,direction]);
    const live=captureWorld(c).live;
    const request={event:e.id,field:true,stopBeforeEvent:page.trigger===1&&page.priorityType===0,
      bumpDirections:page.trigger===1&&page.priorityType===1?15:undefined};
    const points=routeApproachPoints(f.geometry,live,request,()=>false);assert(points.length,'native action approach '+info.id+'/'+e.id);
    const start=points[0];p.setPosition(start.x,start.y);
    for(const autowalk of [false,true]) {
     p._transferring=false;actor._starting=false;
     const r={...request,x:start.x,y:start.y,autowalk,limit:8};
     await verifyWorker(f,r,live,result=>{
      assert(['ready','interrupted'].includes(result.status));
      if(autowalk)assert.equal(result.course.length,result.distance);
      if(result.status==='interrupted')assert.equal(result.boundaryEvent,e.id);
      const end=result.arrival;p.setPosition(end.x,end.y);if(end.facing)p.setDirection(end.facing);
      if(result.boundary){p.moveStraight(result.boundary);p.checkEventTriggerHere([1,2]);}
      else if(page.trigger===0){p.checkEventTriggerHere([0]);if(!actor.isStarting())p.checkEventTriggerThere([0]);}
      else {p.moveStraight(end.facing);p.checkEventTriggerTouchFront(end.facing);}
      assert(actor.isStarting(),'native activation '+info.id+'/'+e.id);
      const interpreter=Object.assign(new c.Game_Interpreter(),{_mapId:info.id,_eventId:e.id,_list:actor.list(),_index:0,_branch:{}});
      f.gameMap._interpreter=interpreter;
      assert(interpreter.command201(rows[1].parameters));
      assert.deepEqual([p._newMapId,p._newX,p._newY,p._newDirection],[target,x,y,direction]);native++;jobs++;
     });
    }
    family++;
   }
  }
 }finally{c.$gameParty.members=before.members;c.$gameParty.hasItem=before.hasItem;c.$gameParty.inBattle=before.inBattle;c.$gameMessage=before.message;}
 assert.equal(family,96);assert.equal(jobs,192);assert.equal(native,192);
 console.log(`Verified ${family} exact native door-sound connection pages, ${jobs} packaged manual/automatic approaches and ${native} original native destination reservations across the game.`);
};
