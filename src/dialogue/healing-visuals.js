'use strict';
const {renderedSprite}=require('../runtime/rendered-sprite');
// Native HP coroutines own their IDs. One caption per actual routine, never
// one per sparkle or per equal text. Sound/HP alone cannot prove a visual.
function createHealing(root,host){
 const seen=new WeakMap();
 function ready(scene){return !!(scene&&scene===host.manager._scene&&host.graphics.app?.stage===scene&&
  scene._started&&scene._active&&!scene._fadeDuration&&!scene._fadeOpacity&&!scene._wqaPreloads?.size&&
  !scene._wqaPreloadOverflow&&!scene._wqaTerrainWork&&!scene._wqaSettingsActive&&
  !host.manager._nextScene&&!host.manager._exiting&&!host.manager._wqaNativeAutosaves&&!host.graphics._wqaResize&&
  !root.$gamePlayer?._transferring&&!host.screenFading()&&host.hasFocus()&&
  (scene._wqaBattleStarted||scene._wqaMapRestored&&scene._mapLoaded&&scene.srcWendy&&scene.srcStones||
   scene._wqaMenuActive&&scene._wqaMenuStatus===scene._statusWindow));}
 function capture(scene,hud,sprite){
  if(!ready(scene)||hud!==scene._statusWindow||hud?.battler?._actorId!==1||
    !Number.isSafeInteger(hud.HPRoutineID)||seen.get(hud)===hud.HPRoutineID||sprite?.parent!==hud)return null;
  const id=hud.HPRoutineID;
  return {id:'hp-healing-sparkles',visual:-6,waitFrames:60,battleVisible:()=>{
   if(!ready(scene)||hud!==scene._statusWindow||hud.HPRoutineID!==id||!hud.parent||!renderedSprite(hud,hud.parent)||
     !renderedSprite(sprite,hud)||sprite.animator?._animationData?.fileName!=='ParticleEffects/Heal')return false;
   seen.set(hud,id);return true;
  }};
 }
 function enemy(scene){
  const troop=root.$gameTroop,script=troop?._interpreter,sprites=scene?._spriteset?._enemySprites;
  if(!ready(scene)||!scene._wqaBattleStarted||troop?._troopId!==150||script?._index!==54||
   script._list!==root.$dataTroops?.[150]?.pages?.[6]?.list||!Array.isArray(sprites)||sprites.length>16)return null;
  const actor=sprites[0],gauge=actor?._gaugeSprite,value=gauge?._value;
  if(!gauge||!Number.isFinite(value))return null;
  return {id:'frygor-heals',visual:-6,waitFrames:80,battleVisible:()=>ready(scene)&&
   actor===scene._spriteset._enemySprites?.[0]&&actor.parent===scene._spriteset._battleField&&
   renderedSprite(gauge,actor)&&gauge._value>value&&gauge.bitmap?.isReady?.()};
 }
 return{ready,capture,enemy};
}
module.exports={createHealing};
