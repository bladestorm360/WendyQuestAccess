'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const native=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),'terrain-paint'],{encoding:'utf8',timeout:6000}));
 for(const nvda of [false,true])for(const invalid of [null,'one-cell','offscreen','wrong-list','late','repaint']){
  const f=fixture(97,8,1),player=f.actor(-1),tiles=f.spriteset._tilemap,spoken=[];
  if(nvda){f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  const count=()=>nvda?spoken.length:f.played.length;
  Object.assign(f.nativeMap,{_displayX:0,_displayY:7});
  Object.assign(tiles,{worldVisible:true,_mapData:f.root.$dataMap.data.slice(),_mapWidth:34,_mapHeight:40});
  Object.assign(player.candidate,{_realX:3,_realY:12});f.interpreter._index=16;
  f.status._brightness=0;f.scene._wqaTerrainWork=1;
  const c=vm.createContext({Tilemap:function(){},SceneManager:{_scene:f.scene},
   a15_0x363c12(){throw Error('Unexpected native property');}});
  for(const method of native)vm.runInContext(method,c);
  for(const row of f.interpreter._list.slice(18,54).filter(row=>row.code===357)){
   const at=JSON.parse(row.parameters[3].coordinates),tile=/^D(\d+),(\d+)$/.exec(row.parameters[3].tileId);
   assert(tile);c.Tilemap.prototype.SetMapData.call(tiles,+at.x,+at.y,+at.z,768+8*(+tile[2])+(+tile[1]));
  }
  for(let n=0;n<160;n++)f.frame();assert.equal(count(),0,'blackout/tile work is silent');
  f.interpreter._index=68;f.scene._wqaTerrainWork=0;f.status._brightness=255;
  // Portrait preloading can skip the movement admission entirely. Recover the
  // exact visible door while Wendy is stationary in Frostyna's next paragraph.
  if(invalid==='one-cell')tiles._mapData[(2*40+9)*34+4]=0;
  if(invalid==='offscreen')f.nativeMap._displayY=20;
  if(invalid==='wrong-list')f.interpreter._list=[];
  if(invalid==='late')f.interpreter._index=84;
  if(invalid==='repaint')tiles._needsRepaint=true;
  f.frame(false);assert.equal(count(),0,'postrender owns publication');f.renderer.emit('postrender');
  assert.equal(count(),invalid?0:1,String(invalid));
  if(!invalid){if(nvda)assert.deepEqual(spoken,['Chomps has smashed the door open.']);
   else {assert.equal(f.played[0].id,'chomps-door-open');f.played[0].emit('ended');}
   for(let n=0;n<40;n++)f.frame();assert.equal(count(),1,'one description in the real script window');}
  assert.deepEqual([player.candidate._realX,player.candidate._realY],[3,12],'no movement needed for the door reveal');
  f.narration.leave(f.scene);
 }
 console.log('Verified Chomps doorway: native nine-tile paint, cold/fade recovery, stationary actor, recorded/NVDA, one activation and six visibility/ownership gates.');
};
