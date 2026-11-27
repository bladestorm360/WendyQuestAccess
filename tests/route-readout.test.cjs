'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{performance}=require('node:perf_hooks');
const {normalizeNavigation}=require('../src/settings/navigation-keys');
const {chunkReadout,readoutLimit,createRouteReadout}=require('../src/world/route-readout');
const {formatSpeech}=require('../src/services/speech-text.cjs');
const {createRenderer}=require('../src/runtime/renderer');
const {createField}=require('../src/world/field');
const {captureWorld}=require('../src/world/snapshot');
const {solveRoute}=require('../src/world/routes.cjs');
const {c,load,read,verifyWorker,verifyRoute}=require('./world.test.cjs');

assert.equal(normalizeNavigation().fullRouteReadout,false);
assert.equal(normalizeNavigation().autoRouteReadout,false);assert.equal(normalizeNavigation().routeLegsPerReadout,3);
for(const count of [1,3,12])assert.equal(normalizeNavigation({routeLegsPerReadout:count}).routeLegsPerReadout,count);
for(const count of [0,13,2.5,'4'])assert.equal(normalizeNavigation({routeLegsPerReadout:count}).routeLegsPerReadout,3);
const saved=normalizeNavigation({fullRouteReadout:true,autoRouteReadout:true,routeLegsPerReadout:12,autowalk:false});
assert(saved.fullRouteReadout&&saved.autoRouteReadout);assert.equal(saved.autowalk,false);assert.equal(readoutLimit(saved),8);
const record={kind:'routeDirections',name:'Chest',directionsOnly:true,legs:[{direction:2,tiles:1},{direction:2,tiles:2},
 {direction:6,tiles:3},{direction:8,tiles:4},{direction:4,tiles:2}],facing:8,prerequisite:'the bridge button',more:false};
const chunk=chunkReadout(record,normalizeNavigation());
assert.equal(formatSpeech(chunk),'3 south, 3 east, 4 north.');assert.equal(record.legs.length,5);
assert.strictEqual(chunkReadout(record,saved),record);
assert.match(formatSpeech(chunkReadout(record,{routeLegsPerReadout:12})),/bridge button/);

for(const failure of ['off','target','menu','cancel','deviation','forced','relocation','scene']){
 const renderer=new EventEmitter(),scene={},player={_x:0,_y:0,_realX:0,_realY:0,_vehicleType:'walk'},map={};
 const root={$gamePlayer:player,$gameMap:map},prefs={autoRouteReadout:true};let valid=true,ready=true,resumed=0;
 const host={manager:{_scene:scene},graphics:{app:{renderer}},navigationPreferences:()=>prefs};
 const monitor=createRouteReadout(root,host,()=>ready,()=>{resumed++;return true;});
 monitor.follow({scene,x:0,y:0},{legs:[{direction:6,tiles:1}],more:true},()=>valid);
 if(failure==='off')prefs.autoRouteReadout=false;
 if(failure==='target')valid=false;
 if(failure==='menu')ready=false;
 if(failure==='cancel')monitor.cancel();
 if(failure==='forced'){player._moveRouteForcing=true;monitor.changed(scene,player);}
 if(failure==='scene')host.manager._scene={};
 player._x=player._realX=failure==='deviation'?0:failure==='relocation'?5:1;
 player._y=player._realY=failure==='deviation'?1:0;
 if(failure==='relocation')monitor.changed(scene,player);
 monitor.landed(scene,player);renderer.emit('postrender');assert.equal(resumed,0,failure);
}

// Provider FIFO is independent from route generation. A completed prefix can
// append before the provider has acknowledged its predecessor, without cancel.
{
 const word=new Int32Array(new SharedArrayBuffer(4)),tasks=[],packets=[],worker=Object.assign(new EventEmitter(),{unref(){},postMessage:p=>packets.push(p)});
 const output=createRenderer({makeWord:()=>word,schedule:f=>tasks.push(f),createWorker:()=>worker,now:()=>0}).notifications;
 output.open({...chunk,legs:[{direction:2,tiles:3}]},()=>true);
 tasks.shift()();const epoch=packets[0].epoch;
 output.continue({...chunk,legs:[{direction:6,tiles:2}]},()=>true);
 assert.equal(packets.length,2);assert.equal(packets[1].epoch,epoch);assert.equal(packets[1].append,true);
 output.open({kind:'fieldTarget',name:'Other',dx:1,dy:0},()=>true);
 assert(packets.some(p=>p.kind==='cancel'),'explicit new context retains cancellation');
}

