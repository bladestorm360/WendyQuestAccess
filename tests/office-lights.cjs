'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,stock)=>{
 const read=mode=>JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),mode],{encoding:'utf8',timeout:6000}));
 const methods=read('office-pictures'),admission=read('narration-ready');
 let cases=0;
 for(const event of [2,3,4,16,17,18,19])for(const nvda of [false,true])for(const cold of [false,true]){
  const f=fixture(103,event,0,!cold),player=f.actor(-1),thief=f.actor(9),captions=[];
  if(nvda){f.host.speechPreferences=()=>({descriptionVoice:'nvda',enabled:true});
   f.host.describeNarration=(text,ready)=>{assert(ready());captions.push(text);return true;};}
  thief.candidate._characterName=thief.sprite._characterName='~BeefThief';
  const c=vm.createContext({...f.root,Graphics:f.graphics,Game_Interpreter:function(){},Game_Picture:function(){this.initialize();},
   Game_Screen:function(){},Game_Message:function(){},Point:function(){this.x=this.y=0;},
   $gameParty:{inBattle:()=>false},$gameVariables:{value:()=>0},WendyQuestAccessNarrationPresent:f.narration.present});
  for(const method of methods)vm.runInContext(method,c);
  for(const key of ['showPicture','erasePicture','realPictureId','picture'])f.status[key]=c.Game_Screen.prototype[key];
  f.status._pictures=[];
  f.interpreter.picturePoint=c.Game_Interpreter.prototype.picturePoint;
  const update=vm.runInContext('(function(){'+admission+'})',c);
  const frame=paint=>{f.graphics.frameCount++;update.call(f.scene);if(paint!==false)f.renderer.emit('postrender');};
  const parent=f.spriteset._pictureContainer_upper={children:[]},list=f.interpreter._list;
  assert(c.Game_Interpreter.prototype.command231.call(f.interpreter,list[4].parameters));
  const native=f.status._pictures[1];assert.equal(native._name,'black');
  const sprite={parent,_pictureId:1,_pictureName:'black',texture:{valid:true},worldVisible:true,worldAlpha:1,
   _frame:{width:1264,height:990},anchor:{x:0,y:0},worldTransform:{a:native._scaleX/100,b:0,c:0,d:native._scaleY/100,tx:native._x,ty:native._y}};
  parent.children=[sprite];f.interpreter._index=14;
  f.scene._wqaPreloads=new Set([{}]);frame();assert.equal(nvda?captions.length:f.played.length,0);
  f.scene._wqaPreloads.clear();frame();frame(false);
  if(cold)assert.equal(nvda?captions.length:f.played.length,nvda?1:0,'cold recording load waits for its first actual paint');
  f.renderer.emit('postrender');assert.equal(nvda?captions[0]:f.played[0]?.id,nvda?'The lights go out.':'office-lights-out');
  f.interpreter._index=27;f.spriteset._tilemap.worldVisible=true;
  c.Game_Interpreter.prototype.command235.call(f.interpreter,list[26].parameters);
  frame();assert.equal(nvda?captions.length:f.played.length,1,'native erase must also remove its drawn black sprite');
  parent.children=[];frame(false);f.renderer.emit('postrender');
  if(nvda)assert.equal(captions[1],'The lights come back on, revealing a hooded figure ahead.');
  else {assert.equal(f.played.length,1);assert(!f.played[0].paused,'reveal never interrupts the blackout caption');
   f.played[0].emit('ended');frame();assert.equal(f.played[1]?.id,'office-lights-on');f.played[1].emit('ended');}
  for(let n=0;n<20;n++)frame();assert.equal(nvda?captions.length:f.played.length,2,'no repeated caption during this dialogue');
  assert.deepEqual([player.candidate._realX,player.candidate._realY],[undefined,undefined],'no player movement or interaction');
  f.narration.leave(f.scene);cases++;
 }
 for(const invalid of ['small-mask','unpainted-mask','wrong-art','hidden-thief','wrong-list','late','foreign-map']){
  const f=fixture(103,2,0);f.actor(-1);const a=f.actor(9);a.candidate._characterName=a.sprite._characterName='~BeefThief';
  const parent=f.spriteset._pictureContainer_upper={children:[]};f.status._pictures={1:{_name:'black',_opacity:255}};
  const sprite={parent,_pictureId:1,_pictureName:'black',texture:{valid:true},worldVisible:true,worldAlpha:1,
   _frame:{width:1264,height:990},anchor:{x:0,y:0},worldTransform:{a:4,b:0,c:0,d:4,tx:-100,ty:-100}};parent.children=[sprite];
  f.interpreter._index=14;
  if(invalid==='small-mask')sprite._frame.width=1;
  if(invalid==='unpainted-mask')sprite.texture.valid=false;
  if(invalid==='wrong-art')sprite._pictureName='white';
  if(invalid==='wrong-list')f.interpreter._list=[];
  if(invalid==='late')f.interpreter._index=34;
  if(invalid==='foreign-map')f.nativeMap._mapId=104;
  if(invalid==='hidden-thief'){f.status._pictures={};parent.children=[];f.interpreter._index=28;a.sprite.worldVisible=false;}
  f.frame();assert.equal(f.played.length,0,invalid);f.narration.leave(f.scene);
 }
 console.log(`Office lights: ${cases} original picture/erase and native ready-site cases across seven triggers, recorded/NVDA, warm/cold, FIFO and seven negatives pass.`);
};
