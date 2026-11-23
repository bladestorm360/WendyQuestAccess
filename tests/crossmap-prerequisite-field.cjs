'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{performance}=require('node:perf_hooks');
const {createField}=require('../src/world/field');
const {transferOptions}=require('../src/world/transfer-events.cjs');
const {transferState,gateAllows}=require('../src/world/transfer-gates.cjs');
const {iceOpensPassage,iceMeltChanges}=require('../src/world/local-destinations');
module.exports=async(c,load,read,verifyWorker)=>{
 const keys=['addEventListener','$gameScreen','$gameMessage','$gameTroop','$gameTemp','$testEvent','ConfigManager','Input',
  'WendyQuestAccessAutowalkInput','WendyQuestAccessFieldMove','WendyQuestAccessFieldChanged','WendyQuestAccessFieldEvent',
  'WendyQuestAccessSceneLeaving','WendyQuestAccessBookmarkEntranceAccepted','WendyQuestAccessBookmarkTransferReserved'];
 const saved=Object.fromEntries(keys.map(key=>[key,c[key]]));
 const original={loadImages:c.Game_Interpreter.prototype.loadImages,scene:c.SceneManager._scene,app:c.Graphics.app,members:c.$gameParty.members,actors:c.$gameParty._actors,
  battle:c.$gameParty.inBattle,sv:c.$gameSwitches.value,ss:c.$gameSwitches.setValue,vv:c.$gameVariables.value,
  vs:c.$gameVariables.setValue,ssv:c.$gameSelfSwitches.value,sss:c.$gameSelfSwitches.setValue};
 c.Game_Interpreter.prototype.loadImages=()=>{};
 try{for(const automatic of process.argv.includes('--baseline-crossmap-chain')?[true]:[false,true]){
  const switches=new Set([1,11,16,33,38]),self=new Set([44,47,48,57].map(id=>`12,${id},A`)),variables=new Map();
  let f=load(113,{switches:[...switches]}),map=f.gameMap,p=f.player,scene;
  const renderer=new EventEmitter(),packets=[],records=[],journey=[],interactions=[];
  const bookmark={id:1,revision:1,kind:'point',mode:'walk',map:125,x:7,y:10,name:'Selected house point'};
  c.$dataCommonEvents=read('CommonEvents.json');c.$gameParty.members=()=>[1,3,4];c.$gameParty._actors=[1,3,4];c.$gameParty.inBattle=()=>false;
  c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
  c.ConfigManager={alwaysDash:false};c.Input={dir4:0};c.$testEvent=null;c.$gameTroop={_interpreter:null};
  c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
  const attachState=()=>{
   c.$gameSwitches.value=id=>switches.has(id);c.$gameSwitches.setValue=(id,on)=>{on?switches.add(id):switches.delete(id);map._needsRefresh=true;};
   c.$gameVariables.value=id=>variables.get(id)||0;c.$gameVariables.setValue=(id,v)=>{variables.set(id,v);map._needsRefresh=true;};
   c.$gameSelfSwitches.value=key=>self.has(key.join(','));c.$gameSelfSwitches.setValue=(key,on)=>{on?self.add(key.join(',')):self.delete(key.join(','));map._needsRefresh=true;};
  };
  function prepare(){
   attachState();delete p.direction;p._followers={areGathering:()=>false,updateMove(){}};map.inactiveTime=0;
   map._needsRefresh=map._needsTilemapRefresh=false;
   map._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){},_depth:0,_list:null,_index:0,_branch:{},_waitMode:'',_waitCount:0,_childInterpreter:null});
   for(const e of map.events())e.setupPage=()=>{};
   scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,srcWendy:{},srcStones:{},
    _active:true,_fadeDuration:0,_fadeOpacity:0};c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
   if(f.id===12)for(const id of[44,47,48,57]){
    const a=f.map.events[id].pages[0].list.find(r=>r.code===357&&r.parameters[1]==='SetBlocker').parameters[3];
    map.event(id).SetBlocker(+a.minX,+a.minY,+a.maxX,+a.maxY);
   }
  }
  p.setPosition(15,29);prepare();
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage:(packet,buffers)=>packets.push(structuredClone(packet,{transfer:buffers||[]}))});
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({autowalk:automatic}),bookmarks:()=>[bookmark],makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
   createRouteWorker:()=>worker},{open(r){records.push(r);return records.length;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
  c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
  c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessFieldEvent=(s,e)=>field.iceEventStarted(s,e);
  c.WendyQuestAccessSceneLeaving=field.leave;c.WendyQuestAccessBookmarkEntranceAccepted=field.bookmarkEntranceAccepted;
  c.WendyQuestAccessBookmarkTransferReserved=field.bookmarkTransferReserved;
  const frame=()=>renderer.emit('postrender');let handled=0,last,peak=0,transfers=0;
  const tick=()=>{const at=performance.now();p.moveByInput();p._realX=p._x;p._realY=p._y;
   peak=Math.max(peak,performance.now()-at);p.checkEventTriggerHere([1,2]);frame();};
  async function reply(){const q=packets.at(-1);handled=packets.length;await verifyWorker(f,q.request,q.live,r=>{
   last=r;worker.emit('message',{epoch:q.epoch,sequence:q.sequence,map:q.map,result:r});});frame();}
  const ask=()=>{assert(field.command('directions'));frame();};
  function execute(it){let n=0;while(it._list&&it._index<it._list.length&&!p._transferring){
   assert(++n<2048);it.executeCommand();if(it._childInterpreter){execute(it._childInterpreter);it._childInterpreter=null;}
  }}
  async function transfer(){
   const dest=[p._newMapId,p._newX,p._newY,p._newDirection||p._direction];journey.push([f.id,...dest]);transfers++;
   assert([12,125].includes(dest[0]),'the verified town detour never substitutes an unrelated entrance');
   const priorMap=map,next=load(dest[0],{switches:[...switches],self:[...self],variables:Object.fromEntries(variables)});
   Object.assign(priorMap,next.gameMap);map=priorMap;f={...next,gameMap:map,player:p};c.$gameMap=map;c.$gamePlayer=p;
   p._transferring=false;p.setPosition(dest[1],dest[2]);p.setDirection(dest[3]);prepare();
   field.observeReady(scene);frame();if(packets.length>handled)await reply();else if(!automatic)ask();
  }
  async function interact(id){
   const e=map.event(id),entry=f.map.events[id],page=e.page();
   assert(!e.isStarting());
   for(let wait=0;wait<10;wait++)tick();
   assert(!e.isStarting(),'ordinary interaction waits for native player Confirm');
   if(last.arrival.facing)p.setDirection(last.arrival.facing);
   p.checkEventTriggerHere([0]);if(!e.isStarting())p.checkEventTriggerThere([0]);assert(e.isStarting(),`native Confirm ${f.id}/${id}`);
   field.iceEventStarted(scene,e);assert(map.setupStartingMapEvent());assert.equal(scene._wqaFieldReady,false);
   const before=packets.length;field.observeReady(scene);assert.equal(packets.length,before);
   const it=map._interpreter;interactions.push([f.id,id]);
   if(iceOpensPassage(entry,page)){
    for(const r of page.list)if(r.code===123)it.command123(r.parameters);
    const change=iceMeltChanges(entry,page);if(change.relocate)it.command203([change.relocate[0],0,...change.relocate.slice(1),0]);
    for(const actor of[id,...change.clears||[]])Object.assign(map.event(actor),{_erased:true,_through:true,_priorityType:0,_starting:false});
   }else{
    for(const r of page.list){
     if(r.code===357&&r.parameters[0]==='Tyruswoo_TileControl'&&r.parameters[1]==='set_tile'){
      const a=r.parameters[3],v=JSON.parse(a.coordinates),o=JSON.parse(a.relativity);map.setTileId(+v.x,+v.y,+v.z,a.tileId,o.clearUpperLayers,o.allowAutotiling);
     }
     if(r.code===123)it.command123(r.parameters);
    }
    e._pageIndex=e.findProperPageIndex();e._starting=false;
   }
   it.clear();map._needsRefresh=map._needsTilemapRefresh=false;scene._wqaFieldReady=true;
   field.iceRouteReady(scene);field.observeReady(scene);frame();if(packets.length>handled)await reply();else if(!automatic)ask();
  }
  scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;ask();await reply();
  for(let count=0;count<3000;count++){
   if(packets.length>handled)await reply();
   if(automatic){
    if(field.autowalk.active(scene))tick();
    else if(process.argv.includes('--baseline-crossmap-chain')&&!transfers){
     console.log('BASELINE cross-map automatic movement stopped before the native entrance',JSON.stringify({pos:[p._x,p._y],last,records}));return;
    }
   }else{
    if(last.legs?.length){for(const leg of last.legs)for(let n=0;n<leg.tiles;n++){
     assert(p.canPass(p._x,p._y,leg.direction));c.Input.dir4=leg.direction;tick();c.Input.dir4=0;
     if(map.events().some(e=>e.isStarting()))break;
    }}
    if(!map.events().some(e=>e.isStarting())&&last.more&&(p._x!==last.arrival.x||p._y!==last.arrival.y)){ask();continue;}
    if(last.boundary&&!map.events().some(e=>e.isStarting())){p.setDirection(last.boundary);p.moveStraight(last.boundary);p.checkEventTriggerHere([1,2]);}
    if(last.entrance&&last.arrival?.facing&&!map.events().some(e=>e.isStarting())){
     p.setDirection(last.arrival.facing);p.moveStraight(last.arrival.facing);p.checkEventTriggerTouchFront(last.arrival.facing);
    }
    frame();
   }
   const event=map.events().find(e=>e.isStarting());
   if(event){assert(map.setupStartingMapEvent());execute(map._interpreter);
    if(p._transferring){await transfer();continue;}
    map._interpreter.clear();map._needsRefresh=map._needsTilemapRefresh=false;scene._wqaFieldReady=true;field.observeReady(scene);frame();
   }
   if(f.id===125&&p._x===7&&p._y===10&&transfers>=2){if(automatic)tick();break;}
   if(!field.autowalk.active(scene)&&['iceRoute','controlRoute'].includes(last.status)){await interact(last.event);continue;}
   if(!automatic&&!p._transferring&&packets.length===handled)ask();
  }
  assert.equal(transfers,2,JSON.stringify({journey,records,last,pos:[f.id,p._x,p._y]}));
  assert.equal(f.id,125);assert.deepEqual([p._x,p._y],[7,10]);assert(interactions.length>0);
  if(automatic)assert.equal(records.filter(r=>r.name==='Arrived.').length,1,'only the selected final destination announces arrival');
  console.log(`Verified ${automatic?'automatic':'manual'} native world→town→interaction→house journey, same selected point, ${interactions.length} player-confirmed prerequisites; peak throttled input ${peak.toFixed(3)} ms.`);
 }}finally{c.Game_Interpreter.prototype.loadImages=original.loadImages;Object.assign(c,saved);c.SceneManager._scene=original.scene;c.Graphics.app=original.app;
  Object.assign(c.$gameParty,{members:original.members,_actors:original.actors,inBattle:original.battle});
  c.$gameSwitches.value=original.sv;c.$gameSwitches.setValue=original.ss;c.$gameVariables.value=original.vv;c.$gameVariables.setValue=original.vs;
  c.$gameSelfSwitches.value=original.ssv;c.$gameSelfSwitches.setValue=original.sss;}
};
