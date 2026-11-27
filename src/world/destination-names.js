'use strict';

// Number distinct native targets, not categories or distance-sorted rows.
// A quest alias for the same event keeps the same ordinal. Apply before any
// reachability filtering, so switching categories cannot renumber the actors.
const snapshots=new WeakMap();
const key=name=>typeof name==='string'?name.trim().toLowerCase():'';
function numberDestinations(map,objects) {
    const groups=new Map(),names=new Map();
    for(const target of objects) {
        if(!Number.isInteger(target.id)||target.category==='bookmarks')continue;
        const label=key(target.name);if(!label)continue;
        let group=groups.get(label);if(!group){group=new Set();groups.set(label,group);}
        group.add(target.id);
    }
    for(const [label,ids]of groups) {
        if(ids.size<2)continue;
        const sorted=Array.from(ids).sort((a,b)=>a-b);
        names.set(label,new Map(sorted.map((id,index)=>[id,index+1])));
    }
    snapshots.set(map,{map:map._mapId,names});
    for(const target of objects) {
        const ordinal=names.get(key(target.name))?.get(target.id);
        if(ordinal)target.name+=` ${ordinal}`;
    }
    return objects;
}
function destinationName(map,id,name) {
    const snapshot=snapshots.get(map);
    const ordinal=snapshot?.map===map._mapId?snapshot.names.get(key(name))?.get(id):undefined;
    return ordinal?`${name} ${ordinal}`:name;
}
module.exports={numberDestinations,destinationName};
