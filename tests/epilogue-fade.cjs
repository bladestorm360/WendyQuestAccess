'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const methods=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),path.join(stock,'package.nw'),'transfer-fade'],{encoding:'utf8',timeout:6000}));
 for(const mode of ['recorded','nvda','cold','black','wrong-page','late','hidden','unpainted']){
  const f=fixture(190,24,0,mode!=='nvda'&&mode!=='cold'),spoken=[];f.actor(-1);
  f.interpreter._index=5;f.spriteset._tilemap.worldVisible=mode!=='hidden';
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  const c=vm.createContext({Scene_Map:function(){},Scene_Base:function(){},$gamePlayer:{fadeType:()=>mode==='black'?0:1}});
  for(const method of methods)vm.runInContext(method,c);
  Object.assign(f.scene,{startFadeIn:c.Scene_Base.prototype.startFadeIn,fadeSpeed:()=>24,updateColorFilter(){}});
  c.Scene_Map.prototype.fadeInForTransfer.call(f.scene);
  if(mode==='wrong-page')f.interpreter._list=f.root.$dataMap.events[24].pages[1].list;
  if(mode==='late')f.interpreter._index=10;
  for(let n=0;n<24;n++){f.frame();c.Scene_Base.prototype.updateFade.call(f.scene);}
  assert.equal(f.played.length+spoken.length,0,'fade is not a ready observation');
  for(let n=0;n<4;n++)f.frame(mode!=='unpainted');
  const positive=['recorded','nvda','cold'].includes(mode);assert.equal(f.played.length+spoken.length,positive?1:0,mode);
  if(positive){assert.equal(mode==='nvda'?spoken[0]:f.played[0].id,mode==='nvda'?'The scene fades through white.':'epilogue-white-fade');
   if(mode!=='nvda')f.played[0].emit('ended');for(let n=0;n<5;n++)f.frame();assert.equal(f.played.length+spoken.length,1);}
  f.narration.leave(f.scene);
 }
 console.log('Epilogue: original native white transfer/start/fade, cold/recorded/NVDA and five source/visibility negatives pass.');
};
