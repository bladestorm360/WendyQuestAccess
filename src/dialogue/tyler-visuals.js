"use strict";

// Authored one-time Tyler entrances, build26578620. The last index ends at
// the first greeting: ordinary later dialogue cannot recover an old leap.
const ENTRIES = {
    15: [60,1,0,60,-3,0,10], 26: [12,1,5,12,3,3,18],
    63: [19,1,6,19,-7,-1,18], 86: [35,1,2,35,-5,2,10],
    181: [15,2,0,7,-4,0,14], 239: [1,0,262,7,15,10,274]
};
function currentTylerEntry(root) {
    const map=root.$gameMap, script=map?._interpreter, entry=ENTRIES[map?._mapId];
    if(!entry)return null;
    const [event,page,index,actor,dx,dy,last]=entry;
    const list=root.$dataMap?.events?.[event]?.pages?.[page]?.list;
    if(script?._eventId!==event || script._list!==list || script._index<=index || script._index>last)return null;
    const row=list?.[index], route=row?.parameters?.[1]?.list;
    if(row?.code!==205 || !Array.isArray(route) || route.length>16 ||
        !route.some(step=>step.code===14 && step.parameters?.[0]===dx && step.parameters[1]===dy))return null;
    return {event,page,index,actor,dx,dy,script,list,key:[map._mapId,event,page,index].join('/')};
}
function landedTyler(root,state) {
    const entry=currentTylerEntry(root), actor=entry && root.$gameMap._events[entry.actor];
    const spawn=entry && root.$dataMap.events[entry.actor];
    if(entry?.key==='181/15/2/0' && !(entry.script._index===8 && entry.script._waitCount>0)) {
        // The first shop's late greeting is only a recovery while its actual
        // music balloon remains painted; later branch instructions are not.
        if(!state.tylerMusic)return false;
    }
    return !!(entry && state.sourceKey===entry.key && state.actor===actor && spawn &&
        actor._x===spawn.x+entry.dx && actor._y===spawn.y+entry.dy);
}
module.exports={ENTRIES,currentTylerEntry,landedTyler};
