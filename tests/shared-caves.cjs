'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {captureWorld,eventTarget}=require('../src/world/snapshot');
const {composeWorld,indexOf,step}=require('../src/world/geometry.cjs');
const {sharedCaveArea}=require('../src/world/shared-caves');
const {mapPlace}=require('../src/world/map-banner');
const {createField}=require('../src/world/field');
const {activeMovingEnemy}=require('../src/world/destinations');
module.exports=async(c,load,read,verifyWorker)=>{
    c.$dataCommonEvents=read('CommonEvents.json');
    const states={variables:{5:0,10:4},switches:[11,23,33,38,39,51,52,77,250]};
    c.$gameParty.members=()=>[4];c.$gameParty._actors=[1,2,3,4,5];
    for(const [x,y,area,exits]of [[9,21,0,[20,50]],[57,18,1,[3,4]],[30,8,2,[10]],[34,30,3,[16]]]){
        const f=load(48,states);f.player.setPosition(x,y);
        const world=composeWorld(f.geometry,{mode:'walk',terrain:[],events:[],vehicles:[]});
        const seen=new Set([indexOf(world,x,y)]),queue=[...seen];
        for(let n=0;n<queue.length;n++)for(let h=0;h<4;h++){
            const next=step(world,queue[n],h);if(next>=0&&!seen.has(next)){seen.add(next);queue.push(next);}
        }
        for(const cell of seen)assert.equal(sharedCaveArea(c,cell%60,Math.floor(cell/60)),area,
            'every native terrain edge remains inside the independently verified section');
        const snap=captureWorld(c);
        const found=snap.objects.filter(t=>t.category==='exits').map(t=>t.id).sort((a,b)=>a-b);
        assert.deepEqual(found,area?[3,4,10,16]:exits);
        for(const t of snap.objects)assert.equal(sharedCaveArea(c,t.x,t.y)===0,area===0,'cave and mine destination sets stay separate');
        assert.equal(mapPlace(c),area?'Nugget Mines':'Caves');
        assert(snap.live.events.some(e=>e.id===16)&&snap.live.events.some(e=>e.id===20),
            'native routing events remain present across the unchanged map canvas');
    }
    const saved={scene:c.SceneManager._scene,app:c.Graphics.app};
    for(const auto of [false,true]){
        const f=load(48,states);f.player.setPosition(57,18);f.gameMap.inactiveTime=0;
        for(const event of f.gameMap.events())if(activeMovingEnemy(c,event))event._erased=true;
        const guard=f.gameMap.event(29);guard._erased=false;guard.setPosition(52,9);
        assert(activeMovingEnemy(c,guard));
        f.player._followers={areGathering:()=>false,updateMove(){}};
        const renderer=new EventEmitter(),packets=[],records=[];
        const scene={_wqaFieldReady:true,_wqaMapRestored:true,_mapLoaded:true,_started:true,_active:true,
            _prevCanMove:true,srcWendy:{},srcStones:{},_fadeDuration:0,_fadeOpacity:0};
        c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
        c.Input={dir4:0};c.$gameTemp={isDestinationValid:()=>false,clearDestination(){}};
        c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
        const bookmark={id:'mine-prefix',revision:1,kind:'point',map:59,mode:'walk',name:'Remote chest',x:57,y:6};
        const worker=Object.assign(new EventEmitter(),{unref(){},postMessage:p=>packets.push(p)});
        const field=createField(c,{manager:c.SceneManager,graphics:c.Graphics,hasFocus:()=>true,screenFading:()=>false,
            navigationPreferences:()=>({autowalk:auto}),bookmarks:()=>[bookmark],
            makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
            {open:r=>{records.push(r);return records.length;},close(){},arrive:r=>{records.push(r);return records.length;},endArrival(){}});
        c.WendyQuestAccessAutowalkInput=field.autowalk.input;
        c.WendyQuestAccessFieldMove=field.autowalk.moved;c.WendyQuestAccessFieldChanged=field.changed;
        scene._wqaSettingsActive=true;assert(field.selectBookmark(scene,bookmark));scene._wqaSettingsActive=false;
        assert(field.command('directions'));renderer.emit('postrender');
        const packet=packets.at(-1);assert(packet.request.transfer);
        let route;await verifyWorker(f,packet.request,packet.live,r=>{route=r;worker.emit('message',{
            epoch:packet.epoch,sequence:packet.sequence,map:packet.map,result:r});});
        renderer.emit('postrender');assert.equal(route.status,'enemyBlocked');
        assert.equal(field.autowalk.active(scene),auto,'first blocked remote request respects Autowalk');
        assert.equal(records.at(-1)?.kind,auto?'fieldStatus':'routeDirections');
        if(auto){
            assert.equal(records.at(-1).name,'Walking.');
            for(let n=0;n<route.distance;n++){f.player.moveByInput();f.player._realX=f.player._x;f.player._realY=f.player._y;}
            f.player.moveByInput();renderer.emit('postrender');
            assert.deepEqual([f.player._x,f.player._y],[route.arrival.x,route.arrival.y]);
            assert(!guard.isStarting(),'the blocked encounter remains player-owned');
            assert(!field.autowalk.active(scene));
            guard._erased=true;
            assert(field.command('directions'));renderer.emit('postrender');
            const next=packets.at(-1);assert(next.request.transfer,'selected remote destination survives prefix completion');
            await verifyWorker(f,next.request,next.live,r=>{assert.equal(r.status,'ready');worker.emit('message',{
                epoch:next.epoch,sequence:next.sequence,map:next.map,result:r});});
            renderer.emit('postrender');assert(field.autowalk.active(scene));
            field.autowalk.stop(scene);
        }
    }
    c.SceneManager._scene=saved.scene;c.Graphics.app=saved.app;
    console.log('Shared caves: four exhaustive native components retain local labels/objects and all routing actors; first blocked remote request walks only in Autowalk mode, stops before enemy and retains onward goal.');
};
