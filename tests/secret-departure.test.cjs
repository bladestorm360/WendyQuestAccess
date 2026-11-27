'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {enter}=require('./dialogue.test.cjs');
(async()=>{
 const map=JSON.parse(fs.readFileSync(path.join(process.argv[2],'package.nw/data/Map107.json'),'utf8'));
 const rows=map.events[3].pages[4].list;
 assert.equal(rows[122].parameters[0].name,'ME_PartyMemberLeft');assert.equal(rows[122].parameters[0].pitch,80);
 assert.deepEqual(rows[123].parameters,[3,1,false]);assert.equal(rows[124].parameters[4],'<s1>');
 assert(rows[125].parameters[0].endsWith('\\|\\|\\|\\|\\^'));assert.equal(rows[130].parameters[1],150);
 for(const render of [true,false]){
  const f=await enter(map,107);f.settings.faceName=()=>'';
  Object.assign(f.settings,{text:rows[125].parameters[0],speaker:rows[124].parameters[4],faceReady:true});
  for(let n=0;n<1000;n++)f.tick(render);
  assert.equal(f.packets().length,render?1:0);
  assert.equal(f.shown.join(''),'Frygor has removed himself from your party.');
  if(render){assert.equal(f.packets()[0].text,f.shown.join(''));assert.equal(f.packets()[0].speaker,'');
   assert.equal(f.packets()[0].preserveDescription,true,'automatic-close speech survives its window');}
 }
 console.log('Secret departure: exact lower-pitched fanfare/actor removal/automatic native text, full painted glyph read once, continuation and no unpainted read pass. No separate character/beam animation is authored in this beat.');
})().catch(error=>{console.error(error);process.exitCode=1;});
