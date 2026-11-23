'use strict';
// Focused refresh: retain verified map binaries, regenerate only connection
// metadata from the owner's exact external build. No native code is stored.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decodeMap}=require('../src/world/geometry.cjs');
const {transferMap,bakeCatalog}=require('./transfer-catalog.cjs');
const {breakfastSource,bakeBreakfast}=require('./bake-breakfast.cjs');
const {BREAKFAST_MAPS}=require('../src/world/terrain-control-labels.cjs');
const {MAX_CATALOG_BYTES}=require('../src/world/walking-catalog.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const [game,existing,output]=process.argv.slice(2);if(!output)throw Error('Supply stock game, current geometry and new external output directory');
const target=path.resolve(output),repo=path.resolve(__dirname,'..');
if([repo,path.resolve(game),path.resolve(existing)].some(root=>target===root||target.startsWith(root+path.sep))||fs.existsSync(target))
 throw Error('Use a new output directory outside Git, stock game and installed geometry');
function read(file,hash){const b=fs.readFileSync(file);if(b.length>2*1024*1024||hash&&digest(b)!==hash)throw Error('Unverified input '+file);return b;}
const manifest=JSON.parse(read(path.join(existing,'manifest.json'))),data=path.join(game,'package.nw/data');
if(manifest.build!=='26578620'||Object.keys(manifest.maps).length!==239)throw Error('Unsupported input manifest');
read(path.join(data,'MapInfos.json'),manifest.mapInfos);
const common=JSON.parse(read(path.join(data,'CommonEvents.json'),manifest.commonEvents));
const tilesets=JSON.parse(read(path.join(data,'Tilesets.json'),manifest.tilesets));
const sources=new Map(),breakfast=new Map(),binaries=[];
for(const [id,entry]of Object.entries(manifest.maps)){
 const map=JSON.parse(read(path.join(data,'Map'+id.padStart(3,'0')+'.json'),entry.input));
 const binary=read(path.join(existing,id+'.wqg'),entry.geometry);binaries.push([id+'.wqg',binary]);
 const source=transferMap(+id,map,decodeMap(+id,binary),tilesets[map.tilesetId].flags,common);sources.set(+id,source);
 if(source.controls)entry.controls=source.controls;
 if(BREAKFAST_MAPS.includes(+id))breakfast.set(+id,breakfastSource(+id,source,map,source.controls,common));
}
const catalog=bakeCatalog(sources,manifest.maps),bytes=Buffer.from(JSON.stringify(catalog));
const region=Buffer.from(JSON.stringify(bakeBreakfast(breakfast,manifest.maps)));
manifest.walking={hash:digest(bytes),catalog};manifest.breakfast=digest(region);
const index=Buffer.from(JSON.stringify(manifest));
console.log(JSON.stringify({maps:binaries.length,landings:catalog.landings.length,catalogBytes:bytes.length,regionalBytes:region.length,
 manifestBytes:index.length,manifestHash:digest(index),breakfastHash:digest(region)}));
if(bytes.length>MAX_CATALOG_BYTES||region.length>MAX_CATALOG_BYTES||index.length>168*1024)
 throw Error('Measured connection metadata exceeds current bounds; review the required size before changing them');
fs.mkdirSync(target);for(const [name,b]of binaries)fs.writeFileSync(path.join(target,name),b,{flag:'wx'});
fs.writeFileSync(path.join(target,'breakfast.json'),region,{flag:'wx'});fs.writeFileSync(path.join(target,'manifest.json'),index,{flag:'wx'});
