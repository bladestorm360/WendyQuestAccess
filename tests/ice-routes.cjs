'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {captureWorld}=require('../src/world/snapshot');
const {iceOpensPassage,iceMeltChanges}=require('../src/world/local-destinations');
const {composeWorld,indexOf,step,DIRECTIONS}=require('../src/world/geometry.cjs');
const {solveRoute}=require('../src/world/routes.cjs');
const {routeThroughIce,routeThroughTerrain,meltedEvents}=require('../src/world/terrain-controls.cjs');
module.exports=async function verifyIceRoutes(c,load,snapshot,read,verifyWorker){
    c.$gameParty.inBattle=()=>false;
    const all=[];let excluded=0;
    for(const info of read('MapInfos.json').filter(Boolean)){
        const data=read(`Map${String(info.id).padStart(3,'0')}.json`);
        for(const entry of data.events.filter(Boolean))for(const [pageIndex,page]of entry.pages.entries())
            if(page.list.some(row=>row.code===357&&row.parameters[3]?.animationState==='melt')){
                if(iceOpensPassage(entry,page))all.push({map:info.id,id:entry.id,page:pageIndex});
                else{assert.equal(info.id,1);assert.equal(entry.id,1);excluded++;}
            }
    }
    assert.equal(all.length,46);assert.equal(excluded,1);
    const groups=Map.groupBy?Map.groupBy(all,x=>x.map):all.reduce((m,x)=>(m.has(x.map)?m.get(x.map).push(x):m.set(x.map,[x]),m),new Map());
    let comparisons=0,actions=0,projections=0,replacements=0,encounters=0,routes=0;
    const start=performance.now();
    for(const[map,entries]of groups){
        function prepared(){
            const f=load(map,{self:entries.map(e=>`${map},${e.id},A`)});
            f.player._x=0;f.player._y=0;
            for(const item of entries){const box=f.map.events[item.id].pages[0].list.find(row=>row.code===357&&row.parameters[1]==='SetBlocker').parameters[3];
                f.gameMap.event(item.id).SetBlocker(+box.minX,+box.minY,+box.maxX,+box.maxY);}
            return f;
        }
        function parity(f,live){
            const world=composeWorld(f.geometry,live);
            for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++)for(let h=0;h<4;h++){
                assert.equal(step(world,indexOf(world,x,y),h)>=0,f.player.canPass(x,y,DIRECTIONS[h]),`native map${map} at${x},${y}/${DIRECTIONS[h]}`);comparisons++;}
            return world;
        }
        let f=prepared(),live=captureWorld(c,true,undefined,undefined,[],true).live;
        const world=parity(f,live);
        assert.equal(live.events.filter(e=>e.meltable).length,entries.length);
        for(const item of entries){
            f=prepared();live=captureWorld(c,true,undefined,undefined,[],true).live;
            const ice=live.events.find(e=>e.id===item.id);assert(ice.meltable);assert(ice.rectangle);
            const current=composeWorld(f.geometry,live);let witness;
            const[l,t,r,b]=ice.rectangle;
            for(let y=Math.max(0,t-1);y<=Math.min(current.height-1,b+1)&&!witness;y++)for(let x=Math.max(0,l-1);x<=Math.min(current.width-1,r+1)&&!witness;x++){
                const cell=indexOf(current,x,y);if(current.blocked[cell]||!(current.cells[cell]&15))continue;
                const result=solveRoute(f.geometry,live,{x,y,event:item.id,field:true});
                if(result.status==='ready')witness={x,y,result};
            }
            assert(witness,`No native action approach to map${map} ice${item.id}`);
            let{x,y}=witness;
            for(const leg of witness.result.legs)for(let n=0;n<leg.tiles;n++){
                assert(f.player.canPass(x,y,leg.direction));x=f.gameMap.roundXWithDirection(x,leg.direction);y=f.gameMap.roundYWithDirection(y,leg.direction);}
            Object.assign(f.player,{_x:x,_y:y,facing:witness.result.arrival.facing});
            for(const actor of f.gameMap.events())actor._starting=false;
            f.player.checkEventTriggerThere([0,1,2]);assert(f.gameMap.event(item.id).isStarting());actions++;
            const projected=meltedEvents(f.geometry,live.events,[ice],1),after=composeWorld(f.geometry,{...live,events:projected});
            let goal;
            for(let gy=t;gy<=b&&!goal;gy++)for(let gx=l;gx<=r&&!goal;gx++){
                const cell=indexOf(after,gx,gy);if(cell<0||after.blocked[cell]||!(after.cells[cell]&15))continue;
                const request={x:witness.x,y:witness.y,targetX:gx,targetY:gy,field:true};
                if(solveRoute(f.geometry,{...live,events:projected},request).status!=='ready')continue;
                const route=routeThroughIce(f.geometry,live,request,()=>false);
                assert(route&&['iceRoute','interrupted'].includes(route.status),`Missing ice route map${map}/${item.id}`);goal=request;routes++;
            }
            // Run the original native relocation, then mirror only the pinned
            // erase state (as existing movement fixtures do). No game executes.
            const changes=iceMeltChanges(f.map.events[item.id],f.map.events[item.id].pages[1]);
            if (changes.relocate || changes.clears) {
                await verifyWorker(f, goal, live, result => assert(['iceRoute','interrupted'].includes(result.status)));
            }
            if(changes.relocate){
                const[id,nx,ny]=changes.relocate;
                const script=Object.assign(new c.Game_Interpreter(),{_mapId:map,_eventId:item.id});
                script.command203([id,0,nx,ny,0]);replacements++;
                const moved=projected.find(e=>e.id===id);assert.equal(moved.x,nx);assert.equal(moved.y,ny);
                assert.equal(moved.normal,live.events.find(e=>e.id===id).normal,'revealed chest retains real native collision');
            }
            for(const id of[item.id,...changes.clears||[]])Object.assign(f.gameMap.event(id),{_erased:true,_through:true,_priorityType:0});
            if(changes.clears)encounters++;
            f.gameMap.refreshTileEvents();parity(f,{...live,events:projected});projections++;
            assert.equal(routeThroughIce(f.geometry,live,{...goal,mode:'walk'},()=>true)?.status,'cancelled');
        }
    }
    assert.equal(actions,46);assert.equal(projections,46);assert.equal(routes,46);assert.equal(replacements,4);assert.equal(encounters,1);
    // A floor event before the ice is the first manual handoff. Recheck only
    // after native progression, then the ordinary ice/encounter route resumes.
    const state={switches:[1,2,3,4,5,6,7,8,9,10,11,15,20,21,22,24,25,30,31,111,112,120,141,142,160,321,479],
        self:['16,51,A','16,24,C','16,24,B','16,46,A','16,28,A']};
    let f=load(16,state);f.player._x=22;f.player._y=9;const ice=f.gameMap.event(51);ice.SetBlocker(-1,-1,1,0);
    // Native post-battle pages retire these actors before control returns.
    for(const id of[24,26,28,29,31,32,33,35,36,38,39,42,43,44,45,46,48,49])
        Object.assign(f.gameMap.event(id),{_erased:true,_through:true,_priorityType:0});
    let live=captureWorld(c,true,undefined,undefined,[],true).live;
    for(const[x,y]of[[22,9],[23,16]]){
        const request={x,y,event:22,field:true};assert.equal(solveRoute(f.geometry,live,request).status,'unreachable');
        const result=routeThroughTerrain(f.geometry,live,request,undefined,()=>false);
        assert.equal(result.status,'interrupted');assert.equal(result.boundaryEvent,27);assert.equal(result.boundary,6);
        assert.deepEqual(result.arrival,{x:23,y:16,facing:null});
        await verifyWorker(f,request,live,reply=>{assert.equal(reply.status,'interrupted');assert.equal(reply.boundaryEvent,27);});
    }
    Object.assign(f.gameMap.event(27),{_erased:true,_through:true,_priorityType:0});
    Object.assign(f.gameMap.event(50),{_erased:true,_through:true,_priorityType:0});
    live=captureWorld(c,true,undefined,undefined,[],true).live;
    const afterEvent=routeThroughTerrain(f.geometry,live,{x:25,y:16,event:22,field:true},undefined,()=>false);
    assert.equal(afterEvent.status,'iceRoute');assert.equal(afterEvent.event,51);
    assert.equal(routeThroughIce(f.geometry,{...live,mode:'ship'},{x:25,y:16,event:22,field:true},()=>false),null);
    assert.throws(()=>meltedEvents(f.geometry,[{id:1}],[{id:1,meltChanges:{relocate:[2,-1,0]}}],1),/placement/);
    console.log(`All-map ice audit:46 playable melts on${groups.size} maps,46 native action approaches/after-melt collision models,${routes} newly open local targets,4 chest replacements,1 native encounter,${comparisons} directed native comparisons;${(performance.now()-start).toFixed(1)} ms throttled.`);
};
