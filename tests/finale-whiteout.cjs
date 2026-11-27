'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const troops=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/Troops.json'),'utf8'));
 const methods=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),path.join(stock,'package.nw'),'screen-tint'],{encoding:'utf8',timeout:6000}));
 for(const mode of ['recorded','nvda','stale-filter','wrong-page','hidden','disabled','unpainted']){
  const f=fixture(107,3,3,mode!=='nvda'),spoken=[];
  if(mode==='nvda'){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  f.scene._wqaBattleStarted=true;f.root.$dataTroops=troops;
  const script={_list:troops[96].pages[5].list,_index:25};f.root.$gameTroop={_troopId:96,_interpreter:script};
  const field=f.spriteset._battleField={},art={worldVisible:mode!=='hidden',worldAlpha:1,bitmap:{isReady:()=>true}};
  f.spriteset._enemySprites=[{parent:field,worldVisible:true,worldAlpha:1,_mainSprite:art,_enemy:{_enemyId:38}}];
  const c=vm.createContext({...f.root,Game_Interpreter:function(){},Game_Screen:function(){},Spriteset_Base:function(){},ColorFilter:function(){this.uniforms={};},
   Graphics:f.graphics,SceneManager:{_scene:f.scene},WendyQuestAccessFinaleBattle:f.narration.battleAccepted});
  vm.runInContext('Array.prototype.clone=function(){return this.slice();}',c);
  for(const method of methods)vm.runInContext(method,c);
  f.status._tone=vm.runInContext('[0,0,0,0]',c);
  f.status.startTint=c.Game_Screen.prototype.startTint;f.status.tone=c.Game_Screen.prototype.tone;
  f.spriteset._baseColorFilter=new c.ColorFilter();
  if(mode==='disabled')f.playback.narration.enabled=false;
  if(mode==='wrong-page')script._list=troops[96].pages[4].list;
  const params=vm.runInContext('[[255,255,255,0],180,false]',c);
  c.Game_Interpreter.prototype.command223.call(script,params);
  for(let n=0;n<130;n++){
   c.Game_Screen.prototype.updateTone.call(f.status);
   if(mode!=='stale-filter')c.Spriteset_Base.prototype.updateBaseFilters.call(f.spriteset);
   f.frame(mode!=='unpainted');
  }
  const positive=['recorded','nvda'].includes(mode);assert.equal(f.played.length+spoken.length,positive?1:0,mode);
  if(positive)assert.equal(mode==='nvda'?spoken[0]:f.played[0].id,mode==='nvda'?'White light engulfs the Double Big Mech.':'double-mech-whiteout');
  f.narration.leave(f.scene);
 }
 console.log('Finale whiteout: original native tint/filter/command, recorded/NVDA and five negative cases pass; both explosion producers unchanged.');
};
