'use strict';
const assert=require('node:assert/strict');
const {PICKUPS,EXIT_POCKET,remainingPickups}=require('../src/world/puzzles/cave-solver');
function verifySolverJourneys(h) {
    const {c,field,preferences,solverHarness,start,tick,ask,records,diagnostics}=h;
    const all=Object.entries(PICKUPS).flatMap(([map,ids])=>ids.map(id=>`${map},${id},A`));
    const completed=[];
    function setup(map,x,y,{loot=[],checkpoint=0,intro=true,switches=[]}={}) {
        field.stopCaveSolver();solverHarness.self.clear();solverHarness.variables.clear();solverHarness.switches.clear();
        for(const key of loot)solverHarness.self.add(key);
        if(intro)solverHarness.self.add('196,3,A');
        for(const id of switches)solverHarness.switches.add(id);
        solverHarness.variables.set(90,checkpoint);
        records.length=diagnostics.length=h.accepted.length=0;
        preferences.autowalk=preferences.caveAutomaticInteractions=true;
        c.$gameMessage._fixtureChoice=0;
        start(map,x,y,0,0);
        for(let frame=0;frame<8;frame++)tick();
    }
    function finish(name,{missing=false,onTick}={}) {
        for(let frame=0;frame<50000;frame++) {
            tick();
            onTick?.();
            const failure=records.find(row=>/not currently reachable|Autowalk stopped|unavailable|No safe|No crossing|next cave step|Blocked by/i.test(row.name||''));
            assert(!failure,JSON.stringify({name,failure,at:[c.$gameMap._mapId,c.$gamePlayer.x,c.$gamePlayer.y],last:diagnostics.slice(-5),self:Array.from(solverHarness.self)}));
            if(c.$gameMap._mapId===202 && !c.Graphics._wqaCaveSolverActive && !c.$gameMap._interpreter._list && !c.$gamePlayer.isMoving() && !c.$gamePlayer._moveRouteForcing)break;
        }
        assert.equal(c.$gameMap._mapId,202,JSON.stringify({name,at:[c.$gameMap._mapId,c.$gamePlayer.x,c.$gamePlayer.y],records:records.slice(-4),diagnostics:diagnostics.slice(-5),pending:c.Graphics._wqaCaveSolverPending,active:c.Graphics._wqaCaveSolverActive,source:c.$gameMap._interpreter,remaining:remainingPickups(c),accepted:h.accepted}));
        if(!missing)assert.deepEqual(remainingPickups(c),[]);
        assert(!c.Graphics._wqaCaveSolverActive);
        assert(records.some(row=>row.name?.startsWith('Chase complete.')));
        assert.deepEqual([c.$gamePlayer.x,c.$gamePlayer.y],[8,16]);
        assert(!records.some(row=>row.activate || row.manualHandoff),'no fixture movement/interaction completes an automatic step');
        completed.push(name);
    }
    setup(196,11,49);ask('puzzleGuide');finish('all eight pickups, checkpoints and complete chase');
    setup(206,17,7,{intro:false});ask('puzzleGuide');finish('first entrance, native Yes choice and first-visit dialogue');
    setup(200,9,33,{loot:all.filter(key=>!key.startsWith('200,')),checkpoint:2});ask('puzzleGuide');finish('resume at second checkpoint');
    setup(199,1,33,{loot:all.filter(key=>key.startsWith('199,')||key.startsWith('200,')),checkpoint:1});ask('puzzleGuide');finish('backtrack for missed first-room pickup');
    setup(200,24,8,{loot:all.filter(key=>key!=='200,20,A'),checkpoint:3});
    {
        const reached=new Set(['24,8']),todo=[[24,8]],map=c.$gameMap,player=c.$gamePlayer;
        for(let at=0;at<todo.length;at++)for(const d of [2,4,6,8]) {
            const [x,y]=todo[at];if(!player.canPass(x,y,d))continue;
            const nx=map.roundXWithDirection(x,d),ny=map.roundYWithDirection(y,d),key=[nx,ny].join(',');
            if(!reached.has(key)){reached.add(key);todo.push([nx,ny]);}
        }
        const rows=Array.from({length:EXIT_POCKET.length},(_,y)=>{
            const spans=[];
            for(let x=0;x<c.$dataMap.width;x++)if(reached.has([x,y].join(','))) {
                const prior=spans.at(-1);if(prior && prior[1]===x-1)prior[1]=x;else spans.push([x,x]);
            }
            return spans;
        });
        assert.deepEqual(rows,EXIT_POCKET,'Every admitted exit-pocket tile matches the native connected component');
        console.log('Checkpoint3 native collision reachability '+JSON.stringify([2,5,10,19,20,12,11].map(id=>{const e=map._events[id];return [id,[[0,0],[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy])=>reached.has([e.x+dx,e.y+dy].join(',')))];})));
    }
    ask('puzzleGuide');finish('native one-way last checkpoint preserves missed pickup flag',{missing:true});
    assert.deepEqual(remainingPickups(c),[[200,20]]);
    assert(records.some(row=>row.name==='Chase complete. 1 earlier cave pickup remains.'));
    setup(200,12,6,{loot:all.filter(key=>!['200,3,A','200,20,A','200,12,A'].includes(key)),checkpoint:3});
    ask('puzzleGuide');finish('late checkpoint still collects the reachable barrel',{missing:true});
    assert(c.$gameSelfSwitches.value([200,12,'A']));assert.deepEqual(remainingPickups(c),[[200,3],[200,20]]);
    setup(206,17,7);c.$gameMessage._fixtureChoice=1;ask('puzzleGuide');
    for(let frame=0;frame<600;frame++)tick();
    assert.equal(c.$gameMap._mapId,206);assert(!c.Graphics._wqaCaveSolverActive);
    assert.equal(remainingPickups(c).length,8);assert(!h.accepted.includes(9));
    completed.push('native entrance No stops without repeating prompt');
    setup(196,11,49);ask('puzzleGuide');
    field.autowalk.input(h.getScene(),c.$gamePlayer,0,true);
    assert(!c.Graphics._wqaCaveSolverActive);
    const pose=[c.$gamePlayer.x,c.$gamePlayer.y];
    for(let frame=0;frame<80;frame++)tick();
    assert.deepEqual([c.$gamePlayer.x,c.$gamePlayer.y],pose);assert(!field.autowalk.active(h.getScene()));
    completed.push('manual takeover cancels all stages');
    ask('puzzleGuide');assert(c.Graphics._wqaCaveSolverActive);ask('puzzleStop');
    assert(!c.Graphics._wqaCaveSolverActive);completed.push('puzzle stop cancels');
    setup(201,6,44,{loot:all,checkpoint:3});ask('puzzleGuide');
    let resumed=false;
    finish('resume within chase',{onTick() {
        if(!resumed && h.accepted.includes(11) && c.$gamePlayer.x===9 && c.$gamePlayer.y===17 && field.ready(h.getScene()) && !c.$gamePlayer.isMoving()) {
            c.$gameMap._events[10]._moveRoute=structuredClone(c.$gameMap._events[10]._moveRoute);
            field.cancelAutowalk(h.getScene());ask('puzzleGuide');resumed=true;
        }
    }});
    assert(resumed);
    setup(196,11,49);ask('puzzleGuide');
    let captured=false;
    finish('native capture and reset retains progress',{onTick() {
        if(!captured && c.$gameMap._mapId===196 && c.$gameVariables.value(90)===1 &&
            field.ready(h.getScene()) && !c.$gamePlayer.isMoving()) {
            captured=true;
            c.$gameMap._events[4].start();c.$gameMap.setupStartingEvent();
        }
    }});
    assert(captured);
    console.log('Solver callback/worker-reply fixture costs '+JSON.stringify(h.metrics()));
    console.log('Full native cave solver journeys pass: '+completed.join('; ')+'.');
}
module.exports={verifySolverJourneys};
