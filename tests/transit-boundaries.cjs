'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {captureWorld,eventTarget}=require('../src/world/snapshot');
const {createField}=require('../src/world/field');
const {createTransferBookmarks}=require('../src/world/transfer-bookmarks');
const {createLocalDetour}=require('../src/world/local-detour');
const {pageMayTransfer}=require('../src/world/transfer-events.cjs');
const {solveRoute,routeApproachPoints}=require('../src/world/routes.cjs');
const {composeWorld,indexOf,DIRECTIONS}=require('../src/world/geometry.cjs');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
    c.$dataCommonEvents=read('CommonEvents.json');
    require('./transit-gates.cjs')(c,load,read);
    const row=(code,parameters=[])=>({code,parameters});
    assert(pageMayTransfer({list:[row(201)]},[]));
    assert(pageMayTransfer({list:[row(117,[1])]},[null,{list:[row(201)]}]));
    assert(!pageMayTransfer({list:[row(117,[1])]},[null,{list:[row(117,[1]),row(121)]}]));
    assert(pageMayTransfer({list:Array.from({length:2049},()=>row(0))},[]));
    let routes=0,edges=0;
    for(const origin of [[8,38],[7,29],[14,17],[43,29]]) {
        const f=load(113,{switches:[33,38]}),p=f.player;p.setPosition(...origin);
        const snap=captureWorld(c),live=snap.live,world=composeWorld(f.geometry,live);
        const terminalCells=new Set();
        for(const e of live.events.filter(e=>e.mapTransfer&&e.action&&!e.erased)) {
            const b=e.rectangle||[e.x,e.y,e.x,e.y];
            for(let y=b[1];y<=b[3];y++)for(let x=b[0];x<=b[2];x++)terminalCells.add(indexOf(world,x,y));
        }
        const reached=new Set([indexOf(world,...origin)]),pending=[origin];
        for(let n=0;n<pending.length;n++) {
            const [x,y]=pending[n];if(n&&terminalCells.has(indexOf(world,x,y)))continue;
            for(const d of DIRECTIONS){edges++;if(!p.canPass(x,y,d))continue;
                const nx=f.gameMap.roundXWithDirection(x,d),ny=f.gameMap.roundYWithDirection(y,d),cell=indexOf(world,nx,ny);
                if(!reached.has(cell)){reached.add(cell);pending.push([nx,ny]);}}
        }
        for(const t of snap.objects) {
            const r={x:p._x,y:p._y,event:t.event??t.id,field:true,stopBeforeEvent:t.eventAction==='step',
                waypoint:t.waypoint===true||t.quest?.waypoint===true,entryDirection:t.entryDirection,
                bumpDirections:t.eventAction==='bump'?t.bumpDirections??15:undefined};
            const answer=solveRoute(f.geometry,live,r);
            if(answer.status==='interrupted')assert(!live.events.find(e=>e.id===answer.boundaryEvent)?.mapTransfer||answer.boundaryEvent===r.event,
                `unverified local transit to ${r.event} through ${answer.boundaryEvent}`);
            if(['ready','interrupted'].includes(answer.status)) {
                const points=routeApproachPoints(f.geometry,live,r,()=>false);
                assert(points.some(point=>reached.has(indexOf(world,point.x,point.y))),`native component for ${r.event}`);
            }
            routes++;
        }
        // Coordinate bookmarks/quest waypoints use the same terminal policy.
        for(const e of live.events.filter(e=>e.mapTransfer&&!e.erased)) {
            const r={x:p._x,y:p._y,targetX:e.x,targetY:e.y,field:true};
            if(e.x===p._x&&e.y===p._y)continue;
            assert(!['ready','interrupted'].includes(solveRoute(f.geometry,live,r).status),'point goal on unrelated entrance');
            routes++;
        }
    }
    async function fieldCase(targetId,origin,automatic,positive,point=false) {
        const f=load(113,{switches:positive?[33,38]:[]}),{player:p,gameMap:m,map}=f;delete p.direction;p.setPosition(...origin);
        p._followers={areGathering:()=>false,updateMove(){}};m.inactiveTime=0;m.refreshIfNeeded=()=>{};
        m._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){}});
        const renderer=new EventEmitter(),packets=[],records=[];
        const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,
            srcWendy:{},srcStones:{},_active:true,_fadeDuration:0,_fadeOpacity:0};
        c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};c.Input={dir4:0};c.ConfigManager={alwaysDash:false};
        c.$testEvent=null;c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
        c.$gameMessage={isBusy:()=>false};c.$gameScreen={_brightness:255};c.addEventListener=()=>{};
        const e=point?null:m.event(targetId),t=point?{}:eventTarget(c,'walk',e,map.events[targetId],e.page(),true);
        const bookmark=point?{id:1,revision:1,kind:'point',map:113,mode:'walk',x:14,y:6,name:'Saved point'}:
            {id:1,revision:1,kind:'entity',map:113,mode:'walk',event:targetId,category:t.category,name:t.name};
        const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet){packets.push(packet);}});
        const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
            navigationPreferences:()=>({autowalk:automatic,spoilers:true}),bookmarks:()=>[bookmark],
            makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
            {open(r){records.push(r);return records.length;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
        const frame=()=>renderer.emit('postrender');
        scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
        assert(field.command('directions'));frame();const packet=packets.at(-1);
        if(point)assert.deepEqual([packet.request.targetX,packet.request.targetY],[14,6]);
        else assert.equal(packet.request.event,targetId);
        assert.equal(packet.request.detour.verifiedOnly,true);
        await verifyWorker(f,packet.request,packet.live,r=>{
            if(positive){assert.equal(r.status,'ready');assert(r.detourPoints?.length);assert.equal(r.entrance,19);}
            else assert.equal(r.status,'unreachable');
            worker.emit('message',{epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});
        });frame();
        assert(!records.some(r=>formatSpeech(r).includes('No verified onward route')));
        if(!positive)assert.equal(records.at(-1).name,'Not currently reachable');
        else assert(records.some(r=>formatSpeech(r).includes('Chillcrest'))||automatic);
        field.leave(scene);
    }
    for(const automatic of [false,true]) {
        await fieldCase(183,[8,38],automatic,false);
        await fieldCase(171,[14,17],automatic,false);
        await fieldCase(21,[14,17],automatic,true);
        await fieldCase(null,[14,17],automatic,true,true);
    }
    // The existing verified return route also applies to every category and
    // point target; category text never changes connectivity or graph rank.
    for(const category of ['events','objects','npcs','treasure','quests','bookmarks']) {
        const f=load(113,{switches:[33,38]});f.player.setPosition(14,17);const snapshot=captureWorld(c);
        const transfers=createTransferBookmarks(c,{graphics:c.Graphics,navigationPreferences:()=>({spoilers:true})});
        const detour=createLocalDetour(c,transfers),target={id:21,category,name:'Selected destination',x:f.map.events[21].x,y:f.map.events[21].y};
        const job={action:'directions',map:113};
        const request={x:14,y:17,event:21,field:true,stopBeforeEvent:true,detour:detour.prepare(job,snapshot,target)};
        await verifyWorker(f,request,snapshot.live,r=>{assert.equal(r.status,'ready');assert.equal(r.entrance,19);assert(detour.accept(job,r));
            assert.equal(job.remote.selection.detour.target,target);assert.equal(job.remote.bookmark.verifiedOnly,true);});
        transfers.clear();
    }
    console.log(`Verified ${routes} all-category/coordinate world requests against ${edges} original native edges, eight production field jobs, six category-preserving verified detours and bounded common-event entrance detection.`);
};
