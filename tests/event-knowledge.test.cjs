"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {contextualEvent,dialoguePresented,completed,commitReady,CONTEXTS,STORE,MAX_SCENES}=require('../src/world/event-knowledge');
const {eventTarget}=require('../src/world/snapshot');
const {questDestinationLabel}=require('../src/world/quest-destinations');
const {worldBoundaryName}=require('../src/world/world-destinations');
const stock=process.argv[2],read=n=>JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data',n),'utf8'));
const native=JSON.parse(execFileSync('python',['-B','tests/event-knowledge-producers.py',stock],{encoding:'utf8',timeout:10000}));
const maps=new Map(),common=read('CommonEvents.json'),infos=read('MapInfos.json');
const map=m=>{if(!maps.has(m))maps.set(m,read('Map'+String(m).padStart(3,'0')+'.json'));return maps.get(m);};
function fixture(m=113,e=145,p=0){
 const data=map(m),entry=data.events[e],page=entry.pages[p],scene={_wqaMapRestored:true,_mapLoaded:true,_started:true,
  _active:true,_fadeDuration:0,_fadeOpacity:0,_wqaFieldReady:true};
 const interpreter={_mapId:m,_eventId:e,_list:page.list};
 const root={$gameSystem:{},$dataMap:data,$dataMapInfos:infos,$dataCommonEvents:common,$gameMap:{_mapId:m,_interpreter:interpreter},
  $gameSwitches:{value:()=>false},$gameSelfSwitches:{value:()=>false},$gameVariables:{value:()=>0},
  $gameMessage:{_wqaSpeakerEvent:e},$gameScreen:{_brightness:255},$gamePlayer:{},SceneManager:{_scene:scene},Graphics:{app:{stage:scene}}};
 const event={_eventId:e,_pageIndex:p,_trigger:page.trigger,_priorityType:page.priorityType,_characterName:page.image.characterName};
 return {root,scene,interpreter,event,entry,page};
}
const target={name:'Scene trigger',category:'events',eventAction:'step',entryDirection:4};
let covered=0;
for(const [key,[label,group]] of Object.entries(CONTEXTS)){
 const [m,e,p]=key.split(':').map(Number),f=fixture(m,e,p);
 assert(f.page&&CONTEXTS[group]);assert(label.length>0&&label.length<=110&&!/[\x00-\x1f]/.test(label));
 assert.equal(contextualEvent(f.root,f.event,target,false),target);
 const named=contextualEvent(f.root,f.event,target,true);
 assert.equal(named.name,label);assert.equal(named.eventAction,target.eventAction);assert.equal(named.entryDirection,4);
 assert(!f.root.$gameSystem[STORE]);
 completed(f.root,f.scene,f.interpreter);
 assert(!f.root.$gameSystem[STORE]); // Native termination copies a receipt only.
 commitReady(f.root,f.scene);
 assert.equal(contextualEvent(f.root,f.event,target,false).name,label);
 assert.equal(f.root.$gameSystem[STORE].ids.length,1);
 assert.equal(questDestinationLabel(f.entry,{page:f.page,trigger:f.page.trigger,map:f.root.$gameMap},named),label);
 covered++;
}
assert.equal(covered,286);
// Inventory every supported map/page using the real classifier. Spoiler naming
// does not add targets, bypass visibility or change categories/actions/identity.
let actual=0;
for(let m=1;m<infos.length;m++){
 if(!infos[m])continue;let data;try{data=map(m);}catch{continue;}
 for(const entry of data.events.filter(Boolean))for(const [p,page]of entry.pages.entries()){
  const f=fixture(m,entry.id,p);let result;
  try{result=eventTarget(f.root,'walk',f.event,entry,page,true);}catch{continue;}
  if(result?.category==='events'){assert(CONTEXTS[m+':'+entry.id+':'+p]);assert(result.eventContext);actual++;}
 }
}
assert.equal(actual,286);
{
 const f=fixture();const generic=eventTarget(f.root,'walk',f.event,f.entry,f.page,false);
 assert.equal(generic.name,'Scene trigger');
 dialoguePresented(f.root,f.scene,{});
 assert.equal(eventTarget(f.root,'walk',f.event,f.entry,f.page,false).name,'Frostyna prevents exploration');
 const original=f.root.$gameSystem;f.root.$gameSystem={};
 assert.equal(eventTarget(f.root,'walk',f.event,f.entry,f.page,false).name,'Scene trigger');
 f.root.$gameSystem=original;assert.equal(eventTarget(f.root,'walk',f.event,f.entry,f.page,false).eventContext,true);
 assert.equal(contextualEvent(f.root,f.event,{name:'Secret',category:'exits'},true).eventContext,undefined);
}
{
 const f=fixture(25,14,0);dialoguePresented(f.root,f.scene,{});
 // Verified duplicate trigger lanes share the scene; future pages do not.
 const alias=Object.keys(CONTEXTS).find(key=>key!=='25:14:0'&&CONTEXTS[key][1]===CONTEXTS['25:14:0'][1]);
 if(alias){const [m,e,p]=alias.split(':').map(Number);assert.equal(m,25);assert.equal(contextualEvent(f.root,{_eventId:e,_pageIndex:p},target,false).eventContext,true);}
 assert.equal(contextualEvent(f.root,{_eventId:14,_pageIndex:1},target,false),target);
 f.event._pageIndex=1; // Actual executing list remains page zero after refresh.
 completed(f.root,f.scene,f.interpreter);commitReady(f.root,f.scene);
 assert.equal(f.root.$gameSystem[STORE].ids.length,1);
}
{
 const groups=new Map();let pair;
 for(const [key,row]of Object.entries(CONTEXTS)){if(groups.has(row[1])){pair=[groups.get(row[1]),key];break;}groups.set(row[1],key);}
 assert(pair);const [m,e,p]=pair[0].split(':').map(Number),[otherMap,otherEvent,otherPage]=pair[1].split(':').map(Number);
 const f=fixture(m,e,p);assert.equal(m,otherMap);assert.equal(p,otherPage);
 assert.deepEqual(f.page.list,map(otherMap).events[otherEvent].pages[otherPage].list);
 dialoguePresented(f.root,f.scene,{});assert.equal(contextualEvent(f.root,{_eventId:otherEvent,_pageIndex:otherPage},target,false).eventContext,true);
}
for(const [object,field,value]of [['scene','_wqaMapRestored',false],['scene','_started',false],['scene','_wqaPreloads',new Set([1])],
 ['scene','_wqaTerrainWork',true],['scene','_fadeDuration',5],['scene','_fadeOpacity',255],['player','_transferring',true],
 ['screen','_brightness',0],['manager','_nextScene',{}],['manager','_wqaNativeAutosaves',1],['graphics','_wqaResize',true]]){
 const f=fixture(),o={scene:f.scene,player:f.root.$gamePlayer,screen:f.root.$gameScreen,manager:f.root.SceneManager,graphics:f.root.Graphics}[object];
 o[field]=value;dialoguePresented(f.root,f.scene,{});completed(f.root,f.scene,f.interpreter);commitReady(f.root,f.scene);
 assert(!f.root.$gameSystem[STORE],field);
}
{
 const f=fixture();completed(f.root,f.scene,{...f.interpreter});commitReady(f.root,f.scene);assert(!f.root.$gameSystem[STORE]);
 f.root.$gameMessage._wqaSpeakerEvent=2;dialoguePresented(f.root,f.scene,{});assert(!f.root.$gameSystem[STORE]);
 completed(f.root,f.scene,f.interpreter);f.scene._wqaFieldReady=false;commitReady(f.root,f.scene);assert(!f.root.$gameSystem[STORE]);
 f.scene._wqaFieldReady=true;commitReady(f.root,f.scene);assert(f.root.$gameSystem[STORE]);
}
for(const bad of [{version:2,ids:['113:145:0']},{version:1,ids:Array(MAX_SCENES+1).fill('113:145:0')},
 {version:1,ids:['unknown','25:14:1','25:14:1',{}]}]){
 const f=fixture();f.root.$gameSystem[STORE]=bad;
 assert.equal(contextualEvent(f.root,f.event,target,false),target);
 dialoguePresented(f.root,f.scene,{});assert.equal(new Set(f.root.$gameSystem[STORE].ids).size,f.root.$gameSystem[STORE].ids.length);
 assert(f.root.$gameSystem[STORE].ids.every(id=>CONTEXTS[id]));
}
{
 const f=fixture(113,90,0);f.root.$gameMap._events=[];f.root.$gameMap._events[90]=f.event;
 assert.equal(worldBoundaryName(f.root,90,false),'Discovery marker');
 assert.equal(worldBoundaryName(f.root,90,true),'Discover Secret Island');
 dialoguePresented(f.root,f.scene,{});assert.equal(worldBoundaryName(f.root,90,false),'Discover Secret Island');
}
// Native initialize/new game, native terminate/clear distinction and exact native
// JsonEx serialization validate slot isolation without touching real saves.
{
 const f=fixture(),context=vm.createContext({$gameMap:f.root.$gameMap,SceneManager:f.root.SceneManager,Graphics:f.root.Graphics,
  WendyQuestAccessEventCompleted:(s,i)=>completed(f.root,s,i)});
 vm.runInContext('var window=globalThis;function Game_System(){this.initialize();}function Game_Interpreter(){};'+native.initialize+native.terminate+native.json,context);
 f.root.$gameSystem=vm.runInContext('new Game_System()',context);
 assert(!f.root.$gameSystem[STORE]);
 context.interpreter=f.interpreter;
 vm.runInContext('Game_Interpreter.prototype.terminate.call(interpreter)',context);
 assert.equal(f.interpreter._list,null);assert.equal(f.interpreter._comments,'');assert(!f.root.$gameSystem[STORE]);
 commitReady(f.root,f.scene);assert(f.root.$gameSystem[STORE]);
 context.system=f.root.$gameSystem;
 const saved=vm.runInContext('JsonEx.stringify(system)',context);context.saved=saved;
 const loaded=vm.runInContext('JsonEx.parse(saved)',context);f.root.$gameSystem=loaded;
 assert.equal(contextualEvent(f.root,f.event,target,false).eventContext,true);
 assert.equal(loaded._saveEnabled,true);assert.equal(loaded._battleCount,0);
 f.root.$gameSystem=vm.runInContext('new Game_System()',context);assert.equal(contextualEvent(f.root,f.event,target,false),target);
 f.root.$gameSystem=vm.runInContext('JsonEx.parse(saved)',context);assert.equal(contextualEvent(f.root,f.event,target,false).eventContext,true);
}
const f=fixture();const start=performance.now();for(let i=0;i<10000;i++)contextualEvent(f.root,f.event,target,false);
console.log(JSON.stringify({contexts:covered,nativeClassifications:actual,saveRoundtrip:true,visibilityAndPageIsolation:true,
 cachedLookups10000Ms:performance.now()-start}));
