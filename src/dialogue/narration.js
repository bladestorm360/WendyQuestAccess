'use strict';

const cues = require('./narration-cues.json');
const { currentTylerEntry } = require('./tyler-visuals');
const { createGlitchTracker } = require('./screen-glitch');
const { skillVisual } = require('./skill-visuals');
const { renderedSprite } = require('../runtime/rendered-sprite');
const { finaleVisible, captureFinale } = require('./finale-visuals');
const { finaleBattleReady, bossFlash, combinedStones } = require('./finale-battle');
const commonReactions = require('./reaction-common');
const environmentVisuals = require('./environment-visuals');
const questionVisuals = require('./question-visuals');
const { idleBeats } = require('./idle-narration');

const beats = Object.create(null);
const clipIds = Object.keys(cues);
for (const id of clipIds) {
    for (const [map, event, page, index, actor, switchId, visual] of cues[id].beats) {
        beats[map] ??= Object.create(null);
        beats[map][event] ??= Object.create(null);
        // Separate pages can reuse a command index for different reactions.
        (beats[map][event][index] ??= []).push({ id, page, actor, switchId: switchId ?? undefined, visual,
            balloonAnchor: cues[id].balloonAnchors?.some(key => key.join('/') === [map,event,page,index].join('/')),
            waitFrames: Number.isInteger(cues[id].waitFrames) ? Math.min(240, Math.max(20,cues[id].waitFrames)) : undefined });
    }
}
//159 original recordings; measured pack 1,949,192 bytes.
const PACK_LIMIT = 1904 * 1024;
const QUEUE_LIMIT = 8;
const FRAME_LIMIT = 20;
const FLASH_LIMIT = 240;
const REWARD_LIMIT = 60;
const MIME = 'audio/webm; codecs="opus"';

function unpackClips(root, bytes) {
    if (!(bytes instanceof root.ArrayBuffer) || bytes.byteLength > PACK_LIMIT ||
        bytes.byteLength < 4 * clipIds.length) return null;
    const sizes = new root.DataView(bytes);
    let position = 4 * clipIds.length;
    const data = Object.create(null);
    for (const [index, id] of clipIds.entries()) {
        const length = sizes.getUint32(index * 4, true);
        if (length < 64 || position + length > bytes.byteLength) return null;
        data[id] = new root.Uint8Array(bytes, position, length);
        position += length;
    }
    return position === bytes.byteLength ? data : null;
}

