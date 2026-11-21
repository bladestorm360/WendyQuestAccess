"use strict";
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createRenderer}=require('../src/runtime/renderer');
const {createDialogueObserver}=require('../src/dialogue/observer');
const {formatSpeech}=require('../src/services/speech-text.cjs');
const frames=new EventEmitter(),worker=new EventEmitter(),packets=[],tasks=[];
worker.unref=()=>{};worker.postMessage=p=>packets.push(p);
const layer={},scene={_active:true,_fadeDuration:0,_fadeOpacity:0,_windowLayer:layer};
const window=scene._messageWindow={parent:layer,worldVisible:true,worldAlpha:1,openness:255,contentsOpacity:255};
const name=window._nameSprite={_currentString:'Frostyna',worldVisible:true,worldAlpha:1,_animationRunning:false};
window._faceSprite={parent:window,worldVisible:true,worldAlpha:1,alpha:1,bitmap:{isReady:()=>true}};
let face='Frostyna';
const host={manager:{_scene:scene},graphics:{app:{stage:scene,renderer:frames}},hasFocus:()=>true,
    screenFading:()=>false,gameMessage:()=>({faceName:()=>face}),
    makeWord:()=>new Int32Array(new SharedArrayBuffer(4)),schedule:task=>tasks.push(task),createWorker:()=>worker};
const output=createRenderer(host),dialogue=createDialogueObserver(host,output.notifications);
function page(text) {
    window._wqaDialoguePaint={text,spoken:0,end:text.length};window._lastFaceName=face;
    dialogue.observe(scene);frames.emit('postrender');while(tasks.length)tasks.shift()();
}
for(const variant of ['Frostyna','FrostynaConcerned']) {
    face=variant;page('A current line.');
    assert(dialogue.command(scene,'details'));assert.match(formatSpeech(packets.at(-1)),/^Frostyna\. A young woman with lavender-blue skin/,JSON.stringify(packets));
    worker.emit('message','ack');worker.emit('message','ack');
    // A separate presented context replaced the transport, but not the native
    // dialogue page. Details must acquire a fresh epoch instead of disappearing.
    output.notifications.open({kind:'fieldStatus',name:'Other current notice.'},()=>true);
    const old=packets.at(-1).epoch;assert(dialogue.command(scene,'details'));
    assert.notEqual(packets.at(-1).epoch,old);assert.match(formatSpeech(packets.at(-1)),/^Frostyna\./);
    for(let n=0;n<8;n++)worker.emit('message','ack');
}
face='';name._currentString='';window._faceSprite.alpha=0;page('An unnamed visible line.');
assert(dialogue.command(scene,'details'));assert.equal(formatSpeech(packets.at(-1)),'No visual description for this speaker.');
window.worldVisible=false;assert(!dialogue.command(scene,'details'),'a retired/hidden message remains silent');
dialogue.leave(scene);
console.log('Verified both native Frostyna portrait keys, current-page Details after transport replacement, explicit unnamed fallback and hidden-page retirement.');
