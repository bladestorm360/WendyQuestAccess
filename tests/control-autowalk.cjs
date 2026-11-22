'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const { createField } = require('../src/world/field');
const { captureWorld } = require('../src/world/snapshot');
const { solveRoute } = require('../src/world/routes.cjs');
const { simpleTerrainControl } = require('../src/world/terrain-control-labels.cjs');

module.exports = async function verifyControls(c, load, verifyWorker, read, snapshot) {
    const simple = [[12,56], [27,43], [36,37], [62,17], [62,18], [93,58], [103,5], [104,6]];
    for (const [id,event] of simple) {
        const f = load(id), actor = f.gameMap.event(event), entry = f.map.events[event];
        assert(simpleTerrainControl(id,actor,entry));
        const changed = structuredClone(entry);
        changed.pages[0].list.splice(1,0,{code:102,parameters:[]});
        const choice = {...actor, page: () => changed.pages[0]};
        assert(!simpleTerrainControl(id,choice,changed), 'a new choice cannot be auto-accepted');
    }
    for (const [id,event,x,y,target] of [[12,56,43,15,7],[27,43,7,41,4],[36,37,29,19,6],
        [62,18,13,29,10],[93,58,3,40,2],[103,5,7,2,3],[104,6,21,5,68]]) {
        const f = load(id); f.player.setPosition(x,y);
        // Reuse the existing stationary-collider control fixtures; the full
        // Russetwood replay below captures production moving-encounter state.
        const live = { ...snapshot(f), terrain: new Uint32Array(0) };
        await verifyWorker(f,{x,y,event:target,field:true,limit:8,autowalk:true,beacon:false},live,result => {
            assert.equal(result.status,'controlRoute'); assert.equal(result.event,event);
            assert.equal(result.course.length,result.distance,'the full automatic course is independent of beacon and spoken leg cap');
        });
    }
    let peak = 0, nativeMs = 0, steps = 0;
    async function run(x,y,target,mode='finish') {
        const f = load(12), {player,map,gameMap} = f;
        delete player.direction;
        player.setPosition(x,y);
        player._followers = {areGathering:()=>false,updateMove(){}};
        gameMap.inactiveTime=0;
        gameMap._interpreter=Object.assign(new c.Game_Interpreter(),{loadImages(){}});
        gameMap.refreshIfNeeded=()=>{};
        const renderer=new EventEmitter(), packets=[],records=[];
        const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_prevCanMove:true,
            srcWendy:{},srcStones:{},_active:true,_fadeDuration:0,_fadeOpacity:0};
        c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
        c.Input={dir4:0};c.ConfigManager={alwaysDash:false};c.$testEvent=null;
        c.$gameTemp={isDestinationValid:()=>false,isCommonEventReserved:()=>false,clearDestination(){}};
        c.$gameMessage={isBusy:()=>false};c.$gameScreen={_brightness:255};c.addEventListener=()=>{};
        const bookmark={id:1,revision:1,kind:'entity',map:12,mode:'walk',event:target,category:'treasure',name:'Selected chest'};
        const preferences={autowalk:true,speakAutowalkPath:false};
        const worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet){packets.push(packet);}});
        const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
            navigationPreferences:()=>preferences,bookmarks:()=>[bookmark],makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),
            createRouteWorker:()=>worker},{open(record){records.push(record);return records.length;},close(){},
            arrive(record){records.push(record);return records.length;},endArrival(){}});
        c.WendyQuestAccessAutowalkInput=field.autowalk.input;
        c.WendyQuestAccessFieldMove=field.autowalk.moved;
        c.WendyQuestAccessSceneLeaving=field.leave;
        c.WendyQuestAccessFieldEvent=(current,event)=>{field.iceEventStarted(current,event);field.autowalk.stop(current);};
        const frame=()=>renderer.emit('postrender');
        const tick=()=>{const started=performance.now();player.moveByInput();player._realX=player._x;player._realY=player._y;
            const elapsed=performance.now()-started;peak=Math.max(peak,elapsed);nativeMs+=elapsed;steps++;frame();};
        let lastResult;
        async function reply() {
            const packet=packets.at(-1);assert(packet);
            await verifyWorker(f,packet.request,packet.live,result=>{lastResult=result;worker.emit('message',{
                epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result});});
            frame();return packet;
        }
        scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
        assert(field.command('directions'));frame();
        assert.equal(packets.at(-1).request.event,target);
        await reply();assert(field.autowalk.active(scene),'control detours must start automatic movement');
        const verifiedApproach=lastResult.arrival;
        if(mode==='cancel') {
            field.cancelAutowalk(scene);assert(!scene._wqaIceRoute);tick();
            assert.deepEqual([player._x,player._y],[x,y]);return;
        }
        if(mode==='manual') {
            field.autowalk.input(scene,player,4,true);assert(!scene._wqaIceRoute);assert(!field.autowalk.active(scene));return;
        }
        for(let limit=0;field.autowalk.active(scene)&&limit<200;limit++)tick();
        const button=gameMap.event(56);
        assert.equal(gameMap._interpreter._eventId,56,'the actual native Action Button path selects the bridge button');
        assert.equal(player._direction,verifiedApproach.facing);
        assert.deepEqual([player._x,player._y],[verifiedApproach.x,verifiedApproach.y]);
        assert(scene._wqaIceRoute,'selected destination survives native interpreter acceptance');
        assert.equal(records.filter(record=>record.name==='Arrived.').length,0,'the button is not the selected arrival');
        const before=packets.length;
        field.iceRouteReady(scene);assert.equal(packets.length,before,'no routing during the native script');
        // Invoke the original native tile setter and self-switch command from
        // the authored rows. Presentation-only sounds/plugin dispatch are inert.
        const states=new Set();c.$gameSelfSwitches.value=key=>states.has(key.join(','));
        c.$gameSelfSwitches.setValue=(key,value)=>{if(value)states.add(key.join(','));else states.delete(key.join(','));};
        for(const row of map.events[56].pages[0].list) {
            if(row.code===357) {
                const args=row.parameters[3],{x,y,z}=JSON.parse(args.coordinates),relative=JSON.parse(args.relativity);
                gameMap.setTileId(+x,+y,+z,args.tileId,relative.clearUpperLayers,relative.allowAutotiling);
            }
            if(row.code===123)gameMap._interpreter.command123(row.parameters);
        }
        button._pageIndex=button.findProperPageIndex();assert.equal(button._pageIndex,1);
        gameMap._interpreter.clear();
        scene._wqaFieldReady=true;gameMap._needsRefresh=gameMap._needsTilemapRefresh=false;
        field.iceRouteReady(scene);frame();assert.equal(packets.length,before+1);
        assert.equal(packets.at(-1).request.event,target,'continuation restores the original selected chest');
        assert.equal(solveRoute(f.geometry,packets.at(-1).live,packets.at(-1).request).status,'ready');
        await reply();assert(field.autowalk.active(scene));
        for(let limit=0;field.autowalk.active(scene)&&limit<200;limit++)tick();
        assert.equal(records.filter(record=>record.name==='Walking.').length,1,'resume is silent');
        assert.equal(records.filter(record=>record.name==='Arrived.').length,1);
        assert.equal(records.at(-1).name,'Arrived.');
    }
    await run(15,36,26);await run(39,22,26);await run(43,15,7);
    await run(15,36,26,'cancel');await run(15,36,26,'manual');
    console.log(`Verified8 choice-free buttons,7 full worker control courses without beacon,3 native Russetwood detours/button activations/final arrivals, cancellation and manual takeover. ${steps} throttled native input updates ${nativeMs.toFixed(2)}ms total/${peak.toFixed(2)}ms peak; no actual game measurement.`);
};
