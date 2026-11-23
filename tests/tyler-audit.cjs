"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cues=require('../src/dialogue/narration-cues.json');
const {ENTRIES}=require('../src/dialogue/tyler-visuals');
module.exports=(fixture,stock)=>{
 const data=path.join(stock,'package.nw/data'),sites=[];
 let pages=0,maps=0,actors=0;
 for(const filename of fs.readdirSync(data).filter(name=>/^Map\d+\.json$/.test(name))){
  const m=+filename.slice(3,6),d=JSON.parse(fs.readFileSync(path.join(data,filename),'utf8'));maps++;
  const ids=new Set(d.events.filter(Boolean).filter(e=>e.pages.some(p=>
   p.image.characterName==='NPC - Wendys Staff'&&p.image.characterIndex===0&&
   p.list.some(r=>r.code===101&&r.parameters[4]==='Tyler'))).map(e=>e.id));
  if([181,239].includes(m))ids.add(7);actors+=ids.size;
  for(const id of ids)for(const p of d.events[id].pages)
   assert(!(p.moveRoute?.list||[]).some(r=>r.code!==0),'Tyler has no unreviewed autonomous animation');
  for(const e of d.events.filter(Boolean))for(const [page,p]of e.pages.entries()){
   pages++;
   for(const [index,row]of p.list.entries()){
    const actor=row.parameters?.[0]===0?e.id:row.parameters?.[0];
    if(!ids.has(actor))continue;
    if(row.code===205 && row.parameters[1].list.some(step=>step.code===14)){
     const route=row.parameters[1].list,id=route.some(step=>step.code===39)?'tyler-departs':'tyler-arrives';
     assert(cues[id].beats.some(b=>b.slice(0,5).join('/')===[m,e.id,page,index,actor].join('/')),
      'Every actual Tyler jump has its own producer locator '+[m,e.id,page,index]);sites.push([m,e.id,page,index,id]);
    }
    if(row.code===213)assert(Object.values(cues).some(c=>c.beats.some(b=>
     b.slice(0,5).join('/')===[m,e.id,page,index,actor].join('/'))),'Every Tyler reaction is narrated');
   }
  }
 }
 const common=JSON.parse(fs.readFileSync(path.join(data,'CommonEvents.json'),'utf8'));
 assert(!common.some(e=>e&&e.list.some(r=>JSON.stringify(r).includes('Tyler'))),'No separate Tyler common-script producer');
 assert.equal(sites.filter(s=>s[4]==='tyler-arrives').length,6);
 assert.equal(sites.filter(s=>s[4]==='tyler-departs').length,5);
 for(const [m,[e,p,i,actor,dx,dy,last]]of Object.entries(ENTRIES))for(const phase of ['jump','landed','late','hidden']){
  const f=fixture(+m,e,p),a=f.actor(actor),spawn=f.root.$dataMap.events[actor];
  Object.assign(a.candidate,{_x:spawn.x+dx,_y:spawn.y+dy,_jumpCount:phase==='jump'?10:0});
  f.interpreter._index=phase==='late'?last+1:i+1;
  if(phase==='landed'&&+m===181){f.interpreter._index=8;f.interpreter._waitCount=30;}
  if(phase==='hidden')a.candidate._transparent=true;
  f.narration.tylerEntry(f.scene);f.frame();
  assert.equal(f.played[0]?.id,['jump','landed'].includes(phase)?'tyler-arrives':undefined,+m+'/'+phase);
  for(let n=0;n<10;n++){f.narration.tylerEntry(f.scene);f.frame();}
  assert(f.played.length<=1,'one actual entrance is not replayed');f.narration.leave(f.scene);
 }
 console.log(`Audited ${maps} maps/${pages} pages/${actors} Tyler actors: six arrivals, five departures and all reactions; every arrival covers jump/landing, hidden/late negatives.`);
};
