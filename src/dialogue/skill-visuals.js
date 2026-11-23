"use strict";

const { renderedSprite } = require('../runtime/rendered-sprite');
const { battleScenePresented } = require('../battle/presentation');

// Exact native particle factories supply these identities after attachment.
// Base/upgraded skills share art; each real action owns one caption per stage.
const SKILLS = Object.freeze({
 'crispy-shield': [[22,23],3,'FrygorCrispyShieldFX'],
 'spicy-surge': [[28,29],5,'SpiceBuff_Over'],
 'rise-shine': [[31,32],2,'BaconatorBuff'],
 'frosty-time': [[25,26],4,'FrostyTimeClock'],
 'frosty-blast': [[10,11],4,'FrostyBlast'],
 'crispy-barrage': [[7,8],3,'FrygorCrispyBarrageFX'],
 'pigtail-whip': [[37],1,'WendyPigtailWhipFX'],
 'beef-charge': [[38],1,'WendyWhereIsBeef_PowerUp'],
 'beef-attack': [[38],1,'WendyWhereIsBeef_Attack'],
 'nugget-strike': [[15,16],5,'NuggetStrike'],
 'bacon-blast': [[18,19],2,'BaconatorBlast']
});
function skillVisual(root,host,scene,actor,sprite,key) {
 const spec=SKILLS[key],action=root.BattleManager?._action,set=scene?._spriteset;
 if(!spec || !action?.isSkill?.() || !spec[0].includes(action.item()?.id) ||
    !battleScenePresented(root,host,scene))return null;
 const expected=spec[1]===1?set?._actorSprites?.[0]:set?._subActorSprite;
 const actorId=spec[1]===1?actor?._actor?._actorId:actor?._actor?.id;
 if(actor!==expected || actorId!==spec[1] || actor?.parent!==set?._battleField || !sprite?.parent)return null;
 const parent=sprite.parent;
 const visible=()=>{
  if(root.BattleManager?._action!==action || !battleScenePresented(root,host,scene) ||
     !renderedSprite(sprite,parent) || !sprite.bitmap?.isReady?.() ||
     !sprite.worldTransform || sprite.worldTransform.tx<0 || sprite.worldTransform.tx>=host.graphics.width ||
     sprite.worldTransform.ty<0 || sprite.worldTransform.ty>=host.graphics.height ||
     sprite.animator?._animationData?.fileName!=='ParticleEffects/'+spec[2])return false;
  let node=parent;
  for(let depth=0;node&&depth<4;depth++,node=node.parent){
   if(node===scene || node===set._battleField)return true;
   if(node.visible===false || node.worldVisible===false || node.worldAlpha===0)return false;
  }
  return false;
 };
 return {id:'skill-'+key,action,battleVisible:visible,visual:-6,waitFrames:240};
}
module.exports={skillVisual,SKILLS};
