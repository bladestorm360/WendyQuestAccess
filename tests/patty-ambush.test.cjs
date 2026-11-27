'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {c,load,read,verifyWorker}=require('./world.test.cjs');
const {captureWorld}=require('../src/world/snapshot');
const {officeAmbushClears}=require('../src/world/local-destinations');
const {createField}=require('../src/world/field');
const {formatSpeech}=require('../src/services/speech-text.cjs');
c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
c.$gameParty._actors=[1,2,3,4,5];c.$gameParty.getNav=()=> 'quest32';
c.Ayatam={QUEST:{needsRefresh:false,QuestDatabase:Array.from({length:32},()=>({QuestName:'Defeat MechBorg'}))}};
c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};c.$gameTroop={};
c.Input={dir4:0};c.addEventListener=()=>{};
c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};
const ids=[2,3,4,16,17,18,19];
function stage(f){
 const parent={},renderer=new EventEmitter(),scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0,
  _spriteset:{_tilemap:{parent}}};
 scene._spriteset._ayatamQuestIconSprite=[{parent,_active:true,worldVisible:true,worldAlpha:1,renderable:true,
  texture:{valid:true},bitmap:{},x:1,y:1,_generated:true,_eventIds:[6],_location:{location:c.$dataMapInfos[104].name}}];
 c.SceneManager._scene=scene;c.SceneManager._nextScene=null;c.Graphics.app={stage:scene,renderer};
 return {scene,renderer};
}
(async()=>{
 for(const automatic of [false,true])for(const [x,y]of [[5,31],[5,21]]){
  const f=load(103),{scene,renderer}=stage(f),p=f.player;f.gameMap.inactiveTime=0;p.setPosition(x,y);
  const live=captureWorld(c,scene).live;
  for(const id of ids){const event=f.map.events[id];assert(officeAmbushClears(103,event,event.pages[0]));
   const projected=live.events.find(e=>e.id===id);assert(projected.clearsOnUse);assert(!projected.mapTransfer);}
  assert(live.events.find(e=>e.id===6).mapTransfer,'the real next-room entrance stays terminal');
  for(const mutation of ['foreign-map','wrong-transfer','wrong-flag','unknown','extra-condition']){
   const e=structuredClone(f.map.events[2]),page=e.pages[0];
   if(mutation==='wrong-transfer')page.list[6].parameters[1]=104;
   if(mutation==='wrong-flag')page.list[89].parameters[0]=114;
   if(mutation==='unknown')page.list[50].code=355;
   if(mutation==='extra-condition')e.pages[1].conditions.switch2Valid=true;
   assert(!officeAmbushClears(mutation==='foreign-map'?104:103,e,page),mutation);
  }
  const packets=[],records=[];
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,b){packets.push(structuredClone(packet,{transfer:b||[]}));}});
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({autowalk:automatic,fullRouteReadout:true}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
   createRouteWorker:()=>worker},{open(r){records.push(r);return records.length;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
  const frame=()=>renderer.emit('postrender');
  for(let n=0;n<12&&records.at(-1)?.category!=='Quests';n++){assert(field.command('nextCategory'));frame();}
  assert.equal(records.at(-1)?.category,'Quests');assert.match(records.at(-1).name,/To Patty/);
  assert(field.command('directions'));frame();const packet=packets.pop();assert(packet);assert.equal(packet.request.event,6);
  let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);
  assert.equal(result.status,'interrupted');assert(ids.includes(result.boundaryEvent));
  assert.equal(result.arrival.y,10);assert(result.distance>0);assert(result.boundary===8);
  worker.emit('message',{...packet,result});frame();frame();
  assert.equal(field.autowalk.active(scene),automatic,'real quest dispatch preserves the selected control mode');
  assert(!records.some(r=>/unreachable|unavailable|Beef Thief/i.test(formatSpeech(r))));
  if(automatic){
   delete p.direction;Object.assign(p,{_moveSpeed:4,_jumpCount:0,_stopCount:0,_dashing:false,_direction:8,
    _followers:{areGathering:()=>false,updateMove(){},isSomeoneCollided:()=>false}});
   c.WendyQuestAccessAutowalkInput=field.autowalk.input;
   c.WendyQuestAccessFieldMove=(s,d,ok)=>field.autowalk.moved(s,d,ok);
   for(let n=0;n<result.distance+2;n++){
    p.moveByInput();for(let ticks=0;p.isMoving()&&ticks<64;ticks++)p.updateMove();frame();
   }
   assert.deepEqual([p._x,p._y],[result.arrival.x,10]);
   assert(!f.gameMap.events().some(e=>e.isStarting()),'Autowalk waits for the player to trigger the ambush');
  }
  field.leave(scene);
 }
 // The original completion writer selects all seven native erase pages.
 let f=load(103),on=new Set();c.$gameSwitches.setValue=(id,value)=>value?on.add(id):on.delete(id);
 const row=f.map.events[2].pages[0].list[89];c.Game_Interpreter.prototype.command121.call({},row.parameters);
 assert(on.has(113));f=load(103,{switches:[...on]});f.player.setPosition(7,9);stage(f);
 for(const id of ids){assert.equal(f.gameMap.event(id)._pageIndex,1);f.gameMap.event(id).setupPage=()=>{};
  c.Game_Interpreter.prototype.command214.call({_eventId:id,isOnCurrentMap:()=>true});}
 const live=captureWorld(c,c.SceneManager._scene).live;
 for(const automatic of [false,true])await verifyWorker(f,{x:7,y:9,event:6,field:true,autowalk:automatic,stopBeforeEvent:true},live,r=>{
  assert.equal(r.status,'controlRoute');assert.equal(r.event,5);assert(!ids.includes(r.boundaryEvent));assert(r.arrival.y<=3);
 });
 for(const row of f.map.events[5].pages[0].list.filter(r=>r.code===357)){
  const options=row.parameters[3],at=JSON.parse(options.coordinates),rel=JSON.parse(options.relativity);
  f.gameMap.setTileId(+at.x,+at.y,+at.z,options.tileId,rel.clearUpperLayers,rel.allowAutotiling);
 }
 f.gameMap.event(5)._pageIndex=1;f.player.setPosition(8,3);
 const opened=captureWorld(c,c.SceneManager._scene).live;
 for(const automatic of [false,true])await verifyWorker(f,{x:8,y:3,event:6,field:true,autowalk:automatic,stopBeforeEvent:true},opened,r=>{
  assert.equal(r.status,'interrupted');assert.equal(r.boundaryEvent,6);assert.equal(r.arrival.y,3);
 });
 console.log('To Patty: four real quest/manual/Autowalk first-event routes, native movement stops before ambush, seven completion/erase pages, onward routes and five proof negatives pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
