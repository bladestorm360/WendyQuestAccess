'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,commandContext,stock)=>{
 const read=mode=>JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),mode],{encoding:'utf8',timeout:6000}));
 const methods=read('office-pictures'),admission=read('narration-ready');
 function setup(nvda=false,cold=false){
  const f=fixture(107,3,3,!nvda&&!cold);f.actor(-1);const spoken=[],list=f.interpreter._list;
  if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  const c=commandContext(f);Object.assign(c,{Game_Picture:function(){this.initialize();},Game_Screen:function(){},
   Game_Message:function(){},Point:function(){this.x=this.y=0;},$gameParty:{inBattle:()=>false},$gameTroop:{},
   AudioManager:{playSe(){}},WendyQuestAccessNarrationPresent:f.narration.present});
  for(const method of methods)vm.runInContext(method,c);
  for(const key of ['showPicture','realPictureId','picture','movePicture'])f.status[key]=c.Game_Screen.prototype[key];
  f.status._pictures=[];Object.assign(f.interpreter,{picturePoint:c.Game_Interpreter.prototype.picturePoint,wait(){}});
  const parent=f.spriteset._pictureContainer_upper={children:[]};
  const sprite={parent,_pictureId:28,_pictureName:'white',worldVisible:true,worldAlpha:0,texture:{valid:true},
   _frame:{width:640,height:480},anchor:{x:0,y:0},worldTransform:{a:1,b:0,c:0,d:1,tx:0,ty:0}};parent.children=[sprite];
  const update=vm.runInContext('(function(){'+admission+'})',c);
  function start(){f.interpreter._index=107;c.Game_Interpreter.prototype.command250.call(f.interpreter,list[107].parameters);
   c.Game_Interpreter.prototype.command231.call(f.interpreter,list[108].parameters);
   c.Game_Interpreter.prototype.command232.call(f.interpreter,list[109].parameters);f.interpreter._index=110;}
  function frame(paint=true,publish=true){const picture=f.status._pictures[28];
   if(picture){c.Game_Picture.prototype.updateMove.call(picture);if(publish)sprite.worldAlpha=picture._opacity/255;}
   f.graphics.frameCount++;update.call(f.scene);if(paint)f.renderer.emit('postrender');}
  return {...f,c,parent,sprite,spoken,start,frame,count:()=>spoken.length+f.played.length};
 }
 for(const nvda of [false,true])for(const cold of [false,true]){
  const f=setup(nvda,cold);if(cold)f.scene._wqaPreloads=new Set(['white']);f.start();
  if(cold){for(let n=0;n<2;n++)f.frame();assert.equal(f.count(),0);f.scene._wqaPreloads.clear();}
  for(let n=0;n<17;n++)f.frame(false);assert.equal(f.count(),0,'native opacity still requires completed render');
  f.renderer.emit('postrender');assert.equal(f.count(),1);
  assert.equal(nvda?f.spoken[0]:f.played[0].id,nvda?'White light fills the screen.':'stones-white-light');
  if(!nvda)f.played[0].emit('ended');f.interpreter._index=116;
  for(let n=0;n<30;n++)f.frame();assert.equal(f.count(),1);f.narration.leave(f.scene);
 }
 for(const invalid of ['small-picture','stale-alpha','wrong-picture','wrong-slot','hidden','wrong-page','foreign-map','late','unpainted','disabled','collection-overflow']){
  const f=setup();f.start();
  if(invalid==='small-picture')f.sprite._frame.width=1;
  if(invalid==='wrong-picture')f.sprite._pictureName='black';
  if(invalid==='wrong-slot'){f.status._pictures[29]=f.status._pictures[28];delete f.status._pictures[28];f.sprite._pictureId=29;}
  if(invalid==='hidden')f.sprite.worldVisible=false;
  if(invalid==='wrong-page')f.interpreter._list=f.root.$dataMap.events[3].pages[4].list;
  if(invalid==='foreign-map')f.nativeMap._mapId=106;
  if(invalid==='late')f.interpreter._index=117;
  if(invalid==='disabled')f.playback.narration.enabled=false;
  if(invalid==='collection-overflow')f.parent.children=Array.from({length:129},()=>f.sprite);
  for(let n=0;n<17;n++)f.frame(invalid!=='unpainted',invalid!=='stale-alpha');
  assert.equal(f.count(),0,invalid);f.narration.leave(f.scene);
 }
 console.log('Corner Stone white light: four native picture/fade recorded/NVDA/cold cases and11 visibility/source/slot/paint negatives pass; earlier Chomps flash is distinct.');
};
