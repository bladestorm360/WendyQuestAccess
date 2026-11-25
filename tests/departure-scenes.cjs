'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {SITES}=require('../src/dialogue/departures');
module.exports=function(fixture,stock,commandContext) {
    const read=name=>JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data',name),'utf8'));
    const common=read('CommonEvents.json');
    const fades=[];let calls=0;
    for(let m=1;m<=239;m++) {
        let data;try{data=read('Map'+String(m).padStart(3,'0')+'.json');}catch{continue;}
        for(const e of data.events)if(e)for(const [p,page]of e.pages.entries())
            for(const [i,row]of page.list.entries())if(row.code===117&&row.parameters[0]===38) {
                calls++;
                const prior=page.list.slice(0,i).findLast(r=>[221,222,201].includes(r.code));
                if(prior?.code===221)fades.push([m,e.id,p,i]);
            }
    }
    assert.equal(calls,122);
    assert.deepEqual(fades,[...SITES.map(s=>s.slice(0,4)),[77,25,0,221],[206,11,0,30]]
        .sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[3]-b[3]));
    assert.equal(read('Map077.json').events[25].pages[0].list[220].code,129,'party join is separate');
    assert.equal(read('Map206.json').events[11].pages[0].list[32].code,201,'cave transfer is separate');
    for(const nvda of [false,true])for(const cold of [false,true])for(const [m,e,p,index,id,cue]of SITES) {
        const f=fixture(m,e,p,!cold),a=f.actor(id),spoken=[];
        f.root.$dataCommonEvents=common;
        if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
            f.host.describeNarration=text=>spoken.push(text);}
        f.spriteset._tilemap.worldVisible=true;
        f.interpreter._index=index;f.interpreter.isOnCurrentMap=()=>true;
        f.interpreter.setupChild=list=>f.interpreter._childInterpreter={_list:list};
        const c=commandContext(f);
        c.WendyQuestAccessDepartureAccepted=f.narration.departureAccepted;
        f.scene._fadeDuration=12;f.status._brightness=0;
        assert(c.Game_Interpreter.prototype.command117.call(f.interpreter,[38]));
        assert(f.scene._wqaDeparturePending,'exact native common acceptance owns the receipt');
        f.narration.departurePresent(f.scene);f.frame();assert.equal(f.played.length+spoken.length,0);
        f.scene._fadeDuration=0;f.status._brightness=255;
        f.narration.departurePresent(f.scene);f.narration.departurePresent(f.scene);f.frame();
        assert.equal(f.played.length+spoken.length,0,'native footsteps alone are not a visible departure');
        // The map's authored hide route or blank event page has now updated.
        if(cue==='frydusa-leaves'){a.candidate._transparent=true;a.sprite.visible=false;}
        else {a.candidate._characterName='';f.frame();assert.equal(f.played.length+spoken.length,0);
            a.sprite._characterName='';}
        f.interpreter._list=null;f.frame(false);assert.equal(f.played.length+spoken.length,0);
        f.renderer.emit('postrender');
        assert.equal(nvda?spoken[0]:f.played[0]?.id,nvda?
            cue==='frydusa-leaves'?'Frydusa flees.':'The archaeologist leaves.':cue);
        for(let n=0;n<4;n++){f.narration.departurePresent(f.scene);f.frame();}
        assert.equal(f.played.length+spoken.length,1,'same native acceptance cannot repeat');
    }
    for(const negative of ['other-index','map-change','unpainted','detached','actor-replaced','tilemap-hidden','wrong-common']) {
        const [m,e,p,index,id]=SITES[0],f=fixture(m,e,p),a=f.actor(id);
        f.root.$dataCommonEvents=common;f.spriteset._tilemap.worldVisible=true;
        f.interpreter._index=index;f.interpreter._childInterpreter={_list:common[38].list};
        if(negative==='other-index')f.interpreter._index++;
        if(negative==='wrong-common')f.interpreter._childInterpreter._list=common[37].list;
        f.narration.departureAccepted(f.scene,f.interpreter);
        a.candidate._characterName='';a.sprite._characterName='';
        if(negative==='map-change')f.nativeMap._mapId=49;
        if(negative==='detached')a.sprite.parent=null;
        if(negative==='actor-replaced')f.nativeMap._events[id]={};
        if(negative==='tilemap-hidden')f.spriteset._tilemap.worldVisible=false;
        f.narration.departurePresent(f.scene);f.frame(negative!=='unpainted');assert.equal(f.played.length,0,negative);
    }
    console.log('Audited122 native footsteps callers; Frydusa/four archaeologist departures pass warm/cold recorded/NVDA, page-clear handoff, actual painted removal and seven ownership/visibility negatives; party join and transfer remain separate.');
};
