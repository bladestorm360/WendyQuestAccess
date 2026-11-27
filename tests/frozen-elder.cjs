'use strict';
const assert=require('node:assert/strict');
const {bakeMap}=require('../src/world/geometry.cjs');
const {solveRoute}=require('../src/world/routes.cjs');
const {routeThroughTerrain}=require('../src/world/terrain-controls.cjs');
const {iceOpensPassage}=require('../src/world/local-destinations');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async function verifyFrozenElder(fixture,mapData,tilesets){
    const data=mapData(13),ice=data.events[8];
    assert(iceOpensPassage(ice,ice.pages[1]));
    const changed=structuredClone(ice);changed.pages[1].list.splice(3,0,{code:102,parameters:[]});
    assert(!iceOpensPassage(changed,changed.pages[1]),'an additional choice is not a verified ordinary melt');
    const f=fixture(data),{c,frame}=f,map=c.$gameMap,player=c.$gamePlayer;
    c.$dataTilesets=tilesets;
    Object.assign(map,{_mapId:13,_tilesetId:data.tilesetId,_events:[],_tileEvents:[],_vehicles:[],_nameDisplay:false});
    for(const id of [6,8]){
        const entry=data.events[id],page=entry.pages[1];
        const event=Object.assign(f.event(id,1),{_x:entry.x,_y:entry.y,_pageIndex:1,_trigger:page.trigger,
            _priorityType:page.priorityType,_through:page.through,_characterName:page.image.characterName});
        if(id===8)event.blockerProperties={x1:-1,y1:-1,x2:1,y2:0};
        map._events[id]=event;map.fixtureEvents.push(event);
    }
    player._vehicleType='walk';player.setPosition(23,19);player.reserveTransfer(13,23,19,2,0);
    c.SceneManager.goto(c.Scene_Map);c.SceneManager.changeScene();c.DataManager.ready=c.ImageManager.ready=true;
    c.SceneManager.updateScene();await new Promise(setImmediate);
    const scene=c.Graphics.app.stage;scene._fadeDuration=scene._fadeOpacity=0;
    c.SceneManager.updateScene();f.idleCallbacks.shift()();c.SceneManager.updateScene();frame();await new Promise(setImmediate);
    scene._spriteset ||= {_tilemap:{}};
    const parent=scene._spriteset._tilemap.parent={};
    scene._spriteset._ayatamQuestIconSprite=[{parent,_active:true,worldVisible:true,worldAlpha:1,renderable:true,
        texture:{valid:true},bitmap:{},x:100,y:100,_eventId:6,_questId:'quest4'}];
    c.$gameParty ||= {};c.$gameParty.getNav=()=> 'quest4';
    c.Ayatam={QUEST:{needsRefresh:false,QuestDatabase:[{},{},{},{QuestName:'Fixture rescue'}]}};
    const key=(value,shiftKey=false)=>{f.dispatchWindowEvent('keydown',{key:value,keyCode:value.toUpperCase().charCodeAt(0),shiftKey});f.dispatchWindowEvent('keyup',{key:value});frame();};
    for(let n=0;n<12&&f.packets.at(-1)?.category!=='Quests';n++)key('l',true);
    assert.equal(f.packets.at(-1)?.category,'Quests');key('p');
    const job=f.routePackets.at(-1);assert.equal(job.request.event,6);assert(job.request.waypoint);
    assert.equal(solveRoute(bakeMap(data,tilesets[data.tilesetId].flags),job.live,job.request).status,'unreachable');
    const result=routeThroughTerrain(bakeMap(data,tilesets[data.tilesetId].flags),job.live,job.request,undefined,()=>false);
    assert.equal(result.status,'iceRoute');assert.equal(result.event,8);
    assert.deepEqual(result.arrival,{x:29,y:6,facing:8});
    f.routeReply({epoch:job.epoch,sequence:job.sequence,map:job.map,
        result:{...result,legs:result.legs.slice(0,8),more:true}});frame();
    assert.equal(f.packets.at(-1).kind,'routeDirections');assert.equal(f.packets.at(-1).prerequisite,'the ice block');
    assert.doesNotMatch(formatSpeech(f.packets.at(-1)),/action button/i,'an incomplete chunk defers the melt instruction');
    assert.equal(f.packets.at(-1).facing,8);
    console.log('Verified the frozen Elder Tater quest uses the reachable ice interaction, native rectangle approach and standard prerequisite directions; unverified extra actions stay excluded.');
};
