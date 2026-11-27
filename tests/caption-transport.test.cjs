"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {createRenderer}=require('../src/runtime/renderer');
function fixture(){
 const word=new Int32Array(new SharedArrayBuffer(4)),port=new EventEmitter(),worker=new EventEmitter(),child=new EventEmitter();
 const commands=[],tasks=[],packets=[],receipts=[],flows=[];
 child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};
 child.stdin=new EventEmitter();child.stdin.write=value=>commands.push(value);child.stdin.end=()=>{};
 port.postMessage=value=>receipts.push(value);port.close=()=>{};
 const source=path.resolve('src/services/speech-worker.cjs');
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{__dirname:path.dirname(source),require(name){
  if(name==='worker_threads')return{parentPort:port,workerData:word.buffer};
  if(name==='child_process')return{spawn:()=>child};if(name==='path')return path;
  if(name==='./speech-text.cjs')return require('../src/services/speech-text.cjs');throw Error(name);
 }},{timeout:150});
 worker.unref=()=>{};worker.postMessage=p=>{packets.push(p);port.emit('message',p);};
 const output=createRenderer({makeWord:()=>word,schedule:task=>tasks.push(task),createWorker:()=>worker,
  descriptionFlowChanged:enabled=>flows.push(enabled)});
 const deliver=()=>{while(receipts.length)worker.emit('message',receipts.shift());};
 const reply=s=>{child.stdout.emit('data',s+'\n');deliver();};
 const start=()=>{while(tasks.length)tasks.shift()();reply('R');};
 const grant=()=>{reply('P');if(commands.at(-1)!=='Y\n')throw Error('No live grant');};
 const accept=first=>{grant();if(first)reply('B');reply('S');};
 return{output,commands,packets,receipts,flows,word,start,reply,grant,accept,deliver};
}
{
 const f=fixture();let visible=true;
 assert(f.output.notifications.describe('A confirmed description.',()=>visible));visible=false;
 f.output.notifications.open({kind:'dialoguePage',speaker:'Wendy',text:'The next visible line.'},()=>true);
 f.start();assert.equal(f.commands.at(-1),'AA confirmed description.\n');
 f.accept(true);assert.equal(f.commands.at(-1),'AWendy. The next visible line.\n');f.accept();
 assert.equal(f.output.counters.submitted,2);assert(!f.commands.some(c=>c.startsWith('S')));
}
{
 const f=fixture();f.output.notifications.describe('Caption survives loading.',()=>true);
 f.output.notifications.open({kind:'fieldStatus',name:'Following game text.'},()=>true);f.start();
 assert(f.output.pauseDescriptions());assert.equal(Atomics.load(f.word,0),0);f.deliver();
 const before=f.commands.length;assert(!f.output.resumeDescriptions(()=>false));
 f.reply('P');assert.equal(f.commands.at(-1),'N\n');f.reply('D');
 assert.equal(f.commands.filter(c=>c.startsWith('A')).length,1,'no provider work during native loading');
 assert(f.output.resumeDescriptions(()=>true));
 assert.equal(f.commands.at(-1),'ACaption survives loading.\n');f.accept(true);
 assert.equal(f.commands.at(-1),'AFollowing game text.\n');f.accept();
 assert.equal(f.output.counters.submitted,2);assert(before>0);
}
{
 const f=fixture();f.output.notifications.describe('Already accepted caption.',()=>true);f.start();f.accept(true);
 f.output.pauseDescriptions();f.output.resumeDescriptions(()=>true);
 f.output.notifications.open({kind:'fieldStatus',name:'After transfer.'},()=>true);f.accept();
 assert.equal(f.commands.filter(c=>c==='AAlready accepted caption.\n').length,1,'no replay after provider acceptance');
}
{
 const f=fixture();f.output.notifications.describe('A cancelled caption.',()=>true);f.start();
 f.output.cancelDescriptions();f.output.notifications.open({kind:'fieldStatus',name:'Explicit requested text.'},()=>true);
 f.reply('P');assert.equal(f.commands.at(-1),'N\n');f.reply('D');
 assert.equal(f.commands.at(-1),'SExplicit requested text.\n');f.accept(true);
 assert.equal(f.output.counters.submitted,1);assert.equal(f.flows.at(-1),false);
}
{
 const f=fixture();for(let n=0;n<9;n++)f.output.notifications.describe('Repeated animation.',()=>true);
 assert.equal(f.output.counters.dropped,1);f.start();for(let n=0;n<8;n++)f.accept(n===0);
 assert.equal(f.commands.filter(c=>c==='ARepeated animation.\n').length,8,'distinct events are never text-deduplicated');
 const count=f.commands.length;f.output.notifications.open({kind:'notAValidRecord'},()=>true);f.deliver();
 assert.equal(f.output.counters.discarded,1);assert.equal(f.commands.length,count,'invalid output does not retry');
}
{
 const f=fixture();let visible=true;
 const token=f.output.notifications.confirmedPage({kind:'dialoguePage',text:'Frygor has removed himself from your party.',speaker:''},()=>visible);
 assert(token);f.start();visible=false;f.output.notifications.close(token);f.output.pauseDescriptions();
 f.reply('P');assert.equal(f.commands.at(-1),'N\n');f.reply('D');
 assert.equal(f.commands.filter(c=>c.startsWith('A')).length,1,'native loading admits no new output');
 f.output.resumeDescriptions(()=>true);assert.equal(f.commands.at(-1),'AFrygor has removed himself from your party.\n');
 f.output.notifications.open({kind:'dialoguePage',text:'The following battle message.'},()=>true);
 f.accept(true);assert.equal(f.commands.at(-1),'AThe following battle message.\n');f.accept();
 assert.equal(f.commands.filter(c=>c.includes('Frygor')).length,2,'one denied attempt, one accepted retry');
 assert.equal(f.output.counters.submitted,2,'only departure and following text are accepted');
}
console.log('Verified actual worker append protocol, immediate following text, automatic-page close/loading continuation, native-load rejection/replay in order, accepted-caption no replay, explicit cancellation and eight-record/no-dedup bounds.');
