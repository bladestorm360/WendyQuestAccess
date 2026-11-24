'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {captureWorld}=require('../src/world/snapshot');
const {worldEntranceRevealed}=require('../src/world/world-destinations');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {createField}=require('../src/world/field');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 const prior={quests:c.$gameParty._quests,nav:c.$gameParty.getNav,common:c.$dataCommonEvents,infos:c.$dataMapInfos,
  setter:c.$gameSwitches.setValue,value:c.$gameSwitches.value,scene:c.SceneManager._scene,app:c.Graphics.app,
  screen:c.$gameScreen,message:c.$gameMessage,listen:c.addEventListener,members:c.$gameParty.members,inBattle:c.$gameParty.inBattle};
 try{
  c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
  c.$gameParty._quests={quest17:{assent:true}};c.$gameParty.getNav=()=> 'quest19';
  const base=[11,23,33,38,39,51,52,77,250,462,503];
  for(const [event,index,flag] of [[53,7,452],[189,7,452],[187,6,453],[188,6,453]]){
   const state={switches:base.slice(),variables:{10:4}},f=load(113,state);f.player.setPosition(44,21);
   assert(!worldEntranceRevealed(c,43,false),'the earlier alternate-route flag alone does not reveal');
   assert(!captureWorld(c,true,undefined,undefined,[],false,false).objects.some(t=>t.id===43));
   assert(worldEntranceRevealed(c,43,true),'Spoiler mode still reveals ahead of time');
   c.$gameSwitches.setValue=(key,on)=>{if(on&&!state.switches.includes(key))state.switches.push(key);};
   const row=f.map.events[event].pages[0].list[index];assert.equal(row.code,121);assert.equal(row.parameters[0],flag);
   c.Game_Interpreter.prototype.command121.call({_mapId:113,_eventId:event,_index:index},row.parameters);
   assert(worldEntranceRevealed(c,43,false));
   assert(captureWorld(c,true,undefined,undefined,[],false,false).objects.some(t=>t.id===43&&t.name==='Cauldron'&&t.category==='exits'));
   const tr=createTransferBookmarks(c,{graphics:c.Graphics,navigationPreferences:()=>({spoilers:false})});
   assert(tr.candidates().entrances.some(e=>e.event===43),'same reveal governs transfer candidates');tr.clear();
   assert(!worldEntranceRevealed(c,25,false),'unrelated future introductions stay gated');
  }
  for(const mode of ['normalQuest','completed']){
   const state={switches:mode==='completed'?[54]:[]},f=load(113,state);f.player.setPosition(44,21);
   c.$gameParty._quests=mode==='normalQuest'?{quest20:{assent:true}}:{};
   assert(worldEntranceRevealed(c,43,false));
  }
  c.$gameParty._quests={quest17:{assent:true}};c.$gameParty.members=()=>[4];c.$gameParty.inBattle=()=>false;
  c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
  for(const automatic of [false,true])for(const [x,y] of [[44,21],[12,17]]){
   const f=load(113,{switches:[...base,452],variables:{10:4}});f.player.setPosition(x,y);f.gameMap.inactiveTime=0;
   Object.assign(f.gameMap.ship(),{_mapId:113,_x:18,_y:6,_driving:false});
   const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0},renderer=new EventEmitter();
   c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};const packets=[],records=[];
   const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,buffers){packets.push(structuredClone(packet,{transfer:buffers||[]}));}});
   const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
    navigationPreferences:()=>({spoilers:false,autowalk:automatic}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
    {open(r){records.push(r);return records.length;},focus(_id,r){records.push(r);return true;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
   const ask=key=>{assert(field.command(key));renderer.emit('postrender');};
   for(let n=0;n<16&&records.at(-1)?.category!=='Exits';n++)ask('nextCategory');
   for(let n=0;n<250&&records.at(-1)?.name!=='Cauldron';n++)ask('nextDestination');
   assert.equal(records.at(-1)?.name,'Cauldron');ask('directions');const packet=packets.shift();assert.equal(packet.request.event,43);
   let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);
   assert(['ready','interrupted'].includes(result.status));if(x===12)assert(result.boatFallback);
   worker.emit('message',{...packet,result});renderer.emit('postrender');
   assert(!records.some(r=>/not currently reachable|unavailable|changed/i.test(formatSpeech(r))));
   if(automatic)assert(field.autowalk.active(scene));else assert(records.some(r=>/north|south|east|west/i.test(formatSpeech(r))));
   field.leave(scene);
  }
  console.log('Verified four native glitch completions, normal/negative reveal rules, transfer candidate parity and four production field routes with Spoiler mode off and the real early quest producer present.');
 }finally{c.$gameParty._quests=prior.quests;c.$gameParty.getNav=prior.nav;c.$gameParty.members=prior.members;c.$gameParty.inBattle=prior.inBattle;
  c.$dataCommonEvents=prior.common;c.$dataMapInfos=prior.infos;c.$gameSwitches.setValue=prior.setter;c.$gameSwitches.value=prior.value;
  c.SceneManager._scene=prior.scene;c.Graphics.app=prior.app;c.$gameScreen=prior.screen;c.$gameMessage=prior.message;c.addEventListener=prior.listen;}
};
