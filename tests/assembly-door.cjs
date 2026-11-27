'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
module.exports=(fixture,commandContext,stock)=>{
 const read=mode=>JSON.parse(execFileSync('python',['-B',path.join(__dirname,'map-producers.py'),
  path.join(stock,'package.nw'),mode],{encoding:'utf8',timeout:6000}));
 const methods=read('door-motion'),admission=read('narration-ready'),emotes=read('music-emotes');
 function setup(nvda=false,cold=false,camera=0){
  const f=fixture(105,12,1,!cold&&!nvda),list=f.interpreter._list,spoken=[];f.actor(-1);const elder=f.actor(5);
  if(nvda){f.host.speechPreferences=()=>({enabled:true,descriptionVoice:'nvda'});
   f.host.describeNarration=(text,ready)=>{assert(ready());spoken.push(text);return true;};}
  f.nativeMap.adjustY=y=>y-camera;f.root.$gameTroop={};f.spriteset._tilemap.worldVisible=true;
  const c=commandContext(f);Object.assign(c,{Game_Picture:function(){this.initialize();},Game_Screen:function(){},
   Game_Message:function(){},Sprite_Picture:function(){},Point:function(){this.x=this.y=0;},
   $gameParty:{inBattle:()=>false},$gameTroop:{},AudioManager:{playSe(){}},
   a15_0x363c12(){throw Error('Unexpected native property');},WorldX:x=>x,WorldY:y=>f.nativeMap.adjustY(y),
   WendyQuestAccessNarrationPresent:f.narration.present,
   $gameTemp:{requestBalloon(){}}});
  for(const source of [...methods,...emotes])vm.runInContext(source,c);
  for(const key of ['showPicture','realPictureId','picture','movePicture'])f.status[key]=c.Game_Screen.prototype[key];
  f.status._pictures=[];const args=list[0].parameters[3];assert.equal(args.pictureName,'pictures/FINALBOSSDOOR');
  assert.equal(args.positionType,'worldSpace');
  f.status.showPicture(+args.id,args.pictureName,2,+args.positionX,+args.positionY,+args.scaleX,+args.scaleY,+args.alpha,0);
  const data=f.status._pictures[1];data._spaceType=1;data.getPositionSpace=c.Game_Picture.prototype.getPositionSpace;
  const parent=f.spriteset._pictureContainer_mid={children:[]};
  const sprite={parent,_pictureId:1,_pictureName:args.pictureName,worldVisible:true,worldAlpha:1,texture:{valid:true},
   worldTransform:{tx:400,ty:176},picture:()=>data};parent.children.push(sprite);
  const update=vm.runInContext('(function(){'+admission+'})',c);
  function pose(){c.Sprite_Picture.prototype.updatePosition.call(sprite);Object.assign(sprite.worldTransform,{tx:sprite.x,ty:sprite.y});}
  pose();
  Object.assign(f.interpreter,{picturePoint:c.Game_Interpreter.prototype.picturePoint,wait(n){this._waitCount=n;},
   character:id=>id===5?elder.candidate:f.root.$gamePlayer,setWaitMode(){}});
  function start(){f.interpreter._index=116;c.Game_Interpreter.prototype.command250.call(f.interpreter,list[116].parameters);
   f.interpreter._index=117;c.Game_Interpreter.prototype.command232.call(f.interpreter,list[117].parameters);
   assert.equal(data._origin,2,'native override retains the authored world-picture anchor');f.interpreter._index=118;}
  function frame(paint=true,publish=true){c.Game_Picture.prototype.updateMove.call(data);if(publish)pose();
   f.graphics.frameCount++;update.call(f.scene);if(paint)f.renderer.emit('postrender');}
  return {...f,c,data,sprite,parent,list,elder,spoken,frame,start,count:()=>spoken.length+f.played.length};
 }
 let cases=0;
 for(const nvda of [false,true])for(const cold of [false,true])for(const camera of [0,2]){
  const f=setup(nvda,cold,camera);if(cold)f.scene._wqaPreloads=new Set(['door']);f.start();
  if(cold){for(let n=0;n<3;n++)f.frame();assert.equal(f.count(),0);f.scene._wqaPreloads.clear();}
  for(let n=0;n<5;n++)f.frame(false);assert.equal(f.count(),0,'motion alone still waits for rendered proof');
  f.renderer.emit('postrender');assert.equal(f.count(),1);
  assert.equal(nvda?f.spoken[0]:f.played[0].id,nvda?'The metal door slides up.':'assembly-door-opens');
  for(let n=0;n<180;n++)f.frame();assert.equal(f.data._duration,0);assert.equal(f.data._y,96);assert.equal(f.count(),1);
  f.interpreter._index=129;f.c.Game_Interpreter.prototype.command213.call(f.interpreter,f.list[129].parameters);
  f.balloon(9,f.elder.candidate,f.elder.sprite);f.frame();
  if(nvda)assert.equal(f.spoken[1],'A light bulb appears over Elder Tater.');
  else {assert.equal(f.played.length,1);assert(!f.played[0].paused,'light bulb cannot interrupt the sliding door description');
   f.played[0].emit('ended');f.frame();assert.equal(f.played[1]?.id,'idea-elder-tater');}
  f.narration.leave(f.scene);cases++;
 }
 const invalids=['already-open','unchanged','stale-pose','wrong-art','wrong-list','foreign-map','hidden','offscreen','unpainted','late','disabled'];
 for(const invalid of invalids){
  const f=setup();f.start();
  if(invalid==='already-open'){f.data._duration=0;f.data._y=96;}
  if(invalid==='unchanged')f.data._targetY=176;
  if(invalid==='wrong-art')f.sprite._pictureName='white';
  if(invalid==='wrong-list')f.interpreter._list=[];
  if(invalid==='foreign-map')f.nativeMap._mapId=106;
  if(invalid==='hidden')f.sprite.worldVisible=false;
  if(invalid==='offscreen')f.sprite.worldTransform.tx=900;
  if(invalid==='late')f.interpreter._index=129;
  if(invalid==='disabled')f.playback.narration.enabled=false;
  for(let n=0;n<5;n++)f.frame(invalid!=='unpainted',!['stale-pose','offscreen'].includes(invalid));
  assert.equal(f.count(),0,invalid);f.narration.leave(f.scene);
 }
 console.log(`Assembly door: ${cases} native picture tween/position cases, recorded/NVDA, cold/camera recovery, unchanged light-bulb FIFO and${invalids.length} negatives pass.`);
};
