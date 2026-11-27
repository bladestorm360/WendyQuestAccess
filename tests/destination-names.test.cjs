'use strict';
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const {numberDestinations,destinationName}=require('../src/world/destination-names');
const {createDestinationBrowser,browse}=require('../src/world/destinations');
const {captureWorld}=require('../src/world/snapshot');
const {c,load}=require('./world.test.cjs');
const map={_mapId:1},items=[
 {id:20,name:'Chest',category:'treasure',x:1,y:0},{id:5,name:'Chest',category:'treasure',x:8,y:0},
 {id:5,name:'Chest',category:'quests',x:8,y:0},{id:9,name:'Barrel',category:'objects',x:2,y:0},
 {id:12,name:'Barrel',category:'objects',x:7,y:0},{id:1,name:'Kathryn',category:'people',x:6,y:0},
 {id:2,name:'Kathryn',category:'merchants',x:6,y:1},{id:3,name:'Scene trigger',category:'events',x:2,y:1},
 {id:4,name:'Scene trigger',category:'events',x:2,y:2},{id:'bookmark-a',name:'Chest',category:'bookmarks'}];
const ids=items.map(i=>i.id);numberDestinations(map,items);
assert.deepEqual(items.map(i=>i.name),['Chest 2','Chest 1','Chest 1','Barrel 1','Barrel 2','Kathryn 1','Kathryn 2','Scene trigger 1','Scene trigger 2','Chest']);
assert.deepEqual(items.map(i=>i.id),ids);assert.equal(destinationName(map,20,'Chest'),'Chest 2');
assert.equal(destinationName(map,3,'Beach conversation'),'Beach conversation','a private name cannot inherit public generic permission');
map._mapId=2;assert.equal(destinationName(map,20,'Chest'),'Chest');map._mapId=1;
const browser=createDestinationBrowser(),snap={map:1,x:0,y:0,width:20,height:5,scrollType:0,objects:items.filter(i=>i.category==='treasure')};
let chosen=browse(browser,snap,[]);const first=chosen.target||chosen;assert(first);
snap.x=10;browse(browser,snap,['nextDestination']);assert.equal(items.find(i=>i.id===5).name,'Chest 1');
// A single actor duplicated by the quest UI never becomes two actors.
const single=[{id:1,name:'Chest',category:'treasure'},{id:1,name:'Chest',category:'quests'}];numberDestinations(map,single);
assert(single.every(i=>i.name==='Chest'));

c.$gameParty.getNav=()=>null;let total=0,duplicates=0,peak=0,aggregate=0;
for(let id=1;id<=239;id++)for(const spoilers of [false,true]){
 const f=load(id);f.player.setPosition(0,0);
 const at=performance.now(),snapshot=captureWorld(c,false,undefined,undefined,[],false,spoilers),elapsed=performance.now()-at;
 peak=Math.max(peak,elapsed);aggregate+=elapsed;assert(snapshot,`map${id}`);
 const names=new Map();
 for(const target of snapshot.objects){
  if(!Number.isInteger(target.id))continue;total++;
  const previous=names.get(target.name.toLowerCase());assert(previous===undefined||previous===target.id,`ambiguous ${id}: ${target.name}`);
  names.set(target.name.toLowerCase(),target.id);if(/ \d+$/.test(target.name))duplicates++;
 }
 const stable=new Map(snapshot.objects.map(i=>[i.id+'|'+i.category,i.name]));
 f.player.setPosition(Math.max(0,f.map.width-1),Math.max(0,f.map.height-1));
 const moved=captureWorld(c,false,undefined,undefined,[],false,spoilers);
 for(const target of moved.objects)assert.equal(target.name,stable.get(target.id+'|'+target.category),'movement cannot renumber an actor');
}
console.log(JSON.stringify({maps:239,spoilerStates:2,targets:total,numbered:duplicates,capturePeakMs:peak,captureAggregateMs:aggregate}));
console.log('All-map duplicate names are unambiguous and movement-stable; cross-category/quest aliases, generic scene privacy, bookmarks and route target IDs are preserved.');
