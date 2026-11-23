'use strict';
const assert = require('node:assert/strict');
const {captureWorld}=require('../src/world/snapshot');
const {solveRoute}=require('../src/world/routes.cjs');
const {bakeMap}=require('../src/world/geometry.cjs');
const {formatSpeech}=require('../src/services/speech-text.cjs');
async function verifyNative(c,load,snapshot,verifyWorker) {
    const f=load(116,{switches:[8],self:['116,11,A']});
    f.player.setPosition(7,7);
    let live=captureWorld(c).live;
    const target=captureWorld(c).objects.find(item=>item.id===8);
    assert.deepEqual(target.handoffs,[13]);
    const request={x:7,y:7,event:8,field:true,bumpDirections:15};
    assert.equal(solveRoute(f.geometry,live,request).boundaryEvent,13,'the generic fallback also discovers the note approach');
    for(const x of [7,6])for(const autowalk of [false,true]) {
        const next={...request,x,autowalk,handoffs:target.handoffs,limit:8};
        await verifyWorker(f,next,live,result=>{
            assert.equal(result.status,'interrupted');assert.equal(result.boundaryEvent,13);
            assert.equal(result.boundary,4);assert.equal(result.distance,x-6);
            assert.deepEqual(result.arrival,{x:6,y:7,facing:null});
            if(autowalk)assert.equal(result.course.length,result.distance);
        });
    }
    assert(f.player.canPass(6,7,4));
    f.player.setPosition(5,7);f.player.checkEventTriggerHere([1,2]);
    assert(f.gameMap.event(13).isStarting(),'the actual native activation starts the note before the door');
    const changed=new Set([8]);c.$gameSwitches.value=id=>changed.has(id);
    c.$gameSwitches.setValue=(id,on)=>on?changed.add(id):changed.delete(id);
    const interpreter=Object.assign(new c.Game_Interpreter(),{_mapId:116,_eventId:13});
    const completion=f.map.events[13].pages[0].list.find(row=>row.code===121);
    assert.deepEqual(completion.parameters,[142,142,0]);
    interpreter.command121(completion.parameters);
    const note=f.gameMap.event(13);assert.equal(note.findProperPageIndex(),1);
    assert.equal(f.map.events[13].pages[1].list[0].code,214);
    // As in existing native fixtures, mirror the pinned completed erase state;
    // dialogue/resource work itself remains entirely under the native engine.
    Object.assign(note,{_erased:true,_through:true,_priorityType:0,_starting:false});
    live=captureWorld(c).live;
    await verifyWorker(f,{...request,x:5,handoffs:[13]},live,result=>{
        assert.equal(result.status,'ready');assert.equal(result.distance,0);assert.equal(result.arrival.facing,2);
    });
    assert(!f.player.canPass(5,7,2),'the closed door keeps its real native solid collider');
    f.player.facing=2;f.player.checkEventTriggerTouch(5,8);
    assert(f.gameMap.event(8).isStarting(),'the native failed step now activates the real exit');
    console.log('Verified Elder house note-before-door routes from both reported positions, manual/automatic worker prefixes, native note activation/completion and final solid-door interaction.');
}
async function verifyField(fixture,mapData,tilesets,house=116) {
    const exit=house===116?8:11,floor=house===116?13:15;
    const sx=house===116?7:8,sy=house===116?7:10;
    const data=mapData(house),f=fixture(data),{c,frame}=f,map=c.$gameMap,player=c.$gamePlayer;
    c.$dataTilesets=tilesets;
    Object.assign(map,{_mapId:house,_tilesetId:data.tilesetId,_events:[],_tileEvents:[],_vehicles:[],_nameDisplay:false});
    for(const id of [exit,floor]) {
        const entry=data.events[id],page=entry.pages[0];
        const event=Object.assign(f.event(id,0),{_x:entry.x,_y:entry.y,_pageIndex:0,_trigger:page.trigger,
            _priorityType:page.priorityType,_through:page.through,_characterName:page.image.characterName});
        map._events[id]=event;map.fixtureEvents.push(event);
    }
    player._vehicleType='walk';player.setPosition(sx,sy);player.reserveTransfer(house,sx,sy,2,0);
    c.SceneManager.goto(c.Scene_Map);c.SceneManager.changeScene();c.DataManager.ready=c.ImageManager.ready=true;
    c.SceneManager.updateScene();await new Promise(setImmediate);
    const scene=c.Graphics.app.stage;scene._fadeDuration=scene._fadeOpacity=0;
    c.SceneManager.updateScene();f.idleCallbacks.shift()();c.SceneManager.updateScene();frame();await new Promise(setImmediate);
    const key=(value,shiftKey=false)=>{f.dispatchWindowEvent('keydown',{key:value,keyCode:value.toUpperCase().charCodeAt(0),shiftKey});
        f.dispatchWindowEvent('keyup',{key:value});frame();};
    for(let n=0;n<12&&f.packets.at(-1)?.category!=='Exits';n++)key('l',true);
    assert.equal(f.packets.at(-1)?.category,'Exits');
    const geometry=bakeMap(data,tilesets[data.tilesetId].flags);
    function directions(expected) {
        key('p');const packet=f.routePackets.at(-1);assert.equal(packet.request.event,exit);
        if(house===116)assert.deepEqual(packet.request.handoffs,[13]);
        else assert.equal(packet.request.handoffs,undefined);
        const result=solveRoute(geometry,packet.live,packet.request);assert.equal(result.status,expected);
        f.routeReply({epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result});frame();
        return formatSpeech(f.packets.at(-1));
    }
    const first=directions('interrupted');assert.match(first,house===116?/west/i:/south/i);assert.match(first,/scene trigger/i);
    assert.doesNotMatch(first,/not currently reachable|collect salt|fan mail/i);
    if(house===116){player.setPosition(6,7);directions('interrupted');}
    map._events[floor]._erased=true;player.setPosition(data.events[floor].x,data.events[floor].y);
    assert.match(directions('ready'),/south/i);
    console.log(`Verified house${house} production exit category, spoiler-free first-event directions and post-event door directions.`);
}
module.exports={verifyNative,verifyField};
