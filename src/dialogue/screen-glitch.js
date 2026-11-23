"use strict";

// Common40 creates the native full-screen glitch; common41 erases it.
// Observe the actual attached, updated PIXI filter after native readiness,
// never the crackle sound or a future story switch. All scans are capped32.
function createGlitchTracker(root) {
    const seen=new WeakSet(),groups=new WeakSet(),epilogues=new WeakMap();
    function groupFor(scene,filter) {
        const script=scene._wqaBattleStarted?root.$gameTroop?._interpreter:root.$gameMap?._interpreter;
        let child=script;
        for(let depth=0;child&&depth<4;depth++,child=child._childInterpreter)
            if(child._list===root.$dataCommonEvents?.[112]?.list)return child;
        // The two credit-card pulses are one authored animation. A fresh
        // first pulse creates a new episode, so actual replay is preserved.
        if(root.$gameMap?._mapId===224 && script?._eventId===1 &&
            script._list===root.$dataMap?.events?.[1]?.pages?.[0]?.list && [67,70].includes(script._index)){
            let episode=epilogues.get(script);
            if(script._index===67 || !episode || episode.list!==script._list){
                episode={list:script._list};epilogues.set(script,episode);
            }
            return episode;
        }
        return filter;
    }
    function visible(scene,filter) {
        const attached=scene.filters,managed=scene._TKMFilters,control=filter?._controller;
        return !!(Array.isArray(attached)&&attached.length<=32&&Array.isArray(managed)&&managed.length<=32&&
            attached.includes(filter)&&managed.includes(filter)&&filter.enabled===true&&control?.enabled===true&&
            control._erase===false&&control._id==='rgb'&&control._filterType==='glitch'&&
            control._targetType==='FullScreenWithWindow'&&Array.isArray(control.currentParams)&&
            control.currentParams.length===5&&control.currentParams[0]>=1&&control.currentParams[1]>0&&
            control.currentParams[2]===0&&scene.visible!==false&&scene.worldAlpha!==0);
    }
    function capture(scene) {
        const filters=scene.filters;
        if(!Array.isArray(filters)||filters.length>32)return null;
        for(const filter of filters){
            if(!filter||seen.has(filter)||!visible(scene,filter))continue;
            const group=groupFor(scene,filter);
            if(groups.has(group)){seen.add(filter);continue;}
            return {id:'epilogue-glitch',visual:-9,filter,group};
        }
        return null;
    }
    return {capture,visible,admit(state){seen.add(state.filter);},confirm(state){groups.add(state.group);}};
}
module.exports={createGlitchTracker};
