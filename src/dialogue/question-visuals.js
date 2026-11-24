"use strict";
const cues = require('./narration-cues.json');
const actors = Object.create(null);
function add(map, actor, id, anchor) {
    const table = actors[map] ||= Object.create(null);
    if (table[actor] && table[actor].id !== id) throw Error('Ambiguous question-mark subject');
    table[actor] = { id, balloonAnchor: anchor };
}
for (const [id, cue] of Object.entries(cues)) {
    for (const [map,event,page,index,actor,,visual] of cue.beats) if (visual === 2)
        add(map, actor, id, cue.balloonAnchors?.some(key => key.join('/') === [map,event,page,index].join('/')));
    for (const [map,,,,,,actor,visual] of cue.commonBeats || []) if (visual === 2) add(map, actor, id, false);
}
// Read only actual native question balloons at a fully ready frame. Their
// producer can finish or change tiles before observation is safe. Registered
// actor identity determines the caption; the rendered balloon confirms it.
function question(root, scene, balloon) {
    if (!(balloon?._duration > 0)) return null;
    const map = root.$gameMap, actor = balloon.targetObject;
    // Map32 preloads its first Frostyna portrait before Wendy's opening
    // exclamation. Recover only this exact active scene's drawn balloon once
    // native readiness returns; the regular receipt shares its sprite guard.
    if (balloon._balloonId === 1) {
        const script=map?._interpreter;
        if(map?._mapId!==32 || script?._mapId!==32 || script._eventId!==5 ||
            script._list!==root.$dataMap?.events?.[5]?.pages?.[0]?.list ||
            script._index<3 || script._index>12 || actor!==root.$gamePlayer ||
            balloon._target?._character!==actor)return null;
        return {id:'startled-wendy',actor,actorId:-1,sprite:balloon._target,balloon,visual:1};
    }
    if (balloon._balloonId !== 2) return null;
    const actorId = actor === root.$gamePlayer ? -1 : actor?._eventId;
    const cue = actors[map?._mapId]?.[actorId];
    if (!cue || !actor || (actorId !== -1 && map._events?.[actorId] !== actor) ||
        balloon._target?._character !== actor) return null;
    return { ...cue, actor, actorId, sprite: balloon._target, balloon, visual: 2 };
}
function assistance(root, scene) {
    const map = root.$gameMap, parent = map?._interpreter, child = parent?._childInterpreter;
    if (map?._mapId !== 16 || ![54,55].includes(parent?._eventId) || parent._index !== 1 ||
        parent._list !== root.$dataMap?.events?.[parent._eventId]?.pages?.[0]?.list ||
        child?._list !== root.$dataCommonEvents?.[200]?.list || child._index < 22 || child._index > 56) return null;
    const actor = map._events?.[52], sprites = scene._spriteset?._characterSprites;
    if (!actor || actor._pageIndex !== 1 || actor._characterName !== 'TREASURE CHEST SPECIAL' ||
        !Array.isArray(sprites) || sprites.length > 512) return null;
    const sprite = sprites.find(item => item._character === actor);
    return sprite && { id: 'assistance-chest', actor, sprite, visual: -12, waitFrames: 240 };
}
module.exports = { question, assistance };
