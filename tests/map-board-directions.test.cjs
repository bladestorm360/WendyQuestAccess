'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {localDestination}=require('../src/world/local-destinations');
const {formatSpeech}=require('../src/services/speech-text.cjs');
const data=JSON.parse(fs.readFileSync(path.join(process.argv[2],'package.nw/data/Map087.json'),'utf8'));
let mask=0;
const root={$gameMap:{_mapId:87},$gameSwitches:{value:id=>!!(mask&(1<<(id-205)))}};
for(mask=0;mask<8;mask++)for(let id=121;id<=130;id++) {
    const page=data.events[id].pages[0], flag=page.list[0].parameters[1];
    assert([205,206,207].includes(flag));
    assert(page.list.some(row=>row.code===121&&row.parameters.join(',')===[flag,flag,0].join(',')), 'board learns its own pathway type');
    const known=!!(mask&(1<<(flag-205)));
    const target=localDestination(root,{_eventId:id,_trigger:0,_pageIndex:0},page);
    assert.equal(target.name,'Map board');assert.equal(target.directionsObtained===true,known);
    const spoken=formatSpeech({kind:'fieldTarget',...target,category:'',dx:-3,dy:1});
    assert.equal(spoken,known?'Map board, already obtained directions, 3 west, 1 south':'Map board, 3 west, 1 south');
    assert.doesNotMatch(spoken,/visited/);
}
const groups=new Map();
for(let id=121;id<=130;id++){const flag=data.events[id].pages[0].list[0].parameters[1];if(!groups.has(flag))groups.set(flag,[]);groups.get(flag).push(id);}
for(const [flag,ids] of groups){assert(ids.length>1);mask=1<<(flag-205);for(const id of ids)assert(localDestination(root,{_eventId:id,_trigger:0},data.events[id].pages[0]).directionsObtained);}
console.log('Verified all ten boards and eight native knowledge states, shared directions, unknown directions and exact selection-speech ordering.');
