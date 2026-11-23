'use strict';
// Source-free transfer inventory. The exact game's maps/common events are
// read from a verified external fixture and never embedded in this tool.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {transferOptions,catalogTransferOptions,pageMayTransfer}=require('../src/world/transfer-events.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Reviewed native ownership families, never permission to infer a walking
// edge from an arbitrary script or branch. Unknown pages fail the audit.
function classification(row) {
 if(row.trigger>2)return 'native lifecycle/cinematic';
 if(row.live.length)return row.catalog.length?'qualified walking connection':'retired prototype live-only';
 const m=row.map,e=row.event;
 if([2,7,29,64,185,187,192].includes(m))return 'developer/prototype';
 if(m===14&&e===25)return 'retired off-terrain return';
 if(m===16&&[20,21].includes(e)||m===17&&e===7)return 'early cinematic-stage transfer';
 if(m===26&&e===5||m===76&&e===64||m===113&&[30,31].includes(e))return 'native vehicle owner';
 if(m===57||m===58&&![15,37,38,39].includes(e))return 'native rejection/forced departure';
 if(m===58)return 'one-use rescue/collapse scene';
 if(m===94||m===103||m===134)return 'same-map story/battle relocation';
 if(m===128||m===195)return 'conditional reward conversation';
 if(m===133||m===206)return 'player choice/native cave entry owner';
 if([196,199,200,201].includes(m))return 'dedicated cave patrol/chase owner';
 if(m===197&&e===7)return 'jukebox replay';
 throw Error('Unclassified native transfer '+[m,e,row.page].join('/'));
}
function audit(game,geometry) {
 const data=path.join(game,'package.nw/data');
 const read=(name,expected)=>{const bytes=fs.readFileSync(path.join(data,name));
  if(bytes.length>2*1024*1024||expected&&hash(bytes)!==expected)throw Error('Unverified input '+name);
  return JSON.parse(bytes);};
 const manifest=JSON.parse(fs.readFileSync(path.join(geometry,'manifest.json')));
 if(manifest.build!=='26578620'||Object.keys(manifest.maps).length!==239)throw Error('Unsupported geometry input');
 const infos=read('MapInfos.json',manifest.mapInfos),common=read('CommonEvents.json',manifest.commonEvents);
 let pages=0,events=0;const rows=[];
 function inspect(list) {
  const out=[],queue=[{list,trail:[]}],seen=new Set();let visited=0;
  for(let n=0;n<queue.length;n++)for(const [i,r]of queue[n].list.entries()) {
   if(++visited>65536)throw Error('Transfer inventory row budget exceeded');
   const at=[...queue[n].trail,i];
   if(r.code===201)out.push({at,native:r.parameters});
   if(r.code===117&&!seen.has(r.parameters[0])) {
    if(seen.size>=128)throw Error('Transfer inventory common-event budget exceeded');
    seen.add(r.parameters[0]);queue.push({list:common[r.parameters[0]]?.list||[],trail:[...queue[n].trail,'common'+r.parameters[0]]});
   }
   if([355,655].includes(r.code)&&/\b(?:reserveTransfer|performTransfer)\s*\(/.test(r.parameters[0]||''))out.push({at,scriptHash:hash(r.parameters[0])});
  }
  return out;
 }
 for(const mid of Object.keys(manifest.maps)) {
  const m=read('Map'+mid.padStart(3,'0')+'.json',manifest.maps[mid].input);
  for(const e of m.events) {
   if(!e)continue;events++;const catalog=catalogTransferOptions(+mid,e,common);
   for(const [pageIndex,page]of e.pages.entries()) {
    pages++;const native=inspect(page.list);
    if(!native.length&&!pageMayTransfer(page,common))continue;
    rows.push({map:+mid,mapName:infos[mid]?.name,event:e.id,name:e.name,page:pageIndex,pages:e.pages.length,
     trigger:page.trigger,priority:page.priorityType,through:page.through,moveType:page.moveType,
     flags:page.conditions,commands:page.list.map(r=>r.code),native,
     live:transferOptions(+mid,e,page,common),catalog});
   }
  }
 }
 for(const row of rows)row.classification=classification(row);
 const classifications={};for(const row of rows)classifications[row.classification]=(classifications[row.classification]||0)+1;
 const manual=rows.filter(r=>[0,1,2].includes(r.trigger));
 return {build:manifest.build,maps:Object.keys(manifest.maps).length,events,pages,
  classifications,summary:{transferPages:rows.length,interactable:manual.length,unqualified:manual.filter(r=>!r.live.length).length,
   liveOnly:manual.filter(r=>r.live.length&&!r.catalog.length).length,automatic:rows.length-manual.length},transfers:rows};
}
if(require.main===module) {
 const [game,geometry,output]=process.argv.slice(2);if(!output)throw Error('Supply stock game, verified geometry and external JSON output');
 const target=path.resolve(output),root=path.resolve(__dirname,'..'),native=path.resolve(game);
 if([root,native].some(base=>target===base||target.startsWith(base+path.sep)))throw Error('Keep audit output outside game and Git');
 const report=audit(game,geometry);fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({maps:report.maps,events:report.events,pages:report.pages,...report.summary}));
}
module.exports={audit};
