'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createField } = require('../src/world/field');
const { captureWorld, eventTarget } = require('../src/world/snapshot');
const { passiveFloorPage } = require('../src/world/local-destinations');
const { solveRoute } = require('../src/world/routes.cjs');
const offsets = {2:[0,1],4:[-1,0],6:[1,0],8:[0,-1]};

// Original authored pages and native movement are supplied by world.test.cjs.
// Nothing here contains copied game source or reconstructed encounter scripts.
module.exports = async function verifyEncounterTriggers(c, load, verifyWorker, read) {
    c.$dataCommonEvents=read('CommonEvents.json');
    let jobs=0, touches=0;
    for (const id of [159,161,163,165,167,169,171,173,175,177,179,181,183]) {
        for (const automatic of [false,true]) {
            const f=load(113), {player,gameMap,map}=f, event=gameMap.event(id);
            const page=event.page();assert(passiveFloorPage(page));
            delete player.direction;
            const occupied=new Set(gameMap.events().filter(e=>[1,2].includes(e._trigger)&&e.list()?.length>1)
                .map(e=>`${e._x},${e._y}`));
            // Pick a three-step, native-passable approach without crossing a
            // different native touch event. This isolates the selected target.
            let origin;
            for (const length of [3,2,1])for (const [d,[dx,dy]] of Object.entries(offsets)) {
                if(origin)continue;
                const x=event._x-length*dx,y=event._y-length*dy;
                if (Array.from({length},(_,n)=>n).every(n=>!occupied.has(`${x+n*dx},${y+n*dy}`)&&
                    player.canPass(x+n*dx,y+n*dy,+d))) {origin=[x,y];break;}
            }
            assert(origin,`native approach ${id}`);player.setPosition(...origin);
            player._followers={areGathering:()=>false,updateMove(){}};
            gameMap.inactiveTime=0;
            gameMap._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){}});
            gameMap.refreshIfNeeded=()=>{};
            const renderer=new EventEmitter(),packets=[],records=[];
            const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,
                srcWendy:{},srcStones:{},_active:true,_fadeDuration:0,_fadeOpacity:0};
            c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
            c.Input={dir4:0};c.ConfigManager={alwaysDash:false};c.$testEvent=null;
            c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
            c.$gameMessage={isBusy:()=>false};c.$gameScreen={_brightness:255};c.addEventListener=()=>{};
            const target=eventTarget(c,'walk',event,map.events[id],page,false);
            assert.equal(target.category,'events');assert.equal(target.eventAction,'step');
            const bookmark={id:1,revision:1,kind:'entity',map:113,mode:'walk',event:id,category:'events',name:target.name};
            const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet){packets.push(packet);}});
            const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
                navigationPreferences:()=>({autowalk:automatic}),bookmarks:()=>[bookmark],
                makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
                {open(record){records.push(record);return records.length;},close(){},
                    arrive(record){records.push(record);return records.length;},endArrival(){}});
            c.WendyQuestAccessAutowalkInput=field.autowalk.input;c.WendyQuestAccessFieldMove=field.autowalk.moved;
            c.WendyQuestAccessSceneLeaving=field.leave;
            c.WendyQuestAccessFieldEvent=(current,e)=>{field.iceEventStarted(current,e);field.autowalk.stop(current);};
            const frame=()=>renderer.emit('postrender');
            scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
            assert(field.command('directions'));frame();
            const packet=packets.at(-1);assert.equal(packet.request.event,id);
            assert.equal(packet.live.events.find(e=>e.id===id).action,true,
                `explicit encounter ${id} must survive automatic background filtering`);
            const incidental=packet.live.events.find(e=>e.id===(id===159?165:159));
            assert.equal(incidental.action,!automatic,'incidental bookkeeping keeps its accepted filtering');
            const raw=captureWorld(c);
            assert.equal(raw.live.events.find(e=>e.id===id).action,true,'copied filtering must not mutate native observation');
            // Preserve the exact distinction: an active but physically blocked
            // trigger is unreachable; an erased target is no longer available.
            const blocked={...packet.live,events:[...packet.live.events, {id:9999,x:event._x,y:event._y,
                normal:true,through:false,action:false,rectangle:[event._x-1,event._y-1,event._x+1,event._y+1]}]};
            assert(['unreachable','approachBlocked'].includes(solveRoute(f.geometry,blocked,packet.request).status));
            const erased={...packet.live,events:packet.live.events.map(e=>e.id===id?{...e,erased:true}:e)};
            assert.equal(solveRoute(f.geometry,erased,packet.request).status,'unavailable');
            let result;
            await verifyWorker(f,packet.request,packet.live,r=>{result=r;
                assert.equal(r.status,'interrupted');assert.equal(r.boundaryEvent,id);
                worker.emit('message',{epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});});
            frame();assert(!records.some(r=>r.name==='Directions unavailable'));
            if (automatic) {
                if(result.distance)assert(field.autowalk.active(scene));
                for(let n=0;field.autowalk.active(scene)&&n<20;n++) {
                    player.moveByInput();player._realX=player._x;player._realY=player._y;frame();
                }
                assert.deepEqual([player._x,player._y],[result.arrival.x,result.arrival.y]);
                assert.equal(records.at(-1).name,'Arrived.');
            } else {
                assert(records.some(r=>r.kind==='routeDirections'));
                for(const leg of result.legs)for(let n=0;n<leg.tiles;n++) {
                    assert(player.canPass(player._x,player._y,leg.direction));player.moveStraight(leg.direction);
                    player._realX=player._x;player._realY=player._y;
                }
            }
            assert(!event.isStarting(),'the final encounter step remains player-owned');
            assert(player.canPass(player._x,player._y,result.boundary));
            player.moveStraight(result.boundary);player.checkEventTriggerHere([1,2]);
            assert(event.isStarting(),'native final step actually reaches the encounter trigger');touches++;
            field.leave(scene);jobs++;
        }
    }
    await require('./discovery-transit.cjs')(c,load,verifyWorker);
    console.log(`Verified ${jobs} manual/automatic production-field and packaged-worker encounter jobs, ${touches} original native trigger touches, incidental cleanup, immutable capture, genuine blockers and erased targets.`);
};
