'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{performance}=require('node:perf_hooks');
const {c,load,read,verifyWorker}=require('./world.test.cjs');
const {createField}=require('../src/world/field');
const {activeMovingEnemy}=require('../src/world/destinations');
const {formatSpeech}=require('../src/services/speech-text.cjs');
c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
c.$gameParty.getNav=()=> 'quest27';c.$gameParty._actors=[1,2,3,4,5];
c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};c.addEventListener=()=>{};
c.Scene_Battle=function(){};
c.Input={dir4:0};c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};
function erased(event){event._erased=true;event._through=true;event._priorityType=0;}
async function fixture(automatic,blocking){
 const f=load(87,{switches:[94,95]});f.player.setPosition(72,8);f.gameMap.inactiveTime=0;
 Object.assign(f.player,{_moveSpeed:4,_jumpCount:0,_stopCount:0,_direction:4,_dashing:false,
  _followers:{areGathering:()=>false,updateMove(){},isSomeoneCollided:()=>false}});
 delete f.player.direction;
 const enemies=f.gameMap.events().filter(e=>activeMovingEnemy(c,e)),enemy=enemies[0];assert(enemy);
 for(const actor of enemies)erased(actor);
 if(blocking){Object.assign(enemy,{_erased:false,_through:false,_priorityType:1});enemy.setPosition(70,9);}
 const renderer=new EventEmitter(),packets=[],records=[];
 const makeScene=()=>({_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0});
 let scene=makeScene();c.SceneManager._scene=scene;c.SceneManager._nextScene=null;c.Graphics.app={stage:scene,renderer};
 const preferences={autowalk:automatic,fullRouteReadout:true};
 const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(p,b){packets.push(structuredClone(p,{transfer:b||[]}));}});
 const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
  navigationPreferences:()=>preferences,makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
  {open(r){records.push(r);return records.length;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
 let stepped=0;
 c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessAutowalkInput=field.autowalk.input;
 c.WendyQuestAccessFieldMove=(scene,direction,succeeded)=>{if(succeeded)stepped=direction;field.autowalk.moved(scene,direction,succeeded);};
 const frame=()=>renderer.emit('postrender');
 async function reply(){const packet=packets.shift();assert(packet);let result;
  await verifyWorker(f,packet.request,packet.live,r=>result=r);worker.emit('message',{...packet,result});frame();frame();return {packet,result};}
 async function ask(action){assert(field.command(action));frame();frame();if(packets.length)return reply();}
 for(let n=0;n<12&&records.at(-1)?.category!=='Quests';n++)await ask('nextCategory');
 assert.equal(records.at(-1)?.category,'Quests');assert(!field.autowalk.active(scene),'browsing cannot start movement');
 const first=await ask('directions');assert(first);assert.equal(first.packet.request.transfer.map,86);
 assert.equal(first.packet.request.autowalk,automatic);
 if(automatic)assert(field.autowalk.active(scene),'the regional quest retains Autowalk intent');
 else assert(records.some(r=>r.kind==='routeDirections'));
 function step(){stepped=0;f.player.moveByInput();
  for(let n=0;f.player.isMoving()&&n<64;n++)f.player.updateMove();
  frame();return stepped;}
 return {f,enemy,field,records,packets,preferences,frame,reply,first,step,get scene(){return scene;},
  newScene(){scene=makeScene();c.SceneManager._scene=scene;c.Graphics.app.stage=scene;return scene;}};
}
(async()=>{
 for(const automatic of [false,true]){const q=await fixture(automatic,false);
  assert.equal(q.first.result.status,automatic?'ready':'interrupted');
  if(automatic)assert.equal(q.first.result.entrance,73);else assert.equal(q.first.result.boundaryEvent,102);
  assert(q.first.result.distance>200,'reported long route is exercised');
  if(automatic){assert(q.first.result.course.length>200);assert(!q.records.some(r=>r.kind==='routeDirections'));
   assert(q.step()>0,'starts walking on first directions request');}
  q.field.leave(q.scene);
 }
 for(const outcome of ['move','defeat','manual','other-event','quest-change']){
  const q=await fixture(true,true);assert.equal(q.first.result.status,'enemyBlocked');
  assert.equal(q.first.result.enemy,q.enemy._eventId);
  for(let i=0;i<q.first.result.distance;i++)assert(q.step()>0);
  assert.equal(q.step(),0);assert(q.field.autowalk.active(q.scene),'blocked course stays parked');
  assert(q.scene._wqaEnemyWalkPending,'cross-map destination has an inert recovery ticket');
  assert(!c.Graphics._wqaEnemyWalkPending,'parked movement needs no additional render observer');
  const before=q.records.length,at=performance.now();
  for(let i=0;i<900;i++)assert.equal(q.field.autowalk.input(q.scene,q.f.player,0,false),0);
  const waitingMs=performance.now()-at;assert.equal(q.records.length,before,'waiting neither repeats speech nor submits a route');assert.equal(q.packets.length,0);
  if(outcome==='move'){
   const d=[2,4,6,8].find(d=>q.enemy.canPass(q.enemy._x,q.enemy._y,d));assert(d);
   q.enemy.moveStraight(d);for(let i=0;q.enemy.isMoving()&&i<64;i++)q.enemy.updateMove();
   q.step();q.frame();assert.equal(q.packets.length,1);
  }else if(outcome==='manual'){
   q.field.autowalk.input(q.scene,q.f.player,4,true);q.frame();
   assert(!c.Graphics._wqaEnemyWalkPending);assert(!q.field.autowalk.active(q.scene));q.field.leave(q.scene);continue;
  }else{
   // The native bump is rejected by collision, so it is an encounter intent,
   // not a manual walking takeover. The actual interpreter-entry hook owns
   // the following lifecycle boundary; no game input is produced in battle.
   const toward=2;assert.equal(q.field.autowalk.input(q.scene,q.f.player,toward,true),toward);
   assert(!q.field.autowalk.active(q.scene));assert(q.scene._wqaEnemyWalkPending);
   c.SceneManager._nextScene=new c.Scene_Battle();
   q.field.leave(q.scene,outcome==='other-event'?q.enemy._eventId+1:q.enemy._eventId);
   const battle={_wqaBattleStarted:true};c.SceneManager._scene=battle;c.Graphics.app.stage=battle;c.SceneManager._nextScene=null;
   erased(q.enemy);q.field.observeReady(battle);assert.equal(q.packets.length,0,'battle has no movement/replanning');
   if(outcome==='quest-change')c.$gameParty.getNav=()=> 'quest28';
   q.newScene();q.field.observeReady(q.scene);q.frame();q.frame();
   if(outcome!=='defeat'){assert.equal(q.packets.length,0);assert(!c.Graphics._wqaEnemyWalkPending);c.$gameParty.getNav=()=> 'quest27';q.field.leave(q.scene);continue;}
   assert.equal(q.packets.length,1,'known defeat resumes at normal field readiness');
  }
  const resumed=await q.reply();assert.equal(resumed.packet.request.transfer.map,86,'same original cross-map goal');
  assert(resumed.packet.request.autowalk);assert(q.field.autowalk.active(q.scene));
  assert(!q.records.slice(before).some(r=>r.kind==='routeDirections'||/request directions/i.test(formatSpeech(r))));
  q.field.leave(q.scene);console.log(JSON.stringify({outcome,waitingFrames:900,waitingMs}));
 }
 console.log('Verified logged Caffeine long regional quest starts Autowalk; moving/defeated enemy recovery retains the cross-map goal, waits silently, respects battle gates and cancels on real takeover, unrelated event or quest replacement.');
})().catch(e=>{console.error(e);process.exitCode=1;});
