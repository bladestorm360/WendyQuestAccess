'use strict';
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {c,read,load}=require('./world.test.cjs');
const {consumedFloorPage}=require('../src/world/consumed-events');
const {captureWorld}=require('../src/world/snapshot');
const switches=new Map(),variables=new Map(),self=new Map(),actors=new Map();
c.$gameSwitches={value:id=>switches.get(id)??false};c.$gameVariables={value:id=>variables.get(id)??0};
c.$gameSelfSwitches={value:key=>self.get(key.join(','))??false};
c.$gameActors={actor:id=>{if(!actors.has(id))actors.set(id,{});return actors.get(id);}};
c.$gameParty._actors=[];c.$gameParty.members=()=>c.$gameParty._actors.map(id=>c.$gameActors.actor(id));
const pure=new Set([0,108,408,657,214]);
function nativeEmpty(page,event) {
 const script=Object.assign(Object.create(c.Game_Interpreter.prototype),{_list:page.list,_index:0,_eventId:event._eventId,
  _mapId:c.$gameMap._mapId,_branch:{},_depth:0});
 for(let n=0;n<1024&&script._index<page.list.length;n++) {
  const row=page.list[script._index];
  if(pure.has(row.code)||row.code===412){script._index++;continue;}
  if(row.code===115)return true;
  if(row.code===111&&![0,1,2,4].includes(row.parameters[0]))return false;
  if(row.code===111&&row.parameters[0]===4&&row.parameters[2]!==0)return false;
  if(![111,411].includes(row.code))return false;
  // The retail interpreter performs only the actual conditional/skip/else
  // flow here. No action, source script, reward or event writer is executed.
  script.executeCommand();
 }
 return script._index>=page.list.length;
}
let pages=0,states=0,pruned=0,active=0;const locators=new Set(),start=performance.now();
for(const info of read('MapInfos.json').filter(Boolean)) {
 let map;try{map=read('Map'+String(info.id).padStart(3,'0')+'.json');}catch{continue;}
 c.$gameMap={_mapId:info.id};
 for(const entry of map.events.filter(Boolean))for(const [pi,page] of entry.pages.entries()) {
  if(![1,2].includes(page.trigger)||page.list.length>1024||!page.list.some(r=>r.code===111))continue;
  pages++;const conditions=page.list.filter(r=>r.code===111).map(r=>r.parameters);
  for(const variant of [0,1,2,3,4,5]) {
   switches.clear();variables.clear();self.clear();c.$gameParty._actors=[];
   for(const p of conditions) {
    if(p[0]===0)switches.set(p[1],!!(variant%2));
    if(p[0]===2)self.set([info.id,entry.id,p[1]].join(','),!!(variant%2));
    if(p[0]===1&&p[2]===0)variables.set(p[1],p[3]+[0,-1,1,-100,100,0][variant]);
    if(p[0]===4&&p[2]===0&&variant%2)c.$gameParty._actors.push(p[1]);
   }
   const event={_eventId:entry.id,_trigger:page.trigger};
   const result=consumedFloorPage(c,event,page);states++;
   if(result){assert(nativeEmpty(page,event),`${info.id}/${entry.id}/${pi}/${variant} still has an action`);pruned++;locators.add(`${info.id}/${entry.id}/${pi}`);}
   else active++;
  }
 }
}
assert(pruned>20&&active>100);const auditMs=performance.now()-start;
// A secret-route warning remains discoverable on its first native branch,
// then all equivalent tiles are inert after their shared completion flag.
for(const done of [false,true]) {
 const f=load(14,{switches:done?[475,510]:[475]});f.player.setPosition(25,20);
 const view=captureWorld(c,true,undefined,undefined,[],false,true);
 for(let id=50;id<=60;id++) {
  assert.equal(view.objects.some(t=>t.id===id),!done,`warning ${id}/${done}`);
  assert.equal(view.live.events.find(t=>t.id===id)?.action,!done);
 }
}
// Current state is re-read despite the immutable-page structure cache.
const f=load(14,{switches:[475]}),e=f.gameMap._events[50],page=e.page();
assert(!consumedFloorPage(c,e,page));c.$gameSwitches.value=id=>id===510;
assert(consumedFloorPage(c,e,page));c.$gameSwitches.value=()=>false;
assert(!consumedFloorPage(c,e,page));
// Unknown script predicates/effects, malformed nesting and ordinary action
// buttons never inherit a consumed result from another branch or page.
const branch=(parameters,code=101)=>({trigger:1,list:[{code:111,indent:0,parameters},
 {code,indent:1,parameters:[]},{code:412,indent:0,parameters:[]},{code:0,indent:0,parameters:[]}]});
assert(!consumedFloorPage(c,e,branch([12,'unknown()'])));
assert(!consumedFloorPage(c,e,branch(undefined)),'unknown malformed condition stays active');
assert(!consumedFloorPage(c,e,branch([0,510,1],117)));
assert(!consumedFloorPage(c,e,{...branch([0,510,1],214),priorityType:1}),'solid erase still removes a blocker');
assert(!consumedFloorPage(c,{...e,_trigger:0},page));
assert(!consumedFloorPage(c,e,{list:[{code:111,indent:0,parameters:[0,510,0]}]}));
let capturePeakMs=0,capturedMaps=0;
for(const info of read('MapInfos.json').filter(Boolean)) {
 let f;try{f=load(info.id);}catch(e){if(e.code==='ENOENT')continue;throw e;}
 f.player.setPosition(0,0);
 const at=performance.now();assert(captureWorld(c));capturePeakMs=Math.max(capturePeakMs,performance.now()-at);capturedMaps++;
}
console.log(JSON.stringify({pages,states,pruned,active,distinctInertPages:locators.size,auditMs}));
console.log(JSON.stringify({capturedMaps,allMapCapturePeakMs:capturePeakMs}));
console.log('Verified all-map bounded branch audit against native conditional flow, first-use/replay, live state refresh, alternate/unknown-effect retention and physical-event identity preservation.');
