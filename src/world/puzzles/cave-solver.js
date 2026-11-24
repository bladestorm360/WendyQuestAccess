'use strict';

const {automaticCaveMap,acceptedAction,CHASES,CHASE_LEGS} = require('./cave-progression');

// Stable native locators, not an independent irreversible step index. Each
// pickup's authored common event consumes its own self-switch A in the save.
const PICKUPS = Object.freeze({196:[9],199:[2,34,25,10],200:[3,20,12]});
const TRANSFERS = {196:{20:199,22:206},199:{3:196,26:200},200:{2:199,11:201},
    201:{1:200,2:202},206:{11:196}};

function caveSolverMap(map) { return map === 206 || automaticCaveMap(map); }
function remainingPickups(root) {
    const result=[];
    for (const [room,ids] of Object.entries(PICKUPS)) for (const id of ids)
        if (root.$gameSelfSwitches?.value?.([Number(room),id,'A']) !== true) result.push([Number(room),id]);
    return result;
}

// Native capture checkpoint 3 lands in the upper-right exit pocket. With
// all five guards back at their authored posts it has no walking connection
// to any crystal, pickup or the previous room. Do not loop back into it.
const EXIT_POCKET=[[[24,24]],[[24,24]],[[24,24]],[[24,24]],[[24,24]],[[23,25]],
    [[12,16],[20,20],[23,25]],[[12,13],[16,20],[23,25],[29,32]],
    [[12,12],[16,22],[24,24],[26,29],[31,32]],[[12,12],[16,28],[31,33]],
    [[12,12],[31,33]],[[32,33]],[[32,33]],[[32,32]]];
function pastDistractions(root) {
    const map=root.$gameMap,player=root.$gamePlayer;
    return map?._mapId===200 && EXIT_POCKET[player?._y]?.some(([left,right])=>player._x>=left && player._x<=right) &&
        root.$gameVariables?.value?.(90)===3 && [4,9,16,17,18].every(id=>{
            const actor=map._events?.[id],entry=root.$dataMap?.events?.[id];
            return actor && entry && actor._pageIndex===0 && !actor._erased && !actor._through &&
                !actor._moveRouteForcing && !actor._jumpCount && actor._x===entry.x && actor._y===entry.y &&
                actor._realX===actor._x && actor._realY===actor._y;
        });
}

function resumeChase(root) {
    const map=root.$gameMap,player=root.$gamePlayer;
    if(map?._mapId!==201 || player?._moveSpeed!==4)return null;
    const sequence=Object.keys(CHASE_LEGS).map(Number);
    const id=sequence.slice().reverse().find(id=>map._events?.[id]?._erased);
    if(!id)return null;
    const [guard,index]=Object.entries(CHASES).find(([,locator])=>locator[0]===id) || [];
    if(!guard || !index)return null;
    const actor=map._events[guard],route=root.$dataMap?.events?.[id]?.pages?.[0]?.list?.[index[1]]?.parameters?.[1];
    if(!actor?._moveRouteForcing || !route || !Array.isArray(route.list) || route.list.length>128 ||
        actor._moveRoute?.repeat!==route.repeat || actor._moveRoute.skippable!==route.skippable ||
        actor._moveRoute.list?.length!==route.list.length || !route.list.every((step,i)=>{
            const actual=actor._moveRoute.list[i];
            return actual.code===step.code && (step.parameters||[]).length===(actual.parameters||[]).length &&
                (step.parameters||[]).every((value,j)=>typeof value==='number' && value===actual.parameters[j]);
        }))return null;
    const start=root.$dataMap.events[id];
    let x=start.x,y=start.y;
    const legs=CHASE_LEGS[id];
    for(let i=0;i<legs.length;i++) {
        const [direction,tiles]=legs[i],dx=direction===6?1:direction===4?-1:0,dy=direction===2?1:direction===8?-1:0;
        const offsetX=player._x-x,offsetY=player._y-y,travelled=offsetX*dx+offsetY*dy;
        if(offsetX*dy===offsetY*dx && travelled>=0 && travelled<tiles) {
            return {next:sequence[sequence.indexOf(id)+1] || 2,
                legs:[[direction,tiles-travelled],...legs.slice(i+1)].map(([direction,tiles])=>({direction,tiles}))};
        }
        x+=dx*tiles;y+=dy*tiles;
    }
    return null;
}

