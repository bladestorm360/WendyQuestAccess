'use strict';
const assert=require('node:assert/strict');

// Native transfer commands reserve these values. This fixture owns only the
// asynchronous resource/scene loader stand-in; interpreter and movement bodies
// remain the extracted native functions. Game map/player identities persist.
function createSolverHarness(c) {
    const switches=new Set(),self=new Set(),variables=new Map();
    let map=null,player=null,loading=null;
    function copy(source,target) {
        for(const key of Object.keys(source)) {
            const descriptor=Object.getOwnPropertyDescriptor(target,key);
            if(descriptor && !descriptor.writable && !descriptor.set)continue;
            target[key]=source[key];
        }
    }
    return {
        switches,self,variables,
        states:()=>({switches:Array.from(switches),self:Array.from(self),variables:Object.fromEntries(variables)}),
        adopt(run) {
            if(map){copy(run.gameMap,map);copy(run.player,player);run.gameMap=c.$gameMap=map;run.player=c.$gamePlayer=player;}
            else {map=run.gameMap;player=run.player;}
        },
        begin() {
            if(loading || !c.$gamePlayer._transferring)return false;
            const p=c.$gamePlayer;
            loading={map:p._newMapId,x:p._newX,y:p._newY,direction:p._newDirection || p._direction,frames:3};
            assert([196,197,199,200,201,202,206,198].includes(loading.map));return true;
        },
        load() {
            if(!loading)return null;
            if(--loading.frames>0)return {waiting:true};
            const value=loading;loading=null;return value;
        },
        get loading(){return !!loading;}
    };
}
module.exports={createSolverHarness};
