'use strict';
const assert=require('assert').strict;
const {createSettingsMenu}=require('../src/settings/menu');
const {openSettings}=require('../src/settings/storage');
async function verify(window){
 const document=window.document,scene={_wqaMapRestored:true},root={document,indexedDB:window.indexedDB,
  SceneManager:{_scene:scene},$gameMap:{_mapId:76},$dataSystem:{locale:'en-US'},Input:{keyMapper:{}},
  addEventListener:(...args)=>window.addEventListener(...args)};
 const until=async test=>{for(let i=0;i<400;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Settings did not settle');};
 function make(indexedDB=root.indexedDB){const values={};const menu=createSettingsMenu({...root,indexedDB},
  {readyScene:()=>scene,fieldReady:()=>true,bookmarkContext:()=>null,capturePads(){},suspend(){},resume(){},audioStop(){},
   retireSpeechSilence(){},controllerChanged(){},navigationChanged:v=>values.navigation=v,audioChanged(){},speechChanged:v=>values.speech=v,battleChanged(){}});
  return {menu,values};}
 const buttons=()=>Array.from(document.querySelectorAll('dialog button'));
 const choose=name=>{const button=buttons().find(b=>b.textContent===name);assert(button,name);button.click();};
 const status=()=>document.querySelector('dialog [role=status]')?.textContent;
 let f=make();await until(()=>f.values.speech);
 assert.equal(f.values.navigation.fullRouteReadout,false);assert.equal(f.values.navigation.routeLegsPerReadout,3);
 assert.equal(f.values.navigation.autoRouteReadout,false);
 assert(f.menu.open(scene));choose('Navigation');choose('Full route readout, off');await until(()=>status()==='Navigation settings saved');
 choose('Automatically speak next leg of route, off');await until(()=>status()==='Navigation settings saved');
 choose('Route legs per readout, 3');assert.equal(buttons().length,13);
 // Controller and keyboard share the same native DOM focus/confirm path.
 const button=buttons().find(b=>b.textContent==='12');button.focus();
 f.menu.controllerInput(f.menu.controllerOwner(),'confirm','xbox',0);await until(()=>status()==='Navigation settings saved');
 assert.equal(f.values.navigation.routeLegsPerReadout,12);
 f.menu.controllerInput(f.menu.controllerOwner(),'back','xbox',0);
 assert.equal(document.activeElement.textContent,'Route legs per readout, 12');
 f.menu.retire(scene);const database=await openSettings(window.indexedDB),saved=await database.read('navigation');
 assert(saved.fullRouteReadout&&saved.autoRouteReadout);assert.equal(saved.routeLegsPerReadout,12);
 f=make();await until(()=>f.values.speech);assert(f.values.navigation.fullRouteReadout&&f.values.navigation.autoRouteReadout);
 assert.equal(f.values.navigation.routeLegsPerReadout,12);
 const legacy={...saved,autowalk:true,fullRouteReadout:false};delete legacy.autoRouteReadout;delete legacy.routeLegsPerReadout;
 await database.save(legacy,'navigation');f=make();await until(()=>f.values.speech);
 assert.equal(f.values.navigation.fullRouteReadout,false);assert.equal(f.values.navigation.autoRouteReadout,false);
 assert.equal(f.values.navigation.routeLegsPerReadout,3);assert.equal(f.values.navigation.autowalk,true);
 const failing={open(name,version){const native=window.indexedDB.open(name,version),request={};native.onsuccess=()=>{
  const db=native.result;request.result=new Proxy(db,{get(target,key){if(key==='transaction')return(...args)=>{if(args[1]==='readwrite')throw Error('Expected save failure');return target.transaction(...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;},set(t,k,v){t[k]=v;return true;}});request.onsuccess?.();};native.onerror=()=>{request.error=native.error;request.onerror?.();};return request;}};
 f=make(failing);await until(()=>f.values.speech);assert(f.menu.open(scene));choose('Navigation');choose('Route legs per readout, 3');choose('1');
 await until(()=>status()?.startsWith('Could not save'));assert.equal(f.values.navigation.routeLegsPerReadout,3);
 assert.equal(document.activeElement.textContent,'3');f.menu.retire(scene);
 return {defaults:'off,3,off',persistence:'saved choices,legacy fields,failed-write rollback',controls:'shared keyboard/controller buttons and Back'};
}
module.exports={verify};
