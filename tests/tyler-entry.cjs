'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function verifyTylerEntry(fixture, commandContext, stock, emoteMethods) {
    // Execute original native jump/interpolation from the pinned source. The
    // no-loop shop coordinates and bush rendering are presentation stand-ins.
    const original = fs.readFileSync(path.join(stock,'package.nw/js/rmmz_objects.js'),'utf8');
    const native = vm.createContext({Game_CharacterBase:function(){},$gameMap:{roundX:x=>x,roundY:y=>y}});
    for(const name of ['jump','updateJump','setDirection','resetStopCount','straighten','hasWalkAnime','hasStepAnime','isDirectionFixed']) {
        const start=original.indexOf(`\nGame_CharacterBase.prototype.${name} = function(`);
        assert(start>=0,name);const end=original.indexOf('\n};',start)+3;
        vm.runInContext(original.slice(start,end),native);
    }
    const prototype=native.Game_CharacterBase.prototype;
    for(const mode of ['jump','landed','music-handoff','retained-music','greeting','wrong-position','transparent','offscreen','late','expired-music']) {
        const f=fixture(181,15,2), {candidate:actor,sprite}=f.actor(7);
        Object.setPrototypeOf(actor,prototype);
        Object.assign(actor,{_x:15,_y:13,_realX:15,_realY:13,_direction:4,_moveSpeed:4,_walkAnime:true,
            refreshBushDepth(){},forceMoveRoute(){this.jump(-4,0);}});
        f.nativeMap.refreshIfNeeded=()=>{};
        Object.assign(f.interpreter,{_index:0,character:()=>actor,isOnCurrentMap:()=>true,setWaitMode(mode){this._waitMode=mode;}});
        f.scene._wqaPreloads=new Set([{}]);
        const c=commandContext(f), row=f.interpreter._list[0];
        c.$gameTemp={requestBalloon(){}};
        for(const method of emoteMethods)vm.runInContext(method,c);
        assert(c.Game_Interpreter.prototype.command205.call(f.interpreter,row.parameters));
        assert(actor._jumpCount>0);assert(!f.scene._wqaNarrationActive,'native cold admission drops the original cue');
        f.interpreter._index=1;
        f.narration.tylerEntry(f.scene);f.frame();assert.equal(f.played.length,0,'closed loading cannot recover output');
        if(mode!=='jump') {
            let frames=0;
            while(actor._jumpCount>0){actor.updateJump();assert(++frames<120);}
            assert.deepEqual([actor._x,actor._y],[11,13]);
            f.interpreter._index=8;f.interpreter._waitCount=30;
        }
        f.scene._wqaPreloads.clear();
        if(mode==='wrong-position')actor._x=15;
        if(mode==='transparent')actor._transparent=true;
        if(mode==='offscreen')sprite.worldTransform.tx=-20;
        if(mode==='late')f.interpreter._index=15;
        if(mode==='greeting' || mode==='expired-music') { f.interpreter._index=14;f.interpreter._waitCount=0; }
        if(mode==='greeting')f.balloon(3,actor,sprite);
        if(mode==='music-handoff' || mode==='retained-music') {
            f.interpreter._waitCount=0;
            assert(c.Game_Interpreter.prototype.command213.call(f.interpreter,f.interpreter._list[8].parameters));
            f.balloon(3,actor,sprite);
            if(mode==='retained-music') {
                f.scene._wqaPreloads.add({});
                f.narration.entry(f.scene,f.interpreter,f.interpreter._list,15);
                f.interpreter._index=14;
                f.scene._wqaPreloads.clear();
            }
        }
        f.narration.tylerEntry(f.scene);
        if(mode==='retained-music')f.narration.questionsPresent(f.scene);f.frame(false);assert.equal(f.played.length,0);
        f.renderer.emit('postrender');
        if(['jump','landed','music-handoff','retained-music','greeting'].includes(mode)) {
            assert.equal(f.played[0]?.id,'tyler-arrives',mode);
            assert(f.scene._wqaTylerEntryObserved);
            for(let n=0;n<20;n++){f.narration.tylerEntry(f.scene);f.frame();}
            assert.equal(f.played.length,1,'the entry recovery is once per actual arrival');
            if(mode!=='greeting') {
                if(mode!=='music-handoff' && mode!=='retained-music') {
                    f.interpreter._index=8;
                    assert(c.Game_Interpreter.prototype.command213.call(f.interpreter,f.interpreter._list[8].parameters));
                    f.balloon(3,actor,sprite);
                }
                f.frame();
                assert.equal(f.played.length,1);assert(!f.played[0].paused,'music never interrupts the entrance description');
                f.played[0].emit('ended');f.frame();
                assert.equal(f.played[1]?.id,'music-tyler');
            }
        } else assert.equal(f.played.length,0,mode+' remains silent');
        f.narration.leave(f.scene);
    }
    console.log('Verified original native Tyler jump, cold-entry rejection/recovery, visible landing wait, once-only entrance before queued music, and wrong-position/hidden/offscreen/late negatives.');
};
