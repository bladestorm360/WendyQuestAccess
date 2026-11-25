'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createField}=require('../src/world/field');
const {captureWorld}=require('../src/world/snapshot');
const {sunriseSequenceExit}=require('../src/world/local-destinations');
const {performance}=require('node:perf_hooks');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$gameParty.members=()=>[4];c.$gameParty._actors=[1,5,3,4];
 const forbidden=[50,51,76,77,79],runs=[];
 let callbackTotal=0,callbacks=0,callbackPeak=0,requestPeak=0;
 for(const auto of [false,true])for(const [category,target] of [['exits',2],['exits',3],['exits',92],['quests',2]]){
  const f=load(76,{switches:[11,23,33,38,39,51,52,53,77,462,463,511],variables:{5:0,10:4}}),p=f.player,map=f.gameMap;
  // Relevant saved state: first glitch erased, second still active. Native
  // state writers below advance every subsequent page instead of faking it.
  p.setPosition(19,29);p._followers={areGathering:()=>false,updateMove(){}};map.inactiveTime=0;
  map.event(95)._erased=category==='quests';map.event(95)._pageIndex=category==='quests'?-1:0;
  const flags=new Set([11,23,33,38,39,51,52,53,77,462,463,511]),vars={5:0,10:4};
  c.$gameSwitches.value=id=>flags.has(id);c.$gameSwitches.setValue=(id,v)=>{v?flags.add(id):flags.delete(id);};
  c.$gameVariables.value=id=>vars[id]??0;c.$gameVariables.setValue=(id,v)=>{vars[id]=v;};
  function publish(){for(const e of map.events()){
   e._pageIndex=e._erased?-1:e.findProperPageIndex();const page=e.page();
   Object.assign(e,{_through:page?.through??true,_priorityType:page?.priorityType??0,
    _trigger:page?.trigger,_tileId:page?.image?.tileId??0,_characterName:page?.image?.characterName??'',_starting:false});
  }map.refreshTileEvents();}
  for(const e of map.events())e.setupPage=publish;
  map.refreshIfNeeded=()=>{};
  const renderer=new EventEmitter(),packets=[],records=[];
  const parent={},marker={_active:true,parent,worldVisible:true,worldAlpha:1,renderable:true,
   texture:{valid:true},bitmap:{},x:18,y:19,_generated:true,_reporting:true,_eventIds:[50,51],_questId:'quest24'};
  c.$gameParty.getNav=()=> 'quest24';c.Ayatam={QUEST:{needsRefresh:false,QuestDatabase:Array.from({length:24},()=>({QuestName:'Meet Eggward'}))}};
  const scene={_spriteset:{_tilemap:{parent},_ayatamQuestIconSprite:[marker]},
   _wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_active:true,
   _prevCanMove:true,srcWendy:{},srcStones:{},_fadeDuration:0,_fadeOpacity:0};
  c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.addEventListener=()=>{};
  c.Input={dir4:0};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
  c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
  c.$gameParty.inBattle=()=>false;
  const view=()=>captureWorld(c,false,undefined,scene),postFirst=map.event(95)._erased;
  map.event(95)._erased=true;
  assert(sunriseSequenceExit(c));assert(view().objects.some(t=>t.sunriseExit&&t.id===2&&t.category==='quests'));
  assert(!view().objects.some(t=>t.category==='quests'&&[50,51].includes(t.id)));
  assert(view().objects.some(t=>[50,51].includes(t.id)&&t.name==='Eggward conversation'),
   'deliberate ordinary Eggward selection stays available and is clearly identified');
  map.event(95)._erased=false;
  assert(!sunriseSequenceExit(c));assert(view().objects.some(t=>t.quest&&[50,51].includes(t.id)),
   'before the first local glitch the native Eggward quest remains untouched');
  map.event(95)._erased=true;
  for(const flag of [462,463]){flags.delete(flag);assert(!sunriseSequenceExit(c));flags.add(flag);}
  for(const flag of [90,466]){flags.add(flag);assert(!sunriseSequenceExit(c));flags.delete(flag);}
  map.event(95)._erased=postFirst;
  const bookmark={id:'sunrise-exit',revision:1,kind:'entity',map:76,mode:'walk',event:target,category,name:'North world-map exit'};
  const worker=Object.assign(new EventEmitter(),{unref(){},postMessage:packet=>packets.push(packet)});
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({autowalk:auto}),bookmarks:()=>[bookmark],makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
   createRouteWorker:()=>worker},{open:r=>{records.push(r);return records.length;},close(){},
   arrive:r=>{records.push(r);return records.length;},endArrival(){}});
  c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
  c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessFieldEvent=()=>{};c.WendyQuestAccessSceneLeaving=field.leave;
  const source=map._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){},_depth:0,_list:null,
   _index:0,_branch:{},_waitMode:'',_waitCount:0,_childInterpreter:null});
  const frame=()=>{const begin=performance.now();renderer.emit('postrender');const elapsed=performance.now()-begin;
   callbackTotal+=elapsed;callbacks++;callbackPeak=Math.max(callbackPeak,elapsed);};
  function check(){assert(!forbidden.some(id=>map.event(id).pos(p._x,p._y)),'no Eggward meeting/mention cell may be traversed');}
  function move(d,automatic=false){if(!automatic)assert(p.canPass(p._x,p._y,d));
   if(automatic)p.moveByInput();else p.moveStraight(d);
   p._realX=p._x;p._realY=p._y;check();frame();}
  function play(event){
   assert.equal(p._x,event._x);assert.equal(p._y,event._y);event.start();
   assert(map.setupStartingMapEvent());assert.equal(source._eventId,event._eventId);
   // Native dialogue/audio/quest presentation is omitted. Original branch,
   // flag, variable, forced-retreat, erase and transfer producers are real.
   for(let n=0;source._index<source._list.length&&n<256;n++){
    const row=source.currentCommand(),code=row.code;
    if([111,411,121,122,214,201].includes(code))assert(source.executeCommand());
    else if(code===205){assert.equal(row.parameters[0],-1);source.command205(row.parameters);
     const course=p._moveRoute.list;assert.deepEqual(Array.from(course,r=>r.code),[1,1,1,0]);
     for(const step of course){if(step.code===0)break;assert(p.canPass(p._x,p._y,2));p.processMoveCommand(step);
      p._realX=p._x;p._realY=p._y;check();}p._moveRouteForcing=false;source._index++;
    }else{assert([0,101,401,117,230,250,357,657,505,412].includes(code),`unclassified command ${code}`);
     if(code===117)assert([40,41,48,159].includes(row.parameters[0]));source._index++;}
   }
   source.clear();publish();map._needsRefresh=map._needsTilemapRefresh=false;scene._wqaFieldReady=true;
   field.observeReady(scene);frame();
  }
  scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
  const stages=[];
  for(const expected of [...postFirst?[]:[95],96,53,53,53,53,53,53,target]){
   let route;
   for(let prefix=0;prefix<16;prefix++){
   const begin=performance.now();assert(field.command('directions'));frame();
   requestPeak=Math.max(requestPeak,performance.now()-begin);const packet=packets.at(-1);
   assert.equal(packet.request.event,target,'original exit remains selected after each native script');
   if(category==='quests')assert(view().objects.some(t=>t.sunriseExit&&t.id===target));
   await verifyWorker(f,packet.request,packet.live,r=>{route=r;worker.emit('message',{
    epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});});frame();
   assert.equal(route.status,'interrupted');assert.equal(route.boundaryEvent,expected);
   if(auto){assert(field.autowalk.active(scene));for(let n=0;n<route.distance;n++)move(0,true);
    p.moveByInput();p._realX=p._x;p._realY=p._y;frame();assert(!field.autowalk.active(scene));
   }else for(const leg of route.legs)for(let n=0;n<leg.tiles;n++)move(leg.direction);
   if(auto||!route.more)break;
   assert(prefix<15,'bounded manual route prefixes must converge');
   }
   assert.deepEqual([p._x,p._y],[route.arrival.x,route.arrival.y]);
   assert(!map.isAnyEventStarting(),'stop before player-owned events');assert(!flags.has(90)&&!flags.has(466));
   stages.push({event:expected,warning:vars[14]??0});move(route.boundary);play(map.event(expected));
  }
  assert(flags.has(464)&&flags.has(466)&&flags.has(90)&&flags.has(465));assert.equal(vars[14],6);
  assert.deepEqual([p._newMapId,p._newX,p._newY],[113,43,28]);runs.push({auto,target,stages});
 }
 console.log(`Sunrise full sequence: ${runs.length} production-field/worker/native journeys, both glitches, six warning transitions and final TrueNoEggward/world transfer; optional Eggward tiles untouched.`);
 console.log(`Throttled complete-sequence field callbacks: ${callbacks} calls, ${callbackTotal.toFixed(2)} ms total, ${callbackPeak.toFixed(2)} ms peak; combined request/submission peak ${requestPeak.toFixed(2)} ms. Native dialogue/rendering/audio and actual-game responsiveness remain unmeasured.`);
};
