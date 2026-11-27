'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const troops=JSON.parse(fs.readFileSync(path.join(stock,'package.nw/data/Troops.json'),'utf8'));
 const methods=JSON.parse(execFileSync('python',['-B',path.join(__dirname,'battle-focus-producers.py'),stock,'shield'],{encoding:'utf8',timeout:7000}));
 function setup(nvda=false){
  const f=fixture(107,3,3,!nvda),spoken=[];
  if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  f.scene._wqaBattleStarted=true;f.root.$dataTroops=troops;
  f.root.$gameTroop={_troopId:96,_interpreter:{_list:troops[96].pages[4].list,_index:34}};
  const field=f.spriteset._battleField={},actor={parent:field,_enemy:{_enemyId:38}};
  const art={parent:actor,bitmap:{width:64,height:64},_frame:{x:0,y:0,width:64,height:64},
   anchor:{x:.5,y:1},scale:{x:1,y:1},width:64,height:64,worldVisible:true,worldAlpha:1,texture:{valid:true},
   addChildAt(child){child.parent=this;}};
  actor._mainSprite=art;f.spriteset._enemySprites=[actor];
  class Bitmap{constructor(){this.context={};}blt(){}static load(url){return {_url:url};}}
  class Sprite{constructor(bitmap){Object.assign(this,{bitmap,worldVisible:true,worldAlpha:1,texture:{valid:true}});}
   setFrame(){}destroy(){this.destroyed=true;this.parent=null;}}
  const c=vm.createContext({a2_0x990531(){throw Error('Unresolved native property');},BattleAnimations:{},Bitmap,Sprite,TilingSprite:Sprite,SceneManager:{_scene:f.scene},
   CoroutineManager:{StartAnonymousCoroutine(){}},
   WendyQuestAccessFinaleShield:(scene,art)=>f.narration.battleAccepted(scene,null,null,null,null,art)});
  for(const method of methods)vm.runInContext(method,c);
  c.BattleAnimations.SuperShieldApply({AddOnFrameUpdate(){}},art,.75);
  return {...f,c,art,actor,spoken,count:()=>spoken.length+f.played.length};
 }
 for(const nvda of [false,true]){
  const f=setup(nvda),overlay=f.art.__SuperShieldOverlay;
  f.c.BattleAnimations.SuperShieldCleanup(f.art);assert(overlay.destroyed);
  f.frame(false);assert.equal(f.count(),0,'cleanup alone cannot speak before paint');f.renderer.emit('postrender');
  assert.equal(f.count(),1);assert.equal(nvda?f.spoken[0]:f.played[0].id,nvda?
   'The gold lattice shielding the Double Big Mech vanishes.':'mech-shield-vanishes');
  f.c.BattleAnimations.SuperShieldCleanup(f.art);f.frame();assert.equal(f.count(),1,'destroyed overlay cannot repeat');
  f.narration.leave(f.scene);
 }
 for(const invalid of ['wrong-troop','wrong-page','wrong-enemy','wrong-art','hidden','unready','disabled','unpainted']){
  const f=setup();
  if(invalid==='wrong-troop')f.root.$gameTroop._troopId=98;
  if(invalid==='wrong-page')f.root.$gameTroop._interpreter._list=troops[96].pages[5].list;
  if(invalid==='wrong-enemy')f.actor._enemy._enemyId=37;
  if(invalid==='wrong-art')f.art.__SuperShieldOverlay.bitmap._url='other.png';
  if(invalid==='hidden')f.art.__SuperShieldOverlay.worldVisible=false;
  if(invalid==='unready')f.scene._started=false;
  if(invalid==='disabled')f.playback.narration.enabled=false;
  f.c.BattleAnimations.SuperShieldCleanup(f.art);f.frame(invalid!=='unpainted');
  assert.equal(f.count(),0,invalid);f.narration.leave(f.scene);
 }
 console.log('Gold shield: original native apply/cleanup, recorded/NVDA and eight source/readiness/paint negatives pass.');
};
