"use strict";
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,commandContext,stock)=>{
 const paint=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),path.join(stock,'package.nw'),'terrain-paint'],{encoding:'utf8',timeout:6000}));
 function setup(mode){
  const f=fixture(63,13,0),tiles=f.spriteset._tilemap,list=f.interpreter._list,c=commandContext(f);
  f.spriteset.x=f.spriteset.y=0;tiles.worldVisible=true;
  Object.assign(tiles,{_mapData:f.root.$dataMap.data.slice(),_mapWidth:25,_mapHeight:32});
  c.$gameTroop={};c.Tilemap=function(){};c.a15_0x363c12=()=>{throw Error('Unexpected native token');};
  for(const code of paint)vm.runInContext(code,c);
  c.Utils={extractFileName:value=>value};let accepted=0,writes=0;
  c.WendyQuestAccessScreenJolt=(scene,script)=>{accepted++;f.narration.environmentStart(scene,script);};
  c.PluginManager={callCommand(_owner,plugin,command,args){
   assert.equal(plugin,'Tyruswoo_TileControl');assert.equal(command,'set_tile');
   const at=JSON.parse(args.coordinates),tile=/^D(\d+),(\d+)$/.exec(args.tileId);assert(tile);
   if(mode==='partial'&&+at.x===17&&+at.y===5)return;
   c.Tilemap.prototype.SetMapData.call(tiles,+at.x,+at.y,+at.z,768+8*(+tile[2])+(+tile[1]));writes++;
  }};
  if(mode==='wrong-event')f.interpreter._eventId=12;
  for(const [i,row]of list.entries())if(row.code===357&&row.parameters[0]==='Tyruswoo_TileControl'){
   f.interpreter._index=i;c.Game_Interpreter.prototype.command357.call(f.interpreter,row.parameters);
  }
  assert.equal(accepted,mode==='wrong-event'?0:1,'only the exact first native wall mutation admits narration');
  assert.equal(writes,mode==='partial'?12:13);
  f.status.startFlash=(color,duration)=>{f.status._flashColor=Array.from(color);f.status._flashDuration=duration;};
  f.interpreter._index=65;c.Game_Interpreter.prototype.command224.call(f.interpreter,list[65].parameters);
  assert.equal(f.status._flashColor[3],255);assert.equal(f.status._flashDuration,120);
  return f;
 }
 for(const nvda of [false,true]){
  const f=setup(),captions=[];
  if(nvda){f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};f.root.Audio=class{constructor(){throw Error('NVDA must not open recorded audio');}};}
  f.nativeMap._needsTilemapRefresh=true;for(let i=0;i<8;i++)f.frame();assert.equal(f.played.length+captions.length,0);
  f.nativeMap._needsTilemapRefresh=false;f.frame();assert.equal(f.played.length+captions.length,0,'opaque flash hides the new hole');
  f.status._flashColor[3]=0;f.frame(false);assert.equal(f.played.length+captions.length,0);
  f.renderer.emit('postrender');
  if(nvda)assert.deepEqual(captions,['The cavern wall bursts open.']);else assert.equal(f.played[0]?.id,'cauldron-wall-breaks');
  for(let i=0;i<12;i++)f.frame();assert.equal(f.played.length+captions.length,1);
  f.narration.leave(f.scene);
 }
 for(const mode of ['partial','wrong-event','hidden','repaint','refresh','opaque','transition']){
  const f=setup(mode);if(mode!=='opaque')f.status._flashColor[3]=0;
  if(mode==='hidden')f.spriteset._tilemap.worldVisible=false;
  if(mode==='repaint')f.spriteset._tilemap._needsRepaint=true;
  if(mode==='refresh')f.nativeMap._needsTilemapRefresh=true;
  if(mode==='transition')f.narration.pause(f.scene);
  f.frame();assert.equal(f.played.length,0,mode);f.narration.leave(f.scene);
 }
 console.log('Verified exact native wall mutation/flash producers, thirteen painted broken-hole tiles, recorded/NVDA once-only captions and seven visibility/ownership/transition negatives.');
};
