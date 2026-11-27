'use strict';
const assert=require('node:assert/strict');
const {c,load}=require('./world.test.cjs');
const {eventTarget}=require('../src/world/snapshot');
const {localHandoffName,handoffCaption}=require('../src/world/local-destinations');
const {formatSpeech}=require('../src/services/speech-text.cjs');
for(const id of [44,49])for(const spoilers of [false,true])for(const seen of [false,true]){
 load(85);c.$gameSystem={_wqaEventKnowledge:{version:1,ids:seen?[`85:${id}:0`]:[]}};
 const event=c.$gameMap._events[id],entry=c.$dataMap.events[id];
 event._pageIndex=0;const page=entry.pages[0];Object.assign(event,{_trigger:page.trigger,_priorityType:page.priorityType});
 const target=eventTarget(c,'walk',event,entry,page,spoilers);assert(target);
 const publicName=handoffCaption(localHandoffName(85,id),target.name,spoilers,true);
 const spoken=formatSpeech({kind:'routeDirections',name:target.name,directionsOnly:true,legs:[],activate:4,manualHandoff:true,boundaryName:publicName});
 if(!spoilers&&!seen){assert.equal(target.name,'Scene trigger');assert.equal(spoken,'Move west to activate.');}
 else{assert.equal(target.name,'Leaving Caffeine Caverns');assert(spoken.includes(target.name));}
 assert(!spoken.includes('Beach conversation'));
}
for(const raw of ['Beach conversation','Side passage warning','Peak approach','Island warning']){
 assert.equal(handoffCaption(raw,undefined,false),'Scene trigger');
 assert.equal(handoffCaption(raw,undefined,false,true),undefined);
 assert.equal(handoffCaption(raw,undefined,true),raw);
 assert.equal(handoffCaption(raw,'Verified discovery',false,true),'Verified discovery');
}
console.log('Native Bacon Beach event labels, unseen/encountered/spoiler modes, generic activation and explicit discovery overrides pass; internal handoff names are not reveal permission.');
