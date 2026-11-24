"use strict";

const CONTEXTS = require('./event-contexts.json');
const MAX_SCENES = 512;
const STORE = '_wqaEventKnowledge';
const IDS = new Set(Object.values(CONTEXTS).map(row => row[1]));
const cache = new WeakMap(), pending = new WeakMap(), paints = new WeakSet();

// Knowledge belongs to the native save-backed Game_System, never global settings.
// Old saves remain unknown until an actual encounter. Plain arrays/objects retain
// native JsonEx compatibility; copied saves inherit only their saved knowledge.
function state(system) {
    if (!system || typeof system !== 'object') return null;
    const record = system[STORE], ids = record?.ids;
    const prior = cache.get(system);
    if (prior && prior.record === record && prior.ids === ids && prior.length === ids?.length) return prior;
    const valid = record?.version === 1 && Array.isArray(ids) && ids.length <= MAX_SCENES;
    const seen = new Set();
    if (valid) for (const id of ids) if (typeof id === 'string' && IDS.has(id)) seen.add(id);
    const next = { record, ids, length: ids?.length, seen };
    cache.set(system, next);
    return next;
}
function remember(root, key) {
    const current = state(root.$gameSystem);
    if (!current || !IDS.has(key) || current.seen.has(key) || current.seen.size >= MAX_SCENES) return false;
    current.seen.add(key);
    // Replace only our own record after a real encounter, also repairing malformed
    // metadata. Never serialize interpreter/list/scene pointers or dialogue text.
    const ids = [...current.seen], record = { version: 1, ids };
    root.$gameSystem[STORE] = record;
    cache.set(root.$gameSystem, { record, ids, length: ids.length, seen: current.seen });
    return true;
}
function contextualEvent(root, event, target, spoilers) {
    if (target?.category !== 'events') return target;
    const row = CONTEXTS[root.$gameMap._mapId + ':' + event._eventId + ':' + event._pageIndex];
    if (!row || !spoilers && !state(root.$gameSystem)?.seen.has(row[1])) return target;
    return { ...target, name: row[0], eventContext: true };
}
function ready(root, scene) {
    return !!(scene?._wqaMapRestored && scene._mapLoaded && scene._started && scene._active &&
        root.SceneManager?._scene === scene && root.Graphics?.app?.stage === scene &&
        !root.SceneManager._nextScene && !root.SceneManager._exiting && !root.SceneManager._wqaNativeAutosaves &&
        !root.Graphics._wqaResize && !scene._wqaTerrainWork && !scene._wqaPreloads?.size &&
        !scene._wqaPreloadOverflow && scene._fadeDuration === 0 && scene._fadeOpacity === 0 &&
        root.$gameScreen?._brightness === 255 && !root.$gameMap?._needsTilemapRefresh &&
        !root.$gamePlayer?._transferring);
}
function executingKey(root, interpreter) {
    const map = root.$gameMap;
    if (interpreter !== map?._interpreter || interpreter?._mapId !== map._mapId || !interpreter._list) return null;
    const id = interpreter._eventId, pages = root.$dataMap?.events?.[id]?.pages;
    if (!Array.isArray(pages) || pages.length > 32) return null;
    // Native switches can change the live actor page before its old script ends.
    // Resolve the executing list, not the actor's current page index.
    const page = pages.findIndex(item => item.list === interpreter._list);
    return CONTEXTS[map._mapId + ':' + id + ':' + page]?.[1] || null;
}
function dialoguePresented(root, scene, paint) {
    if (!paint || paints.has(paint) || !ready(root, scene)) return;
    const key = executingKey(root, root.$gameMap?._interpreter);
    if (!key) return;
    const speakerEvent = root.$gameMessage?._wqaSpeakerEvent;
    if (speakerEvent && speakerEvent !== root.$gameMap._interpreter._eventId) return;
    paints.add(paint);
    remember(root, key);
}
function completed(root, scene, interpreter) {
    if (!ready(root, scene) || !root.$gameSystem) return;
    const key = executingKey(root, interpreter);
    if (!key) return;
    let receipt = pending.get(root.$gameSystem);
    if (!receipt) pending.set(root.$gameSystem, receipt = new Set());
    if (receipt.size < MAX_SCENES) receipt.add(key);
    root.Graphics._wqaEventKnowledgePending = true;
}
function commitReady(root, scene) {
    if (!scene?._wqaFieldReady || !ready(root, scene)) return;
    const receipt = pending.get(root.$gameSystem);
    root.Graphics._wqaEventKnowledgePending = false;
    if (!receipt) return;
    pending.delete(root.$gameSystem);
    for (const key of receipt) remember(root, key);
}

module.exports = { contextualEvent, dialoguePresented, completed, commitReady, CONTEXTS, STORE, MAX_SCENES };
