'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {captureWorld}=require('../src/world/snapshot');
const {worldEntranceRevealed}=require('../src/world/world-destinations');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {createField}=require('../src/world/field');
const fs=require('node:fs'),zlib=require('node:zlib');
const {performance}=require('node:perf_hooks');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
 c.$gameParty._quests=[null];c.$gameParty.getNav=()=>null;c.$gameParty._actors=[1,5,3,4];
 c.$gameParty.members=()=>[4];c.$gameParty.inBattle=()=>false;
 const regional=[56,59,60],farther=Array.from({length:10},(_,i)=>61+i),base=[11,23,33,38,39,51,52,54,77,90,250,462,463,464,465,624];
 const state={switches:base.slice(),variables:{5:0,10:4,14:6,119:39.5,120:27.5}};
 let peak=0,combinedPeak=0;
 load(113,state).player.setPosition(43,28);
 const before=Array.from({length:200},(_,i)=>worldEntranceRevealed(c,i+1,false));
 for(const id of regional)assert(!worldEntranceRevealed(c,id,false),'earlier skip flags do not reveal this region');
 const native=load(76,state),row=native.map.events[2].pages[0].list.find(r=>r.code===121&&r.parameters[0]===466);
 assert(row);c.$gameSwitches.setValue=(id,on)=>{if(on&&!state.switches.includes(id))state.switches.push(id);};
 c.Game_Interpreter.prototype.command121.call({_mapId:76,_eventId:2},row.parameters);
 load(113,state).player.setPosition(43,28);
 const changed=Array.from({length:200},(_,i)=>i+1).filter(id=>worldEntranceRevealed(c,id,false)!==before[id-1]);
 assert.deepEqual(changed,regional,'only normal Breakfast-region introductions inherit the native skip');
 const snapshot=captureWorld(c);
 for(const id of regional)assert(snapshot.objects.some(t=>t.id===id&&t.category==='exits'));
 const transfer=createTransferBookmarks(c,{graphics:c.Graphics,navigationPreferences:()=>({spoilers:false})});
 for(const id of regional)assert(transfer.candidates().entrances.some(e=>e.event===id),'browsing and onward transfer candidates share the reveal');
 transfer.clear();
 assert(!worldEntranceRevealed(c,71,false),'the Breakfast Stone island keeps its later bridge/story prerequisite');
 for(const id of farther)assert(!worldEntranceRevealed(c,id,false),'the later region retains its cavern introduction');
 assert(!worldEntranceRevealed(c,25,false)&&!worldEntranceRevealed(c,100,false),'future town and hidden ruins stay gated');
 assert(worldEntranceRevealed(c,71,true)&&worldEntranceRevealed(c,100,true),'Spoiler mode keeps its explicit reveal');
 state.switches.push(97);load(113,state);assert(worldEntranceRevealed(c,71,false));state.switches.pop();
 // The native Cracked Cove entry introduces26 after the skip too: its only
 // owning branch is this event's unused self-switch, not quest25 acceptance.
 const caveEntry=read('Map191.json').events[1].pages[0].list;
 assert.equal(caveEntry[6].code,111);assert.equal(caveEntry[6].parameters.join(','),"2,A,1");
 assert.equal(caveEntry[9].code,357);assert.equal(caveEntry[9].indent,1);
 assert.equal(caveEntry[9].parameters[1],'startQuest');assert.equal(caveEntry[9].parameters[3].questId,'26');
 assert.equal(caveEntry[14].code,412);assert.equal(caveEntry[14].indent,0);assert.equal(caveEntry[15].code,201);
 for(const quest of [25,26]){
  load(113,{switches:base});c.$gameParty._quests={['quest'+quest]:{assent:true}};
  for(const id of quest===25?regional:[59,60,...farther])assert(worldEntranceRevealed(c,id,false));
 }
 c.$gameParty._quests=[null];
 const saveArg=process.argv.indexOf('--player-save');let saved;
 if(saveArg>=0){
  const bytes=fs.readFileSync(process.argv[saveArg+1]);assert(bytes.length<2*1024*1024);
  try{saved=JSON.parse(zlib.inflateSync(bytes));}catch{saved=JSON.parse(zlib.inflateSync(Buffer.from(bytes.toString('utf8'),'latin1')));}
  assert.equal(saved.map._mapId,113);assert.equal(saved.switches._data[466],true);assert.equal(saved.partyNav,null);
 }
 const courses=[];
 for(const own of saved?[false,true]:[false])for(const auto of [false,true])for(const target of own?regional:[59]){
  // Ayatam saves its authoritative named records in partyQuests, separately
  // from the legacy array on party. Keep native records and all tile deltas.
  const questState=own?Object.fromEntries(saved.partyQuests.filter(Boolean).map(q=>[q.questId,q])):[null];
  c.$gameParty._quests=questState;
  if(own){assert(!questState.quest25.assent&&!questState.quest26.assent);assert(questState.quest24.reported);}
  const current=own?{switches:saved.switches._data.flatMap((v,i)=>v?[i]:[]),variables:saved.variables._data,
   self:Object.entries(saved.selfSwitches._data).filter(([,v])=>v).map(([k])=>k)}:state;
  const f=load(113,current),p=f.player,map=f.gameMap;
  if(own){
   const index=current.switches.indexOf(466);current.switches.splice(index,1);
   assert(!worldEntranceRevealed(c,59,false),'the exact saved ordinary quests did not introduce Cracked Cove');
   current.switches.push(466);assert(worldEntranceRevealed(c,59,false));
   c.$gameTileChanges=saved.tileChanges;
   for(const [id,entry]of saved.map._events.entries())if(entry&&map._events[id]){
    const actor=map._events[id];for(const key of ['_x','_y','_erased','_pageIndex','_trigger','_priorityType','_characterName','_through','_tileId'])actor[key]=entry[key];
   }
   map.refreshTileEvents();
  }
  p.setPosition(own?saved.player._x:43,own?saved.player._y:28);p._followers={areGathering:()=>false,updateMove(){}};
  map.inactiveTime=0;c.Input={dir4:0};c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};
  const renderer=new EventEmitter(),packets=[],records=[],scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
  c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.addEventListener=()=>{};
  c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage:packet=>packets.push(packet)});
  const label=captureWorld(c).objects.find(t=>t.id===target&&t.category==='exits').name;
  const bookmark={id:'regional-'+target,revision:1,kind:'entity',event:target,map:113,mode:'walk',category:'exits',name:label};
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({spoilers:false,autowalk:auto}),bookmarks:()=>[bookmark],
   makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
   {open:r=>{records.push(r);return records.length;},close(){},focus(_id,r){records.push(r);return true;},
    arrive:r=>{records.push(r);return records.length;},endArrival(){}});
  c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
  c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessFieldEvent=()=>{};
  const ask=key=>{const begin=performance.now();assert(field.command(key));renderer.emit('postrender');
   const elapsed=performance.now()-begin;peak=Math.max(peak,elapsed);return elapsed;};
  if(target===59){
   for(let n=0;n<16&&records.at(-1)?.category!=='Exits';n++)ask('nextCategory');
   for(let n=0;n<200&&records.at(-1)?.name!=='Cracked Cove';n++)ask('nextDestination');
   assert.equal(records.at(-1)?.name,'Cracked Cove');
  }else{scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;}
  const submission=ask('directions'),packet=packets.at(-1);assert.equal(packet.request.event,target);
  let route,receipt=0;await verifyWorker(f,packet.request,packet.live,r=>{route=r;const begin=performance.now();worker.emit('message',{
   epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});receipt=performance.now()-begin;});
  const begin=performance.now();renderer.emit('postrender');combinedPeak=Math.max(combinedPeak,submission+receipt+performance.now()-begin);
  courses.push({own,auto,target,status:route.status});
  if(target!==59){
   assert(['ready','interrupted','iceRoute','controlRoute','terrainExit','npcBlocked','enemyBlocked'].includes(route.status),
    `${label} must have a verified walking or prerequisite prefix, got ${route.status}`);
   if(auto&&route.distance>0)assert(field.autowalk.active(scene),`${label} prefix respects Autowalk`);
   field.autowalk.stop(scene);field.leave(scene);continue;
  }
  assert.equal(route.status,'ready');assert.equal(field.autowalk.active(scene),auto);
  if(auto){for(let n=0;n<route.distance;n++){p.moveByInput();p._realX=p._x;p._realY=p._y;}
   p.moveByInput();renderer.emit('postrender');assert(!field.autowalk.active(scene));
  }else for(const leg of route.legs)for(let n=0;n<leg.tiles;n++){
   assert(p.canPass(p._x,p._y,leg.direction));p.moveStraight(leg.direction);p._realX=p._x;p._realY=p._y;
  }
  assert.deepEqual([p._x,p._y],[route.arrival.x,route.arrival.y]);
  assert(!map.isAnyEventStarting(),'the entrance is still activated by the player');
  field.leave(scene);
 }
 console.log(`Breakfast reveal: native466 unlocks exactly3 immediate introductions without quest25; native cavern26 handoff, transfer parity, spoiler/future/bridge negatives and native manual/Autowalk to Cracked Cove pass${saved?', including the exact player save, named quest records and world tile changes':''}.`);
 console.log(`Verified ${courses.length} production-field regional direction requests in both movement modes, including all3 immediate entrance courses from the exact player state when supplied.`);
 console.log(`Throttled Breakfast field browse/submission peak ${peak.toFixed(2)} ms; combined request/response CPU peak ${combinedPeak.toFixed(2)} ms. Actual gameplay, audio and whole-game responsiveness remain separate.`);
};
