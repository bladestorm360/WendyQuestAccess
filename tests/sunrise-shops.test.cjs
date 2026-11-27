'use strict';
const assert=require('node:assert/strict');
const {c,load,read}=require('./world.test.cjs');
const {eventTarget}=require('../src/world/snapshot');
const {mapPlace,sunriseShopName}=require('../src/world/map-banner');
const expected={149:'Sunrise Bay coffee mud baths',150:"Helly's Surf Shop",151:'Sunrise Bay bookshop'};
for(const [door,id]of [[61,149],[62,150],[63,151]])for(const spoilers of [false,true]){
 load(76);const event=c.$gameMap._events[door],entry=c.$dataMap.events[door],page=entry.pages[event._pageIndex];
 assert(page.list.some(row=>row.code===201&&row.parameters[1]===id));
 const target=eventTarget(c,'walk',event,entry,page,spoilers);
 assert.equal(target.name,expected[id]);assert.equal(target.category,'exits');
 load(id);assert.equal(mapPlace(c),expected[id]);assert.equal(sunriseShopName(id),expected[id]);
}
const lines=id=>read(`Map${id}.json`).events.filter(Boolean).flatMap(e=>e.pages.flatMap(p=>p.list)).filter(r=>r.code===401).map(r=>r.parameters[0]).join(' ');
assert.match(lines(149),/coffee mud baths/);assert.match(lines(150),/Helly's Surf Shop/);
assert.match(lines(151),/run the till/);assert.match(lines(151),/book on roasting/);
assert.equal(sunriseShopName(148),'');assert.equal(sunriseShopName(152),'');
console.log('All three native Sunrise Bay shop transfers/interiors agree in both spoiler modes; bookshop uses the inspected bookcase/stacks/counter and native till/book interactions.');
