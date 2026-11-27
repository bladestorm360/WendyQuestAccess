// Original installer engine. All game-derived bytes and geometry are generated
// locally from the validated installation; none are carried by the release.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=__dirname,release=JSON.parse(fs.readFileSync(path.join(root,'release.json')));
const [action,gameArg,workArg]=process.argv.slice(2);
const game=path.resolve(gameArg),work=path.resolve(workArg);
const recovery='.wendyquest-access-recovery',transaction='.wendyquest-access-transaction';
const installedRelease='WendyQuestAccess-release.json';
const registry='package.nw/js/plugins.js';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const fail=message=>{throw Error(message);};
function relative(value){
 if(typeof value!=='string'||value.length>240||!value.split('/').every(part=>
   /^[A-Za-z0-9._ -]+$/.test(part)&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&
   !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))fail('Unsafe package path.');
 return value;
}
function direct(file){
 let current=path.resolve(file);
 for(;;){try{if(fs.lstatSync(current).isSymbolicLink())fail('Linked folders are unsupported: '+current);}catch(error){if(error.code!=='ENOENT'&&error.code!=='ENOTDIR')throw error;}
  const parent=path.dirname(current);if(parent===current)break;current=parent;}
 return path.resolve(file);
}
const target=key=>direct(path.join(game,relative(key)));
function read(file,limit=32*1024*1024){
 direct(file);const stat=fs.statSync(file);if(!stat.isFile()||stat.size>limit)fail('Unexpected file size/type: '+file);
 const data=fs.readFileSync(file);if(data.length!==stat.size)fail('File changed while reading: '+file);return data;
}
const digest=file=>fs.existsSync(file)?hash(read(file)):null;
function inventory(folder){
 const result={};if(!fs.existsSync(folder))return result;
 function visit(dir,prefix){for(const item of fs.readdirSync(direct(dir),{withFileTypes:true})){
  const key=relative(prefix+item.name),file=direct(path.join(dir,item.name));
  if(item.isDirectory())visit(file,key+'/');else if(item.isFile())result[key]=digest(file);else fail('Unsupported file: '+file);
  if(Object.keys(result).length>1024)fail('Unexpected file count.');}}
 visit(folder,'');return result;
}
function write(file,data){
 direct(file);fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.wqa-new';if(fs.existsSync(temp))fail('Incomplete temporary file: '+temp);
 try{const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function progress(text){fs.writeFileSync(path.join(work,'progress.txt'),text,'utf8');}
function planCheck(plan){
 if(!plan||plan.build!==release.build||Object.keys(plan).sort().join()!=='build,geometry,patched,payload,stock')fail('Unsupported installation record.');
 const keys=Object.keys(release.plan.stock).sort().join();
 if(Object.keys(plan.stock).sort().join()!==keys||Object.keys(plan.patched).sort().join()!==keys)fail('Unexpected native recovery set.');
 for(const kind of ['stock','patched','payload','geometry']){
  const entries=Object.entries(plan[kind]);if(!entries.length||entries.length>512)fail('Invalid installation file count.');
  for(const [key,value] of entries){relative(key);if(!/^[a-f0-9]{64}$/.test(value))fail('Invalid installation fingerprint.');
   if(kind==='payload'&&key!=='js/plugins/WendyQuestAccess.js'&&!key.startsWith('wendyquest-access/'))fail('Invalid payload path.');
   if(kind==='geometry'&&!/^([1-9][0-9]{0,2}\.wqg|manifest\.json|breakfast\.json)$/.test(key))fail('Invalid geometry path.');}
 }
}
const owned=plan=>Object.assign({},...Object.entries(plan.payload).map(([k,v])=>({['package.nw/'+k]:v})),
 ...Object.entries(plan.geometry).map(([k,v])=>({['package.nw/wendyquest-access-geometry/'+k]:v})));
function allowed(key){
 relative(key);return Object.hasOwnProperty.call(release.plan.stock,key)||
  key==='package.nw/js/plugins/WendyQuestAccess.js'||key.startsWith('package.nw/wendyquest-access/')||
  /^package\.nw\/wendyquest-access-geometry\/([1-9][0-9]{0,2}\.wqg|manifest\.json|breakfast\.json)$/.test(key)||
  key===installedRelease||key===recovery+'/plan.json'||key.startsWith(recovery+'/')&&Object.hasOwnProperty.call(release.plan.stock,key.slice(recovery.length+1));
}
function prune(file){
 let parent=path.dirname(file);
 while(parent!==game&&parent.startsWith(game+path.sep)&&fs.existsSync(parent)&&!fs.readdirSync(parent).length){fs.rmdirSync(parent);parent=path.dirname(parent);}
}
function clearTransaction(journal){
 const dir=target(transaction),expected=new Set(['journal.json','journal.json.wqa-new',...journal.entries.filter(e=>e.old!==null).flatMap(e=>['backup/'+e.backup,'backup/'+e.backup+'.wqa-new'])]);
 for(const key of Object.keys(inventory(dir)))if(!expected.has(key))fail('Unrecognized transaction recovery file: '+key);
 for(const key of expected){const file=path.join(dir,key);if(fs.existsSync(file))fs.unlinkSync(file);}
 const backups=path.join(dir,'backup');if(fs.existsSync(backups))fs.rmdirSync(backups);fs.rmdirSync(dir);
}
function recover(){
 const dir=target(transaction);if(!fs.existsSync(dir))return;
 const record=path.join(dir,'journal.json');if(!fs.existsSync(record)){
  const files=inventory(dir);if(Object.keys(files).some(key=>key!=='journal.json.wqa-new'))fail('Incomplete recovery staging contains unexpected files: '+dir);
  const folders=fs.readdirSync(dir);if(folders.some(key=>!['backup','journal.json.wqa-new'].includes(key)))fail('Unknown recovery staging folder.');
  if(fs.existsSync(record+'.wqa-new'))fs.unlinkSync(record+'.wqa-new');
  if(fs.existsSync(path.join(dir,'backup')))fs.rmdirSync(path.join(dir,'backup'));fs.rmdirSync(dir);return;} 
 const journal=JSON.parse(read(record,1024*1024));
 if(journal.schema!==1||!['staging','applying'].includes(journal.phase)||!Array.isArray(journal.entries)||journal.entries.length>1024)fail('Invalid recovery journal.');
 for(const item of journal.entries){
  if(!allowed(item.key)||!/^\d{1,4}\.bin$/.test(item.backup)||
   ![item.old,item.next,item.intermediate].every(v=>v===null||v===undefined||/^[a-f0-9]{64}$/.test(v)))fail('Unsafe recovery journal.');
  const actual=digest(target(item.key));if(![item.old,item.next,item.intermediate,null].includes(actual))fail('Recovery stopped to preserve an externally changed file: '+item.key);
  if(journal.phase==='staging'&&actual!==item.old)fail('Staged recovery target changed: '+item.key);
  if(journal.phase==='applying'&&item.old!==null&&digest(path.join(dir,'backup',item.backup))!==item.old)fail('Recovery backup is damaged: '+item.key);
 }
 if(journal.phase==='staging'){clearTransaction(journal);return;}
 progress('Restoring an interrupted installation.');
 for(const item of journal.entries.slice().reverse()){
  const file=target(item.key),temporary=file+'.wqa-new';
  if(fs.existsSync(temporary)){if(![item.old,item.next,item.intermediate].includes(digest(temporary)))fail('Unknown recovery temporary file: '+item.key);fs.unlinkSync(temporary);}
  if(item.old===null){if(fs.existsSync(file))fs.unlinkSync(file);}
  else write(file,read(path.join(dir,'backup',item.backup)));
 }
 clearTransaction(journal);for(const item of journal.entries)prune(target(item.key));
}
function oldInstallation(){
 const folder=target(recovery);if(!fs.existsSync(folder))return null;
 const plan=JSON.parse(read(path.join(folder,'plan.json'),256*1024));planCheck(plan);
 const expected=new Set(['plan.json',...Object.keys(plan.stock)]);
 const files=inventory(folder);if(Object.keys(files).length!==expected.size||Object.keys(files).some(k=>!expected.has(k)))fail('Unexpected native recovery files.');
 const originals={};for(const [key,sha]of Object.entries(plan.stock)){
  const data=read(path.join(folder,key));if(hash(data)!==sha||sha!==release.plan.stock[key])fail('Native original recovery changed: '+key);originals[key]=data;}
 return {plan,originals};
}
function checkExisting(old){
 const marker=target(installedRelease);
 if(fs.existsSync(marker)){
  const value=JSON.parse(read(marker,4096));
  if(value.schema!==1||Object.keys(value).sort().join()!=='archiveSha256,planSha256,schema,source,version'||
   !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value.version)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(value.source)||
   !/^[a-f0-9]{64}$/.test(value.archiveSha256)||!/^[a-f0-9]{64}$/.test(value.planSha256))
   fail('Changed installation metadata was preserved.');
 }
 const permitted=old?owned(old.plan):{};
 for(const folder of ['package.nw/wendyquest-access','package.nw/wendyquest-access-geometry'])
  for(const key of Object.keys(inventory(target(folder))))if(!Object.hasOwnProperty.call(permitted,folder+'/'+key))fail('Unrecognized mod file will be preserved: '+folder+'/'+key);
 const files=Object.assign({},permitted);
 files['package.nw/js/plugins/WendyQuestAccess.js']=permitted['package.nw/js/plugins/WendyQuestAccess.js'];
 for(const [key,expected]of Object.entries(files)){const actual=digest(target(key));if(actual!==null&&actual!==expected)fail('A mod file changed; it was preserved: '+key);}
 for(const [key,stock]of Object.entries(release.plan.stock)){
  const actual=digest(target(key));if(actual!==stock&&(!old||actual!==old.plan.patched[key]&&actual!==null))fail('Unsupported or changed game script: '+key);}
}
function recipes(originals){
 const all=JSON.parse(read(path.join(root,'recipes.json'),1024*1024)),result={};
 for(const [key,recipe]of Object.entries(all)){
  if(!Object.hasOwnProperty.call(release.plan.stock,key)||hash(originals[key])!==recipe.source)fail('Native input changed: '+key);
  if(recipe.operations.length>2048||recipe.resultLength>2*1024*1024)fail('Patch exceeds its limit.');
  const parts=recipe.operations.map(op=>{
   if(op.kind==='copy'&&Number.isSafeInteger(op.offset)&&Number.isSafeInteger(op.length)&&op.offset>=0&&op.length>0&&op.offset+op.length<=originals[key].length)
    return originals[key].subarray(op.offset,op.offset+op.length);
   if(op.kind==='literal'){const data=Buffer.from(op.data,'base64');if(data.length===op.length)return data;}
   fail('Invalid native patch recipe.');});
  const data=Buffer.concat(parts);if(data.length!==recipe.resultLength||hash(data)!==release.plan.patched[key])fail('Native patch verification failed: '+key);result[key]=data;
 }
 if(Object.keys(result).length!==Object.keys(release.plan.stock).length)fail('Incomplete native patch set.');return result;
}
function apply(changes,originalRegistry){
 const dir=target(transaction);fs.mkdirSync(dir);fs.mkdirSync(path.join(dir,'backup'));
 const journal={schema:1,phase:'staging',entries:[]};
 // Backups and the durable journal precede every mutation. A crash while only
 // staging backups leaves the game untouched and requires recovery inspection.
 for(const [key,data]of changes){
  if(!allowed(key))fail('Unexpected transaction target.');
  const file=target(key),old=digest(file),backup=journal.entries.length+'.bin';
  journal.entries.push({key,old,next:data===null?null:hash(data),backup,
   intermediate:key===registry?hash(originalRegistry):null});
 }
 write(path.join(dir,'journal.json'),Buffer.from(JSON.stringify(journal)));
 for(const item of journal.entries)if(item.old!==null)write(path.join(dir,'backup',item.backup),read(target(item.key)));
 journal.phase='applying';write(path.join(dir,'journal.json'),Buffer.from(JSON.stringify(journal)));
 try{
  // Native registration is inactive throughout payload and geometry changes.
  write(target(registry),originalRegistry);
  for(const item of journal.entries){
   if(item.key===registry)continue;const file=target(item.key);
   if(digest(file)!==item.old)fail('File changed during installation: '+item.key);
   const data=changes.get(item.key);if(data===null){if(fs.existsSync(file))fs.unlinkSync(file);}else write(file,data);
  }
  if(digest(target(registry))!==hash(originalRegistry))fail('Registration changed during installation.');
  write(target(registry),changes.get(registry));
  for(const item of journal.entries)if(digest(target(item.key))!==item.next)fail('Installed verification failed: '+item.key);
 }catch(error){recover();throw error;}
 clearTransaction(journal);for(const item of journal.entries)prune(target(item.key));
}
function main(){
 if(!['install','verify','uninstall'].includes(action)||!/[A-Za-z]:\\/.test(game)||work.startsWith(game+path.sep))fail('Invalid installer arguments.');
 direct(game);direct(work);planCheck(release.plan);
 progress('Checking game files and recovery.');
 recover();const old=oldInstallation();checkExisting(old);
 for(const [key,expected]of Object.entries(release.inputs)){
  // The launcher is fingerprinted through the exclusive parent handle.
  if(key==='WendyQuest.exe')continue;
  if(digest(target(key))!==expected)fail('Unsupported game data: '+key);
 }
 if(action==='verify'){
  if(!old)fail('The mod is not installed.');
  const expected=Object.assign({},old.plan.patched,owned(old.plan));
  for(const [key,sha]of Object.entries(expected))if(digest(target(key))!==sha)fail('A mod file is missing or changed: '+key);
  return 'Installed files verified. Saves and preferences are untouched.';
 }
 const originals=old?old.originals:Object.fromEntries(Object.keys(release.plan.stock).map(key=>[key,read(target(key))]));
 const changes=new Map();
 if(action==='uninstall'){
  if(!old)fail('The mod is not installed.');
  for(const [key,data]of Object.entries(originals))changes.set(key,data);
  for(const key of Object.keys(owned(old.plan)))changes.set(key,null);
  for(const key of Object.keys(old.plan.stock))changes.set(recovery+'/'+key,null);
  changes.set(recovery+'/plan.json',null);
  changes.set(installedRelease,null);
 }else{
  progress('Generating navigation data from your game.');
  const maps=path.join(work,'maps'),args=process.argv;
  process.argv=[args[0],path.join(root,'bake.cjs'),game,maps];try{require('./bake.cjs');}finally{process.argv=args;}
  const actual=inventory(maps),expected=release.plan.geometry;
  if(JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(expected).sort())||Object.entries(expected).some(([key,sha])=>actual[key]!==sha))fail('Generated map data did not match this release.');
  if(old)for(const key of Object.keys(owned(old.plan)))changes.set(key,null);
  for(const [key,data]of Object.entries(recipes(originals)))changes.set(key,data);
  for(const key of Object.keys(release.plan.payload))changes.set('package.nw/'+key,read(path.join(root,'payload',key)));
  for(const key of Object.keys(expected))changes.set('package.nw/wendyquest-access-geometry/'+key,read(path.join(maps,key)));
  for(const [key,data]of Object.entries(originals))changes.set(recovery+'/'+key,data);
  const planBytes=Buffer.from(JSON.stringify(release.plan,null,2)+'\n');
  changes.set(recovery+'/plan.json',planBytes);
  const download=JSON.parse(read(path.join(work,'download.json'),4096));
  if(download.schema!==1||download.tag!=='v'+release.version||!/^[a-f0-9]{64}$/.test(download.sha256))fail('Missing verified download identity.');
  // The receipt is part of the same durable transaction as every mod file.
  // Its plan hash avoids a circular archive/manifest hash and detects a later
  // developer deployment before an updater calls the installation current.
  changes.set(installedRelease,Buffer.from(JSON.stringify({schema:1,version:release.version,source:release.source,
   archiveSha256:download.sha256,planSha256:hash(planBytes)},null,2)+'\n'));
 }
 progress(action==='uninstall'?'Restoring the original game.':'Installing and verifying the update.');
 apply(changes,originals[registry]);
 return action==='uninstall'?'Mod removed. Saves and preferences are retained.':'Installation complete. Start Wendy Quest normally through Steam.';
}
try{const message=main();fs.writeFileSync(path.join(work,'result.json'),JSON.stringify({ok:true,message}));}
catch(error){fs.writeFileSync(path.join(work,'result.json'),JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
