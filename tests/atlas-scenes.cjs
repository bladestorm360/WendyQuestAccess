'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
module.exports=function(fixture,stock) {
    const common=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/CommonEvents.json'),'utf8'));
    const methods=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
        path.join(stock,'package.nw'),'atlas-commands'],{encoding:'utf8',timeout:10000}));
    function setup(warm=true,m=59,e=18,page=1) {
        const f=fixture(m,e,page,warm);
        f.root.$dataCommonEvents=common;f.root.$gameMessage={_texts:[]};
        f.root.$gameVariables={value:()=>200};
        const c=vm.createContext({...f.root,Graphics:f.graphics,SceneManager:{_scene:f.scene},
            Point:function(){this.x=this.y=0;},Game_Picture:function(){this.initialize();},Game_Screen:function(){},Game_Message:function(){},
            Game_Interpreter:function(){},$gameParty:{inBattle:()=>false},
            WendyQuestAccessAtlasAccepted:f.narration.atlasAccepted});
        for(const method of methods)vm.runInContext(method,c,{timeout:500});
        Object.assign(f.status,{_pictures:[],picture:c.Game_Screen.prototype.picture,
            movePicture:c.Game_Screen.prototype.movePicture,realPictureId:c.Game_Screen.prototype.realPictureId});
        f.spriteset.parent=f.scene;
        const parent={parent:f.spriteset,children:[]};f.spriteset._pictureContainer_upper=parent;
        function picture(id,art) {
            const p=new c.Game_Picture();p.show(art,1,320,240,100,100,255,0);f.status._pictures[id]=p;
            parent.children.push({_pictureId:id,_pictureName:art,parent,worldVisible:true,worldAlpha:1,
                texture:{valid:true},_frame:{width:id===27?380:32,height:id===27?320:32},
                anchor:{x:.5,y:.5},worldTransform:{a:1,b:0,c:0,d:1,tx:320,ty:240}});
            return p;
        }
        picture(27,'system/Savoria Map');
        function child(id,index,parentChild=false) {
            const s={_mapId:59,_eventId:18,_index:index,_list:common[id].list,
                picturePoint:c.Game_Interpreter.prototype.picturePoint,wait(){}};
            if(parentChild)f.interpreter._childInterpreter={_mapId:59,_eventId:18,
                _list:common[143].list,_childInterpreter:s};
            else f.interpreter._childInterpreter=s;
            return s;
        }
        function motion(id,index,slot,parentChild=false) {
            const script=child(id,index,parentChild),row=script._list[index];assert.equal(row.code,232);
            assert.equal(row.parameters[0],slot);c.Game_Interpreter.prototype.command232.call(script,row.parameters);
            return script;
        }
        function tick(paint=true) {
            for(const sprite of parent.children) {
                const p=f.status._pictures[sprite._pictureId];if(!p)continue;
                p.updateMove();sprite.worldAlpha=p._opacity/255;
                sprite.worldTransform.tx=p._x;sprite.worldTransform.ty=p._y;
                sprite.worldTransform.a=p._scaleX/100;sprite.worldTransform.d=p._scaleY/100;
            }
            f.narration.atlasPresent(f.scene);f.frame(paint);
        }
        function drain(){for(let n=0;n<12;n++){const audio=f.played.at(-1);audio?.emit('ended');tick();}}
        return {...f,c,picture,motion,tick,drain,parent,child};
    }
    // Verify exact data sites, including every marker slot and both diagram kinds.
    const sites=[[142,75,27],[143,42,27],[101,166,27],[101,212,27],
        [142,80,38],[101,172,38],[160,45,50],
        ...[41,42,43,44,45].flatMap((id,n)=>[[171+2*n,5,id],[172+2*n,3,id]])];
    for(const [ce,index,id] of sites)assert.equal(common[ce].list[index].parameters[0],id);
    for(const [ce,index,id] of sites) {
        const f=setup();
        if(ce===101)f.status._pictures[27]._name=f.parent.children[0]._pictureName='system/Caffeine Caverns Map';
        if(id!==27)f.picture(id,id===38?'system/WendyIcon':id===50?
            'system/MapMarkers/Map Quest Marker':'system/MapMarkers/Map Markers0');
        f.motion(ce,index,id);f.tick(false);assert.equal(f.played.length,0,'native command is not paint');
        f.renderer.emit('postrender');assert.equal(f.played.length,1,[ce,index,id].join('/'));
        const expected=id===27?[143].includes(ce)||index===212?'map-closes':'map-opens':
            id===38?'map-wendy':id===50?'map-quest':ce%2?'map-marks':'map-erases';
        assert.equal(f.played[0].id,expected);
        for(let n=0;n<5;n++)f.tick();assert.equal(f.played.length,1,'held map does not replay');
    }
    {
        const f=setup();for(let n=0;n<5;n++)f.picture(41+n,'system/MapMarkers/Map Markers'+n%4);
        for(let n=0;n<5;n++)f.motion(171+2*n,5,41+n);f.tick();
        assert.deepEqual(f.played.map(a=>a.id),['map-marks'],'five ruins pins form one native batch');
        f.drain();f.c.Game_Message.prototype.clear.call(f.root.$gameMessage);
        f.motion(171,5,41);f.tick();assert.equal(f.played.length,2,'a new native paragraph batch replays');
        f.drain();f.picture(27,'system/Savoria Map');f.motion(142,75,27);f.tick();
        assert.equal(f.played.at(-1).id,'map-opens','reopening creates a new picture lifetime');
    }
    for(const alteration of ['hidden','offscreen','wrong-art','detached','transparent','overflow','map-change','wrong-child']) {
        const f=setup();f.motion(142,75,27);
        const p=f.status._pictures[27],s=f.parent.children[0];
        if(alteration==='hidden')s.worldVisible=false;
        if(alteration==='offscreen')p._x=p._targetX=-50000;
        if(alteration==='wrong-art')s._pictureName='unrelated';
        if(alteration==='detached')f.parent.parent=null;
        if(alteration==='transparent')p._opacity=p._targetOpacity=0;
        if(alteration==='overflow')while(f.parent.children.length<=128)f.parent.children.push({});
        if(alteration==='map-change')f.nativeMap._mapId=48;
        if(alteration==='wrong-child'){f.narration.cancel(f.scene);f.interpreter._childInterpreter=null;
            f.narration.atlasAccepted(f.scene,{_mapId:59,_index:75,_list:common[142].list},27);}
        f.tick();assert.equal(f.played.length,0,alteration);
    }
    {
        const f=setup();f.picture(41,'system/MapMarkers/Map Markers0');
        f.motion(172,3,41,true);f.tick();assert.equal(f.played.length,0,'closing already describes cleanup');
    }
    {
        const f=setup(false);f.motion(142,75,27);f.scene._wqaPreloads=new Set(['native']);
        f.tick();assert.equal(f.played.length,0,'no warmup/render observation inside resource phase');
        f.scene._wqaPreloads.clear();f.tick();f.tick();assert.equal(f.played[0]?.id,'map-opens','cold pack recovers');
    }
    {
        const f=setup();f.motion(142,75,27);f.tick();f.picture(38,'system/WendyIcon');
        f.motion(142,80,38);f.tick();assert.equal(f.played.length,1,'player marker queues behind opening');
        f.played[0].emit('ended');f.tick();assert.equal(f.played[1]?.id,'map-wendy');
        f.narration.pause(f.scene);assert(f.played[1].paused);f.tick();assert(!f.played[1].paused);
    }
    {
        const f=setup();f.motion(142,75,27);f.tick();f.drain();
        f.picture(38,'system/WendyIcon');f.motion(142,80,38);f.tick();f.drain();
        for(let n=0;n<4;n++)f.picture(41+n,'system/MapMarkers/Map Markers'+n);
        f.c.Game_Message.prototype.clear.call(f.root.$gameMessage);
        f.motion(171,5,41);f.tick();f.motion(173,5,42);f.tick();f.drain();
        f.c.Game_Message.prototype.clear.call(f.root.$gameMessage);
        f.motion(175,5,43);f.tick();f.motion(177,5,44);f.tick();f.drain();
        f.motion(143,42,27);f.tick();
        assert.deepEqual(f.played.map(a=>a.id),['map-opens','map-wendy','map-marks','map-marks','map-closes'],
            'Mayor sequence narrates two separate marker batches in order');
    }
    for(let e=121;e<=130;e++) {
        const f=setup(true,87,e,0);
        f.status._pictures[27]._name=f.parent.children[0]._pictureName='system/Caffeine Caverns Map';
        for(const [index,id,expected]of [[171,27,'map-opens'],[193,38,'map-wendy'],[235,27,'map-closes']]) {
            if(id===38)f.picture(38,'system/WendyIcon');
            const s=f.interpreter;s._index=index;s.picturePoint=f.c.Game_Interpreter.prototype.picturePoint;s.wait=()=>{};
            f.c.Game_Interpreter.prototype.command232.call(s,s._list[index].parameters);
            f.tick();assert.equal(f.played.at(-1)?.id,expected);f.drain();
        }
    }
    {
        const f=setup(false);const spoken=[];
        f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
        f.host.describeNarration=text=>spoken.push(text);
        f.motion(142,75,27);f.tick();assert.deepEqual(spoken,['A map slides into view.']);
        assert.equal(f.played.length,0);
    }
    {
        const f=setup();f.motion(142,75,27);f.tick(false);
        f.scene._wqaPreloads=new Set(['next-image']);f.narration.pause(f.scene,false,true);
        f.renderer.emit('postrender');assert.equal(f.played.length,0);
        f.scene._wqaPreloads.clear();f.tick();assert.equal(f.played[0]?.id,'map-opens');
    }
    {
        const f=setup();f.motion(142,75,27);f.parent.children[0].worldVisible=false;
        while(f.parent.children.length<128)f.parent.children.push({});
        const start=performance.now();for(let n=0;n<240;n++)f.tick();
        console.log('Throttled240 maximum-container atlas receipt/paint frames '+(performance.now()-start).toFixed(2)+' ms total.');
    }
    console.log('Atlas native picture motions,17 sites, five-pin grouping, genuine replay, cold readiness, FIFO and visibility negatives pass.');
};
