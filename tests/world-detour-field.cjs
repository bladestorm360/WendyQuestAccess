'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { createField } = require('../src/world/field');
const { formatSpeech } = require('../src/services/speech-text.cjs');
async function verifyWorldDetourField(c, load, verifyWorker, common, infos) {
    const saved = { scene:c.SceneManager._scene, app:c.Graphics.app, screen:c.$gameScreen, message:c.$gameMessage,
        listen:c.addEventListener, members:c.$gameParty.members, inBattle:c.$gameParty.inBattle,
        common:c.$dataCommonEvents, infos:c.$dataMapInfos };
    let peak=0;
    try {
        c.$dataCommonEvents=common;c.$dataMapInfos=infos;
        c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
        c.$gameParty.members=()=>[4];c.$gameParty.inBattle=()=>false;
        for(const north of [false,true]) {
            const f=load(113,{switches:[54,90,97,72,464,465],variables:{5:4,4:3}});
            f.player.setPosition(43,north?28:30);f.gameMap.inactiveTime=0;
            const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
            const renderer=new EventEmitter();c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
            const records=[],packets=[];
            const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,buffers){
                packets.push(structuredClone(packet,{transfer:buffers||[]}));
            }});
            const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,
                screenFading:()=>false,navigationPreferences:()=>({}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
                createRouteWorker:()=>worker},{open(record){records.push(record);return records.length;},close(){}});
            function ask(action){const at=performance.now();assert(field.command(action));renderer.emit('postrender');peak=Math.max(peak,performance.now()-at);}
            for(let i=0;i<12&&records.at(-1)?.category!=='Exits';i++)ask('nextCategory');
            for(let i=0;i<250&&records.at(-1)?.name!=='Cauldron';i++)ask('nextDestination');
            assert.equal(records.at(-1)?.name,'Cauldron');
            ask('directions');const packet=packets.shift();assert.equal(packet.request.event,43);
            let result;await verifyWorker(f,packet.request,packet.live,reply=>result=reply);
            const at=performance.now();worker.emit('message',{...packet,result});renderer.emit('postrender');peak=Math.max(peak,performance.now()-at);
            const speech=formatSpeech(records.at(-1));
            assert.match(speech,north?/take exit to Sunrise Beach/i:/take exit to Nugget Mine/i);
            assert.doesNotMatch(speech,/No verified onward|entrance changed|unavailable/i);
            field.leave(scene);
        }
        console.log('Verified connected field directions, actual transferred terrain buffers and named detour exits; throttled callback peak '+peak.toFixed(2)+' ms.');
    } finally {
        c.SceneManager._scene=saved.scene;c.Graphics.app=saved.app;c.$gameScreen=saved.screen;c.$gameMessage=saved.message;
        c.addEventListener=saved.listen;c.$gameParty.members=saved.members;c.$gameParty.inBattle=saved.inBattle;
        c.$dataCommonEvents=saved.common;c.$dataMapInfos=saved.infos;
    }
}
module.exports={verifyWorldDetourField};