function planCaveStep(root) {
    const map=root.$gameMap?._mapId, remaining=remainingPickups(root);
    const earlier=remaining.some(([room])=>room<map);
    const local=remaining.find(([room])=>room===map);
    const checkpoint=root.$gameVariables?.value?.(90);
    if(!Number.isInteger(checkpoint) || checkpoint<0 || checkpoint>3)return null;
    let id;
    if(map===206) id=11;
    else if(map===196) id=local?.[1] || (checkpoint<1 ? 21 : 20);
    else if(map===199) id=earlier || checkpoint<1 ? 3 : local?.[1] || 26;
    else if(map===200) id=pastDistractions(root) ? remaining.some(([room,id])=>room===200 && id===12) ? 12 : 11 : earlier ? 2 : checkpoint<2 ? 6 : local?.[1] || (checkpoint<3 ? 15 : 11);
    else if(map===201) id=2; // Returning south lands beyond the same one-way guard barrier.
    else if(map===202) return {complete:true,remaining:remaining.length};
    else return null;
    return {map,id,transfer:TRANSFERS[map]?.[id]};
}

function solverActionAllowed(root,scene,event) {
    const action=acceptedAction(root,scene,event);
    if (!action) return false;
    if(automaticCaveMap(action.origin)) return true;
    if(action.origin===206 && event._eventId===11 && action.exit?.[2]===196) return true;
    return false;
}

function createCaveSolver(root,graphics,preferences) {
    let run=null, serial=0;
    function enabled() {const value=preferences();return value.autowalk===true && value.caveAutomaticInteractions===true;}
    function active() {
        if(run && (run.system!==root.$gameSystem || !enabled() ||
            !caveSolverMap(root.$gameMap?._mapId) && root.$gameMap?._mapId!==198)) stop();
        return !!run;
    }
    function waitingNative() {
        const event=root.$gameMap?._mapId===196 && root.$gameMap._events?.[3];
        return !!event && !event._erased && event._pageIndex===0 && root.$gameSelfSwitches?.value?.([196,3,'A'])!==true;
    }
    function stop() {const was=!!run;run=null;graphics._wqaCaveSolverPending=graphics._wqaCaveSolverActive=false;return was;}
    return {
        enabled,active,stop,waitingNative,
        available:()=>caveSolverMap(root.$gameMap?._mapId),
        start() {
            if(!enabled() || !root.$gameSystem || !caveSolverMap(root.$gameMap?._mapId) || serial>=0x7ffffffe)return false;
            run={token:++serial,system:root.$gameSystem,announced:false};
            graphics._wqaCaveSolverPending=graphics._wqaCaveSolverActive=true;return true;
        },
        token:()=>active()?run.token:0,
        current:token=>active() && run.token===token,
        wake() {if(active())graphics._wqaCaveSolverPending=true;},
        pending:()=>active() && graphics._wqaCaveSolverPending===true,
        next(objects) {
            if(!active())return null;
            if(run.transfer) {
                const transfer=run.transfer;run.transfer=null;
                if(root.$gameMap?._mapId===transfer.origin){stop();return {declined:true};}
            }
            const step=planCaveStep(root);
            if(!step || step.complete) {stop();return step;}
            const target=objects.find(item=>item.id===step.id && item.category!=='quests');
            if(!target)return {unavailable:true,map:step.map,id:step.id};
            graphics._wqaCaveSolverPending=false;
            return {target,token:run.token,announced:run.announced,transfer:step.transfer,chase:resumeChase(root)};
        },
        announced() {if(active())run.announced=true;},
        prepare(action) {
            if(active()) {
                run.prepared={map:action.origin,id:action.event._eventId,transfer:action.exit?.[2]};
                graphics._wqaCaveSolverPending=true;
            }
        },
        accepted(map,id) {
            if(!active())return;
            const prepared=run.prepared;
            if(id>0) {
                if(prepared?.map===map && prepared.id===id && prepared.transfer)
                    run.transfer={origin:map,target:prepared.transfer};
                run.prepared=null;
            }
            graphics._wqaCaveSolverPending=true;
        },
        leave(scene,keep=false) {
            if(!active())return;
            if(scene?._wqaSettingsActive)return stop();
            // Keep only intent through admitted native scripts/transfers. No
            // route work runs until the existing field-ready gate reopens.
            if(keep || waitingNative() || run.transfer && [run.transfer.origin,run.transfer.target].includes(root.$gameMap?._mapId) || root.$gamePlayer?._transferring || root.$gameMap?._interpreter?._list || root.$gameMap?._mapId===198)
                graphics._wqaCaveSolverPending=true;
            else stop();
        }
    };
}

module.exports={PICKUPS,caveSolverMap,remainingPickups,planCaveStep,EXIT_POCKET,pastDistractions,resumeChase,solverActionAllowed,createCaveSolver};
