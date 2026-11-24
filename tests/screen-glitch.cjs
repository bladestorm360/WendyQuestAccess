"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const cues=require('../src/dialogue/narration-cues.json');
module.exports=(fixture,stock)=>{
 const native=JSON.parse(execFileSync('python',['tests/glitch-producers.py',stock],{encoding:'utf8',timeout:6000}));
 const data=path.join(stock,'package.nw/data'),read=name=>JSON.parse(fs.readFileSync(path.join(data,name),'utf8'));
 const common=read('CommonEvents.json'),troops=read('Troops.json'),sites=[];
 let pages=0;
 for(const filename of fs.readdirSync(data).filter(n=>/^Map\d+\.json$/.test(n))){
  const m=+filename.slice(3,6),d=read(filename);
  for(const e of d.events.filter(Boolean))for(const [p,page]of e.pages.entries()){
   pages++;for(const [i,row]of page.list.entries())if(row.code===117&&row.parameters[0]===40)sites.push([m,e.id,p,i]);
  }
 }
 assert.deepEqual(native.params,[10,100,0,0,0],'actual native defaults have horizontal displacement and zero RGB split');
 assert.equal(common[40].list[0].parameters[3].filterType,'glitch');
 assert.equal(common[40].list[0].parameters[3].filterTarget,'FullScreenWithWindow');
 assert.equal(common[41].list[0].parameters[1],'eraseFilter');
 function attach(f,battle=false){
  f.root.$dataCommonEvents=common;f.root.$gameParty={inBattle:()=>battle};
  const g=f.nativeMap;g._filterConArr=[];g.mapId=()=>g._mapId;
  const c=vm.createContext({...f.root,Scene_Map:function(){},Game_Map:function(){},Filter_Controller:function(){this.initialize(...arguments);},
   Graphics:f.graphics,Rectangle:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},
   _0x4d4a18:['FullScreenWithWindow'],PIXI:{filters:{DisplacementFilter:function(){}}},_0x5b5f5a(){throw Error('Unresolved native filter token');}});
  for(const [name,source]of Object.entries(native.methods)){
   if(name.includes('.')){const [owner,key]=name.split('.');c[owner].prototype[key]=vm.runInContext('('+source+')',c);}
   else if(!['glitchHandler','apply','remove'].includes(name))c.Filter_Controller.prototype[name]=vm.runInContext('('+source+')',c);
  }
  Object.assign(c.Filter_Controller,{targetType:{FullScreenWithWindow:'FullScreenWithWindow'},defaultFilterParam:{glitch:native.params},
   filterSpecialInit:{},filterNameMap:{glitch:class{constructor(){this.enabled=false;}}},enabledAll:true,
   updateFilterHandler:{glitch:vm.runInContext('('+native.methods.glitchHandler+')',c)}});
  Object.assign(g,c.Game_Map.prototype);
  f.scene.filters=[];f.scene._TKMFilters=[];
  f.scene.getTKMFilterObj=type=>{assert.equal(type,'FullScreenWithWindow');return [f.scene];};
  f.scene.applyTKMFilterToTarget=vm.runInContext('('+native.methods.apply+')',c);
  f.scene.removeTKMFilterFromTarget=vm.runInContext('('+native.methods.remove+')',c);
  f.scene.updateTKMfilters=c.Scene_Map.prototype.updateTKMfilters;
  if(battle){f.scene._wqaBattleStarted=true;f.root.$gameTroop={_troopId:150,_interpreter:f.interpreter};}
  const add=()=>{g.createFilter('rgb','glitch','FullScreenWithWindow',[],null);f.scene.updateTKMfilters();
   const filter=f.scene.filters.at(-1);assert.equal(filter.slices,10);assert.equal(filter.offset,100);
   assert.deepEqual(Array.from(filter.red),[0,0]);return filter;};
  const erase=()=>{g.eraseFilter('rgb');f.scene.updateTKMfilters();};
  const paint=(draw=true)=>{f.graphics.frameCount++;f.narration.glitchPresent(f.scene);f.narration.present(f.scene);if(draw)f.renderer.emit('postrender');};
  return {add,erase,paint,c};
 }
 for(const [m,e,p,i]of sites){
  const f=fixture(m,e,p);f.interpreter._index=i+1;const n=attach(f);n.add();
  n.paint(false);assert.equal(f.played.length,0);f.renderer.emit('postrender');
  assert.equal(f.played[0]?.id,'epilogue-glitch',[m,e,p,i].join('/'));
  n.erase();for(let k=0;k<10;k++)n.paint();assert.equal(f.played.length,1,'one filter never repeats');
  assert(!f.played[0].paused,'effect erasure never interrupts its confirmed description');f.narration.leave(f.scene);
 }
 for(const mode of ['disabled','detached','wrong-type','wrong-target','no-displacement','covered','preload','erased-before-paint']){
  const f=fixture(25,45,0),n=attach(f),filter=n.add();
  if(mode==='disabled')filter.enabled=false;
  if(mode==='detached')f.scene.filters=[];
  if(mode==='wrong-type')filter._controller._filterType='noise';
  if(mode==='wrong-target')filter._controller._targetType='Tile';
  if(mode==='no-displacement')filter._controller.currentParams[1]=0;
  if(mode==='covered')f.status._brightness=0;
  if(mode==='preload')f.scene._wqaPreloads=new Set([{}]);
  n.paint(false);if(mode==='erased-before-paint')n.erase();f.renderer.emit('postrender');
  assert.equal(f.played.length,0,mode+' is not a painted screen glitch');f.narration.leave(f.scene);
 }
 // Cauldron keeps one native controller across its transfer. The new map
 // constructs another PIXI filter from that controller, not another effect.
 for(const event of [37,38,39])for(const painted of [true,false]){
  const f=fixture(58,event,0),n=attach(f);f.interpreter._index=11;
  const rows=f.interpreter._list;
  assert.deepEqual(rows[18].parameters,[0,57,7,4,6,2]);
  const old=n.add();n.paint(painted);assert.equal(f.played.length,painted?1:0);
  f.narration.pause(f.scene);
  const next={...f.scene,filters:[],_TKMFilters:[]};
  next.getTKMFilterObj=()=>[next];
  f.scene=next;f.host.manager._scene=next;f.graphics.app.stage=next;
  f.nativeMap._mapId=57;f.root.$dataMap=read('Map057.json');
  f.interpreter._mapId=57;f.interpreter._eventId=5;
  f.interpreter._list=f.root.$dataMap.events[5].pages[0].list;f.interpreter._index=3;
  next.updateTKMfilters();const recreated=next.filters[0];
  assert.notEqual(recreated,old);assert.equal(recreated._controller,old._controller);
  n.paint();assert.equal(f.played.length,1,'one confirmed effect across native scene recreation');
  f.played[0].emit('ended');n.paint();
  assert.equal(f.played.length,1,'no duplicate queued behind the carried voice');
  n.erase();const fresh=n.add();assert.notEqual(fresh._controller,old._controller);
  n.paint();assert.equal(f.played.length,2,'a genuinely new native effect still speaks');
  f.narration.leave(next);
 }
 // Exact common112 invocations are two pulses of one animation, including
 // every secret battle page. A second real invocation must announce again.
 const battleSites=troops[150].pages.flatMap((page,p)=>page.list.flatMap((r,i)=>r.code===117&&r.parameters[0]===112?[[p,i]]:[]));
 for(const [page,index]of battleSites){
  const f=fixture(25,45,0),n=attach(f,true);f.interpreter._list=troops[150].pages[page].list;f.interpreter._index=index+1;
  for(let episode=0;episode<2;episode++){
   f.interpreter._childInterpreter={_list:common[112].list,_index:2};
   for(let pulse=0;pulse<2;pulse++){n.add();n.paint();n.erase();n.paint();}
   if(episode===0){assert.equal(f.played.length,1);f.played[0].emit('ended');n.paint();}
  }
  assert.equal(f.played.length,2,'each actual common112 invocation is preserved');f.narration.leave(f.scene);
 }
 // The two epilogue pulses share an episode; replay is a new episode.
 {
  const f=fixture(224,1,0),n=attach(f);
  for(let episode=0;episode<2;episode++){
   for(const index of [67,70]){f.interpreter._index=index;n.add();n.paint();n.erase();n.paint();}
   assert.equal(f.played.length,episode+1);f.played.at(-1).emit('ended');n.paint();
  }
  f.narration.leave(f.scene);
 }
 // A filter still visible after the native preload gate reopens is observed
 // then, never during loading. Erased-before-readiness remains silent above.
 {
  const f=fixture(25,45,0),n=attach(f);n.add();f.scene._wqaPreloads=new Set([{}]);n.paint();
  assert.equal(f.played.length,0);f.scene._wqaPreloads.clear();n.paint();
  assert.equal(f.played[0]?.id,'epilogue-glitch');f.narration.leave(f.scene);
 }
 {
  const f=fixture(25,45,0,false),captions=[];
  f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
  f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};
  f.root.Audio=class{constructor(){throw Error('NVDA glitch must not create recorded audio');}};
  const n=attach(f);n.add();n.paint(false);assert.equal(captions.length,0);f.renderer.emit('postrender');
  assert.deepEqual(captions,[cues['epilogue-glitch'].text]);assert.equal(f.played.length,0);f.narration.leave(f.scene);
 }
 const f=fixture(25,45,0),n=attach(f);n.add();n.paint();const first=f.played[0];n.erase();n.add();n.paint();
 assert.equal(f.played.length,1);assert(!first.paused,'a later effect queues behind existing narration');
 first.emit('ended');n.paint();assert.equal(f.played.length,2,'identical captions from separate effects are not content-deduplicated');
 f.narration.leave(f.scene);
 // Bounded idle observation includes unrelated native filters, not just the
 // first positive. This is capped fixture cost, not live-game responsiveness.
 const idle=fixture(25,45,0),m=attach(idle);const filter=m.add();filter._controller._filterType='noise';
 const at=performance.now();for(let i=0;i<600;i++)m.paint();
 assert.equal(idle.played.length,0);console.log('600 bounded native-filter observation frames:',(performance.now()-at).toFixed(2),'ms throttled total.');
 assert.match(cues['epilogue-glitch'].text,/sideways-shifting horizontal strips/);
 console.log(`Verified ${sites.length} direct glitch producers/${pages} map pages and ${battleSites.length} secret battle common112 callers, original native filter creation/update/erase/defaults, postrender gating, burst grouping/replay, hidden/loading negatives and noninterrupting FIFO.`);
};
