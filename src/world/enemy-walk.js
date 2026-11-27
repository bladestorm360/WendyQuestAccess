'use strict';
const {activeMovingEnemy}=require('./destinations');

// One inert cross-map intent survives only this blocking encounter. It never
// owns input during an interpreter, battle, loading or native resource phase.
function createEnemyWalk(root,host,preferences) {
    let pending=null;
    function cancel() {
        const previous=pending;
        if(previous)previous.scene._wqaEnemyWalkPending=false;
        pending=null;host.graphics._wqaEnemyWalkPending=false;
        return previous;
    }
    function current() {
        const p=pending,player=root.$gamePlayer,map=root.$gameMap;
        return p&&preferences().autowalk&&host.hasFocus()&&map===p.map&&map._mapId===p.mapId&&
            player===p.player&&player._vehicleType==='walk'&&player._x===p.x&&player._y===p.y&&
            map._events?.[p.id]===p.enemy&&root.$gameParty?.getNav?.()===p.quest;
    }
    function park(scene,job,record,owner) {
        if(!(job.remote||job.terrainOnward||job.journey)||!job.autowalk||job.mode!=='walk')return;
        const enemy=root.$gameMap._events?.[record.enemy];
        if(!activeMovingEnemy(root,enemy))return;
        cancel();pending={scene,job,owner,map:root.$gameMap,mapId:root.$gameMap._mapId,player:root.$gamePlayer,
            x:root.$gamePlayer._x,y:root.$gamePlayer._y,id:record.enemy,enemy,list:enemy.list(),
            enemyX:enemy._x,enemyY:enemy._y,quest:root.$gameParty?.getNav?.(),accepted:false};
        scene._wqaEnemyWalkPending=true;
        // The existing movement owner observes a parked blocker. Do not add
        // a second per-frame ready/render observer until native control closes.
        host.graphics._wqaEnemyWalkPending=false;
    }
    function leave(scene,eventId) {
        if(!pending)return;
        if(!current()||scene?._wqaSettingsActive)return cancel();
        const next=host.manager._nextScene;
        if(next&&next.constructor!==root.Scene_Battle&&next.constructor!==root.Scene_Map)return cancel();
        if(eventId===pending.id){pending.accepted=true;host.graphics._wqaEnemyWalkPending=true;return;}
        if(eventId!==undefined&&!(eventId===0&&pending.accepted))return cancel();
        const script=root.$gameMap._interpreter;
        if(!pending.accepted&&!pending.enemy.isStarting?.()&&
            !(script?._eventId===pending.id&&script._list===pending.list))cancel();
        else host.graphics._wqaEnemyWalkPending=true;
    }
    function settle(scene) {
        if(!pending)return null;
        if(!current())return cancel(),null;
        if(activeMovingEnemy(root,pending.enemy)&&pending.enemy._x===pending.enemyX&&pending.enemy._y===pending.enemyY)return null;
        const ticket=cancel();ticket.scene=scene;return ticket;
    }
    return {park,cancel,leave,settle,active:()=>!!pending};
}
module.exports={createEnemyWalk};
