'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
module.exports = function verifyContinuity(fixture, commandContext, emoteMethods) {
    function sleeping(rate) {
        const f = fixture(13,5,6), sleeper = f.actor(17), c = commandContext(f);
        f.playback.narration.playbackPercent = rate;
        c.$gameTemp = { requestBalloon(actor,id) { f.balloon(id,actor,sleeper.sprite); } };
        for (const method of emoteMethods) vm.runInContext(method,c);
        Object.assign(f.interpreter,{ _index:16,character:()=>sleeper.candidate,setWaitMode(){} });
        c.Game_Interpreter.prototype.command213.call(f.interpreter,[17,10,false]);
        f.nativeMap.mapId=()=>13;f.interpreter.clear=c.Game_Interpreter.prototype.clear;
        f.interpreter.loadImages=c.Game_Interpreter.prototype.loadImages;
        c.WendyQuestAccessNarrationEventEntry=f.narration.entry;
        c.Game_Interpreter.prototype.setup.call(f.interpreter,f.root.$dataMap.events[5].pages[7].list,5);
        f.frame();assert.equal(f.played[0]?.id,'sleeping-wendy');
        assert.equal(f.played[0].playbackRate,rate/100);
        return f;
    }
    for (const rate of [80,100,200,250]) {
        const f=sleeping(rate),audio=f.played[0];audio.currentTime=0.31;
        f.narration.pause(f.scene,true);f.status._brightness=128;f.status._fadeOutDuration=12;
        for(let n=0;n<30;n++)f.frame();
        assert(!audio.paused,'a purely visual fade must not interrupt an already confirmed voice');
        f.scene._wqaPreloads=new Set([{}]);f.frame();
        assert(audio.paused,'a real resource gate pauses at its existing playhead');
        f.scene._wqaPreloads.clear();f.frame();assert(audio.paused,'finishing resource work does not resume inside a fade');
        f.narration.pause(f.scene);f.root.$gamePlayer._transferring=true;
        const next={...f.scene,_wqaMapRestored:false,_wqaNarrationActive:false,_wqaPreloads:new Set()};
        f.host.manager._scene=f.graphics.app.stage=next;f.nativeMap._mapId=116;f.nativeMap._events={};
        f.narration.present(next);assert(audio.paused);
        f.root.$gamePlayer._transferring=false;f.status._brightness=255;f.status._fadeOutDuration=0;
        next._wqaMapRestored=true;f.narration.present(next);
        assert(!audio.paused);assert.equal(audio.currentTime,0.31);assert.equal(f.played.length,1,'resume the same media, never restart the caption');
        assert.equal(audio.playbackRate,rate/100);audio.emit('ended');f.narration.present(next);
        assert(!f.graphics._wqaNarrationContinuation);f.narration.leave();
    }
    // Confirmed followers retain order without carrying old actor/list objects.
    {
        const f=fixture(13,5,2),a=f.actor(-1),b=f.actor(5);
        for(const [i,source]of [[4,a],[7,b]]){f.interpreter._index=i;f.narration.accepted(f.scene,f.interpreter,source.candidate,undefined,1);f.balloon(1,source.candidate,source.sprite);}
        f.frame();assert.equal(f.played.length,1);f.narration.pause(f.scene);f.narration.pause(f.scene);
        f.interpreter._list=null;f.nativeMap._events={};f.narration.present(f.scene);f.renderer.emit('postrender');
        f.played[0].emit('ended');f.frame();assert.deepEqual(f.played.map(x=>x.id),['startled-wendy','startled-elder-tater']);f.narration.leave();
    }
    // Unpainted information, explicit cancellation, mute and focus loss never
    // revive a description merely because a later map has finished loading.
    {
        const f=fixture(13,5,6),source=f.actor(17);f.interpreter._index=16;
        f.narration.accepted(f.scene,f.interpreter,source.candidate,undefined,10);f.narration.pause(f.scene);
        f.frame();assert.equal(f.played.length,0);assert(!f.graphics._wqaNarrationContinuation);
    }
    for(const cancel of [f=>f.narration.leave(),f=>{f.playback.enabled=false;f.frame();},f=>{f.host.hasFocus=()=>false;f.frame();}]) {
        const f=sleeping(80);f.narration.pause(f.scene);cancel(f);
        assert(f.played[0].paused);assert.equal(f.played[0].src,'');assert(!f.graphics._wqaNarrationContinuation);
    }
    {
        const f=sleeping(80);f.narration.pause(f.scene);f.played[0].emit('error');
        assert(f.played[0].src,'late decoder callbacks must not release media during resource loading');
        f.frame();assert.equal(f.played[0].src,'','ready-frame cleanup releases a failed paused clip');
    }
    {
        const f=sleeping(100);f.narration.pause(f.scene);
        const battle={_wqaBattleStarted:true,_started:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
        f.host.manager._scene=f.graphics.app.stage=battle;f.narration.present(battle);
        assert(!f.played[0].paused,'already confirmed narration resumes after native battle readiness');f.narration.leave();
    }
    {
        const {performance}=require('node:perf_hooks');
        const f=sleeping(80),start=performance.now();
        for(let n=0;n<240;n++)f.frame();
        const readyMs=performance.now()-start;
        f.narration.pause(f.scene,true);f.status._brightness=128;
        const faded=performance.now();for(let n=0;n<240;n++)f.frame();
        const fadeMs=performance.now()-faded;
        f.scene._wqaPreloads=new Set([{}]);const cold=performance.now();
        for(let n=0;n<240;n++)f.frame();
        console.log(`Throttled240 narration frames: ready ${readyMs.toFixed(2)} ms, pure fade ${fadeMs.toFixed(2)} ms, resource-closed ${(performance.now()-cold).toFixed(2)} ms; no native wait added.`);
        f.narration.leave();
    }
    console.log('Verified full original sleep narration across pure fades and readiness-gated map continuation at80/100/200/250 percent; retained playhead, ordered confirmed voices, no hidden-effect carry, and explicit cancel/mute/blur retirement.');
};
