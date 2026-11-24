'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {sites}=require('../src/dialogue/environment-visuals');
module.exports=function(fixture,commandContext,stock){
 const paint=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),path.join(stock,'package.nw'),'terrain-paint'],{encoding:'utf8'}));
 let count=0;
 for(const [m,events] of Object.entries(sites))for(const [e,pages]of Object.entries(events))for(const[p,indices]of Object.entries(pages))for(const i of indices){
  if(+m===63)continue; // Exact wall artwork/flash/paint cases have their own replay.
  const f=fixture(+m,+e,+p);f.interpreter._index=i;
  f.spriteset.x=f.spriteset.y=0;const tiles=f.spriteset._tilemap;
  tiles.worldVisible=true;tiles._mapData=f.root.$dataMap.data.slice();tiles._mapWidth=f.root.$dataMap.width;tiles._mapHeight=f.root.$dataMap.height;
  const c=commandContext(f);c.Utils={extractFileName:value=>value};c.PluginManager={callCommand(){}};
  c.WendyQuestAccessScreenJolt=f.narration.environmentStart;
  const row=f.interpreter._list[i];assert(c.Game_Interpreter.prototype.command357.call(f.interpreter,row.parameters));
  const terrain=![27,37].includes(+m);
  if(terrain){
   f.scene._wqaTerrainWork=1;for(let k=0;k<35;k++)f.frame();assert.equal(f.played.length,0);
   f.scene._wqaTerrainWork=0;f.nativeMap._needsTilemapRefresh=true;f.frame();assert.equal(f.played.length,0);
   f.nativeMap._needsTilemapRefresh=false;
   const drain={51:52,53:61,55:59}[m],flood=f.interpreter._list[drain||i].parameters[3];
   c.Tilemap=function(){};c.a15_0x363c12=()=>{throw Error("Unexpected string-table access");};for(const method of paint)vm.runInContext(method,c);
   const x=+flood.x,y=+flood.y,z=+flood.layer,cell=(z*tiles._mapHeight+y)*tiles._mapWidth+x;
   c.Tilemap.prototype.SetMapData.call(tiles,x,y,z,tiles._mapData[cell]+1);tiles._needsRepaint=true;
   f.frame();assert.equal(f.played.length,0,'changed map data alone is not a painted floor');tiles._needsRepaint=false;
  }else{f.frame();assert.equal(f.played.length,0);f.spriteset.x=3;}
  f.frame(false);assert.equal(f.played.length,0);f.renderer.emit('postrender');
  const id=terrain?(+m===19?'cave-floor-shifts':'sauce-drains'):(+m===27&&i!==18?'tremors-strengthen':'ground-trembles');
  assert.equal(f.played[0]?.id,id,[m,e,p,i].join('/'));f.narration.leave(f.scene);count++;
 }
 const f=fixture(19,36,0);f.interpreter._index=11;f.spriteset._tilemap._mapData=f.root.$dataMap.data.slice();
 f.narration.environmentStart(f.scene,f.interpreter);assert(f.scene._wqaEnvironmentPending);f.narration.leave(f.scene);
 assert(!f.scene._wqaEnvironmentPending);f.frame();assert.equal(f.played.length,0,'native transition cancels pending terrain description');
 console.log('Separate environment voices:',count,'earthquake/terrain producers, actual native tile changes and paint, loading deferral and transition cancellation.');
};
