'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {c,load,read,verifyWorker}=require('./world.test.cjs');
const {transferMap}=require('../tools/transfer-catalog.cjs');
const {prerequisiteLanding}=require('../src/world/terrain-controls.cjs');
const {captureWorld}=require('../src/world/snapshot');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {floorClearsOnUse}=require('../src/world/local-destinations');
const {EventEmitter}=require('node:events');
const {createField}=require('../src/world/field');
const {formatSpeech}=require('../src/services/speech-text.cjs');
let saved;
if(process.argv[4]){const bytes=fs.readFileSync(process.argv[4]);
 try{saved=JSON.parse(zlib.inflateSync(bytes));}catch{saved=JSON.parse(zlib.inflateSync(Buffer.from(bytes.toString('utf8'),'latin1')));}}
const states=saved?{switches:saved.switches._data.flatMap((v,i)=>v?[i]:[]),variables:saved.variables._data,
 self:Object.entries(saved.selfSwitches._data).filter(([,v])=>v).map(([k])=>k)}:{switches:[94,95,466],self:[]};
c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
c.$gameParty._actors=saved?.party._actors||[1,2,3,4,5];c.$gameParty._quests=Object.fromEntries((saved?.partyQuests||[]).filter(Boolean).map(q=>[q.questId,q]));
c.$gameParty.getNav=()=>saved?.partyNav||'quest27';c.$gameSystem=saved?.system||{};
function projected(id,map=read(`Map${String(id).padStart(3,'0')}.json`)){
 const f=load(id,states);return transferMap(id,map,f.geometry,read('Tilesets.json')[map.tilesetId].flags,c.$dataCommonEvents);
}
function world(bridges){const state={...states,switches:states.switches.filter(id=>id!==97)};if(bridges)state.switches.push(97);
 const f=load(113,state);if(saved){c.$gameTileChanges=saved.tileChanges;
  for(const [id,row]of saved.map._events.entries())if(row&&f.gameMap._events[id])for(const k of bridges?['_x','_y']:['_x','_y','_erased','_pageIndex','_trigger','_priorityType','_characterName','_through','_tileId'])f.gameMap._events[id][k]=row[k];}
 f.gameMap.refreshTileEvents();f.player.setPosition(40,29);f.gameMap.inactiveTime=0;return f;}
function choices(){return createTransferBookmarks(c,{graphics:c.Graphics,navigationPreferences:()=>({spoilers:false})}).candidates();}
(async()=>{
 // Actual native completion pages, not editor names, prove removal. Unknown
 // commands/flags and unchanged collision actors must remain barriers.
 const auto=read('Map191.json').events[36];assert(floorClearsOnUse(auto,auto.pages[0]));
 for(const mutate of [e=>e.pages[0].list[0].parameters[1]='Unknown',e=>e.pages[1].list[0].code=201,
  e=>e.pages[0].list.splice(1,0,{code:355,indent:0,parameters:['unknown']})]){
  const copy=structuredClone(auto);mutate(copy);assert(!floorClearsOnUse(copy,copy.pages[0]));}
 for(const [id,event]of [[87,86],[77,25]]){
  const map=read(`Map${String(id).padStart(3,'0')}.json`);assert(!projected(id,map).live.events.some(e=>e.id===event));
  for(const mutate of [m=>m.events[event].pages[1].list[0].code=201,
   m=>{const q=m.events[event].pages[1].conditions;if(q.selfSwitchValid)q.selfSwitchCh='B';else q.switch1Id=93;}]){
   const copy=structuredClone(map);mutate(copy);assert(projected(id,copy).live.events.some(e=>e.id===event));}
 }
 const cave=projected(87),landing=prerequisiteLanding(cave.geometry,cave.live,72,8,cave.controls);
 for(const event of [73,74,75,76,77,78,80,81,82,83,84])assert(landing.events[event],`Caffeine exit ${event}`);
 assert(cave.live.events.some(e=>e.id===9),'the unchanged collision actor is preserved');
 const byway=projected(77),closed=prerequisiteLanding(byway.geometry,byway.live,48,16,byway.controls);
 const edits=byway.conditional.changes.map(([cell,flags])=>[cell%byway.geometry.width,Math.floor(cell/byway.geometry.width),flags]);
 const opened=prerequisiteLanding(byway.geometry,{...byway.live,terrain:edits},48,16,byway.controls);
 const west=byway.exits.find(e=>e.map===113&&e.x===37&&e.y===26);assert(west);
 assert(!closed.events[west.event]);assert(opened.events[west.event],'native restored bacon bridges connect Byway east/west');
 for(const bridges of [false,true])for(const automatic of [false,true]){
  const f=world(bridges),snap=captureWorld(c),transfer=choices(),candidates=transfer.entrances.map(({event,map,x,y,approach})=>({event,map,x,y,approach}));
  for(const event of [61,62,63,64,65,66,67,68,69,70]){
   const request={x:40,y:29,event,field:true,autowalk:automatic,detour:{map:113,state:transfer.state,trail:[],candidates,
    verifiedOnly:true,world:snap.live,worldMap:113,worldEntries:candidates}};
   await verifyWorker(f,request,snap.live,r=>{
    assert.equal(r.status,'ready',`${event}/${bridges}/${automatic}: ${JSON.stringify(r)}`);
    assert((bridges?[59,60]:[59]).includes(r.entrance),'use a connected Cove or restored Byway entrance');
    assert.equal(r.approach,r.entrance===59?8:4);
    assert(r.detourPoints.length);});
  }
  // Exercise the real field consumer too: browsing does not start walking;
  // the directions key accepts the verified detour in either control mode.
  c.$gameParty.getNav=()=>null;
  f.player.setPosition(43,28);const renderer=new EventEmitter(),records=[],packets=[];
  const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
  c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};c.addEventListener=()=>{};
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(p,b){packets.push(structuredClone(p,{transfer:b||[]}));}});
  const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({spoilers:false,autowalk:automatic}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
   {open(r){records.push(r);return records.length;},close(){}});
  const ask=key=>{assert(field.command(key));renderer.emit('postrender');};
  let found=false;for(let category=0;category<12&&!found;category++){
   ask('nextCategory');for(let i=0;i<250;i++){if(records.at(-1)?.name==='Shellside'){found=true;break;}ask('nextDestination');}}
  assert(found,'Shellside is an ordinary visible destination: '+JSON.stringify({last:records.slice(-3),packets:packets.length,
   position:[f.player._x,f.player._y,f.player._realX,f.player._realY],refresh:f.gameMap._needsTilemapRefresh}));assert(!scene._wqaAutowalkActive);
  ask('directions');const packet=packets.pop();assert(packet);let result;
  await verifyWorker(f,packet.request,packet.live,r=>result=r);assert.equal(result.entrance,59);
  worker.emit('message',{...packet,result});renderer.emit('postrender');
  assert(!records.some(r=>/Not currently reachable|No verified onward|unavailable/.test(formatSpeech(r))));
  assert(records.some(r=>automatic?/Walking|Arrived/i.test(formatSpeech(r)):/Cracked Cove/i.test(formatSpeech(r))),JSON.stringify(records.slice(-3)));
  field.leave(scene);
 }
 console.log('Verified Shellside and nine Breakfast Isles destinations through Cracked Cove/Caffeine Caverns in both bridge states and manual/Autowalk modes; real field handoff, native restored-bridge crossing and opaque-producer negatives.');
})().catch(error=>{console.error(error);process.exitCode=1;});
