'use strict';

const { renderedSprite } = require('../runtime/rendered-sprite');
const ATLAS = 'system/Savoria Map';
const CAVERN = 'system/Caffeine Caverns Map';
const SITES = [142,143,101,160,171,172,173,174,175,176,177,178,179,180];
// Own only these authored picture motions. Native child interpreters may end
// before their non-waiting pin tween is painted; the picture, map and message
// epoch, rather than that retired child, own this bounded receipt.
function createAtlasTracker(root, graphics) {
    let pending = [];
    const groups = new WeakMap();
    function retire(scene) {
        pending = pending.filter(state => scene && state.scene !== scene);
        if (scene) scene._wqaAtlasPending = false;
    }
    function accepted(scene, script, id) {
        const map=root.$gameMap, screen=root.$gameScreen;
        let child=map?._interpreter, depth=0, closing=false, found=false;
        while(child && depth++<8) {
            if(child===script)found=true;
            if(child._list===root.$dataCommonEvents?.[143]?.list)closing=true;
            child=child._childInterpreter;
        }
        if(!found || child || script._mapId!==map._mapId)return;
        const common=SITES.find(key=>root.$dataCommonEvents?.[key]?.list===script._list);
        const index=script._index;
        const board=map._mapId===87 && script._eventId>=121&&script._eventId<=130 &&
            script===map._interpreter && script._list===root.$dataMap?.events?.[script._eventId]?.pages?.[0]?.list;
        let kind;
        if(id===27 && (common===142&&index===75 || common===101&&index===166 || board&&index===171))kind='map-opens';
        else if(id===27 && (common===143&&index===42 || common===101&&index===212 || board&&index===235))kind='map-closes';
        else if(id===38 && (common===142&&index===80 || common===101&&index===172 || board&&index===193))kind='map-wendy';
        else if(id===50 && common===160&&index===45)kind='map-quest';
        else if(id>=41&&id<=45 && common===171+2*(id-41)&&index===5)kind='map-marks';
        else if(id>=41&&id<=45 && common===172+2*(id-41)&&index===3&&!closing)kind='map-erases';
        if(!kind)return;
        const base=screen?._pictures?.[27], picture=screen?._pictures?.[id];
        if(!base || ![ATLAS,CAVERN].includes(base._name) || !picture)return;
        const art=id===27?base._name:id===38?'system/WendyIcon':id===50?
            'system/MapMarkers/Map Quest Marker':'system/MapMarkers/Map Markers';
        if(id>=41&&id<=45 ? ![0,1,2,3].some(n=>picture._name===art+n) : picture._name!==art)return;
        const epoch=root.$gameMessage?._texts;
        if(!Array.isArray(epoch))return;
        let messages=groups.get(base);
        if(!messages){messages=new WeakMap();groups.set(base,messages);}
        let group=messages.get(epoch);
        if(!group){group=new Set();messages.set(epoch,group);}
        // One native batch can place five pins between two paragraphs. This
        // groups that visual operation, never text or a later genuine replay.
        if(group.has(kind) || pending.some(state=>state.group===group&&state.id===kind))return;
        pending=pending.filter(state=>state.scene===scene&&state.mapId===map._mapId);
        if(pending.length>=8)return;
        pending.push({id:kind,visual:-14,scene,mapId:map._mapId,base,picture,pictureId:id,
            art:picture._name,group,frame:graphics.frameCount,waitFrames:240});
        scene._wqaAtlasPending=true;
    }
    function take(scene) {
        const result=[];
        pending=pending.filter(state=>{
            if(state.scene!==scene || state.mapId!==root.$gameMap?._mapId ||
                graphics.frameCount-state.frame>240)return false;
            result.push(state);return false;
        });
        scene._wqaAtlasPending=false;
        return result;
    }
    function visible(scene,state) {
        if(scene!==state.scene || root.$gameMap?._mapId!==state.mapId ||
            root.$gameScreen?._pictures?.[27]!==state.base ||
            root.$gameScreen._pictures[state.pictureId]!==state.picture)return false;
        const spriteset=scene._spriteset, parent=spriteset?._pictureContainer_upper;
        if(spriteset?.parent!==scene || parent?.parent!==spriteset ||
            !Array.isArray(parent.children) || parent.children.length>128)return false;
        const shown=(id,picture,art)=>{
            const sprite=parent.children.find(item=>item._pictureId===id);
            if(!(picture._opacity>0)||sprite?._pictureName!==art||!renderedSprite(sprite,parent))return false;
            const pose=sprite.worldTransform, frame=sprite._frame;
            if(!pose||pose.b!==0||pose.c!==0||!(pose.a>0)||!(pose.d>0)||
                !(frame?.width>0)||!(frame.height>0))return false;
            const w=frame.width*pose.a,h=frame.height*pose.d;
            const x=pose.tx-w*sprite.anchor.x,y=pose.ty-h*sprite.anchor.y;
            return x<graphics.width&&y<graphics.height&&x+w>0&&y+h>0;
        };
        return shown(27,state.base,state.base._name)&&shown(state.pictureId,state.picture,state.art);
    }
    function retain(state) {
        if(state.mapId!==root.$gameMap?._mapId||pending.length>=8||pending.some(item=>item===state))return;
        pending.push(state);state.scene._wqaAtlasPending=true;
    }
    return {accepted,take,visible,retain,get size(){return pending.length;},confirm(state){state.group.add(state.id);},retire};
}
module.exports={createAtlasTracker};
