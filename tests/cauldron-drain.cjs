"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,commandContext,stock)=>{
 const native=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),'cauldron-drain'],{encoding:'utf8',timeout:6000}));
 for(const nvda of [false,true])for(const [m,e,start,drain]of [[51,2,8,52],[53,3,9,61],[53,4,9,61],[55,4,7,59]]){
  const f=fixture(m,e,0),list=f.interpreter._list,tiles=f.spriteset._tilemap;
  const captions=[],count=()=>nvda?captions.length:f.played.length;
  if(nvda){
   f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
   f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};
   f.root.Audio=class{constructor(){throw Error('NVDA drain must not create recorded audio');}};
  }
  f.spriteset.x=f.spriteset.y=0;tiles.worldVisible=true;
  Object.assign(tiles,{_mapData:f.root.$dataMap.data.slice(),_mapWidth:f.root.$dataMap.width,_mapHeight:f.root.$dataMap.height});
  tiles._readMapData=(x,y,z)=>x<0||y<0||x>=tiles._mapWidth||y>=tiles._mapHeight?0:
   tiles._mapData[(z*tiles._mapHeight+y)*tiles._mapWidth+x];
  const c=commandContext(f);let routine,writes=0;
  Object.assign(c,{TileEditor:{},Tilemap:function(){},Point:class{constructor(x,y){Object.assign(this,{x,y});}},
   Time:{GetDeltaTime:()=>1/60},CoroutineManager:{StartAnonymousCoroutine:create=>{routine=create();}},
   a15_0x363c12(){throw Error('Unexpected native property');},
   Utils:{extractFileName:value=>value},PluginManager:{callCommand(){}},
   WendyQuestAccessScreenJolt:f.narration.environmentStart});
  vm.runInContext('Array.prototype.contains=Array.prototype.includes;',c);
  for(const method of native)vm.runInContext(method,c);
  // Detached publisher keeps the real native flood schedule/region traversal
  // and native SetMapData buffer writes. A0,1 resolves to autotile base2432;
  // exact neighboring autotile shapes are outside this lifetime regression.
  f.nativeMap.setTileId=(x,y,z,tile,clear,autotile)=>{
   assert.equal(tile,'A0,1');assert.equal(clear,false);assert.equal(autotile,true);
   c.Tilemap.prototype.SetMapData.call(tiles,x,y,z,2432);writes++;
  };
  f.interpreter._index=start;
  c.Game_Interpreter.prototype.command357.call(f.interpreter,list[start].parameters);
  assert(f.scene._wqaEnvironmentPending);
  const flood=list[drain].parameters[3];
  const clearAt=list.slice(drain+1).filter(r=>r.code===230).reduce((n,r)=>n+r.parameters[0],0);
  c.TileEditor.FloodFillRegion(flood.tileID,+flood.layer,+flood.regionID,+flood.x,+flood.y,+flood.delay/60);
  assert.equal(f.scene._wqaTerrainWork,1);let done=false,ticks=0,completedAt;
  while(!done||ticks<=clearAt+1){
   if(ticks===clearAt){c.Game_Interpreter.prototype.clear.call(f.interpreter);assert.equal(f.interpreter._list,null);}
   if(!done){done=routine.next().done;if(done)completedAt=ticks;}
   f.frame();if(f.scene._wqaTerrainWork)assert.equal(count(),0,'no observation while native flood work is active');
   assert(++ticks<300,'finite actual native drain episode');
  }
  assert.equal(f.scene._wqaTerrainWork,0);assert(writes>0);
  if(nvda)assert.deepEqual(captions,['The sauce recedes, exposing the floor.']);
  else {assert.equal(f.played[0]?.id,'sauce-drains',`${m}:${e} drain remains visible after native script completion`);assert(!f.played[0].paused);}
  assert.equal(count(),1);
  if(m===55)assert(completedAt>clearAt,'third-room native drain outlasts its event');
  for(let i=0;i<12;i++)f.frame();assert.equal(count(),1);
  console.log(`Cauldron ${m}:${e}: native drain ${completedAt} frames, script waits ${clearAt}, ${writes} published cells, one ${nvda?'NVDA':'recorded'} caption.`);
  f.narration.leave(f.scene);
 }
 // The native clear exception must not admit a different event or map.
 for(const invalid of ['new-list','new-map','new-interpreter','unchanged','replaced-buffer','transition']){
  const f=fixture(55,4,0),tiles=f.spriteset._tilemap;
  f.spriteset.x=f.spriteset.y=0;tiles.worldVisible=true;tiles._mapData=f.root.$dataMap.data.slice();
  f.interpreter._index=7;f.narration.environmentStart(f.scene,f.interpreter);
  f.interpreter._list=null;
  if(invalid==='new-list')f.interpreter._list=[];
  if(invalid==='new-map')f.nativeMap._mapId=56;
  if(invalid==='new-interpreter')f.nativeMap._interpreter={_list:null};
  if(invalid==='replaced-buffer')tiles._mapData=tiles._mapData.slice();
  if(invalid!=='unchanged')tiles._mapData[(f.root.$dataMap.height+3)*f.root.$dataMap.width+5]=2432;
  if(invalid==='transition')f.narration.pause(f.scene);
  f.frame();assert.equal(f.played.length,0,invalid);f.narration.leave(f.scene);
 }
 console.log('Verified all four native cauldron drain schedules, original interpreter clear, changed ready/painted floor, once-only caption and six ownership/visibility/cancellation negatives.');
};
