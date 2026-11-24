"use strict";
const {renderedSprite}=require('../runtime/rendered-sprite');
function site(root) {
    const map=root.$gameMap, script=map?._interpreter;
    const table=map?._mapId===49 ? [[14,1,56,89,55,-1,51,'grunt-ambush']] :
        map?._mapId===134 ? [[6,0,10,24,6,-1,undefined,'party-jailed'],[10,1,71,99,70,11,77,'jail-breach']] :
        map?._mapId===197 ? [[18,0,18,22,17,-1,576,'shrine-lights'],
            [18,0,69,77,68,-1,573,'shrine-reunion'],[18,1,14,18,13,-1,573,'shrine-reunion']] : [];
    for(const [event,page,first,last,index,actor,switched,id] of table) {
        if(script?._eventId===event && script._index>=first && script._index<=last &&
            script._list===root.$dataMap?.events?.[event]?.pages?.[page]?.list)
            return {script,index,actor:actor===-1?root.$gamePlayer:map._events[actor],switched,id};
    }
    return null;
}
function visibleActor(root,host,scene,id,name) {
    const actor=id===-1?root.$gamePlayer:root.$gameMap._events?.[id],sprites=scene._spriteset?._characterSprites;
    if(!actor || actor._erased || actor._transparent || !Array.isArray(sprites) || sprites.length>512)return null;
    const sprite=sprites.find(item=>item._character===actor),pos=sprite?.worldTransform;
    return actor._characterName && (!name || actor._characterName===name) && sprite?._characterName===actor._characterName &&
        renderedSprite(sprite,scene._spriteset._tilemap) && pos?.tx>=0 && pos.tx<=host.graphics.width &&
        pos.ty>=0 && pos.ty<=host.graphics.height ? actor : null;
}
function visible(root,host,scene,state) {
    if(state.id==='grunt-ambush')return root.$gameSwitches.value(51) && [18,19,20,22].some(id=>{
        const actor=visibleActor(root,host,scene,id,'~MechGrunt'),spawn=root.$dataMap.events[id];
        return actor && (actor._realX!==spawn.x || actor._realY!==spawn.y);
    });
    if(state.id==='party-jailed')return scene._spriteset._tilemap.worldVisible===true &&
        !!visibleActor(root,host,scene,-1) && root.$gamePlayer._x===6 && root.$gamePlayer._y===5;
    if(state.id==='jail-breach') {
        const tilemap=scene._spriteset._tilemap,data=root.$dataMap,tiles=tilemap?._mapData;
        if(!root.$gameSwitches.value(77) || !visibleActor(root,host,scene,11,'~Chomps') ||
            tilemap.worldVisible!==true || tilemap._needsRepaint || data.width!==12 || data.height!==12 || tiles?.length!==864)return false;
        // The native scene replaces twelve wall cells. Observe their drawn
        // changes after the fade; neither the switch nor sound proves a hole.
        for(let y=1;y<=3;y++)for(let x=5;x<=8;x++) {
            const cell=(12+y)*12+x;
            if(tiles[cell]!==data.data[cell])return true;
        }
        return false;
    }
    return false;
}
module.exports={site,visible};
