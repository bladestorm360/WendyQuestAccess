'use strict';
// These exact same-map footsteps/fade scenes remove a speaking NPC. Map77's
// similar sound accompanies Baconator joining the party, not an NPC escape.
const SITES = [[48,21,1,22,21,'archaeologist-leaves'],[49,24,1,21,24,'archaeologist-leaves'],
    [62,2,1,19,2,'archaeologist-leaves'],[60,87,0,50,86,'frydusa-leaves'],
    [60,87,0,84,3,'archaeologist-leaves']];
function createDepartureTracker(root,graphics) {
    let pending=[];const seen=new WeakSet();
    function accepted(scene,script) {
        const map=root.$gameMap,child=script?._childInterpreter;
        if(script!==map?._interpreter||child?._list!==root.$dataCommonEvents?.[38]?.list||seen.has(child))return;
        const site=SITES.find(([m,e,p,i])=>m===map._mapId&&e===script._eventId&&i===script._index&&
            script._list===root.$dataMap?.events?.[e]?.pages?.[p]?.list);
        const actor=site&&map._events?.[site[4]];
        if(!actor||!actor._characterName||pending.length>=8)return;
        seen.add(child);
        pending.push({id:site[5],scene,mapId:map._mapId,actor,actorId:site[4],
            frame:graphics.frameCount,waitFrames:240,visual:-15});
        scene._wqaDeparturePending=true;
    }
    function take(scene) {
        const result=pending.filter(s=>s.scene===scene&&s.mapId===root.$gameMap?._mapId&&graphics.frameCount-s.frame<=600);
        pending=[];scene._wqaDeparturePending=false;return result;
    }
    function visible(scene,state) {
        if(scene!==state.scene||root.$gameMap?._mapId!==state.mapId||
            root.$gameMap._events?.[state.actorId]!==state.actor)return false;
        const sprites=scene._spriteset?._characterSprites,tilemap=scene._spriteset?._tilemap;
        if(tilemap?.worldVisible!==true||!Array.isArray(sprites)||sprites.length>512)return false;
        const sprite=sprites.find(s=>s._character===state.actor);
        if(!sprite||sprite.parent!==tilemap)return false;
        // A switch alone is not proof. The native sprite must have reflected
        // its hidden/empty graphic after the fade or autorun page handoff.
        return state.actor._transparent===true&&sprite.visible===false ||
            state.actor._characterName===''&&sprite._characterName==='';
    }
    function retain(state) {if(pending.length<8){pending.push(state);state.scene._wqaDeparturePending=true;}}
    function retire(scene) {pending=pending.filter(s=>scene&&s.scene!==scene);if(scene)scene._wqaDeparturePending=false;}
    return {accepted,take,visible,retain,retire,get size(){return pending.length;}};
}
module.exports={SITES,createDepartureTracker};
