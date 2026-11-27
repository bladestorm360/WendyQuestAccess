'use strict';
const {renderedSprite}=require('../runtime/rendered-sprite');
// Exact one-use recruitment/credential actions in build26578620. Receipt
// capture is metadata only; asset, pose and party checks wait for native-ready
// postrender. Long arrivals must not expire before entering the viewport.
const JUMPS=[
 [77,25,0,76,26,0,13,'bacon-bridge-landing',40,13,40,14],
 [77,25,0,98,26,1,0,'tatoria-aside',41,14],
 [77,25,0,108,27,0,13,'baconator-landing',39,13,39,14],
 [191,3,0,45,3,0,2,'officer-aside',33,19]
];
const WALKS=[[14,5,1,37,35,0,0,'frygor-approaches']];
const ROUTES=[...JUMPS,...WALKS];
function createRecruitmentVisuals(root,graphics,nextOrder){
 let pending=[];const seen=new WeakMap();
 function source(scene,script,index){
  const map=root.$gameMap;
  if(!scene?._wqaMapRestored||script!==map?._interpreter||script._mapId!==map._mapId)return null;
  const site=ROUTES.find(([m,e,p,i])=>map._mapId===m&&script._eventId===e&&index===i&&
   script._list===root.$dataMap?.events?.[e]?.pages?.[p]?.list);
  return site?{map,site}:null;
 }
 function add(scene,map,script,index,id,actorId,site){
  const key=[map._mapId,script._eventId,index].join('/');
  let keys=seen.get(scene);if(!keys){keys=new Set();seen.set(scene,keys);}
  if(keys.has(key)||pending.length>=5)return true;
  keys.add(key);
  pending.push({id,scene,map,mapId:map._mapId,eventId:script._eventId,source:script,sourceList:script._list,
   actorId,actor:actorId===null?null:map._events[actorId],site,page:site?.[2]??0,key,order:nextOrder(),
   birth:graphics.frameCount,frame:graphics.frameCount,waitFrames:240,visual:-16});
  scene._wqaRecruitmentPending=true;return true;
 }
 function jump(scene,script,actor,switched,visual,index){
  if(switched!==undefined||visual!==undefined)return false;
  const found=source(scene,script,index);if(!found)return false;
  const {map,site}=found,row=script._list[index],route=row?.parameters?.[1]?.list;
  if(row?.code!==205||(row.parameters[0]||script._eventId)!==site[4]||actor!==map._events?.[site[4]]||actor?._erased||
   !Array.isArray(route))return true;
  if(WALKS.includes(site)) {
   if(route.length>32||row.parameters[1].repeat!==false||
      !route.every(r=>[0,1,2,25,37].includes(r.code))||!route.some(r=>r.code===1)||!route.some(r=>r.code===2))return true;
   const added=add(scene,map,script,index,site[7],site[4],site);
   const state=pending.find(s=>s.source===script&&s.key===[map._mapId,script._eventId,index].join('/'));
   if(state&&!state.walk)Object.assign(state,{walk:true,route:row.parameters[1],originX:actor._realX,originY:actor._realY});
   return added;
  }
  if(route.length>16||!route.some(r=>r.code===14&&r.parameters?.[0]===site[5]&&r.parameters[1]===site[6]))return true;
  return add(scene,map,script,index,site[7],site[4],site);
 }
 function party(scene,script){
  const map=root.$gameMap,list=root.$dataMap?.events?.[25]?.pages?.[0]?.list;
  if(!scene?._wqaMapRestored||map?._mapId!==77||script!==map._interpreter||script._mapId!==77||script._eventId!==25||
   script._list!==list||script._index!==221||list?.[221]?.code!==117||list[221].parameters[0]!==38||
   script._childInterpreter?._list!==root.$dataCommonEvents?.[38]?.list)return;
  add(scene,map,script,221,'companions-reappear',null,null);
 }
 function valid(scene,state){return state.scene===scene&&state.map===root.$gameMap&&state.mapId===root.$gameMap?._mapId&&
  root.$dataMap?.events?.[state.eventId]?.pages?.[state.page]?.list===state.sourceList&&
  graphics.frameCount-state.birth<=600;}
 function take(scene){const result=pending.filter(s=>valid(scene,s));pending=[];scene._wqaRecruitmentPending=false;return result;}
 function painted(scene,sprite){
  const parent=scene._spriteset?._tilemap,pose=sprite?.worldTransform;
  return parent?.worldVisible===true&&renderedSprite(sprite,parent)&&pose&&pose.tx>=0&&pose.tx<=graphics.width&&
   pose.ty>=0&&pose.ty<=graphics.height+16;
 }
 function visible(scene,state){
  if(!valid(scene,state))return false;
  const sprites=scene._spriteset?._characterSprites;
  if(!Array.isArray(sprites)||sprites.length>512)return false;
  if(state.site){
   const site=state.site,actor=state.map._events?.[state.actorId];
   if(!actor||actor!==state.actor||actor._erased||actor._transparent||!actor._characterName)return false;
   if(state.walk) {
    const sprite=sprites.find(s=>s._character===actor);
    return state.source._list===state.sourceList&&state.source._index<=58&&actor._moveRoute===state.route&&
     actor._characterName==='~Frygor'&&sprite?._characterName==='~Frygor'&&painted(scene,sprite)&&
     (actor._realX!==state.originX||actor._realY!==state.originY);
   }
   const last=site[0]===191?51:site[3]===76?94:site[3]===98?107:124;
   if(state.source._list&&state.source._list!==state.sourceList||
    state.source._list===state.sourceList&&state.source._index>last)return false;
   // The native command must have moved this actor to its authored landing;
   // a skipped blocked route or an unrelated later teleport is not proof.
   const landed=actor._x===site[8]&&actor._y===site[9]||site.length>10&&actor._x===site[10]&&actor._y===site[11];
   if(!landed)return false;
   const sprite=sprites.find(s=>s._character===actor);
   return sprite?._characterName===actor._characterName&&painted(scene,sprite)&&
    (actor._jumpCount>0||actor._realX===actor._x&&actor._realY===actor._y);
  }
  // The join changes graphics behind black. Wait for a real, painted follower
  // of Baconator alongside another companion, not the hidden staged NPC.
  if(!root.$gameParty?._actors?.includes(2))return false;
  const followers=sprites.filter(s=>s._character?._memberIndex>0&&s._character._memberIndex<=8&&
   !s._character._transparent&&s._character._characterName&&s._characterName===s._character._characterName&&painted(scene,s));
  return followers.length>=2&&followers.some(s=>s._characterName==='~Baconator');
 }
 function retain(state){if(pending.length<5){pending.push(state);state.scene._wqaRecruitmentPending=true;}}
 function retire(scene){pending=pending.filter(s=>scene&&s.scene!==scene);if(scene)scene._wqaRecruitmentPending=false;}
 return {jump,party,take,visible,retain,retire,get size(){return pending.length;}};
}
module.exports={JUMPS,WALKS,createRecruitmentVisuals};