function createNarration(root, host, preferences) {
    const glitches=createGlitchTracker(root);
    const skillActions=new WeakMap();
    let pack = null;
    let loading = null;
    let failed = false;
    let owner = null;
    let environment = null;
    let reactions = [];
    let seenBalloons = new WeakSet();
    let sequence = 0;
    let clip = null;
    let carried = [];

    function ready(scene, fading = false, continuation = false) {
        const { graphics, manager } = host;
        return !!(scene && (continuation && scene._wqaBattleStarted ||
            scene._wqaMapRestored && scene._mapLoaded && scene.srcWendy && scene.srcStones) &&
            scene._started && scene._active && (fading || scene._fadeDuration === 0 && scene._fadeOpacity === 0) &&
            !scene._wqaPreloads?.size && !scene._wqaPreloadOverflow && !scene._wqaTerrainWork &&
            !scene._wqaSettingsActive && !root.$gamePlayer?._transferring && (fading || root.$gameScreen?._brightness === 255) &&
            (fading || !host.screenFading()) && scene === manager._scene && graphics.app?.stage === scene &&
            !graphics._wqaResize && !manager._nextScene && !manager._exiting && !manager._wqaNativeAutosaves &&
            !!root.$gameMap && !root.$gameMap._needsTilemapRefresh && host.hasFocus());
    }

    function nvda(){return host.speechPreferences?.().descriptionVoice==='nvda';}
    function voiceReady(){return nvda()||!!pack;}

    function enabled() {
        const audio = preferences();
        return audio.narration?.enabled && (nvda()?host.speechPreferences().enabled:audio.enabled&&audio.narration.volume>0);
    }

    function warm(scene) {
        const prologue = [188, 115].includes(root.$gameMap?._mapId);
        const battle=scene?._wqaBattleStarted&&ready(scene,false,true);
        if (nvda() || !enabled() || pack || loading || failed || !ready(scene,false,battle) || !prologue && !battle &&
            (root.$gameMap._interpreter?._list || !scene._wqaFieldReady && !idleReady(scene))) return;
        // Chromium reads the fixed package path asynchronously in a settled
        // field frame. Native boundaries retire the request before loading.
        const xhr = new root.XMLHttpRequest();
        loading = { scene, xhr };
        scene._wqaNarrationLoading = true;
        xhr.open('GET', 'wendyquest-access/narration.webmpack', true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 4000;
        xhr.onprogress = event => {
            if (loading?.xhr === xhr && event.loaded > PACK_LIMIT) {
                failed = host.graphics._wqaNarrationPackFinished = true;
                leave(scene);
            }
        };
        xhr.onloadend = () => {
            if (loading?.xhr !== xhr) return;
            loading = null;
            scene._wqaNarrationLoading = false;
            if (!ready(scene)) return;
            try {
                if (xhr.status === 0 || xhr.status === 200) pack = unpackClips(root, xhr.response);
            } finally {
                failed = !pack;
                host.graphics._wqaNarrationPackFinished = true;
            }
        };
        xhr.send();
    }

    function stopClip() {
        if (!clip) return;
        const { audio, url } = clip;
        clip = null;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        root.URL.revokeObjectURL(url);
    }

    function leave(scene, keepEnvironment = false, keepReactions = false, keepPlayback = false) {
        if (!keepPlayback) {
            carried = [];host.graphics._wqaNarrationContinuation = false;
            if (!owner || !scene || clip?.scene === scene) stopClip();
        }
        if (keepReactions && owner && (!scene || owner.scene === scene)) {
            for (const state of owner.queue) {
                if (!(state.visual > 0) || state.confirmed || reactions.some(receipt => receipt.order === state.order)) continue;
                if (reactions.length >= QUEUE_LIMIT) break;
                if (state.balloon) seenBalloons.delete(state.balloon);
                reactions.push({ ...state, frame: state.requestedFrame });
                state.scene._wqaReactionReceipts = true;
            }
        }
        if (!keepReactions) {
            for (const receipt of reactions) receipt.scene._wqaReactionReceipts = false;
            reactions = [];seenBalloons = new WeakSet();
        }
        if (!keepEnvironment && environment && (!scene || environment.scene === scene)) {
            environment.scene._wqaEnvironmentPending = false;
            environment = null;
        }
        if (loading && (!scene || loading.scene === scene)) {
            const { scene: field, xhr } = loading;
            loading = null;
            field._wqaNarrationLoading = false;
            xhr.abort();
        }
        if (!owner || scene && owner.scene !== scene) return;
        owner.scene._wqaNarrationActive = false;
        owner = null;
        if (!keepPlayback) stopClip();
    }

    function pendingCount() { return reactions.length + carried.length + (owner?.queue.length || 0); }

    // A confirmed description is already visible information. Keep only its
    // caption ID after its source scene retires; actor/interpreter pointers and
    // unconfirmed effects never travel to another map. A paused Audio retains
    // its actual playhead, so readiness resumes the word rather than restarting.
    function pause(scene, playing = false, keepReactions = false) {
        const speechPending=host.pauseNarrationSpeech?.();
        if (owner && (!scene || owner.scene === scene)) {
            for (const state of owner.queue) {
                if (state.confirmed && carried.length < QUEUE_LIMIT) carried.push(state.id);
            }
        }
        leave(scene, false, keepReactions, true);
        if (clip && !playing) { clip.audio.pause();clip.suspended = true; }
        host.graphics._wqaNarrationContinuation = !!clip || carried.length > 0 || speechPending;
    }

    function resume(scene) {
        if (!host.graphics._wqaNarrationContinuation) return true;
        if (!enabled() || !host.hasFocus() || host.manager._exiting) { leave();return false; }
        if (!ready(scene, false, true)) {
            // A pure visual fade may finish an already playing voice. Actual
            // map/resource/scene work pauses it before entry and never waits.
            if (!ready(scene, true, true) && clip && !clip.suspended) {
                clip.audio.pause();clip.suspended = true;
            }
            return false;
        }
        if (clip?.finishedPending) stopClip();
        host.resumeNarrationSpeech?.(()=>ready(scene,false,true));
        const context = owner ?? begin(scene);
        context.carried = context.hasReactions = true;
        context.queue.unshift(...carried.map(id => ({ id, confirmed: true })));
        carried = [];
        if (clip) {
            clip.scene = scene;
            if (clip.suspended) { clip.suspended = false;clip.audio.play()?.catch(clip.finished); }
        }
        host.graphics._wqaNarrationContinuation = false;
        return true;
    }

    function accepted(scene, interpreter, actor, switched, visual, commandIndex = interpreter._index, recovery = false) {
        if (!voiceReady() || !enabled() || !ready(scene)) return;
        const map = root.$gameMap;
        // Recover a preceding Tyler entrance before its first greeting
        // reaction; the native route may have run behind a resource gate.
        if (visual > 0) tylerEntry(scene);
        const common = commonReactions.resolve(root, interpreter, visual);
        if (common) { interpreter = common.parent; commandIndex = common.index; }
        const candidates = beats[interpreter._mapId]?.[interpreter._eventId]?.[commandIndex];
        const candidate = common?.cue || candidates?.find(beat =>
            root.$dataMap?.events?.[interpreter._eventId]?.pages[beat.page]?.list === interpreter._list);
        if (!candidate) return;
        const page = root.$dataMap?.events?.[interpreter._eventId]?.pages[candidate.page];
        if ((interpreter !== map._interpreter && map._events?.[interpreter._eventId]?._interpreter !== interpreter) || interpreter._mapId !== map._mapId ||
            page?.list !== interpreter._list || candidate.switchId !== switched || !switched && candidate.visual !== visual) return;
        const source = candidate.actor === -1 ? root.$gamePlayer : map._events[candidate.actor];
        if (!source || source._erased || (switched ? !root.$gameSwitches.value(switched) : actor !== source)) return;
        actor = source;
        visual = candidate.visual;
        const sourceKey = [map._mapId,interpreter._eventId,candidate.page,commandIndex].join('/');
        if(candidate.id==='tyler-arrives' && !recovery) {scene._wqaTylerEntrySeen=null;scene._wqaTylerEntryMap=null;}
        const prior = scene._wqaNarrationSeen;
        if (visual > 0) {
            if (prior?.list === interpreter._list && prior.index === commandIndex &&
                (reactions.length || owner?.scene === scene)) return;
            if (pendingCount() >= QUEUE_LIMIT) return;
            // Keep a bounded intent until the native balloon exists. The game
            // can terminate this script and load its next page in the same
            // frame before the first balloon is drawn. No game object is
            // modified or serialized, and no worker runs during that loading.
            scene._wqaNarrationSeen = { list: interpreter._list, index: commandIndex };
            reactions.push({ scene, mapId: map._mapId, actor, actorId: candidate.actor,
                visual, id: candidate.id, frame: host.graphics.frameCount,
                balloonAnchor: candidate.balloonAnchor, sourceKey, requestedFrame: host.graphics.frameCount, order: ++sequence });
            scene._wqaReactionReceipts = true;
            return true;
        }
        // Guard one command within its active narration context. A later
        // real activation of the same NPC/list can show the balloon again.
        if (owner?.scene === scene && owner.list === interpreter._list &&
            prior?.list === interpreter._list && prior.index === commandIndex) return;
        // Sample only the authored actor, and only once at the accepted
        // command. The frame callback verifies the same sprite and ownership.
        const sprites = scene._spriteset?._characterSprites;
        const sprite = Array.isArray(sprites) && sprites.length <= 512 &&
            sprites.find(item => item._character === actor);
        if (!sprite) return;
        // The common-event request precedes the native companion graphic
        // changes. Retain only followers actually visible before they vanish.
        const companions = visual === -5 ? sprites.filter(item =>
            item._character?._memberIndex > 0 && item._character._memberIndex <= 8 &&
            item._character._characterName && !item._character._transparent &&
            renderedSprite(item, scene._spriteset._tilemap) && item.worldTransform?.tx >= 0 &&
            item.worldTransform.tx <= host.graphics.width && item.worldTransform.ty >= 0 &&
            item.worldTransform.ty <= host.graphics.height + 16).slice(0, 8).map(item =>
                ({ sprite: item, actor: item._character })) : null;
        if (visual === -5 && !companions.length) return;
        if (owner && (owner.scene !== scene || owner.list !== interpreter._list)) {
            if (owner.scene === scene && owner.hasReactions) { owner.interpreter = interpreter;owner.list = interpreter._list; }
            else leave(owner.scene);
        }
        const context = owner ?? begin(scene, interpreter);
        if (interpreter !== map._interpreter) context.joltBase = interpreter;
        if (pendingCount() >= QUEUE_LIMIT) return;
        scene._wqaNarrationSeen = { list: interpreter._list, index: commandIndex };
        const order = ++sequence;
        // A native portrait preload can drop the unpainted jump while keeping
        // the later music receipt. Retain only this source ordinal so a fresh
        // rendered recovery stays before that receipt, never interrupts it.
        if (sourceKey === '181/15/2/0') scene._wqaTylerEntryOrder ||= order;
        context.queue.push({ frame: host.graphics.frameCount, sprite, actor, switched, visual, companions,
            order: sourceKey === '181/15/2/0' ? scene._wqaTylerEntryOrder : order,
            script: interpreter, scriptList: interpreter._list, sourceKey,
            balloonAnchor: candidate.balloonAnchor, waitFrames: candidate.waitFrames,
            screenX: scene._spriteset.x, screenY: scene._spriteset.y,
            x: actor._realX, y: actor._realY, mapY: map._displayY, mapX: map._displayX, direction: actor._direction, id: candidate.id,
            finale: visual === -6 ? captureFinale(root, scene, candidate.id) : null });
        return true;
    }

    function jolt(scene, interpreter) {
        if (!voiceReady() || !enabled() || !ready(scene)) return;
        // Only the currently executing map/common-event chain can own a jolt.
        // Parallel events qualify through their own native event interpreter.
        const map = root.$gameMap;
        let base = map._interpreter?._list ? map._interpreter :
            map._events?.[interpreter._eventId]?._interpreter;
        let current = base, depth = 0;
        while (current && current !== interpreter && depth++ < 8) current = current._childInterpreter;
        if (current !== interpreter) {
            base = map._events?.[interpreter._eventId]?._interpreter;
            current = base;depth = 0;
            while (current && current !== interpreter && depth++ < 8) current = current._childInterpreter;
        }
        if (current !== interpreter || !base?._list) return;
        const row = interpreter._list?.[interpreter._index];
        const impulse = row?.code === 357 && row.parameters?.[0] === 'ShakeScreen' && row.parameters[1] === 'CreateImpulse';
        const effect = row?.parameters?.[3];
        if (!impulse || Number(effect?.Power) !== 4 || Number(effect?.Duration) !== 1 ||
            ![50, 80].includes(Number(effect?.Frequency))) return;
        // Match the exact shout/reaction sound in the same authored beat.
        // Nine fixed command slots cover either sound-before or sound-after.
        const paired = interpreter._list.slice(Math.max(0, interpreter._index - 4), interpreter._index + 5)
            .some(command => command.code === 250 && command.parameters?.[0]?.name === 'WQ/Emote/SFX_ScreenShake');
        if (!paired) return;
        // The named Elder Tater shout and finale destruction already own voices.
        if (interpreter._mapId === 13 && interpreter._eventId === 5 && interpreter._index === 63) return;
        if (owner && (owner.scene !== scene || owner.list !== base._list)) {
            if (owner.scene === scene && owner.hasReactions) { owner.interpreter = base;owner.list = base._list; }
            else leave(owner.scene);
        }
        const context = owner ?? begin(scene, base);
        if (pendingCount() >= QUEUE_LIMIT) return;
        const prior = context.lastJolt;
        if (prior?.interpreter === interpreter && prior.list === interpreter._list && prior.index === interpreter._index) return;
        context.lastJolt = { interpreter, list: interpreter._list, index: interpreter._index };
        context.joltBase = base;
        context.queue.push({ id: 'screen-jolt', visual: -7, order: ++sequence,
            screenX: scene._spriteset.x, screenY: scene._spriteset.y, frame: host.graphics.frameCount });
    }

    function environmentStart(scene, interpreter) {
        if (!voiceReady() || !enabled() || !ready(scene)) return;
        const state = environmentVisuals.capture(root, scene, interpreter, host.graphics.frameCount);
        if (!state) return;
        if (environment?.list === state.list && environment.index === state.index) return;
        state.order = ++sequence;
        environment = state;
        scene._wqaEnvironmentPending = true;
    }

    function environmentPresent(scene) {
        const state = environment;
        if (!state || state.scene !== scene) return;
        if (!enabled() || state.interpreter !== root.$gameMap?._interpreter ||
            state.interpreter._list !== state.list || host.graphics.frameCount - state.frame > 600) {
            scene._wqaEnvironmentPending = false;environment = null;return;
        }
        // No processing during flood-fill/resource work. Resume at the same
        // native-ready site only after tile refresh and preload gates reopen.
        if (!ready(scene)) return;
        if (owner && (owner.scene !== scene || owner.list !== state.list)) {
            if (owner.scene === scene && owner.hasReactions) { owner.interpreter = state.interpreter;owner.list = state.list; }
            else leave(owner.scene, true);
        }
        const context = owner ?? begin(scene, state.interpreter);
        if (pendingCount() >= QUEUE_LIMIT) return;
        context.queue.push(state);environment = null;scene._wqaEnvironmentPending = false;
    }

    function skillAccepted(scene,actor,sprite,key) {
        if(!voiceReady() || !enabled() || !ready(scene,false,true) || pendingCount()>=QUEUE_LIMIT)return;
        // Never add a late charging caption ahead of the timed word overlay.
        // Its brisk recording fits the native1.2s gap at the slowest setting.
        if(key==='beef-charge' && (clip || pendingCount()))return;
        const state=skillVisual(root,host,scene,actor,sprite,key);
        if(!state)return;
        let seen=skillActions.get(state.action);
        if(seen?.has(key))return;
        if(owner && owner.scene!==scene)leave(owner.scene);
        const context=owner??begin(scene);
        context.skillEffect=context.hasReactions=true;
        if(!seen){seen=new Set();skillActions.set(state.action,seen);}
        seen.add(key);
        context.queue.push({...state,frame:host.graphics.frameCount,order:++sequence});
    }

    function glitchPresent(scene) {
        if(!voiceReady() || !enabled() || !ready(scene,false,true) || pendingCount()>=QUEUE_LIMIT)return;
        const state=glitches.capture(scene);
        if(!state)return;
        if(owner && owner.scene!==scene)leave(owner.scene);
        const context=owner??begin(scene);
        context.screenEffect=true;
        glitches.admit(state);
        context.queue.push({...state,frame:host.graphics.frameCount,order:++sequence});
    }

    function questionsPresent(scene) {
        if (!voiceReady() || !enabled() || !ready(scene)) return;
        // Preserve native request order when its receipt survived. A bounded
        // rendered-state pass then covers questions requested during loading
        // or tile work; no observation/playback runs inside those phases.
        harvestReactions(scene);
        const balloons = scene._spriteset?._balloonSprites;
        if (Array.isArray(balloons) && balloons.length <= 32) for (const balloon of balloons) {
            if (seenBalloons.has(balloon)) continue;
            const state = questionVisuals.question(root, scene, balloon);
            if (!state || !visibleActorCue(scene, state)) continue;
            // Idle owns Wendy's timed question and its wake cancellation.
            if (state.actorId === -1 && idleReady(scene)) { seenBalloons.add(balloon); continue; }
            if (owner && owner.scene !== scene) leave(owner.scene);
            const context = owner ?? begin(scene);
            if (pendingCount() >= QUEUE_LIMIT) break;
            context.hasReactions = true;seenBalloons.add(balloon);
            context.queue.push({ ...state, frame: host.graphics.frameCount, order: ++sequence });
        }
        if (scene._wqaAssistanceReveal || owner?.queue.some(state => state.id === 'assistance-chest')) return;
        const state = questionVisuals.assistance(root, scene);
        if (!state) return;
        if (owner && owner.scene !== scene) leave(owner.scene);
        const context = owner ?? begin(scene);
        if (pendingCount() >= QUEUE_LIMIT) return;
        context.hasReactions = true;
        context.queue.push({ ...state, frame: host.graphics.frameCount, order: ++sequence });
    }

    function mechEntry(scene) {
        const map = root.$gameMap, interpreter = map?._interpreter;
        if (!voiceReady() || !enabled() || !ready(scene) || map?._mapId !== 16 ||
            interpreter?._eventId !== 39 || interpreter._index < 7 || interpreter._index > 22 ||
            interpreter._list !== root.$dataMap?.events?.[39]?.pages?.[0]?.list) return;
        // Native setup preloads the first Mech Double portrait before running
        // its opening commands. Those commands may execute while the bitmap
        // gate is closed. Catch only this exact still-running entrance on its
        // first safe frame; actual balloon/sprite paint must still confirm it.
        const pending = key => reactions.some(state => state.sourceKey === key) ||
            owner?.scene === scene && owner.queue.some(state => state.sourceKey === key);
        const mask = scene._wqaMechDoubleNarrationMask || 0;
        if (!(mask & 1) && !pending('16/39/0/0')) accepted(scene,interpreter,root.$gamePlayer,undefined,1,0);
        if (!(mask & 2) && !pending('16/39/0/6')) accepted(scene,interpreter,map._events[39],undefined,undefined,6);
    }

    function tylerEntry(scene) {
        if (!voiceReady() || !enabled() || !ready(scene)) return;
        const entry=currentTylerEntry(root);
        if(!entry || scene._wqaTylerEntrySeen===entry.key)return;
        const actor=root.$gameMap._events[entry.actor], spawn=root.$dataMap.events[entry.actor];
        if(!actor || !(actor._jumpCount>0) && !(actor._x===spawn.x+entry.dx && actor._y===spawn.y+entry.dy))return;
        if(owner?.scene===scene && owner.queue.some(state=>state.sourceKey===entry.key))return;
        accepted(scene,entry.script,actor,undefined,-6,entry.index,true);
    }

    function prologue(scene) {
        const map = root.$gameMap, interpreter = map?._interpreter;
        // Map13's fade-in is already running when command232 accepts the
        // moving black pictures. Observe only its later, native-ready wait;
        // never mutate interpreter progress or start work during map entry.
        if (scene?._wqaArrivalObserved || map?._mapId !== 13 || interpreter?._eventId !== 5 ||
            interpreter._index !== 38 || !(interpreter._waitCount > 0) ||
            interpreter._list !== root.$dataMap?.events?.[5]?.pages?.[0]?.list || !ready(scene)) return;
        if (accepted(scene, interpreter, map._events[17], undefined, -6, 37)) scene._wqaArrivalObserved = true;
    }

    function begin(scene, interpreter = null) {
        scene._wqaNarrationActive = true;
        owner = { scene, interpreter, list: interpreter?._list, mapId: root.$gameMap?._mapId, queue: [], paintPending: false };
        return owner;
    }

    function entry(scene, interpreter, list, eventId) {
        // This exact beach page is a repeating wait-only continuation, not a
        // fresh cutscene/resource phase. Its native loadImages sees no image
        // commands. Retire on first entry; later ready iterations must not
        // stop an already rendered reaction every frame.
        const sameWait = Array.isArray(list) && root.$gameMap?._mapId === 13 && eventId === 5 &&
            interpreter === root.$gameMap._interpreter &&
            list === root.$dataMap?.events?.[5]?.pages?.[3]?.list;
        const repeat = sameWait && scene?._wqaNarrationWaitLoop === list;
        if (scene) scene._wqaNarrationWaitLoop = sameWait ? list : null;
        if (repeat && ready(scene)) return;
        // Native event setup still closes all playback and async work before
        // loading images. Only the inert, bounded balloon intents survive this
        // same-map handoff; transfers/fades/focus loss clear them normally.
        pause(scene, false, true);
        if (scene) scene._wqaNarrationSeen = null;
    }

    function harvestReactions(scene) {
        if (!reactions.length || !ready(scene) || !enabled()) return;
        const map = root.$gameMap, balloons = scene._spriteset?._balloonSprites;
        if (!Array.isArray(balloons) || balloons.length > 32) return;
        reactions = reactions.filter(receipt => {
            if (receipt.scene !== scene || receipt.mapId !== map._mapId ||
                host.graphics.frameCount - receipt.frame > 240 ||
                (receipt.actorId === -1 ? root.$gamePlayer : map._events[receipt.actorId]) !== receipt.actor) return false;
            const balloon = balloons.find(balloon => !seenBalloons.has(balloon) &&
                balloon.targetObject === receipt.actor && balloon._balloonId === receipt.visual);
            if (!balloon) return true;
            if (owner && owner.scene !== scene) leave(owner.scene, false, true);
            const context = owner ?? begin(scene);
            if (context.queue.length + carried.length >= QUEUE_LIMIT) return true;
            context.hasReactions = true;seenBalloons.add(balloon);
            context.queue.push({ ...receipt, sprite: balloon._target, balloon, frame: host.graphics.frameCount });
            context.queue.sort((a,b) => (a.order || 0) - (b.order || 0));
            return false;
        });
        scene._wqaReactionReceipts = reactions.length > 0;
    }

    function idleReady(scene) {
        const { $gameMap: map, $gamePlayer: player } = root;
        return ready(scene) && enabled() && !map._interpreter?._list && !map.isEventRunning?.() &&
            (!map._needsRefresh || scene._wqaNonPageRefreshOnly) &&
            !root.$gameMessage?.isBusy() && !player?.isInVehicle?.() &&
            !player?._moveRouteForcing && map.inactiveTime >= 30;
    }

    function idle(scene) {
        if (owner && (owner.scene !== scene || owner.interpreter) || !idleReady(scene)) return;
        // Standing idle closes walking controls. A first settled idle
        // sample can still load the pack when normal field warmup missed it.
        if (!voiceReady()) return warm(scene);
        const map = root.$gameMap;
        let context = owner;
        for (const [index, beat] of idleBeats.entries()) {
            const bit = 1 << index;
            if ((scene._wqaIdleNarrationMask & bit) || map.inactiveTime < beat.start ||
                map.inactiveTime >= beat.end || !beat.visible(scene, map, root.$gamePlayer) ||
                context?.queue.some(state => state.bit === bit)) continue;
            context ??= begin(scene);
            if (pendingCount() >= QUEUE_LIMIT) break;
            context.queue.push({ id: beat.id, bit, idle: beat, frame: host.graphics.frameCount });
        }
    }

    function playNext(context) {
        if (clip || !context.queue[0]?.confirmed) return;
        const { id } = context.queue.shift();
        try {
            if(nvda()){host.describeNarration?.(cues[id].text,()=>ready(context.scene,false,true));return;}
            const setting = preferences().narration;
            const audio = new root.Audio();
            if (!audio.canPlayType(MIME)) return leave(context.scene);
            const url = root.URL.createObjectURL(new root.Blob([pack[id]], { type: 'audio/webm' }));
            clip = { audio, url, scene: context.scene };
            // Native frame presentation starts the next confirmed clip. An
            // ended/error handler only releases its own playback resources.
            const finished = () => {
                if (clip?.audio !== audio) return;
                // A late decoder/end task can arrive after the native pause.
                // Defer media cleanup until readiness rather than doing work
                // inside the protected resource phase.
                if (clip.suspended) clip.finishedPending = true;
                else stopClip();
            };
            clip.finished = finished;
            audio.addEventListener('ended', finished, { once: true });
            audio.addEventListener('error', finished, { once: true });
            audio.volume = setting.volume / 100;
            if ('preservesPitch' in audio) audio.preservesPitch = true;
            audio.defaultPlaybackRate = audio.playbackRate = setting.playbackPercent / 100;
            audio.src = url;
            audio.play()?.catch(finished);
        } catch { leave(context.scene); }
    }

    // The native crystal's own phase-zero update supplies its branch. Only
    // its rendered sprite is eligible; a full meter alone is not an event.
    function momentumAccepted(scene,sprite) {
        if(!enabled()||!ready(scene,false,true)||!scene._wqaBattleStarted||sprite.phase!==0||
            typeof sprite._full!=='boolean'||pendingCount()>=QUEUE_LIMIT)return false;
        if(!voiceReady()){warm(scene);return false;}
        const field=scene._spriteset?._battleField;
        if(sprite.parent!==field||sprite._frame?.y!==32||!sprite.bitmap?.isReady?.())return false;
        if(owner?.scene!==scene)leave();
        const context=owner??begin(scene);
        context.momentum=context.hasReactions=true;
        context.queue.push({id:sprite._full?'momentum-full':'momentum-collected',visual:-6,frame:host.graphics.frameCount,
            battleVisible:()=>sprite.phase===0&&renderedSprite(sprite,field)&&
                sprite.worldTransform?.tx>=0&&sprite.worldTransform.tx<host.graphics.width&&
                sprite.worldTransform?.ty>=0&&sprite.worldTransform.ty<host.graphics.height});
        return true;
    }

    function battleAccepted(scene, interpreter, actor, sprite, stones) {
        if (!voiceReady() || !enabled() || !finaleBattleReady(root, host, scene)) return;
        const beat = actor ? combinedStones(root, scene, actor, sprite, stones) : bossFlash(root, scene, interpreter);
        if (!beat) return;
        interpreter = root.$gameTroop._interpreter;
        if (owner && (owner.scene !== scene || owner.list !== interpreter._list)) {
            if (owner.scene === scene && owner.hasReactions) { owner.interpreter = interpreter;owner.list = interpreter._list; }
            else leave(owner.scene);
        }
        const context = owner ?? begin(scene, interpreter);
        context.battle = true;
        if (pendingCount() >= QUEUE_LIMIT) return;
        const token = actor ? sprite : interpreter._index;
        if (context.lastBattleToken === token) return;
        context.lastBattleToken = token;
        context.queue.push({ id: beat.id, battleVisible: beat.visible, frame: host.graphics.frameCount, visual: -6 });
    }

    function mayPresent(context) {
        const { scene, interpreter, list } = context;
        if(context.skillEffect)return enabled()&&ready(scene,false,true);
        if(context.screenEffect)return enabled()&&ready(scene,false,true)&&context.mapId===root.$gameMap?._mapId;
        if(context.momentum)return enabled()&&ready(scene,false,true);
        if (context.carried) return ready(scene, false, true) && enabled();
        if (context.hasReactions) return ready(scene) && enabled() && context.mapId === root.$gameMap?._mapId;
        if (context.battle) return enabled() && finaleBattleReady(root, host, scene) &&
            interpreter === root.$gameTroop._interpreter && interpreter._list === list;
        return interpreter ? ready(scene) && enabled() &&
            (interpreter === root.$gameMap._interpreter || context.joltBase === interpreter &&
                root.$gameMap._events?.[interpreter._eventId]?._interpreter === interpreter) &&
            interpreter._list === list : idleReady(scene);
    }

    function visibleRewardGlow(scene) {
        const names = ['_pictureContainer_upper', '_pictureContainer_mid', '_pictureContainer_lower'];
        const name = 'img/ParticleEffects/LockedChestGlow.json';
        let count = 0;
        for (const key of names) {
            const parent = scene._spriteset?.[key];
            const children = parent?.children;
            if (!Array.isArray(children)) continue;
            if ((count += children.length) > 128) return false;
            for (const sprite of children) {
                const id = sprite._pictureId;
                const picture = Number.isInteger(id) && id >= 1 && id <= 11 && root.$gameScreen._pictures?.[id];
                const pose = sprite.worldTransform;
                if (picture?._animated && picture._name === name && picture._opacity > 0 &&
                    sprite._pictureName === name && sprite._frameAnimator && renderedSprite(sprite, parent) &&
                    pose && pose.tx >= 0 && pose.tx <= host.graphics.width && pose.ty >= 0 && pose.ty <= host.graphics.height)
                    return true;
            }
        }
        return false;
    }

    function visibleActorCue(scene, state) {
        if(state.visual===-9)return glitches.visible(scene,state.filter);
        if (state.visual === -8) return environmentVisuals.visible(root, scene, state);
        if (state.visual === -7) return scene._spriteset._tilemap?.worldVisible === true &&
            (scene._spriteset.x !== state.screenX || scene._spriteset.y !== state.screenY);
        if (state.visual === -6) return finaleVisible(root, host, scene, state);
        // The finale paints a white full-screen picture over this change.
        if (state.id === 'chomps-sacrifice' && root.$gameScreen?._pictures?.[29]?._opacity > 20) return false;
        const { actor, sprite, switched, visual } = state;
        const spriteset = scene._spriteset;
        const parent = spriteset?._tilemap;
        if (!parent || actor._erased || actor._transparent || sprite.parent !== parent ||
            sprite._characterName !== actor._characterName) return false;
        if (visual === -3) return parent.worldVisible === true && parent.worldAlpha > 0 &&
            root.$gameMap._scrollDirection === 8 && root.$gameMap._scrollRest > 0 &&
            root.$gameMap._displayY < state.mapY;
        if (visual === -4) return visibleRewardGlow(scene);
        if (visual === -5) return state.companions?.length > 0 && state.companions.every(item =>
            item.sprite._character === item.actor && item.sprite.parent === parent &&
            item.actor._characterName === '' && item.sprite._characterName === '');
        // Dave's authored light bulbs and music use blank map anchors.
        // For those cataloged cues
        // the actual rendered balloon owns visibility, including its pose.
        const blankAnchor = (visual === 9 || visual === 3 || state.balloonAnchor) && actor._characterName === '' && !actor._tileId;
        const onScreen = (pose, allowance = 0) => pose && pose.tx >= 0 && pose.tx <= host.graphics.width &&
            pose.ty >= 0 && pose.ty <= host.graphics.height + allowance;
        if (!blankAnchor && (!actor._characterName || !renderedSprite(sprite, parent) ||
            !onScreen(sprite.worldTransform, 16))) return false;
        if (visual > 0) {
            const balloons = spriteset._balloonSprites;
            return Array.isArray(balloons) && balloons.length <= 32 && balloons.some(balloon =>
                (!state.balloon || balloon === state.balloon) && balloon.targetObject === actor && balloon._target === sprite && balloon._balloonId === visual &&
                balloon._duration > 0 && renderedSprite(balloon, spriteset._effectsContainer) &&
                (!blankAnchor || onScreen(balloon.worldTransform)));
        }
        if (visual === -12) {
            const white = root.$gameScreen._pictures?.[44];
            return actor._pageIndex === 1 && actor._characterName === 'TREASURE CHEST SPECIAL' &&
                root.$gameSwitches.value(544) && (!white || white._name === 'white' && white._opacity < 200);
        }
        if (visual === -1) return root.$gameScreen._flashColor?.[3] > 0;
        if (visual !== undefined) return true;
        if (switched) return root.$gameSwitches.value(switched);
        return actor._realX !== state.x || actor._realY !== state.y || actor._jumpCount > 0;
    }

    function present(scene) {
        if (!resume(scene)) return;
        harvestReactions(scene);
        environmentPresent(scene);
        const context = owner;
        if (!context || context.scene !== scene) return;
        if (!mayPresent(context)) return !context.interpreter && !context.hasReactions && !context.carried
            ? leave(scene) : pause(scene, ready(scene, true, true) && !ready(scene, false, true), true);
        if (context.paintPending || (clip && context.queue.every(state => state.confirmed))) return;
        const frame = host.graphics.frameCount;
        // Keep already rendered descriptions even after the effect disappears.
        // Only unpainted effects expire on the short native presentation budget.
        context.queue = context.queue.filter(state => state.confirmed ||
            (!state.script || state.script._list === state.scriptList) && frame - state.frame <= (state.waitFrames || (state.id === 'chomps-sacrifice' || (state.visual === -6 || state.visual === -8) ? FLASH_LIMIT : state.visual === -4 ? REWARD_LIMIT : FRAME_LIMIT)));
        if (!clip && !context.queue.length) return leave(scene, true, true);
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        context.paintPending = true;
        renderer.once('postrender', () => {
            if (owner !== context) return;
            context.paintPending = false;
            if (!mayPresent(context)) return !context.interpreter && !context.hasReactions && !context.carried
            ? leave(scene) : pause(scene, ready(scene, true, true) && !ready(scene, false, true), true);
            if (host.graphics.frameCount - frame > FRAME_LIMIT) return;
            for (const state of context.queue) {
                if (state.confirmed) continue;
                const map = root.$gameMap;
                state.confirmed = state.battleVisible ? state.battleVisible() : state.idle ? map.inactiveTime < state.idle.end &&
                    state.idle.visible(scene, map, root.$gamePlayer) : visibleActorCue(scene, state);
                if(state.confirmed && state.visual===-9)glitches.confirm(state);
                if (state.confirmed && state.bit) scene._wqaIdleNarrationMask |= state.bit;
                if(state.confirmed && state.id==='tyler-arrives') {
                    scene._wqaTylerEntrySeen=state.sourceKey;scene._wqaTylerEntryMap=map._mapId;
                    if(state.sourceKey==='181/15/2/0')scene._wqaTylerEntryObserved=true;
                }
                if (state.confirmed && state.id === 'assistance-chest') scene._wqaAssistanceReveal = true;
                if (state.confirmed && map?._mapId === 16) {
                    if (state.sourceKey === '16/39/0/0') scene._wqaMechDoubleNarrationMask = (scene._wqaMechDoubleNarrationMask || 0) | 1;
                    if (state.id === 'mechs-descend') scene._wqaMechDoubleNarrationMask = (scene._wqaMechDoubleNarrationMask || 0) | 2;
                }
            }
            playNext(context);
        });
    }

    return { cancel(scene){host.cancelNarrationSpeech?.();leave(scene);}, skillAccepted, accepted, entry, pause, jolt, environmentStart, glitchPresent, questionsPresent, mechEntry, tylerEntry, battleAccepted, momentumAccepted, prologue, idle, present, warm, leave, get needsPack() { return !nvda() && !pack && !loading && !failed; } };
}

module.exports = { createNarration, unpackClips };
