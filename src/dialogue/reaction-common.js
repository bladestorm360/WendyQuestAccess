'use strict';
const cues=require('./narration-cues.json');
const table=Object.create(null);
for(const [id,cue] of Object.entries(cues))for(const [map,event,page,call,common,index,actor,visual]of cue.commonBeats||[]){
    const key=[map,event,common,index].join('/');
    (table[key]||= []).push({id,page,call,common,actor,visual});
}
// Common reaction lists execute on the exact native child interpreter. Their
// parent remains the owner across the child's wait and rendered balloon.
function resolve(root,interpreter,visual){
    const map=root.$gameMap,parent=map?._interpreter;
    if(parent?._childInterpreter!==interpreter||parent._mapId!==map._mapId||
        parent._eventId!==interpreter._eventId||interpreter._mapId!==map._mapId)return null;
    for(const common of [102,140]){
        if(root.$dataCommonEvents?.[common]?.list!==interpreter._list)continue;
        const entries=table[[map._mapId,interpreter._eventId,common,interpreter._index].join('/')];
        const cue=entries?.find(cue=>cue.visual===visual&&parent._index===cue.call+1&&
            root.$dataMap?.events?.[parent._eventId]?.pages?.[cue.page]?.list===parent._list);
        if(cue)return {parent,cue,index:cue.call};
    }
    return null;
}
module.exports={resolve};
