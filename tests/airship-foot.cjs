"use strict";

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute, findReachable } = require('../src/world/routes.cjs');
const { DIRECTIONS } = require('../src/world/geometry.cjs');
const { onFootAirshipRoute, onFootAirshipReachable } = require('../src/world/airship-route.cjs');
const { createField } = require('../src/world/field');
const { formatSpeech } = require('../src/services/speech-text.cjs');
const { travelMode } = require('../src/world/vehicle-navigation');

// Real native vehicle/input methods and real Map 113 data are supplied by
// world.test. No game process or save is opened by this fixture.
async function verifyAirshipFoot(c, load, read, verifyWorker) {
    const keys = ['$gameMessage','$gameSystem','$dataCommonEvents','Input','$gameTemp','$gameScreen',
        'addEventListener','WendyQuestAccessSceneLeaving','WendyQuestAccessBookmarkLandingAccepted',
        'WendyQuestAccessBookmarkEntranceAccepted','WendyQuestAccessBookmarkTransferReserved',
        'WendyQuestAccessAutowalkInput','WendyQuestAccessFieldMove'];
    const saved = Object.fromEntries(keys.map(key => [key,c[key]]));
    const oldScene=c.SceneManager._scene, oldApp=c.Graphics.app, oldParty={...c.$gameParty};
    let peak=0;
    try {
        c.$gameParty.inBattle=()=>false;c.$gameParty.onPlayerWalk=()=>{};c.$gameParty.members=()=>[];
        c.$gameMessage={isBusy:()=>false};c.$gameScreen={_brightness:255};c.addEventListener=()=>{};
        c.$gameSystem={saveWalkingBgm(){},replayWalkingBgm(){}};
        c.$dataCommonEvents=read('CommonEvents.json');c.Tyruswoo.TileControl.param={};
        c.Input={dir4:0,isTriggered:key=>key==='ok'};
        c.$gameTemp={isDestinationValid:()=>false};
        function begin() {
            const f=load(113),{player:p,gameMap:m}=f;delete p.direction;
            p._followers={areGathering:()=>false,gather(){},synchronize(){},updateMove(){}};
            p.updateEncounterCount=()=>{};p._waitCount=0;p.setPosition(43,29);m.inactiveTime=0;
            m.refreshIfNeeded=()=>{};m.setupTestEvent=m.setupAutorunCommonEvent=()=>false;
            m._interpreter={setupReservedCommonEvent:()=>false,isRunning(){return !!this._list;},
                setup(list,id){this._list=list;this._eventId=id;}};
            for(const craft of m.vehicles()) {
                Object.defineProperties(craft,{x:{get:()=>craft._x},y:{get:()=>craft._y}});
                Object.assign(craft,{_altitude:0,_driving:false,_moveSpeed:5,playBgm(){}});
            }
            m.airship().setLocation(113,43,28);
            return f;
        }
        const f=begin(),{gameMap:m,player:p}=f,craft=m.airship();
        const snap=()=>captureWorld(c,true,undefined,undefined,[],false,true);
        const walk=snap();assert.equal(walk.live.airshipAvailable,true);
        for(const change of [{_mapId:0},{_transparent:true},{_altitude:1},{_driving:true}]) {
            const before={...craft};Object.assign(craft,change);
            assert.equal(snap().live.airshipAvailable,false);Object.assign(craft,before);
        }
        craft.setLocation(113,0,0);
        const distant=snap();
        assert.equal(onFootAirshipRoute(f.geometry,distant.live,{x:43,y:29,event:113,field:true},{status:'unreachable'},()=>false),null,
            'an unlocked but unreachable aircraft cannot grant a route');
        craft.setLocation(113,43,28);
        const erased=m._events[90];erased._erased=true;erased.setPosition(49,7);
        assert(snap().live.events.some(event=>event.id===90&&event.erased));
        assert(!craft.isLandOk(49,7,2));
        erased._erased=false;erased.setPosition(f.map.events[90].x,f.map.events[90].y);
        let alternate=0,disconnected=0;
        const markers=walk.objects.filter(t=>t.category==='events' && t.name.startsWith('Discover '));
        const candidates=markers.map(t=>({event:t.id}));
        for(const t of markers) {
            const request={x:walk.x,y:walk.y,event:t.id,field:true,stopBeforeEvent:true};
            const direct=solveRoute(f.geometry,walk.live,request);
            const via=onFootAirshipRoute(f.geometry,walk.live,request,direct,()=>false);
            if(via) {
                alternate++;assert.equal(via.status,'ready');assert(via.airshipBoarding);
                const landing=via.airshipBoarding.landing;assert(craft.isLandOk(landing.x,landing.y,2));
                if(direct.status==='unreachable')disconnected++;
            }
            assert.equal(onFootAirshipRoute(f.geometry,{...walk.live,airshipAvailable:false},request,direct,()=>false),null);
        }
        // Native transfers are terminal for discovery walks. Fourteen old
        // interrupted results were false transit through unrelated entrances.
        assert.equal(markers.length,23);assert.equal(alternate,21);assert.equal(disconnected,20);
        const direct=findReachable(f.geometry,walk.live,{x:walk.x,y:walk.y,candidates});
        const expanded=onFootAirshipReachable(f.geometry,walk.live,{x:walk.x,y:walk.y,candidates},direct,()=>false);
        assert.equal(expanded.status,'reachable');
        assert(expanded.available.some((value,index)=>value&&!direct.available[index]));
        const near={x:walk.x,y:walk.y,targetX:43,targetY:29,field:true};
        assert.equal(onFootAirshipRoute(f.geometry,walk.live,near,solveRoute(f.geometry,walk.live,near),()=>false),null);
        assert.equal(onFootAirshipRoute(f.geometry,walk.live,{...near,targetX:45,targetY:24},{status:'unreachable'},()=>true).status,'cancelled');
        await verifyWorker(f,{x:walk.x,y:walk.y,event:113,field:true,beacon:true,limit:8},walk.live,result=>{
            assert.equal(result.status,'ready');assert(result.airshipBoarding);assert.equal(result.course.length,result.distance);
        });
        await verifyWorker(f,{x:walk.x,y:walk.y,candidates},walk.live,result=>assert.deepEqual(result,expanded));

        for(const [automatic,savedPoint,startAboard] of [[false,false],[true,false],[false,true],[true,true],
            [false,false,true],[true,false,true]]) {
            const native=begin(),{gameMap,player}=native,aircraft=gameMap.airship();
            const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
            const frames=new EventEmitter();c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer:frames};
            const bookmark={id:1,revision:1,kind:'point',name:'Landing marker',map:113,mode:'walk',x:44,y:24};
            const records=[],packets=[];
            const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,buffers){
                packets.push(structuredClone(packet,{transfer:buffers||[]}));
            }});
            const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,
                screenFading:()=>false,bookmarks:()=>savedPoint?[bookmark]:[],navigationPreferences:()=>({spoilers:true,autowalk:automatic}),
                makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
            {open(record){records.push(record);return records.length;},close(){},
                arrive(record){records.push(record);return records.length;},endArrival(){}});
            if(startAboard) {
                // Original native boarding/ascent, before selecting a goal.
                player.setPosition(43,28);assert(player.getOnVehicle());
                player._vehicleGettingOn=false;aircraft.getOn();player.setThrough(true);
                for(let n=0;n<48;n++)aircraft.updateAirship();
                assert.equal(travelMode(gameMap,player),'airship');
                const flight=captureWorld(c,true,undefined,scene,[],false,true);
                assert.deepEqual(flight.objects.filter(t=>t.category==='events').map(t=>t.id),
                    walk.objects.filter(t=>t.category==='events').map(t=>t.id),
                    'boarding preserves every eligible event, including discoveries and encounters');
                const privateFlight=captureWorld(c,false,undefined,scene,[],false,false);
                assert(!privateFlight.objects.some(t=>t.id===135),'unrevealed entrance remains hidden');
            }
            c.WendyQuestAccessSceneLeaving=owner=>field.leave(owner);
            c.WendyQuestAccessBookmarkLandingAccepted=field.bookmarkLandingAccepted;
            c.WendyQuestAccessBookmarkEntranceAccepted=field.bookmarkEntranceAccepted;
            c.WendyQuestAccessBookmarkTransferReserved=field.bookmarkTransferReserved;
            const inputs=[];c.WendyQuestAccessAutowalkInput=(...args)=>{const value=field.autowalk.input(...args);inputs.push([args[2],args[3],value]);return value;};c.WendyQuestAccessFieldMove=field.autowalk.moved;
            function ask(action) {
                const at=performance.now();assert(field.command(action),action);frames.emit('postrender');
                peak=Math.max(peak,performance.now()-at);
            }
            if(savedPoint) {
                scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
            } else {
                for(let n=0;n<15&&records.at(-1)?.category!=='Events';n++)ask('nextCategory');
                assert.equal(records.at(-1)?.category,'Events');
                for(let n=0;n<250&&field.bookmarkContext(scene)?.entity?.event!==113;n++)ask('nextDestination');
                assert.equal(field.bookmarkContext(scene)?.entity?.event,113);
            }
            const goalEvent=savedPoint?undefined:113;
            async function route(event, ground=false) {
                ask('directions');const packet=packets.shift();assert(packet);assert.equal(packet.request.event,event);
                let result;await verifyWorker(native,packet.request,packet.live,reply=>result=reply);
                assert(ground ? result.status==='ready'||result.status==='interrupted'&&result.boundaryEvent===event : result.status==='ready');
                const at=performance.now();worker.emit('message',{...packet,result});frames.emit('postrender');
                peak=Math.max(peak,performance.now()-at);return result;
            }
            function settle(){player._realX=player._x;player._realY=player._y;player.updateVehicle();}
            function follow(result) {
                if(automatic) {
                    assert(field.autowalk.active(scene),'automatic start: '+JSON.stringify(records.at(-1)));
                    for(let n=0;field.autowalk.active(scene)&&n<result.distance+3;n++) {
                        player.moveByInput();settle();frames.emit('postrender');
                    }
                    assert(!field.autowalk.active(scene));
                } else for(const leg of result.legs)for(let n=0;n<leg.tiles;n++) {
                    player.moveStraight(leg.direction);assert(player.isMovementSucceeded());settle();
                }
                assert.deepEqual([player._x,player._y],[result.arrival.x,result.arrival.y],JSON.stringify({record:records.at(-1),inputs,canMove:player.canMove()}));
            }
            if(!startAboard) {
            const boarding=await route(goalEvent);assert(boarding.airshipBoarding);
            if(!automatic)assert.match(formatSpeech(records.at(-1)),/board the airship/i);
            follow(boarding);scene._wqaRouteActive=true;assert(player.triggerButtonAction());settle();
            for(let n=0;n<48;n++){aircraft.updateAirship();settle();}
            assert.equal(travelMode(gameMap,player),'airship');scene._wqaFieldReady=true;field.observeReady(scene);
            }
            const flight=await route(goalEvent);assert(flight.land);assert(aircraft.isLandOk(flight.arrival.x,flight.arrival.y,2));
            follow(flight);scene._wqaRouteActive=true;assert(player.triggerButtonAction());
            assert(c.Graphics._wqaBookmarkTransferPending);
            scene._wqaFieldReady=true;field.observeReady(scene);assert(c.Graphics._wqaBookmarkTransferPending);
            for(let n=0;n<48;n++){aircraft.updateAirship();settle();}
            assert.equal(travelMode(gameMap,player),'walk');scene._wqaFieldReady=true;field.observeReady(scene);
            assert(!c.Graphics._wqaBookmarkTransferPending);
            const ground=await route(goalEvent,true);assert(!ground.airshipBoarding&&!ground.land);
            assert(ground.distance<=2);
            if(savedPoint)assert.deepEqual([ground.arrival.x,ground.arrival.y],[44,24]);
            else assert.equal(field.bookmarkContext(scene)?.entity?.event,113);
            assert(!gameMap.events().some(event=>event.isStarting()),'landing/approach does not trigger an event');
            field.leave(scene);
        }
        console.log('Verified 23 discoveries, 21 native landings, 6 disconnected foot routes, unlock negatives, erased landing blockers, shorter walks, worker availability/cancellation and manual/automatic board-flight-ground handoff; callback peak '+peak.toFixed(2)+' ms (throttled fixture).');
    } finally {
        for(const key of keys)c[key]=saved[key];Object.assign(c.$gameParty,oldParty);
        c.SceneManager._scene=oldScene;c.Graphics.app=oldApp;
    }
}
module.exports={verifyAirshipFoot};
