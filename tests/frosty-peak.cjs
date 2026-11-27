"use strict";
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {captureWorld}=require('../src/world/snapshot');
const {createField}=require('../src/world/field');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {createLocalDetour}=require('../src/world/local-detour');
const {floorClearsOnUse}=require('../src/world/local-destinations');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 const prior={scene:c.SceneManager._scene,app:c.Graphics.app,screen:c.$gameScreen,message:c.$gameMessage,
  listen:c.addEventListener,common:c.$dataCommonEvents,infos:c.$dataMapInfos,nav:c.$gameParty.getNav,ayatam:c.Ayatam,
  switchSetter:c.$gameSwitches.setValue,selfSetter:c.$gameSelfSwitches.setValue};
 try{
  c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
  const states={switches:[11,23,33,462],variables:{10:4}};
  c.$gameParty.getNav=()=> 'quest15';c.Ayatam={QUEST:{needsRefresh:false,QuestDatabase:[]}};
  // Native flag commands, rather than an assumed interaction, must choose
  // the actual erase page for both reported connection blockers.
  for(const [map,id]of [[36,35],[113,171]]){
   const local={switches:[],self:[]},f=load(map,local),e=f.gameMap.event(id),page=e.page();
   assert(floorClearsOnUse(f.map.events[id],page));
   c.$gameSwitches.setValue=(key,on)=>{if(on)local.switches.push(key);};
   c.$gameSelfSwitches.setValue=(key,on)=>{if(on)local.self.push(key.join(','));};
   const interpreter={_mapId:map,_eventId:id};
   for(const row of page.list)if([121,123].includes(row.code))c.Game_Interpreter.prototype['command'+row.code].call(interpreter,row.parameters);
   e._pageIndex=e.findProperPageIndex();assert.equal(e.page().list[0].code,214,'native completion selects erase page');
  }
  const atlas=read('Map036.json').events[35];
  for(const bad of [201,301,355]){
   const clone=JSON.parse(JSON.stringify(atlas));clone.pages[0].list.splice(1,0,{code:bad,indent:0,parameters:[]});
   assert(!floorClearsOnUse(clone,clone.pages[0]),'a transfer/battle/script cannot be mistaken for atlas bookkeeping');
  }
  const clone=JSON.parse(JSON.stringify(atlas));clone.pages[0].list.find(r=>r.code===117).parameters=[160];
  assert(!floorClearsOnUse(clone,clone.pages[0]),'unknown common events remain opaque');
  for(const automatic of [false,true]){
   const f=load(113,states);f.player.setPosition(13,6);f.gameMap.inactiveTime=0;
   const renderer=new EventEmitter(),records=[],packets=[];
   const parent={},marker={_active:true,parent,worldVisible:true,worldAlpha:1,renderable:true,texture:{valid:true},bitmap:{},
    x:7,y:12,_generated:true,_questId:'quest15',_eventIds:[23],_location:{location:'FrostyPeak'}};
   const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0,
    _spriteset:{_tilemap:{parent},_ayatamQuestIconSprite:[marker]}};
   c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.addEventListener=()=>{};
   c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
   const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(p,buffers){packets.push(structuredClone(p,{transfer:buffers||[]}));}});
   const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,screenFading:()=>false,
    navigationPreferences:()=>({spoilers:true,autowalk:automatic,fullRouteReadout:true}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
    {open(r){records.push(r);return records.length;},close(){}});
   const ask=key=>{assert(field.command(key));renderer.emit('postrender');};
   for(let i=0;i<12&&records.at(-1)?.category!=='Quests';i++)ask('nextCategory');
   for(let i=0;i<250&&records.at(-1)?.name!=='Frosty Peak';i++)ask('nextDestination');
   assert.equal(records.at(-1)?.name,'Frosty Peak');ask('directions');const packet=packets.shift();
   let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);
   assert.equal(result.status,'ready');assert.equal(result.entrance,22);assert(result.detourPoints.length);
   worker.emit('message',{...packet,result});renderer.emit('postrender');
   assert(!records.some(r=>/not currently reachable|No verified onward|unavailable/i.test(formatSpeech(r))));
   if(!automatic)assert(records.some(r=>/Cold Brew Trail/i.test(formatSpeech(r))));
   else assert(scene._wqaAutowalkActive,'automatic route starts normally toward the same entrance');
   field.leave(scene);
   // The retained destination still crosses the actual trail before its
   // northern return, then approaches the one-use encounter and the peak.
   const start=load(113,states);start.player.setPosition(13,6);const snap=captureWorld(c);
   const transfers=createTransferBookmarks(c,{graphics:c.Graphics,navigationPreferences:()=>({spoilers:true})});
   const target={id:23,name:'Frosty Peak',category:'quests',x:7,y:12},job={action:'directions',map:113};
   createLocalDetour(c,transfers).prepare(job,snap,target);const world=job.detourApproach.world;
   const points=result.detourPoints,worldEntries=job.detourApproach.entrances;
   const trail=load(36,states);trail.player.setPosition(34,38);
   for(const e of trail.gameMap.events())if(e.page()?.list.some(r=>r.code===301))e._erased=true;
   const live=captureWorld(c).live,choices=transfers.candidates();
   await verifyWorker(trail,{x:34,y:38,field:true,autowalk:automatic,transfer:{map:113,points,world,worldEntries,
    state:choices.state,candidates:choices.entrances}},live,r=>{
     assert(['ready','iceRoute','controlRoute','interrupted'].includes(r.status),'trail returns a reachable native prerequisite');
     assert(!r.entrance||[5,24,25,26].includes(r.entrance),'never turn back toward the southern entrance');
   });
   const north=load(113,states);north.player.setPosition(9,9);
   await verifyWorker(north,{x:9,y:9,event:23,field:true,autowalk:automatic,stopBeforeEvent:true},captureWorld(c).live,r=>{
    assert(['interrupted','ready'].includes(r.status));assert([23,171].includes(r.boundaryEvent??23));
   });transfers.clear();
  }
  console.log('Verified Frosty Peak via Cold Brew Trail from the logged13,6 world position in manual/Autowalk, native atlas/encounter completion, retained onward northern route and opaque-transfer negatives.');
 }finally{Object.assign(c.SceneManager,{_scene:prior.scene});c.Graphics.app=prior.app;c.$gameScreen=prior.screen;c.$gameMessage=prior.message;
  c.addEventListener=prior.listen;c.$dataCommonEvents=prior.common;c.$dataMapInfos=prior.infos;c.$gameParty.getNav=prior.nav;c.Ayatam=prior.ayatam;
  c.$gameSwitches.setValue=prior.switchSetter;c.$gameSelfSwitches.setValue=prior.selfSetter;}
};
if(require.main===module){const {c,load,read,verifyWorker}=require('./world.test.cjs');module.exports(c,load,read,verifyWorker).catch(e=>{console.error(e);process.exitCode=1;});}
