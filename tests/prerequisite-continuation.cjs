'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
const {createField}=require('../src/world/field');
module.exports=async(c,load,read,verifyWorker)=>{
 const keys=['addEventListener','$gameScreen','$gameMessage','$gameTemp','$testEvent','ConfigManager','Input','WendyQuestAccessAutowalkInput',
  'WendyQuestAccessFieldMove','WendyQuestAccessFieldChanged','WendyQuestAccessFieldEvent','WendyQuestAccessSceneLeaving'];
 const saved=Object.fromEntries(keys.map(key=>[key,c[key]]));
 const prior={scene:c.SceneManager._scene,app:c.Graphics.app,value:c.$gameSwitches.value,set:c.$gameSwitches.setValue};
 let peak=0;
 try{for(const cancel of [false,true]){
  const f=load(116,{switches:[8],self:['116,11,A']}),p=f.player,map=f.gameMap;
  p.setPosition(7,7);delete p.direction;p._followers={areGathering:()=>false,updateMove(){}};map.inactiveTime=0;
  const switches=new Set([8]);c.$gameSwitches.value=id=>switches.has(id);
  c.$gameSwitches.setValue=(id,on)=>{on?switches.add(id):switches.delete(id);map._needsRefresh=true;};
  const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,
   srcWendy:{},srcStones:{},_active:true,_fadeDuration:0,_fadeOpacity:0};
  const renderer=new EventEmitter(),packets=[],records=[];
  c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.addEventListener=()=>{};
  c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};c.Input={dir4:0};
  c.ConfigManager={alwaysDash:false};c.$testEvent=null;c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
  const bookmark={id:1,revision:1,kind:'entity',map:116,mode:'walk',event:8,category:'exits',name:'Selected house exit'};
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage:packet=>packets.push(packet)});
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({autowalk:true}),bookmarks:()=>[bookmark],makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
   createRouteWorker:()=>worker},{open(r){records.push(r);return records.length;},close(){},
   arrive(r){records.push(r);return records.length;},endArrival(){}});
  c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
  c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessFieldEvent=()=>{};
  c.WendyQuestAccessSceneLeaving=field.leave;
  const interpreter=map._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){},_depth:0,_list:null,
   _index:0,_branch:{},_waitMode:'',_waitCount:0,_childInterpreter:null});
  for(const e of map.events())e.setupPage=()=>{};
  const frame=()=>renderer.emit('postrender');
  const tick=()=>{const at=performance.now();p.moveByInput();p._realX=p._x;p._realY=p._y;
   peak=Math.max(peak,performance.now()-at);p.checkEventTriggerHere([1,2]);frame();};
  async function reply(){const packet=packets.at(-1);await verifyWorker(f,packet.request,packet.live,r=>{
    worker.emit('message',{epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});});frame();}
  scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
  assert(field.command('directions'));frame();await reply();assert(field.autowalk.active(scene));
  for(let n=0;n<5&&!f.gameMap.event(13).isStarting();n++)tick();
  assert.deepEqual([p._x,p._y],[5,7]);assert(f.gameMap.event(13).isStarting(),'automatic final step enters the native note');
  assert(!records.some(r=>r.name==='Arrived.'),'no intermediate arrival');
  assert(map.setupStartingMapEvent());assert.equal(interpreter._eventId,13);assert.equal(scene._wqaFieldReady,false);
  const count=packets.length;field.observeReady(scene);assert.equal(packets.length,count,'no work during native event');
  // Execute original completion command; native dialogue/rendering remains a
  // stand-in, as in the established house-door and cleanup fixtures.
  const done=f.map.events[13].pages[0].list.find(r=>r.code===121);interpreter.command121(done.parameters);
  assert.equal(switches.has(142),true);const note=map.event(13);assert.equal(note.findProperPageIndex(),1);
  Object.assign(note,{_pageIndex:1,_erased:true,_through:true,_priorityType:0,_starting:false});
  interpreter.clear();map._needsRefresh=map._needsTilemapRefresh=false;scene._wqaFieldReady=true;
  if(cancel){
   c.Input.dir4=6;tick();c.Input.dir4=0;field.observeReady(scene);frame();
   assert.equal(packets.length,count,'manual takeover cancels pending continuation');
   assert.equal(records.filter(r=>r.name==='Autowalk stopped.').length,1);
  }else{
   field.observeReady(scene);frame();assert.equal(packets.length,count+1);
   assert.equal(packets.at(-1).request.event,8,'the original exit, not the floor event, is retained');
   await reply();tick();assert.equal(records.filter(r=>r.name==='Arrived.').length,1);
   assert.equal(records.filter(r=>r.name==='Walking.').length,1,'continuation is silent');
   assert.deepEqual([p._x,p._y],[5,7]);
  }
 }}finally{Object.assign(c,saved);c.SceneManager._scene=prior.scene;c.Graphics.app=prior.app;
  c.$gameSwitches.value=prior.value;c.$gameSwitches.setValue=prior.set;}
 console.log(`Verified original house-note activation/completion, retained exit, native readiness, silent continuation, manual cancellation/one stop report; peak throttled input ${peak.toFixed(3)} ms.`);
};
