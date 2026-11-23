'use strict';
const assert=require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {composeWorld,indexOf,DIRECTIONS}=require('../src/world/geometry.cjs');
const {solveRoute}=require('../src/world/routes.cjs');
module.exports=async(c,load,verifyWorker)=>{
    let checked=0,edges=0;
    for(const origin of [[8,38],[7,29],[15,30],[43,29]]) {
        const f=load(113),p=f.player;p.setPosition(...origin);
        const snap=captureWorld(c),live=snap.live;
        assert.equal(live.airshipAvailable,false,'locked craft must not grant flight');
        assert(live.events.find(e=>e.id===1).mapTransfer);
        assert(live.events.find(e=>e.id===2).mapTransfer);
        assert(live.events.find(e=>e.id===97).discoveryFor);
        const world=composeWorld(f.geometry,live);
        const stops=new Set(live.events.filter(e=>e.mapTransfer&&!e.erased).map(e=>indexOf(world,e.x,e.y)));
        const visited=new Set([indexOf(world,...origin)]),pending=[origin];
        // Independent flood using original native canPass, with transfers
        // terminal. Native event progression is never projected across maps.
        for(let n=0;n<pending.length;n++) {
            const [x,y]=pending[n];
            if(n&&stops.has(indexOf(world,x,y)))continue;
            for(const d of DIRECTIONS) {
                edges++;if(!p.canPass(x,y,d))continue;
                const nx=f.gameMap.roundXWithDirection(x,d),ny=f.gameMap.roundYWithDirection(y,d),cell=indexOf(world,nx,ny);
                if(!visited.has(cell)){visited.add(cell);pending.push([nx,ny]);}
            }
        }
        const markers=snap.objects.filter(t=>t.name==='Discovery marker');assert.equal(markers.length,23);
        
        for(const t of markers) {
            const request={x:p._x,y:p._y,event:t.id,field:true,stopBeforeEvent:true};
            const result=solveRoute(f.geometry,live,request);
            const physical=visited.has(indexOf(world,t.x,t.y));
            assert.equal(['ready','interrupted'].includes(result.status),physical,`native local reachability ${t.id} from ${origin}`);
            if(result.status==='interrupted')assert(!live.events.find(e=>e.id===result.boundaryEvent).mapTransfer);
            if(t.id===97 && origin[0]===8) {
                const old=solveRoute(f.geometry,{...live,events:live.events.map(e=>({...e,mapTransfer:false}))},request);
                assert.equal(old.status,'interrupted');assert.equal(old.boundaryEvent,1,'reproduce the reported false beach handoff');
                assert.equal(result.status,'unreachable');
            }
            if(t.id===97)await verifyWorker(f,request,live,r=>{
                assert.equal(r.status,result.status);
                assert(![1,2].includes(r.boundaryEvent),'beach/ruins cannot masquerade as onward transit');
            });
            checked++;
        }
        // The same native exit remains selectable. This fix does not hide it
        // or redefine cross-map plans, vehicle landing or entrance controls.
        const exit=solveRoute(f.geometry,live,{x:p._x,y:p._y,event:1,field:true});
        if(origin[1]===38)assert.equal(exit.status,'ready');
    }
    console.log(`Verified ${checked} world discovery routes against ${edges} native collision edges without intermediate map transfers, four packaged marker97 requests, locked-airship gate and normal selected beach exit.`);
};
