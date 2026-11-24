'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createField}=require('../src/world/field');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
 c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
 c.$gameParty.members=()=>[4];c.$gameParty.inBattle=()=>false;
 for(const automatic of [false,true])for(const [category,name]of [['Exits','To Breaded Bay'],['Vehicles','Boat'],['Vehicles','Board the boat from the island dock'],['Exits','Cauldron']]){
  const f=load(113,{switches:[11,23,33,38,39,51,52,77,250,462,503],variables:{10:4}});f.player.setPosition(12,17);f.gameMap.inactiveTime=0;
  Object.assign(f.gameMap.ship(),{_mapId:113,_x:18,_y:6,_driving:false});
  const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
  const renderer=new EventEmitter();c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
  const packets=[],records=[],worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,buffers){packets.push(structuredClone(packet,{transfer:buffers||[]}));}});
  const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({spoilers:true,autowalk:automatic}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
   {open(r){records.push(r);return records.length;},focus(_token,r){records.push(r);return true;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
  const ask=action=>{assert(field.command(action));renderer.emit('postrender');};
  for(let n=0;n<16&&records.at(-1)?.category!==category;n++)ask('nextCategory');
  assert.equal(records.at(-1)?.category,category);
  for(let n=0;n<250&&records.at(-1)?.name!==name;n++)ask('nextDestination');
  assert.equal(records.at(-1)?.name,name);ask('directions');const packet=packets.shift();assert(packet?.request.boatFallback);
  let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);assert(result.boatFallback);
  worker.emit('message',{...packet,result});renderer.emit('postrender');
  if(automatic){assert(field.autowalk.active(scene));assert(records.some(r=>formatSpeech(r)==='Walking.'));}
  else assert.match(formatSpeech(records.at(-1)),/west|north|south|east/);
  if(automatic){
   f.player._followers={updateMove(){}};
   c.WendyQuestAccessFieldMove=undefined;
   for(let n=0;n<80&&field.autowalk.active(scene);n++){
    const direction=field.autowalk.input(scene,f.player,0);if(!direction)break;
    assert(f.player.canPass(f.player._x,f.player._y,direction));f.player.moveStraight(direction);
    f.player._realX=f.player._x;f.player._realY=f.player._y;field.autowalk.moved(scene,direction,true);
    renderer.emit('postrender');
   }
   assert(!field.autowalk.active(scene));assert.deepEqual([f.player._x,f.player._y],[14,6]);
   assert(!f.gameMap.event(21).isStarting(),'town entry remains a manual final step');
   assert(!records.some(r=>r.board),'the town entrance is not mistaken for the parked boat');
  }
  assert(!records.some(r=>/Not currently reachable|changed|unavailable/.test(formatSpeech(r))));field.leave(scene);
 }
 console.log('Verified production field dispatch for all four boat/cauldron destinations in manual and Autowalk modes, with real worker replies and retained boarding tickets.');
};
