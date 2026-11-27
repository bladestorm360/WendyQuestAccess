'use strict';

const VECTORS = {2:[0,1],4:[-1,0],6:[1,0],8:[0,-1]};

function readoutLimit(preferences) {
    const count=preferences.routeLegsPerReadout;
    return preferences.fullRouteReadout===true ? 8 :
        Number.isInteger(count)&&count>=1&&count<=12 ? count : 3;
}

function chunkReadout(record,preferences) {
    if(preferences.fullRouteReadout===true)return record;
    const legs=[];
    for(const leg of record.legs||[]) {
        const previous=legs[legs.length-1];
        if(previous?.direction===leg.direction)previous.tiles+=leg.tiles;
        else legs.push({...leg});
    }
    const limit=readoutLimit(preferences),more=record.more===true||legs.length>limit;
    return {...record,legs:legs.slice(0,limit),more,chunkReadout:true};
}

// One issued prefix, with no idle polling or route search on the native
// movement callback. The engine's interpolation-complete notification is
// authoritative even with all player audio disabled. Only a completed prefix
// schedules one postrender recapture through the existing asynchronous router.
function createRouteReadout(root,host,ready,resume) {
    let generation=0,session=null,issued=null;
    function cancel() {
        const active=!!session;
        if(session)session.scene._wqaReadoutActive=false;
        generation++;session=issued=null;
        return active;
    }
    function current(token) {
        return !!session&&token===generation&&host.navigationPreferences().autoRouteReadout===true&&
            !host.navigationPreferences().autowalk&&session.map===root.$gameMap&&session.player===root.$gamePlayer&&
            session.scene===host.manager._scene&&session.valid();
    }
    function follow(job,record,valid) {
        const preferences=host.navigationPreferences();
        if(preferences.autoRouteReadout!==true||preferences.autowalk||!record.legs?.length)return null;
        if(!job.autoReadout||!session||session.scene!==job.scene||session.map!==root.$gameMap)cancel();
        const legs=record.legs;
        if(legs.length>12||legs.some(leg=>!VECTORS[leg.direction]||!Number.isInteger(leg.tiles)||leg.tiles<1||leg.tiles>16384))return null;
        session={scene:job.scene,map:root.$gameMap,player:root.$gamePlayer,valid};
        issued={x:job.x,y:job.y,legs:legs.map(leg=>({...leg})),index:0,left:legs[0].tiles,
            more:record.more===true,controller:job.controller};
        job.scene._wqaReadoutActive=true;
        return generation;
    }
    function changed(scene,actor) {
        if(!session||session.scene!==scene)return false;
        if(!actor||!current(generation)||root.$gamePlayer._moveRouteForcing)return cancel(),false;
        if(actor!==root.$gamePlayer)return false;
        if(issued) {
            const [x,y]=nextTile(issued);
            if(!(actor._x===issued.x&&actor._y===issued.y)&&!(actor._x===x&&actor._y===y))return cancel(),false;
        }
        return true;
    }
    function nextTile(prefix) {
        const direction=prefix.legs[prefix.index].direction,[dx,dy]=VECTORS[direction],map=session.map;
        return [map.roundXWithDirection?.(prefix.x,direction)??prefix.x+dx,
            map.roundYWithDirection?.(prefix.y,direction)??prefix.y+dy];
    }
    function landed(scene,player) {
        if(!issued||session?.scene!==scene||player!==session.player)return;
        if(!current(generation)||!ready(scene,true)||player._vehicleType!=='walk'||
            player._x!==player._realX||player._y!==player._realY)return cancel();
        const prefix=issued,[x,y]=nextTile(prefix);
        if(player._x!==x||player._y!==y)return cancel();
        prefix.x=player._x;prefix.y=player._y;
        if(--prefix.left>0)return;
        if(++prefix.index<prefix.legs.length){prefix.left=prefix.legs[prefix.index].tiles;return;}
        issued=null;scene._wqaReadoutActive=false;
        if(!prefix.more)return; // Final approach waits for the player's action.
        const token=generation,renderer=host.graphics.app?.renderer;
        if(typeof renderer?.once!=='function')return cancel();
        renderer.once('postrender',()=>{
            if(!current(token)||!ready(scene,true))return cancel();
            if(!resume(prefix.controller))cancel();
        });
    }
    return {cancel,current,follow,changed,landed,active:scene=>!!session&&session.scene===scene};
}

module.exports={readoutLimit,chunkReadout,createRouteReadout};
