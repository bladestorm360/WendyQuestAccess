'use strict';

const cues = require('./narration-cues.json');
const { renderedSprite } = require('../runtime/rendered-sprite');
const { idleBeats } = require('./idle-narration');

const beats = Object.create(null);
const clipIds = Object.keys(cues);
for (const id of clipIds) {
    for (const [map, event, page, index, actor, switchId, visual] of cues[id].beats) {
        beats[map] ??= Object.create(null);
        beats[map][event] ??= Object.create(null);
        // Separate pages can reuse a command index for different reactions.
        (beats[map][event][index] ??= []).push({ id, page, actor, switchId: switchId ?? undefined, visual });
    }
}
const PACK_LIMIT = 1024 * 1024;
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
    let pack = null;
    let loading = null;
    let failed = false;
    let owner = null;
    let clip = null;

    function ready(scene) {
        const { graphics, manager } = host;
        return !!(scene?._wqaMapRestored && scene._mapLoaded && scene._started && scene._active &&
            scene.srcWendy && scene.srcStones && scene._fadeDuration === 0 && scene._fadeOpacity === 0 &&
            !scene._wqaPreloads?.size && !scene._wqaPreloadOverflow && !scene._wqaTerrainWork &&
            !scene._wqaSettingsActive && !root.$gamePlayer?._transferring && root.$gameScreen?._brightness === 255 &&
            !host.screenFading() && scene === manager._scene && graphics.app?.stage === scene &&
            !graphics._wqaResize && !manager._nextScene && !manager._exiting && !manager._wqaNativeAutosaves &&
            !!root.$gameMap && !root.$gameMap._needsTilemapRefresh && host.hasFocus());
    }

    function enabled() {
        const audio = preferences();
        return audio.enabled && audio.narration?.enabled && audio.narration.volume > 0;
    }

    function warm(scene) {
        if (!enabled() || pack || loading || failed || !ready(scene) || root.$gameMap._interpreter?._list ||
            (!scene._wqaFieldReady && !idleReady(scene))) return;
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

    function leave(scene) {
        if (loading && (!scene || loading.scene === scene)) {
            const { scene: field, xhr } = loading;
            loading = null;
            field._wqaNarrationLoading = false;
            xhr.abort();
        }
        if (!owner || scene && owner.scene !== scene) return;
        owner.scene._wqaNarrationActive = false;
        owner = null;
        stopClip();
    }

    function accepted(scene, interpreter, actor, switched, visual) {
        if (!pack || !enabled() || !ready(scene)) return;
        const map = root.$gameMap;
        const candidates = beats[interpreter._mapId]?.[interpreter._eventId]?.[interpreter._index];
        const candidate = candidates?.find(beat =>
            root.$dataMap?.events?.[interpreter._eventId]?.pages[beat.page]?.list === interpreter._list);
        if (!candidate) return;
        const page = root.$dataMap?.events?.[interpreter._eventId]?.pages[candidate.page];
        if (interpreter !== map._interpreter || interpreter._mapId !== map._mapId ||
            page?.list !== interpreter._list || candidate.switchId !== switched || candidate.visual !== visual) return;
        const source = candidate.actor === -1 ? root.$gamePlayer : map._events[candidate.actor];
        if (!source || source._erased || (switched ? !root.$gameSwitches.value(switched) : actor !== source)) return;
        actor = source;
        const prior = scene._wqaNarrationSeen;
        // Guard one command within its active narration context. A later
        // real activation of the same NPC/list can show the balloon again.
        if (owner?.scene === scene && owner.list === interpreter._list &&
            prior?.list === interpreter._list && prior.index === interpreter._index) return;
        // Sample only the authored actor, and only once at the accepted
        // command. The frame callback verifies the same sprite and ownership.
        const sprites = scene._spriteset?._characterSprites;
        const sprite = Array.isArray(sprites) && sprites.length <= 512 &&
            sprites.find(item => item._character === actor);
        if (!sprite) return;
        if (owner && (owner.scene !== scene || owner.list !== interpreter._list)) leave(owner.scene);
        const context = owner ?? begin(scene, interpreter);
        if (context.queue.length >= QUEUE_LIMIT) return;
        scene._wqaNarrationSeen = { list: interpreter._list, index: interpreter._index };
        context.queue.push({ frame: host.graphics.frameCount, sprite, actor, switched, visual,
            x: actor._realX, y: actor._realY, mapY: map._displayY, id: candidate.id });
    }

    function begin(scene, interpreter = null) {
        scene._wqaNarrationActive = true;
        owner = { scene, interpreter, list: interpreter?._list, queue: [], paintPending: false };
        return owner;
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
        if (!pack) return warm(scene);
        const map = root.$gameMap;
        let context = owner;
        for (const [index, beat] of idleBeats.entries()) {
            const bit = 1 << index;
            if ((scene._wqaIdleNarrationMask & bit) || map.inactiveTime < beat.start ||
                map.inactiveTime >= beat.end || !beat.visible(scene, map, root.$gamePlayer) ||
                context?.queue.some(state => state.bit === bit)) continue;
            context ??= begin(scene);
            if (context.queue.length >= QUEUE_LIMIT) break;
            context.queue.push({ id: beat.id, bit, idle: beat, frame: host.graphics.frameCount });
        }
    }

    function playNext(context) {
        if (clip || !context.queue[0]?.confirmed) return;
        const { id } = context.queue.shift();
        try {
            const setting = preferences().narration;
            const audio = new root.Audio();
            if (!audio.canPlayType(MIME)) return leave(context.scene);
            const url = root.URL.createObjectURL(new root.Blob([pack[id]], { type: 'audio/webm' }));
            clip = { audio, url };
            // Native frame presentation starts the next confirmed clip. An
            // ended/error handler only releases its own playback resources.
            const finished = () => { if (clip?.audio === audio) stopClip(); };
            audio.addEventListener('ended', finished, { once: true });
            audio.addEventListener('error', finished, { once: true });
            audio.volume = setting.volume / 100;
            if ('preservesPitch' in audio) audio.preservesPitch = true;
            audio.defaultPlaybackRate = audio.playbackRate = setting.playbackPercent / 100;
            audio.src = url;
            audio.play()?.catch(finished);
        } catch { leave(context.scene); }
    }

    function mayPresent(context) {
        const { scene, interpreter, list } = context;
        return interpreter ? ready(scene) && enabled() &&
            interpreter === root.$gameMap._interpreter && interpreter._list === list : idleReady(scene);
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
        // Dave's authored light bulbs and music use blank map anchors.
        // For those cataloged cues
        // the actual rendered balloon owns visibility, including its pose.
        const blankAnchor = (visual === 9 || visual === 3) && actor._characterName === '' && !actor._tileId;
        const onScreen = (pose, allowance = 0) => pose && pose.tx >= 0 && pose.tx <= host.graphics.width &&
            pose.ty >= 0 && pose.ty <= host.graphics.height + allowance;
        if (!blankAnchor && (!actor._characterName || !renderedSprite(sprite, parent) ||
            !onScreen(sprite.worldTransform, 16))) return false;
        if (visual > 0) {
            const balloons = spriteset._balloonSprites;
            return Array.isArray(balloons) && balloons.length <= 32 && balloons.some(balloon =>
                balloon.targetObject === actor && balloon._target === sprite && balloon._balloonId === visual &&
                balloon._duration > 0 && renderedSprite(balloon, spriteset._effectsContainer) &&
                (!blankAnchor || onScreen(balloon.worldTransform)));
        }
        if (visual === -1) return root.$gameScreen._flashColor?.[3] > 0;
        if (visual !== undefined) return true;
        if (switched) return root.$gameSwitches.value(switched);
        return actor._realX !== state.x || actor._realY !== state.y || actor._jumpCount > 0;
    }

    function present(scene) {
        const context = owner;
        if (!context || context.scene !== scene) return;
        if (!mayPresent(context)) return leave(scene);
        if (context.paintPending || (clip && context.queue.every(state => state.confirmed))) return;
        const frame = host.graphics.frameCount;
        // Keep already rendered descriptions even after the effect disappears.
        // Only unpainted effects expire on the short native presentation budget.
        context.queue = context.queue.filter(state => state.confirmed ||
            frame - state.frame <= (state.id === 'chomps-sacrifice' ? FLASH_LIMIT : state.visual === -4 ? REWARD_LIMIT : FRAME_LIMIT));
        if (!clip && !context.queue.length) return leave(scene);
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        context.paintPending = true;
        renderer.once('postrender', () => {
            if (owner !== context) return;
            context.paintPending = false;
            if (!mayPresent(context)) return leave(scene);
            if (host.graphics.frameCount - frame > FRAME_LIMIT) return;
            for (const state of context.queue) {
                if (state.confirmed) continue;
                const map = root.$gameMap;
                state.confirmed = state.idle ? map.inactiveTime < state.idle.end &&
                    state.idle.visible(scene, map, root.$gamePlayer) : visibleActorCue(scene, state);
                if (state.confirmed && state.bit) scene._wqaIdleNarrationMask |= state.bit;
            }
            playNext(context);
        });
    }

    return { accepted, idle, present, warm, leave, get needsPack() { return !pack && !loading && !failed; } };
}

module.exports = { createNarration, unpackClips };
