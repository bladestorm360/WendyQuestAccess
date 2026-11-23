'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { captureWorld } = require('../src/world/snapshot');
const { composeWorld, indexOf, offset, step, DIRECTIONS } = require('../src/world/geometry.cjs');
const baselinePath=process.argv.find(a=>a.startsWith('--audit-baseline='))?.slice(17);
const { solveWorldRoute, routeGoals } = require(baselinePath || '../src/world/routes.cjs');

function required(map, event, page) {
    const q = page.conditions, switches = [], self = [], variables = {};
    if (q.switch1Valid) switches.push(q.switch1Id);
    if (q.switch2Valid) switches.push(q.switch2Id);
    if (q.selfSwitchValid) self.push([map,event,q.selfSwitchCh].join(','));
    if (q.variableValid) variables[q.variableId] = q.variableValue;
    return { switches, self, variables, items: q.itemValid ? [q.itemId] : [], actors: q.actorValid ? [q.actorId] : [] };
}
function merge(a,b) {
    const union = key => [...new Set([...(a[key] || []),...(b[key] || [])])].sort();
    const variables = {...a.variables};
    for (const [key,value] of Object.entries(b.variables || {})) variables[key] = Math.max(variables[key] || 0,value);
    return {switches:union('switches'),self:union('self'),variables,items:union('items'),actors:union('actors')};
}
function hasAction(page) { return page.list.length > 1 && [0,1,2].includes(page.trigger); }
function floor(page) { return hasAction(page) && page.priorityType !== 1 && page.trigger !== 0; }
function floorTable(world, normal = false) {
    const stops = new Uint16Array(world.cells.length);
    for (const event of world.events) {
        if (event.erased || !event.action || event.normal !== normal || ![1,2].includes(event.trigger)) continue;
        const [left,top,right,bottom] = event.rectangle || [event.x,event.y,event.x,event.y];
        for(let y=Math.max(0,top);y<=Math.min(world.height-1,bottom);y++)
            for(let x=Math.max(0,left);x<=Math.min(world.width-1,right);x++)
                if (!stops[y*world.width+x]) stops[y*world.width+x]=event.id;
    }
    return stops;
}
function settleBlockers(f) {
    // These native parallel setup pages share the same constant, unconditional
    // SetBlocker command. Invoke the original function without running dialogue.
    for (const event of f.gameMap.events()) {
        const page=event.page();
        if (page?.trigger !== 4) continue;
        for (const command of page.list) if (command.code===357 && command.indent===0 && command.parameters[1]==='SetBlocker') {
            const q=command.parameters[3];
            assert([q.minX,q.minY,q.maxX,q.maxY].every(value=>Number.isFinite(+value)));
            event.SetBlocker(+q.minX,+q.minY,+q.maxX,+q.maxY);
        }
    }
}
function verifyPrefix(f,world,stops,request,result) {
    assert.equal(result.status,'interrupted');
    let {x,y}=request;
    for(const leg of result.legs) for(let n=0;n<leg.tiles;n++) {
        assert(f.player.canPass(x,y,leg.direction));
        x=f.gameMap.roundXWithDirection(x,leg.direction);y=f.gameMap.roundYWithDirection(y,leg.direction);
        assert.equal(stops[indexOf(world,x,y)],0,'never walk across the first native floor event');
    }
    assert.deepEqual([x,y],[result.arrival.x,result.arrival.y]);
    assert(f.player.canPass(x,y,result.boundary));
    const nx=f.gameMap.roundXWithDirection(x,result.boundary),ny=f.gameMap.roundYWithDirection(y,result.boundary);
    assert.equal(stops[indexOf(world,nx,ny)],result.boundaryEvent);
    f.player.setPosition(nx,ny);
    for(const event of f.gameMap.events()) event._starting=false;
    f.player.checkEventTriggerHere([1,2]);
    assert.equal(f.gameMap.events().find(event=>event.isStarting())?._eventId,result.boundaryEvent);
}
async function audit(c,load,snapshot,read) {
    const startTime=performance.now(), findings=[], maps=[], unique=new Map();
    let pages=0,floors=0,statesChecked=0,covered=0,routes=0,validPrefixes=0,nativeEdges=0;
    const infos=read('MapInfos.json');
    const oldItems=c.$gameParty.hasItem,oldMembers=c.$gameParty.members;
    try { for(let mid=1;mid<infos.length;mid++) {
        let data;
        try {data=read(`Map${String(mid).padStart(3,'0')}.json`);} catch(error) {if(error.code==='ENOENT')continue;throw error;}
        maps.push(mid);
        const variants=new Map(), targets=[], floorPages=[];
        const add=state=>variants.set(JSON.stringify(state),state);
        add(merge({},{}));
        for(const event of data.events) if(event) for(const [pi,page] of event.pages.entries()) {
            pages++;
            if(!hasAction(page))continue;
            const row={event,page,pi,state:required(mid,event.id,page)};
            targets.push(row);add(row.state);
            if(floor(page)){floors++;floorPages.push(row);}
        }
        // Pair minimal native conditions only where one floor can cover an
        // action/counter/waypoint approach. No future progression is executed.
        for(const f of floorPages) for(const t of targets) if(f.event.id!==t.event.id &&
            Math.abs(f.event.x-t.event.x)+Math.abs(f.event.y-t.event.y)<=2) add(merge(f.state,t.state));
        const seen=new Set();
        for(const state of variants.values()) {
            c.$gameParty.hasItem=item=>state.items.includes(item?.id);
            c.$gameParty.members=()=>state.actors.map(id=>c.$gameActors.actor(id));
            const f=load(mid,state);settleBlockers(f);
            f.player.setPosition(0,0);
            const live=snapshot(f),key=JSON.stringify(live.events);
            if(seen.has(key))continue;
            seen.add(key);statesChecked++;
            const world=composeWorld(f.geometry,live),stops=floorTable(world);
            const objects=captureWorld(c,true,undefined,undefined,[],false,true)?.objects || [];
            if(!stops.some(Boolean))continue;
            for(const target of live.events) {
                if(target.erased || !target.action || ![0,1,2].includes(target.trigger))continue;
                const requests=[{event:target.id}, {event:target.id,waypoint:true}];
                if(target.normal && target.trigger!==0) requests.push({event:target.id,bumpDirections:15});
                if(!target.normal && target.trigger!==0) for(const direction of DIRECTIONS)
                    requests.push({event:target.id,entryDirection:direction});
                for(const spec of requests) {
                    const goals=routeGoals(world,spec,()=>false,spec.bumpDirections ? {bump:floorTable(world,true)} : undefined);
                    if(spec.entryDirection) {
                        const cell=indexOf(world,target.x,target.y),heading=DIRECTIONS.indexOf(spec.entryDirection);
                        const before=offset(world,cell,3-heading);
                        if(!goals || goals[cell]!==1 || before<0 || step(world,before,heading)!==cell)continue;
                        goals.fill(0);goals[before]=1;
                    }
                    if(!goals)continue;
                    for(let cell=0;cell<goals.length;cell++) {
                        if(!goals[cell] || !stops[cell] || (!spec.waypoint && stops[cell]===target.id))continue;
                        covered++;
                        for(let heading=0;heading<4;heading++) {
                            const near=offset(world,cell,3-heading),origin=offset(world,near,3-heading);
                            if(near<0 || origin<0 || stops[origin] || world.blocked[origin] ||
                                step(world,origin,heading)!==near || step(world,near,heading)!==cell)continue;
                            const request={...spec,x:origin%world.width,y:Math.floor(origin/world.width),field:true};
                            const physical=solveWorldRoute(world,{...request,field:false});
                            if(physical.status!=='ready')continue;
                            routes++;
                            const result=solveWorldRoute(world,request);
                            for(const [from,dir] of [[origin,heading],[near,heading]]) {
                                assert.equal(step(world,from,dir)>=0,f.player.canPass(from%world.width,Math.floor(from/world.width),DIRECTIONS[dir]));nativeEdges++;
                            }
                            if(result.status==='interrupted') {verifyPrefix(f,world,stops,request,result);validPrefixes++;}
                            else if(['unreachable','approachBlocked'].includes(result.status)) {
                                const finding={map:mid,target:target.id,page:f.gameMap.event(target.id)._pageIndex,
                                    floor:stops[cell],floorPage:f.gameMap.event(stops[cell])._pageIndex,request,state,status:result.status};
                                const k=[mid,target.id,stops[cell],spec.waypoint?'waypoint':spec.bumpDirections?'bump':'action',spec.entryDirection||0].join(':');
                                if(!unique.has(k))unique.set(k,finding);
                                finding.production=objects.filter(o=>o.id===target.id && !!spec.waypoint===(o.waypoint===true||o.quest?.waypoint===true) &&
                                    !!spec.bumpDirections===(o.eventAction==='bump') && spec.entryDirection===o.entryDirection).map(o=>({name:o.name,category:o.category,
                                    handoffs:o.handoffs,status:solveWorldRoute(world,{...request,handoffs:o.handoffs}).status}));
                                findings.push(finding);
                            } else assert.equal(result.status,'ready');
                        }
                    }
                }
            }
        }
        if(mid%40===0)console.log(`Audited maps through ${mid}: ${statesChecked} native page configurations, ${routes} covered-approach routes.`);
    }} finally {c.$gameParty.hasItem=oldItems;c.$gameParty.members=oldMembers;}
    const report={maps:maps.length,pages,floorPages:floors,statesChecked,covered,routes,validPrefixes,nativeEdges,
        failingReplays:findings.length,unique:[...unique.values()],elapsedMs:performance.now()-startTime};
    const output=process.argv.find(a=>a.startsWith('--audit-output='))?.slice(15);
    if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,uniqueCount:report.unique.length,unique:undefined}));
    assert.equal(maps.length,239);assert.equal(pages,6527);assert.equal(floors,1139);
    if(process.argv.includes('--event-audit-green'))assert.equal(findings.length,0);
}
async function verify(c,load,snapshot,read,verifyWorker) {
    const rows=[[15,62,68,8,41,16],[117,11,15,8,10,16],[134,9,20,7,8,450],
        [201,8,9,3,27],[201,10,11,10,17],[201,16,27,16,13],[201,17,28,22,13],[201,18,29,28,19]];
    for(const [mid,event,floorId,x,y,sw] of rows) {
        const f=load(mid,{switches:sw?[sw]:[]});settleBlockers(f);f.player.setPosition(x,y);
        const target=captureWorld(c).objects.find(o=>o.id===event);assert(target);
        const request={x,y,event,field:true,bumpDirections:target.eventAction==='bump'?15:undefined};
        const live=snapshot(f),world=composeWorld(f.geometry,live),stops=floorTable(world);
        const result=solveWorldRoute(world,request);assert.equal(result.boundaryEvent,floorId);
        verifyPrefix(f,world,stops,request,result);
        f.player.setPosition(x,y);
        for(const autowalk of [false,true]) await verifyWorker(f,{...request,autowalk,limit:1},live,out=>{
            assert.equal(out.status,'interrupted');assert.equal(out.boundaryEvent,floorId);
            assert.deepEqual(out.arrival,result.arrival);
            if(autowalk)assert.equal(out.course.length,result.distance);
        });
    }
    // A current floor may also cover an oriented entrance predecessor, a
    // counter approach or a bookmark. Exercise first-event ordering and real
    // walls separately from native map-state inventory.
    const {PASSAGE,COUNTER}=require('../src/world/geometry.cjs');
    const geometry={width:7,height:1,scrollType:0,cells:new Uint8Array(7).fill(PASSAGE)};
    const live={mode:'walk',through:false,terrain:[],vehicles:[],events:[
        {id:1,x:6,y:0,normal:true,through:false,trigger:0,action:true},
        {id:2,x:5,y:0,normal:false,through:true,trigger:1,action:true},
        {id:3,x:2,y:0,normal:false,through:true,trigger:1,action:true}]};
    const solve=require('../src/world/routes.cjs').solveRoute;
    const request={x:0,y:0,event:1,field:true};
    assert.equal(solve(geometry,live,request).boundaryEvent,3,'first event wins, including before a covered final goal');
    live.events.pop();assert.equal(solve(geometry,live,request).boundaryEvent,2);
    geometry.cells[5]|=COUNTER;
    assert.equal(solve(geometry,live,request).status,'ready','an unobstructed native counter approach wins');
    geometry.cells[5]&=~COUNTER;
    live.events[0]={id:1,x:6,y:0,normal:false,through:true,trigger:1,action:true};
    assert.equal(solve(geometry,live,{...request,entryDirection:6}).boundaryEvent,2);
    assert.equal(solve(geometry,live,{x:0,y:0,targetX:5,targetY:0,field:true}).boundaryEvent,2);
    live.events[1].erased=true;
    assert.equal(solve(geometry,live,{...request,entryDirection:6}).status,'ready');
    live.events[1].erased=false;
    live.events.push({id:4,x:3,y:0,normal:false,through:false,rectangle:[3,0,4,0],trigger:3,action:false});
    assert(['unreachable','approachBlocked'].includes(solve(geometry,live,request).status),'a real rectangular gate remains blocked');
    assert.equal(solve(geometry,live,request,()=>true).status,'cancelled');
    console.log('Verified8 production target cases with16 manual/automatic worker jobs, actual native floor activation, counter preference, oriented entry, bookmarks, first-event order, erasure, rectangular gates and cancellation.');
}
module.exports={audit,verify,verifyPrefix,floorTable,settleBlockers};
