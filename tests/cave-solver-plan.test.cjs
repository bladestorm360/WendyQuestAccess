'use strict';
const assert=require('node:assert/strict');
const {PICKUPS,remainingPickups,planCaveStep,createCaveSolver}=require('../src/world/puzzles/cave-solver');
const consumed=new Set();let checkpoint=0;
const root={$gameSystem:{},$gameMap:{_mapId:196,_events:[]},$gameVariables:{value:()=>checkpoint},
    $gameSelfSwitches:{value:key=>consumed.has(key.join(','))},$gamePlayer:{}};
const key=(map,id)=>[map,id,'A'].join(',');
function expect(map,id,transfer){root.$gameMap._mapId=map;assert.deepEqual(planCaveStep(root),{map,id,transfer});}
expect(196,9);consumed.add(key(196,9));expect(196,21);checkpoint=1;expect(196,20,199);
for(const id of [2,34,25,10]){expect(199,id);consumed.add(key(199,id));}
expect(199,26,200);expect(200,6);checkpoint=2;
for(const id of [3,20,12]){expect(200,id);consumed.add(key(200,id));}
expect(200,15);checkpoint=3;expect(200,11,201);expect(201,2,202);root.$gameMap._mapId=202;assert.deepEqual(planCaveStep(root),{complete:true,remaining:0});
root.$gameMap._mapId=197;assert.equal(planCaveStep(root),null);
// Reconcile free roaming/old saves from native flags, rather than continue an old index.
consumed.delete(key(196,9));expect(199,3,196);expect(200,2,199);expect(201,2,202);
root.$gameMap._events[4]={_erased:true};expect(201,2,202);root.$gameMap._mapId=202;assert.deepEqual(planCaveStep(root),{complete:true,remaining:1});root.$gameMap._mapId=197;assert.equal(planCaveStep(root),null);expect(206,11,196);
assert.deepEqual(remainingPickups(root),[[196,9]]);
root.$gameMap._mapId=113;assert.equal(planCaveStep(root),null);
const graphics={},preferences={autowalk:true,caveAutomaticInteractions:false};
const solver=createCaveSolver(root,graphics,()=>preferences);
root.$gameMap._mapId=196;assert(!solver.start());preferences.caveAutomaticInteractions=true;
assert(solver.start());const token=solver.token();const step=solver.next([{id:9,category:'objects'}]);
assert.equal(step.target.id,9);assert(!solver.pending());solver.wake();assert(solver.pending());
root.$gameSystem={};assert(!solver.current(token),'load/new game cannot inherit a previous run');
assert(solver.start());preferences.autowalk=false;assert(!solver.active());
console.log('Native-flag cave order, eight pickups, checkpoints, mid-sequence reconciliation, forward chase escape, chase finish boundary, save identity and default-off gating pass.');
