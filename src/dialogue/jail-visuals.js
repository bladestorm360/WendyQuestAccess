"use strict";
const {renderedSprite}=require('../runtime/rendered-sprite');
function site(root) {
    const map=root.$gameMap, script=map?._interpreter;
    if(map?._mapId===103 && [2,3,4,16,17,18,19].includes(script?._eventId) &&
        script._list===root.$dataMap?.events?.[script._eventId]?.pages?.[0]?.list) {
        if(script._index>=8 && script._index<=16)return {script,index:8,actor:root.$gamePlayer,id:'office-lights-out'};
        if(script._index>=27 && script._index<=33)return {script,index:27,actor:map._events[9],id:'office-lights-on'};
    }
    const table=map?._mapId===97 ? [[8,1,56,83,56,-1,undefined,'chomps-door-open']] :
        map?._mapId===106 ? [[11,1,0,6,0,11,undefined,'elder-tater-freed']] :
        map?._mapId===105 ? [[12,1,118,128,116,-1,undefined,'assembly-door-opens']] :
        map?._mapId===49 ? [[14,1,56,89,55,-1,51,'grunt-ambush']] :
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
    if(state.id==='elder-tater-freed') {
        const map=root.$gameMap,barred=map._events?.[1],sprites=scene._spriteset._characterSprites;
        if(!root.$gameSwitches.value(115) || barred?._pageIndex!==1 || barred._characterName!=='' ||
            !Array.isArray(sprites) || sprites.length>512 || scene._spriteset._tilemap.worldVisible!==true)return false;
        const previous=sprites.find(sprite=>sprite._character===barred);
        // Switch115 ends the entrance script immediately. Its next autorun
        // preloads portraits before the freed sprite can be drawn. Only the
        // painted replacement plus cleared barred graphic confirms release.
        return previous?.parent===scene._spriteset._tilemap && previous._characterName==='' &&
            map._events?.[11]?._pageIndex===1 && !!visibleActor(root,host,scene,11,'~ElderTater');
    }
    if(state.id==='office-lights-out' || state.id==='office-lights-on') {
        const dark=root.$gameScreen?._pictures?.[1],sprites=[];let count=0;
        for(const key of ['_pictureContainer_upper','_pictureContainer_mid','_pictureContainer_lower']) {
            const parent=scene._spriteset[key],children=parent?.children;
            if(!Array.isArray(children))continue;
            if((count+=children.length)>128)return false;
            for(const sprite of children)if(sprite._pictureId===1 && sprite._pictureName==='black' && renderedSprite(sprite,parent))
                sprites.push(sprite);
        }
        if(state.id==='office-lights-on')return !dark && !sprites.length &&
            scene._spriteset._tilemap.worldVisible===true && !!visibleActor(root,host,scene,9,'~BeefThief');
        if(dark?._name!=='black' || dark._opacity<250)return false;
        return sprites.some(sprite=>{
            const p=sprite.worldTransform,r=sprite._frame,anchor=sprite.anchor;
            if(!p || !r || !anchor || p.b!==0 || p.c!==0 || !(p.a>0) || !(p.d>0))return false;
            const left=p.tx-anchor.x*r.width*p.a,top=p.ty-anchor.y*r.height*p.d;
            // The authored picture starts outside the viewport and is scaled
            // to cover it. Its center need not be onscreen to prove darkness.
            return left<=0 && top<=0 && left+r.width*p.a>=host.graphics.width && top+r.height*p.d>=host.graphics.height;
        });
    }
    if(state.id==='chomps-door-open') {
        const map=root.$gameMap,data=root.$dataMap,tilemap=scene._spriteset._tilemap,tiles=tilemap?._mapData;
        if(data.width!==34 || data.height!==40 || tiles?.length!==34*40*6 ||
            tilemap.worldVisible!==true || tilemap._needsRepaint ||
            !Number.isFinite(map._displayX) || !Number.isFinite(map._displayY) ||
            map._displayX>6 || map._displayY>11 || map._displayX+host.graphics.width/48<4 ||
            map._displayY+host.graphics.height/48<9)return false;
        // The smash is heard behind a blackout. The nine native replacement
        // tiles prove the subsequently painted broken doorway, independently
        // of Wendy's forced walk or any asset-loading delay before that walk.
        for(let y=0;y<3;y++)for(let x=0;x<3;x++)
            if(tiles[(2*40+9+y)*34+4+x]!==768+8*y+x)return false;
        return true;
    }
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
