'use strict';

const { drawnText, visibleSprite } = require('../battle/presentation');
const { moveReview } = require('../menus/review');

const SLOTS = Object.freeze([3, 4, 5, 6, 7, 25, 26, 30, 31, 32]);
const TITLES = Object.freeze({
    'pictures/Ending': 'In a very different location...',
    'pictures/TheEnd': 'The end',
    'Credits/029 MECHBORG abb153': "MechBorg sits in the ruined robot's cockpit, with small colored balls beside him."
});

function panelText(container, sprite, picture, graphics) {
    if (sprite?.parent !== container || !(sprite.worldAlpha >= 0.98) || !sprite.worldVisible ||
        sprite.renderable === false) return '';
    if (picture._text) {
        const text = sprite._textSprite;
        // Native Sprite_Text resolves the authored newline escapes before paint.
        if (text?._currentString !== picture._text.replaceAll('\\n', '\n')) return '';
        const pose = text.worldTransform;
        if (!pose || !(pose.tx > 0 && pose.tx < graphics.width && pose.ty > 0 && pose.ty < graphics.height)) return '';
        return drawnText(sprite, text, 384);
    }
    const title = TITLES[picture._name];
    const pose = sprite.worldTransform;
    // The pinned cards place their text in the center of a larger background.
    if (!title || sprite._pictureName !== picture._name || !visibleSprite(container, sprite) ||
        !sprite.texture?.valid || !pose || sprite.anchor?.x !== 0.5 || sprite.anchor?.y !== 0.5 || pose.b || pose.c ||
        !(pose.a > 0 && pose.d > 0) ||
        !(pose.tx > 40 && pose.ty > 12 && pose.tx < graphics.width - 40 && pose.ty < graphics.height - 12)) return '';
    return title;
}

function liveCard(screen, { id, picture, sprite }) {
    return screen?._pictures?.[id] === picture && picture._opacity >= 250 && !picture._duration &&
        sprite.parent && sprite.worldVisible && sprite.worldAlpha >= 0.98;
}

function createCredits(root, host, notifications, preferences) {
    let current = null;

    function ready(scene) {
        const map = root.$gameMap;
        const id = map?._mapId;
        return !!((id === 39 || id === 188 || id === 189 || id >= 210 && id <= 239) && map._interpreter?._list &&
            scene?._wqaMapRestored && scene._mapLoaded && scene._started && scene._active && scene === host.manager._scene &&
            host.graphics.app?.stage === scene && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize && !host.screenFading() &&
            !scene._wqaTerrainWork && !root.$gamePlayer?._transferring && !root.$gameMessage?.isBusy?.() &&
            scene._fadeDuration === 0 && scene._fadeOpacity === 0 && root.$gameScreen?._brightness === 255 && host.hasFocus());
    }

    function leave(scene) {
        if (!current || current.scene !== scene) return;
        const state = current;
        current = null;
        scene._wqaCreditsPending = scene._wqaCreditsActive = false;
        scene._wqaCreditsSeen = scene._wqaCreditsRetry = scene._wqaCreditCards = null;
        scene._wqaControllerReady = false;
        if (state.epoch) notifications.close(state.epoch);
    }

    function rows(state, mark = false) {
        const scene = state.scene;
        const screen = root.$gameScreen;
        const spriteset = scene._spriteset;
        const container = spriteset?._pictureContainer_upper;
        if (spriteset?.parent !== scene || container?.parent !== spriteset ||
            !Array.isArray(container.children) || container.children.length > 128 || !screen?._pictures) return [];
        const byId = new Map(container.children.map(sprite => [sprite._pictureId, sprite]));
        const presented = [];
        for (const id of SLOTS) {
            const picture = screen._pictures[id];
            if (!picture || picture._opacity < 250 || picture._duration > 0 || !picture._text && !TITLES[picture._name]) continue;
            if (mark && state.retry.get(picture) > host.graphics.frameCount) continue;
            const sprite = byId.get(id);
            const text = panelText(container, sprite, picture, host.graphics);
            if (text) presented.push({ id, picture, sprite, text });
            else if (mark && !state.seen.has(picture)) {
                // A slow texture remains eligible while the original card is
                // on screen. Poll at most once per four native frames.
                state.retry.set(picture, host.graphics.frameCount + 4);
            }
        }
        return presented;
    }

    function submit(state, record) {
        if (!state.epoch || !notifications.focus(state.epoch, record))
            state.epoch = notifications.open(record, () => owner(state.scene) === state);
    }

    function observe(scene) {
        const renderer = host.graphics.app?.renderer;
        if (!ready(scene) || scene._wqaCreditsPending || typeof renderer?.once !== 'function') return;
        if (current?.scene === scene && current.epoch && !owner(scene)) obscure(scene);
        if (current && current.scene !== scene) leave(current.scene);
        if (!current) {
            current = { kind: 'credits', scene, seen: new WeakSet(), retry: new WeakMap(), epoch: 0, lines: [], position: 0 };
            scene._wqaCreditsSeen = current.seen;
            scene._wqaCreditsRetry = current.retry;
        }
        const state = current;
        scene._wqaCreditsPending = scene._wqaCreditsActive = scene._wqaPresentation = true;
        renderer.once('postrender', () => {
            if (current !== state) return;
            scene._wqaCreditsPending = false;
            try {
                if (!ready(scene)) return leave(scene);
                const presented = rows(state, true);
                const fresh = presented.filter(entry => !state.seen.has(entry.picture));
                if (!fresh.length) return;
                scene._wqaCreditCards = presented;
                scene._wqaControllerReady = true;
                for (const entry of fresh) {
                    state.seen.add(entry.picture);
                    submit(state, { kind: 'dialoguePage', text: entry.text, append: !!state.epoch });
                }
            } catch { leave(scene); }
        });
    }

    function owner(scene) {
        if (!current || current.scene !== scene || !current.epoch || !ready(scene) ||
            !scene._wqaCreditCards?.some(card => liveCard(root.$gameScreen, card))) return null;
        return current;
    }

    function obscure(scene) {
        if (!current || current.scene !== scene || !current.epoch) return;
        notifications.close(current.epoch);
        current.epoch = current.position = 0;
        scene._wqaCreditCards = null;
        scene._wqaControllerReady = false;
    }

    function command(scene, action) {
        const state = owner(scene);
        if (!state) return false;
        const text = rows(state).filter(entry => state.seen.has(entry.picture)).map(entry => entry.text).join('\n');
        if (!text) return false;
        if (action === 'details') submit(state, { kind: 'dialoguePage', text });
        else if (action.startsWith('review')) {
            state.lines = text.split('\n').map(line => line.trim()).filter(Boolean);
            if (!state.lines.length) return false;
            state.position = Math.min(state.position, state.lines.length - 1);
            const record = moveReview(state, action);
            record.indexed = preferences().indexing;
            submit(state, record);
        } else return false;
        return true;
    }

    return { observe, obscure, leave, command,
        owner(scene) {
            const state = owner(scene);
            if (state) state.hasReview = true;
            return state;
        },
        announce(state, record) {
            if (owner(state.scene) === state) submit(state, record);
        }
    };
}

module.exports = { createCredits, creditSlots: SLOTS };