c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');c.$gameParty.getNav=()=>null;
c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
// Find a fixed authored ordinary walk with several turns. Native collision,
// original move/interpolation and the packaged worker all use the same map.
let example;
for(const map of [76,15,85]){
 const f=load(map),cells=[];
 for(let i=0;i<f.geometry.cells.length;i++)if((f.geometry.cells[i]&15)===15&&!f.gameMap.events().some(e=>e._x===i%f.map.width&&e._y===Math.floor(i/f.map.width)))cells.push(i);
 for(let a=0;a<Math.min(cells.length,48)&&!example;a+=4){
  const start=cells[a],x=start%f.map.width,y=Math.floor(start/f.map.width);f.player.setPosition(x,y);
  const live=captureWorld(c).live;
  for(let b=0;b<cells.length&&!example;b+=11){const end=cells[b],targetX=end%f.map.width,targetY=Math.floor(end/f.map.width);
   const result=solveRoute(f.geometry,live,{x,y,targetX,targetY,field:true});
   if(result.status==='ready'&&result.legs.length>=5&&result.legs.length<=8&&result.distance<=80)example={map,x,y,targetX,targetY,legs:result.legs};}
 }
 if(example)break;
}
assert(example,'authored multi-turn ordinary route');
console.log('Authored route source',JSON.stringify(example));

async function run(full,automatic,count=3){
 const f=load(example.map);f.player.setPosition(example.x,example.y);f.gameMap.inactiveTime=0;
 Object.assign(f.player,{_moveSpeed:4,_jumpCount:0,_stopCount:0,_direction:2,_dashing:false,
  _followers:{areGathering:()=>false,updateMove(){},isSomeoneCollided:()=>false}});
 const renderer=new EventEmitter(),packets=[],records=[];
 const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
 c.Graphics._wqaFootstepsEnabled=false;
 const bookmark={id:'readout',revision:1,kind:'point',map:example.map,mode:'walk',name:'Readout endpoint',x:example.targetX,y:example.targetY};
 const preferences=normalizeNavigation({fullRouteReadout:full,autoRouteReadout:automatic,routeLegsPerReadout:count});
 const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(p,b){packets.push(structuredClone(p,{transfer:b||[]}));}});
 let closes=0,appends=0;
 const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
  navigationPreferences:()=>preferences,bookmarks:()=>[bookmark],makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
  {open(r){records.push(r);return records.length;},continue(r){records.push(r);appends++;return records.length;},close(){closes++;}});
 let landed=0,changes=0;
 c.WendyQuestAccessFieldChanged=(...args)=>{changes++;return field.changed(...args);};
 c.WendyQuestAccessFootstep=(...args)=>{landed++;return field.readoutLanded(...args);};
 scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
 const frame=()=>renderer.emit('postrender');
 const ask=()=>{assert(field.command('directions'));frame();};
 const reply=async()=>{const packet=packets.shift();assert(packet);assert.equal(packet.request.limit,full?8:count);
  let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);assert.equal(result.status,'ready');
  worker.emit('message',{...packet,result});frame();return result;};
 ask();let result=await reply();assert.equal(result.legs.length,full?example.legs.length:Math.min(count,example.legs.length));
 let walked=0,callbackMs=0,callbackPeak=0,rounds=0;
 while(true){
  const before=records.length,closedBefore=closes;
  for(const leg of result.legs)for(let n=0;n<leg.tiles;n++){
   f.player.moveStraight(leg.direction);assert(f.player.isMovementSucceeded());
   const previousPackets=packets.length;
   for(let ticks=0;f.player.isMoving()&&ticks<64;ticks++){
    const t=performance.now();f.player.updateMove();const elapsed=performance.now()-t;callbackMs+=elapsed;callbackPeak=Math.max(callbackPeak,elapsed);
    if(f.player.isMoving())assert.equal(packets.length,previousPackets,'interpolation never advances the readout early');
   }
   assert(!f.player.isMoving());walked++;frame();
  }
  frame(); // Completion schedules the existing next-postrender route capture.
  if(automatic){assert.equal(closes,closedBefore,'normal confirmed steps preserve speech FIFO');}
  if(!result.more)break;
  if(!automatic){assert.equal(packets.length,0,'default never continues without a directions request');ask();}
  else assert.equal(packets.length,1,'one fresh automatic request per completed prefix: '+JSON.stringify({landed,changes,flag:scene._wqaReadoutActive,records,position:[f.player._x,f.player._y]}));
  result=await reply();if(automatic)assert.equal(records.length,before+1);
  assert(++rounds<16);
 }
 assert.deepEqual([f.player._x,f.player._y],[example.targetX,example.targetY]);assert.equal(packets.length,0);
 assert.equal(appends,automatic?rounds:0);
 // Native loss, target replacement and stop invalidate the old owner.
 if(automatic){field.cancelRouteReadout();assert(!scene._wqaReadoutActive);}
 field.leave(scene);console.log(JSON.stringify({full,automatic,count,walked,rounds,callbackMs,callbackPeak}));
}
(async()=>{
 for(const full of [false,true])for(const automatic of [false,true])await run(full,automatic);
 await run(false,true,1);await run(false,true,12);
 await require('./transfer-bookmarks.cjs').verifyTransferBookmarks(c,load,verifyRoute,verifyWorker,read('CommonEvents.json'));
 console.log('Verified chunk/full settings, consecutive-leg formatting, final-only actions, provider FIFO, packaged routes and actual native settled-tile continuation with player sounds off.');
})().catch(e=>{console.error(e);process.exitCode=1;});
