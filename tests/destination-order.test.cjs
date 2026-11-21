"use strict";
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { browse, createDestinationBrowser } = require('../src/world/destinations');
const a = { id: 1, category: 'objects', x: 0, y: 0 };
const b = { id: 2, category: 'objects', x: 10, y: 0 };
const c = { id: 3, category: 'objects', x: 20, y: 0 };
const near = { id: 4, category: 'people', x: 9, y: 0 };
const far = { id: 5, category: 'people', x: 30, y: 0 };
const view = { x: 0, y: 0, width: 100, height: 100, scrollType: 0, objects: [a,b,c,near,far] };
const browser = createDestinationBrowser();
const pick = (...changes) => browse(browser, view, changes).target?.id;
assert.equal(pick(), 1);assert.equal(pick('nextDestination'), 2);
view.x = 20;assert.equal(pick(), 2, 'walking and route reads retain the selected identity');
assert.equal(pick('nextDestination'), 3, 'walking does not reverse or re-sort this category');
assert.equal(pick('previousDestination'), 2);
assert.equal(pick('nextCategory'), 5, 'entry chooses the nearest current NPC');
assert.equal(pick('nextDestination'), 4);
view.x = 8;assert.equal(pick('previousCategory'), 2);
assert.equal(pick('previousDestination'), 3, 'cycling wraps in the entry order');
assert.equal(pick('nextCategory'), 4);assert.equal(pick('nextDestination'), 5);
assert.equal(pick('previousCategory'), 2, 're-entry discards the remembered farther object');
assert.equal(pick('nextDestination'), 1);assert.equal(pick('nextDestination'), 3);
view.x = 20;for (let n=0;n<100;n++)assert.equal(pick(),3);
assert.equal(pick('previousDestination'), 1, 'current reads never re-sort the fixed order');
view.objects = view.objects.filter(item => item.id !== 1);
assert.equal(browse(browser,view,[]).status,'Selected destination is unavailable');
assert.equal(pick('nextCategory'), 5);assert.equal(pick('previousCategory'), 3);

const added = createDestinationBrowser();
const changing = { ...view,x:0,objects:[a,b,near] };
assert.equal(browse(added,changing,[]).target,a);
const fresh = {id:6,category:'objects',x:1,y:0};changing.objects.push(fresh);changing.x=10;
assert.equal(browse(added,changing,[]).target,a);
assert.equal(browse(added,changing,['nextDestination']).target,b);
assert.equal(browse(added,changing,['nextDestination']).target,fresh,'new destinations append until category re-entry');
assert.equal(browse(added,changing,['nextCategory','previousCategory']).target,b);

const loop = createDestinationBrowser();
const wrapped = {x:0,y:0,width:10,height:10,scrollType:3,objects:[
    {id:7,category:'objects',x:3,y:0},{id:8,category:'objects',x:9,y:0},
    {id:9,category:'people',x:0,y:9},{id:10,category:'people',x:0,y:3}]};
assert.equal(browse(loop,wrapped,[]).target.id,8);
assert.equal(browse(loop,wrapped,['nextCategory']).target.id,9);
const tied=createDestinationBrowser(),tie={...view,x:10,objects:[a,c,near]};
assert.equal(browse(tied,tie,[]).target,a,'native order breaks equal-distance ties');
tie.objects=[c,a,near];assert.equal(browse(tied,tie,['nextDestination']).target,c,'new snapshots retain the entered order');

const bounded=createDestinationBrowser(),large={...view,x:0,objects:Array.from({length:512},(_,n)=>({id:n,category:'objects',x:n,y:0}))};
browse(bounded,large,[]);const at=performance.now();let peak=0;
for(let n=0;n<200;n++){large.x=n;const start=performance.now();browse(bounded,large,[]);peak=Math.max(peak,performance.now()-start);}
assert.equal(Object.values(bounded.orders).reduce((sum,ids)=>sum+ids.length,0),512);
console.log('Verified nearest category entry, stable movement/route order, per-entry re-ranking, cycling/wrap, native ties and dynamic IDs.');
console.log('Throttled 200 bounded 512-destination current/route reads', (performance.now()-at).toFixed(2),'ms total; peak',peak.toFixed(2),'ms per separate request.');
