"use strict";
const {parkedVehicle}=require('./vehicle-navigation');
const {boatBoarding}=require('./transfer-events.cjs');
// Only the authored Float Fort boat and its two requested sea destinations.
// This ticket navigates; it never supplies Confirm or the boarding step.
function createBoatJourney(root,transfers) {
    let journey=null;
    const copy=({event,map,x,y,approach})=>({event,map,x,y,approach});
    function clear(){journey=null;}
    function prepare(job,snapshot,target) {
        if(snapshot.map!==113 || snapshot.mode!=='walk' || root.$gameSwitches.value(38)!==true ||
            !parkedVehicle(root.$gameMap,'ship') || ![28,94,514].includes(target.id))return;
        const {entrances,state}=transfers.candidates();
        const bookmark={map:26,mode:'walk',name:'Boat',point:{x:29,y:12},kind:'point',x:29,y:12,verifiedOnly:true,
            worldMap:113,world:{...snapshot.live,terrain:snapshot.live.terrain.slice()},worldEntries:entrances.map(copy)};
        const selection={boat:{target,bookmark},trail:[]};
        job.boatApproach={bookmark,entrances,ground:[],state,selection};
        return {map:26,point:bookmark.point,verifiedOnly:true,state,candidates:entrances.map(copy),
            world:bookmark.world,worldMap:113,worldEntries:bookmark.worldEntries};
    }
    function accept(job,result) {
        if(!result.boatFallback || !job.boatApproach)return false;
        job.remote=job.boatApproach;
        // This course ends at a town entrance, not the parked craft. Retain
        // the craft only in the final ticket; arrival must validate the exit.
        job.vehicle=undefined;job.eventAction=undefined;job.point=false;
        return true;
    }
    function settle(arrived) {
        if(!arrived?.boat)return false;
        journey={player:root.$gamePlayer,map:root.$gameMap._mapId,ticket:arrived};return true;
    }
    function resume(job,snapshot,remote,route,status,select) {
        if(!journey)return false;
        const {player,map,ticket}=journey,{target,bookmark}=ticket.boat;
        if(player!==root.$gamePlayer || map!==snapshot.map){clear();return false;}
        if(snapshot.map===26 && snapshot.mode==='walk') {
            const entry=root.$dataMap.events[5],event=root.$gameMap._events[5];
            const edge=boatBoarding(entry,event?.page(),root.$dataCommonEvents);
            const destination=snapshot.objects.find(t=>t.id===5&&t.category==='vehicles');
            const live=transfers.candidates().entrances.find(e=>e.event===5);
            if(!edge || !live || !destination){clear();status(job,'Boat boarding is not currently reachable.');return true;}
            select(destination);route(job,snapshot,destination);
            transfers.arm(job.scene,{...ticket,trail:[],autowalk:job.autowalk},live);
            return true;
        }
        if(snapshot.map===113 && snapshot.mode==='ship') {
            if(target.id===514){clear();status(job,'Arrived.');return true;}
            const id=target.id===28?31:51;
            const destination=snapshot.objects.find(t=>t.id===id);
            if(!destination){clear();status(job,'Not currently reachable');return true;}
            select(destination);route(job,snapshot,destination);
            if(id===51) {
                const edge=transfers.islandLanding();
                if(edge)transfers.arm(job.scene,{...ticket,trail:[],autowalk:job.autowalk},edge);
            } else clear();
            return true;
        }
        if(snapshot.map===113 && snapshot.mode==='walk' && target.id===94 && root.$gameSwitches.value(224)===false) {
            const destination=snapshot.objects.find(t=>t.id===94);
            if(destination){select(destination);route(job,snapshot,destination);clear();return true;}
        }
        if(snapshot.mode!=='walk'){clear();return false;}
        remote(job,snapshot,bookmark,ticket);return true;
    }
    return {clear,prepare,accept,settle,resume};
}
module.exports={createBoatJourney};
