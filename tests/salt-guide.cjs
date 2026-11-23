"use strict";
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createField}=require('../src/world/field');
const {createSaltGuide}=require('../src/world/puzzles/salt-caverns');
const {captureWorld}=require('../src/world/snapshot');
const {saltState}=require('../src/world/puzzles/salt-state.cjs');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 const keys=['Input','$gameScreen','$gameMessage','$gameTemp','addEventListener','ConfigManager','WendyQuestAccessAutowalkInput',
  'WendyQuestAccessFieldMove','WendyQuestAccessFieldChanged','WendyQuestAccessSceneLeaving','CoroutineManager'];
 const saved=Object.fromEntries(keys.map(k=>[k,c[k]])),sceneBefore=c.SceneManager._scene,app=c.Graphics.app;
 const sv=c.$gameSwitches.value,ss=c.$gameSwitches.setValue,vv=c.$gameVariables.value,vs=c.$gameVariables.setValue;
 const lv=c.$gameSelfSwitches.value,ls=c.$gameSelfSwitches.setValue;
 try{for(const [automatic,verbose] of [[false,true],[false,false],[true,false]]){
  const f=load(19),map=f.gameMap,p=f.player;p.setPosition(24,68);delete p.direction;
  p._followers={areGathering:()=>false,updateMove(){}};map.inactiveTime=0;
  const switches=new Set([200]),self=new Set(),vars=new Map([[3,0]]);
  c.$gameSwitches.value=id=>switches.has(id);c.$gameSwitches.setValue=(id,on)=>{on?switches.add(id):switches.delete(id);};
  c.$gameVariables.value=id=>vars.get(id)||0;c.$gameVariables.setValue=(id,value)=>vars.set(id,value);
  c.$gameSelfSwitches.value=key=>self.has(key.join(','));c.$gameSelfSwitches.setValue=(key,on)=>{on?self.add(key.join(',')):self.delete(key.join(','));};
  const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,
   srcWendy:{},srcStones:{},_active:true,_fadeDuration:0,_fadeOpacity:0,_spriteset:{}};
  const tilemap=Object.assign(new c.Tilemap(),{_mapWidth:f.map.width,_mapHeight:f.map.height,_mapData:f.map.data});
  scene._spriteset._tilemap=tilemap;
  const renderer=new EventEmitter(),packets=[],records=[];
  c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.Graphics.frameCount=0;
  c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};c.Input={dir4:0};c.ConfigManager={alwaysDash:false};
  c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};c.addEventListener=()=>{};
  // Battles and the torch reminder are already completed in this physical
  // replay. Their independent native route tests cover pre-completion gates.
  const retired=[7,18,48,101,102,105,113,116,117,118,119,127,133,134,135,136,137];
  function refresh(){for(const e of map.events()){
   e._pageIndex=e.findProperPageIndex();const page=e.page();
   Object.assign(e,{_through:page?.through??true,_priorityType:page?.priorityType??0,_trigger:page?.trigger,_starting:false});
   if(retired.includes(e._eventId))Object.assign(e,{_erased:true,_through:true,_priorityType:0});
  }map._needsRefresh=map._needsTilemapRefresh=false;}
  refresh();
  let wire;
  const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({autowalk:automatic,verbosePuzzleGuidance:verbose}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
   createRouteWorker:()=>wire=Object.assign(new EventEmitter(),{unref(){},postMessage:q=>packets.push(q)})},
   {open(r){records.push(r);return records.length;},close(){},arrive(r,current,old,detail){records.push(r);if(detail)records.push(detail);return records.length;},endArrival(){}});
  c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
  c.WendyQuestAccessFieldChanged=field.changed;c.WendyQuestAccessSceneLeaving=field.leave;
  const it=map._interpreter=Object.assign(new c.Game_Interpreter(),{_list:null,_index:0,_branch:{},_depth:0,
   _waitMode:'',_waitCount:0,loadImages(){}});
  const frame=()=>renderer.emit('postrender');
  const tick=()=>{p.moveByInput();p._realX=p._x;p._realY=p._y;frame();};
  function execute(id){
   const list=f.map.events[id].pages[0].list;
   Object.assign(it,{_list:list,_index:0,_branch:{},_eventId:id,_mapId:19});
   for(let count=0;it._index<list.length;count++){
    assert(count<2048);const row=list[it._index];
    if([111,411,121,122,123].includes(row.code))it.executeCommand();
    else if(row.code===357&&row.parameters[1]==='FloodFill'){
     const a=row.parameters[3];let routine;c.CoroutineManager={StartAnonymousCoroutine:fn=>routine=fn()};
     c.TileEditor.FloodFillRegion(a.tileID,+a.layer,+a.regionID,+a.x,+a.y,+a.delay/60);
     if(routine)for(let n=0;!routine.next().done;n++)assert(n<1800);
     it._index++;
    }else it._index++; // only presentation/audio and no-position-change jumps remain
   }
   it.clear();refresh();
   if(![71,35].includes(id)){execute(71);execute(35);}
  }
  const guide=createSaltGuide(c);const opened=[],controls=[],trace=[];let stopChecked=false;
  assert(field.command('puzzleGuide'));frame();
  for(let stage=0;stage<48;stage++){
   const view=captureWorld(c),g=guide.review(scene,view.objects);assert(g?.target,'current live guide target');
   const beforeColors=opened.length<4;
   if(beforeColors){assert(g.terrainOnly);assert(!/yellow|blue|green|red|color order/i.test(g.text));}
   else break;
   if(!packets.length){assert(field.command('puzzleGuide'));frame();}
   const packet=packets.shift(),request=packet.request;
   assert.equal(request.event,g.target.id);assert(request.saltTerrainOnly);
   let result;await verifyWorker(f,request,packet.live,r=>{result=r;wire.emit('message',{
    epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});});frame();
   assert(['ready','saltRoute'].includes(result.status),JSON.stringify({request,state:saltState(c),result}));
   assert(!result.actions?.some(id=>[19,20,21,22].includes(id)),'treasure stage never plans a colored press');
   trace.push({stage,pose:[p.x,p.y],state:saltState(c),goal:g.target.id,actions:result.actions,arrival:result.arrival,more:result.more});
   const target=result.status==='saltRoute'?result.actions[0]:g.target.id;
   if(automatic){
    assert(field.autowalk.active(scene),'production guide uses Autowalk '+JSON.stringify({request,result,records:records.slice(-3)}));
    if(!stopChecked){
     assert(field.command('puzzleStop'));assert(!field.autowalk.active(scene));stopChecked=true;
     assert(field.command('puzzleGuide'));frame();continue;
    }
    for(let steps=0;field.autowalk.active(scene)&&steps<512;steps++)tick();
    assert(!field.autowalk.active(scene),'course stops for player interaction');
   }else for(const leg of result.legs)for(let step=0;step<leg.tiles;step++){
    assert(p.canPass(p.x,p.y,leg.direction),'each suggested tile uses native collision');
    p.moveStraight(leg.direction);p._realX=p._x;p._realY=p._y;
   }
   if(p.x!==result.arrival.x||p.y!==result.arrival.y)continue;
   const spoken=records.findLast(r=>r.kind==='routeDirections');
   assert(spoken?.puzzleGuidance);assert.equal(spoken.verbosePuzzleGuidance,verbose);
   if(verbose && spoken.legs.length)assert(formatSpeech(spoken).indexOf('Salt Caverns')>0);
   if(!verbose)assert(!/chests collected|Color order|More steps follow/.test(formatSpeech(spoken)));
   const actor=map.event(target),waiting=packets.length;
   for(let idle=0;idle<60;idle++){tick();field.observeReady(scene);}
   assert(!actor.isStarting(),'guide never activates a crystal/chest');assert.equal(packets.length,waiting);
   if(result.arrival.facing)p.setDirection(result.arrival.facing);
   p.checkEventTriggerHere([0]);if(!actor.isStarting())p.checkEventTriggerThere([0]);
   assert(actor.isStarting(),'native player Confirm reaches the suggested interaction');
   field.leave(scene,target);scene._wqaFieldReady=false;
   if([36,120,68,49].includes(target)){
    const prior=saltState(c).mask;execute(target);controls.push(target);assert.notEqual(saltState(c).mask,prior);
   }else{
    assert([3,4,5,6].includes(target));Object.assign(it,{_mapId:19,_eventId:target});it.command123(['A',0]);refresh();opened.push(target);
   }
   assert(guide.observe(scene),'native crystal/consumed flags proactively update progress');
   scene._wqaFieldReady=true;field.observeReady(scene);frame();
   assert.equal(packets.length,1,'production ready hook proactively requests the next actual step');
  }
  assert.deepEqual(opened,[6,5,4,3],JSON.stringify(trace.slice(-10)));assert([36,120,68,49].every(id=>controls.includes(id)),JSON.stringify(controls));
  const final=guide.review(scene,captureWorld(c).objects);
  assert(!/Color order/.test(final.text),'treasure flags alone do not invent reaching final colors');
  p.setPosition(30,16);const colors=guide.review(scene,captureWorld(c).objects);
  assert.match(colors.text,/yellow, blue, green, then red/);assert.equal(colors.target.id,19);
  // Current native flags, not remembered button counts, own free-roam resume.
  execute(120);assert(guide.observe(scene));execute(120);assert(guide.observe(scene));
  c.$gameSelfSwitches.setValue([19,5,'A'],false);refresh();
  const backtrack=guide.review(scene,captureWorld(c).objects);assert.equal(backtrack.target.id,5);assert(!/color order/i.test(backtrack.text));
  c.$gameSelfSwitches.setValue([19,5,'A'],true);vars.set(3,2);switches.add(29);switches.add(27);
  const resume=guide.review(scene,captureWorld(c).objects);assert.equal(resume.target.id,21);
  guide.stop(scene);execute(36);assert(!guide.observe(scene),'stopped guidance stays silent');
  field.leave(scene);
  console.log(`Verified ${automatic?'automatic-course':'manual'} Salt guide: native flood branches, all four terrain controls/four chests, no early colors, roaming/repeated toggles, partial-color resume and stop.`);
 }}finally{Object.assign(c,saved);c.SceneManager._scene=sceneBefore;c.Graphics.app=app;
  c.$gameSwitches.value=sv;c.$gameSwitches.setValue=ss;c.$gameVariables.value=vv;c.$gameVariables.setValue=vs;
  c.$gameSelfSwitches.value=lv;c.$gameSelfSwitches.setValue=ls;}
};
