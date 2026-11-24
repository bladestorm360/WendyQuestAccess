'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createField}=require('../src/world/field');
const {formatSpeech}=require('../src/services/speech-text.cjs');
module.exports=async(c,load,read,verifyWorker)=>{
 c.$dataCommonEvents=read('CommonEvents.json');c.$dataMapInfos=read('MapInfos.json');
 c.addEventListener=()=>{};c.$gameScreen={_brightness:255};c.$gameMessage={isBusy:()=>false};
 c.$gameParty.members=()=>[4];c.$gameParty.inBattle=()=>false;
 for(const automatic of [false,true])for(const [category,name]of [['Exits','To Breaded Bay'],['Vehicles','Boat'],['Vehicles','Board the boat from the island dock']]){
  const f=load(113,{switches:[33,38,250],variables:{10:4}});f.player.setPosition(12,17);f.gameMap.inactiveTime=0;
  Object.assign(f.gameMap.ship(),{_mapId:113,_x:18,_y:6,_driving:false});
  const scene={_wqaFieldReady:true,_active:true,_fadeDuration:0,_fadeOpacity:0};
  const renderer=new EventEmitter();c.SceneManager._scene=scene;c.Graphics.app={stage:scene,renderer};
  const packets=[],records=[],worker=Object.assign(new EventEmitter(),{unref(){},postMessage(packet,buffers){packets.push(structuredClone(packet,{transfer:buffers||[]}));}});
  const field=createField(c,{graphics:c.Graphics,manager:c.SceneManager,hasFocus:()=>true,screenFading:()=>false,
   navigationPreferences:()=>({spoilers:true,autowalk:automatic}),makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),createRouteWorker:()=>worker},
   {open(r){records.push(r);return records.length;},close(){},arrive(r){records.push(r);return records.length;},endArrival(){}});
  const ask=action=>{assert(field.command(action));renderer.emit('postrender');};
  for(let n=0;n<16&&records.at(-1)?.category!==category;n++)ask('nextCategory');
  assert.equal(records.at(-1)?.category,category);
  for(let n=0;n<250&&records.at(-1)?.name!==name;n++)ask('nextDestination');
  assert.equal(records.at(-1)?.name,name);ask('directions');const packet=packets.shift();assert(packet?.request.boatFallback);
  let result;await verifyWorker(f,packet.request,packet.live,r=>result=r);assert(result.boatFallback);
  worker.emit('message',{...packet,result});renderer.emit('postrender');
  if(automatic){assert(field.autowalk.active(scene));assert(records.some(r=>formatSpeech(r)==='Walking.'));}
  else assert.match(formatSpeech(records.at(-1)),/west|north|south|east/);
  assert(!records.some(r=>/Not currently reachable|changed|unavailable/.test(formatSpeech(r))));field.leave(scene);
 }
 console.log('Verified production field dispatch for all three boat destinations in manual and Autowalk modes, with real worker replies and retained boarding tickets.');
};
