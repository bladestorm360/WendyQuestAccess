'use strict';

const cues = require('./narration-cues.json');
const { renderedSprite } = require('../runtime/rendered-sprite');

const beats = Object.create(null);
const clipIds = Object.keys(cues);
for (const id of clipIds) {
    for (const [map, event, page, index, actor, switchId, visual] of cues[id].beats) {
        beats[map] ??= Object.create(null);
        beats[map][event] ??= Object.create(null);
        beats[map][event][index] = { id, page, actor, switchId: switchId ?? undefined, visual };
    }
}
const PACK_LIMIT = 384 * 1024;
const FRAME_LIMIT = 20;
const FLASH_LIMIT = 240;
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
        if (!enabled() || pack || loading || failed || !ready(scene) || !scene._wqaFieldReady ||
            root.$gameMap._interpreter?._list) return;
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
        const candidate = beats[interpreter._mapId]?.[interpreter._eventId]?.[interpreter._index];
        if (!candidate) return;
        const page = root.$dataMap?.events?.[interpreter._eventId]?.pages[candidate.page];
        if (interpreter !== map._interpreter || interpreter._mapId !== map._mapId ||
            page?.list !== interpreter._list || candidate.switchId !== switched || candidate.visual !== visual) return;
        const source = candidate.actor === -1 ? root.$gamePlayer : map._events[candidate.actor];
        if (!source || source._erased || (switched ? !root.$gameSwitches.value(switched) : actor !== source)) return;
        actor = source;
        const prior = scene._wqaNarrationSeen;
        if (prior?.list === interpreter._list && prior.index === interpreter._index) return;
        if (owner) leave(owner.scene);
        // Sample only the authored actor, and only once at the accepted
        // command. The frame callback verifies the same sprite and ownership.
        const sprites = scene._spriteset?._characterSprites;
        const sprite = Array.isArray(sprites) && sprites.length <= 512 &&
            sprites.find(item => item._character === actor);
        if (!sprite) return;
        scene._wqaNarrationActive = true;
        scene._wqaNarrationSeen = { list: interpreter._list, index: interpreter._index };
        owner = { scene, interpreter, list: interpreter._list, index: interpreter._index,
            frame: host.graphics.frameCount, sprite, actor, switched, visual, x: actor._realX, y: actor._realY, id: candidate.id };
    }

    function present(scene) {
        const state = owner;
        if (!state || state.scene !== scene) return;
        const limit = state.id === 'chomps-sacrifice' ? FLASH_LIMIT : FRAME_LIMIT;
        if (!ready(scene) || !enabled() || state.interpreter !== root.$gameMap._interpreter ||
            state.interpreter._list !== state.list || state.actor._erased ||
            !state.started && host.graphics.frameCount - state.frame > limit) return leave(scene);
        if (state.pending || state.started) return;
        // The finale paints a white full-screen picture over this change.
        // Wait until it clears so the narration follows the visible result.
        if (state.id === 'chomps-sacrifice' && root.$gameScreen?._pictures?.[29]?._opacity > 20) return;
        const { actor, sprite, switched, visual } = state;
        const spriteset = scene._spriteset;
        const parent = spriteset?._tilemap;
        let visibleEffect = () => true;
        if (visual > 0) {
            const balloons = spriteset?._balloonSprites;
            const balloon = Array.isArray(balloons) && balloons.length <= 32 &&
                balloons.find(item => item.targetObject === actor && item._target === sprite && item._balloonId === visual);
            visibleEffect = () => renderedSprite(balloon, spriteset._effectsContainer) && balloon._duration > 0;
        } else if (visual === -1) {
            visibleEffect = () => root.$gameScreen._flashColor?.[3] > 0;
        }
        const changed = visual !== undefined ? visibleEffect() : switched ? root.$gameSwitches.value(switched) :
            actor._realX !== state.x || actor._realY !== state.y || actor._jumpCount > 0;
        if (!parent || !changed || !actor._characterName || sprite._characterName !== actor._characterName ||
            actor._transparent || !renderedSprite(sprite, parent)) return;
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return leave(scene);
        state.pending = true;
        const frameBefore = host.graphics.frameCount;
        renderer.once('postrender', () => {
            if (owner !== state) return;
            if (host.graphics.frameCount - frameBefore > FRAME_LIMIT) return leave(scene);
            if (!ready(scene) || !enabled() || !renderedSprite(sprite, parent) || !visibleEffect()) return leave(scene);
            const pose = sprite.worldTransform;
            if (!pose || pose.tx < 0 || pose.tx > host.graphics.width || pose.ty < 0 ||
                pose.ty > host.graphics.height + 16) {
                state.pending = false;
                return;
            }
            state.started = true;
            try {
                const setting = preferences().narration;
                const audio = new root.Audio();
                if (!audio.canPlayType(MIME)) return leave(scene);
                const url = root.URL.createObjectURL(new root.Blob([pack[state.id]], { type: 'audio/webm' }));
                clip = { audio, url };
                audio.addEventListener('ended', () => { if (clip?.audio === audio) leave(scene); }, { once: true });
                audio.addEventListener('error', () => { if (clip?.audio === audio) leave(scene); }, { once: true });
                audio.volume = setting.volume / 100;
                if ('preservesPitch' in audio) audio.preservesPitch = true;
                audio.defaultPlaybackRate = audio.playbackRate = setting.playbackPercent / 100;
                audio.src = url;
                audio.play()?.catch(() => { if (clip?.audio === audio) leave(scene); });
            } catch { leave(scene); }
        });
    }

    return { accepted, present, warm, leave, get needsPack() { return !pack && !loading && !failed; } };
}

module.exports = { createNarration, unpackClips };
