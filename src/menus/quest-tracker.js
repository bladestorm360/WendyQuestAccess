'use strict';

const { captureQuestPaint, drawnQuestPage } = require('./quest-paint');
const { restoreQuestPaint } = require('./quest-restore');
const { reviewLines, moveReview } = require('./review');

const REVIEW = new Set(['reviewPrevious', 'reviewNext', 'reviewFirst', 'reviewLast']);

function createQuestTracker(root, host, fieldReady, notifications, preferences) {
    let current = null;
    let waiting = null;

    function safeMap(scene) {
        return scene && scene === host.manager._scene && host.graphics.app?.stage === scene &&
            scene._wqaMapRestored && scene._mapLoaded && scene._started && scene._active &&
            scene._fadeDuration === 0 && scene._fadeOpacity === 0 && !scene._wqaSettingsActive &&
            !host.manager._nextScene && !host.manager._exiting && !host.manager._wqaNativeAutosaves &&
            !host.graphics._wqaResize && !host.screenFading() && host.hasFocus() && !scene._wqaTerrainWork &&
            root.$gameScreen?._brightness === 255 && !root.$gamePlayer?._transferring &&
            !root.$gamePlayer?._vehicleGettingOn && !root.$gamePlayer?._vehicleGettingOff &&
            root.$gameMap?.inactiveTime < 30 &&
            // The native marker qualifies this weather-only write on the current map.
            (!root.$gameMap._needsRefresh || scene._wqaLightningRefreshOnly) &&
            !root.$gameMap._needsTilemapRefresh;
    }

    function liveWindow(scene, window) {
        return !!window && window === scene._questNavWindow && window.parent === scene._windowLayer &&
            window._init && window.visible && window.openness === 255 && window.contentsOpacity > 0 &&
            !!window._questData && typeof window._questId === 'string' && window._questId.length <= 32;
    }

    function settled(window) { return window._transitionState === window._targetTransitionState; }

    function renderedWindow(scene, window) {
        const sprite = window?._contentsSprite;
        return safeMap(scene) && liveWindow(scene, window) && settled(window) && window._needContentRefresh === false &&
            sprite?.bitmap && sprite.bitmap === window.contents && sprite.worldVisible && sprite.worldAlpha > 0 &&
            window.worldVisible && window.worldAlpha > 0 && window.offsetY === 0;
    }

    function drawable(scene, window, draft) {
        return draft && window._wqaQuestDraft === draft && window._questData === draft.quest &&
            window._questId === draft.id && window._wqaQuestRevision === draft.revision &&
            window.contents === draft.bitmap && renderedWindow(scene, window);
    }

    function restoreReady(scene, window, gameQuest) {
        return window && window._wqaQuestDraft == null && renderedWindow(scene, window) &&
            fieldReady(scene, true) && window.contents.isReady?.() &&
            root.$gameParty?.getNav?.() === window._questId && gameQuest.questInNavi();
    }

    function paint(window) {
        const scene = host.manager._scene;
        if (!safeMap(scene) || !liveWindow(scene, window) || !settled(window) || window.offsetY !== 0 ||
            !window.contents?.isReady?.()) return;
        // Native UI can already be in a stable rendered dialogue while the
        // field is still suspended. Keep the paint, then speak only in field.
        const interpreter = root.$gameMap._interpreter;
        if (interpreter?._list && (interpreter._waitMode !== 'message' ||
            !scene._wqaDialogue || scene._messageWindow?.openness !== 255)) return;
        return captureQuestPaint(window);
    }

    function retireSpeech(page) {
        if (page?.epoch) {
            notifications.close(page.epoch);
            page.epoch = 0;
        }
    }

    function cancelRender(scene) {
        if (!waiting || waiting.scene !== scene) return;
        const task = waiting;
        waiting = null;
        task.renderer.off('postrender', task.complete);
    }

    function leave(scene) {
        cancelRender(scene);
        if (scene) scene._wqaQuestTracking = false;
        if (current?.scene !== scene) return;
        retireSpeech(current);
        current = null;
    }

    function ready(page, moving = false) {
        return !!page && page === current && drawable(page.scene, page.window, page.draft) && fieldReady(page.scene, moving);
    }

    function detail(page) { return { kind: 'menuDetails', lines: page.lines }; }

    function speak(page, record, moving = false) {
        retireSpeech(page);
        page.epoch = notifications.open(record, () => ready(page, moving));
    }

    function announce(page) {
        if (!ready(page, true) || page.scene._wqaRouteActive || page.scene._wqaCaveReview) return;
        const { window, draft } = page;
        const last = window._wqaQuestAnnounced;
        // The native fold animation paints the same objective publication
        // twice. Its settled title appearance is a separate visible event.
        if (last?.quest === draft.quest && last.revision === draft.revision && (last.title || !page.title)) return;
        window._wqaQuestAnnounced = { quest: draft.quest, revision: draft.revision, title: !!page.title };
        speak(page, { kind: 'questFocus', name: page.title, objective: page.first }, true);
        if (preferences().autodetail && page.body.length) notifications.focus(page.epoch, { kind: 'menuDetails',
            lines: page.body, append: true });
    }

    function confirm(scene, window, draft) {
        if (!drawable(scene, window, draft)) return;
        const rendered = drawnQuestPage(window, draft, host.graphics);
        if (!rendered || (!rendered.title && !rendered.lines.length)) return leave(scene);
        if (rendered.title) window._wqaQuestRevealedTitle = { quest: draft.quest, name: rendered.title };
        const revealed = window._wqaQuestRevealedTitle;
        const title = revealed?.quest === draft.quest ? revealed.name : '';
        const body = reviewLines(rendered.lines);
        const lines = reviewLines([title, ...body]);
        if (!lines.length) return leave(scene);
        const previous = current;
        if (previous) leave(previous.scene);
        const same = previous?.window === window && previous.draft.quest === draft.quest;
        current = { scene, window, draft, title, first: rendered.first, objective: rendered.objective, body, lines, epoch: 0,
            position: same ? Math.min(previous.position, lines.length - 1) : 0 };
        scene._wqaQuestTracking = scene._wqaPresentation = true;
        announce(current);
    }

    function observe(scene, gameQuest) {
        const window = scene._questNavWindow;
        const draft = window?._wqaQuestDraft;
        // The same native quest keeps its review position across a fold.
        // Retire speech during the animation and wait for the settled paint.
        if (current?.scene === scene && current.window === window && current.draft.quest === window._questData &&
            safeMap(scene) && liveWindow(scene, window) && window.offsetY === 0 && !settled(window)) {
            cancelRender(scene);
            retireSpeech(current);
            return;
        }
        const restoring = !!gameQuest && !!restoreReady(scene, window, gameQuest);
        if (!restoring && !drawable(scene, window, draft)) return leave(scene);
        if (current && current.draft === draft) {
            if (!fieldReady(scene, true)) retireSpeech(current);
            else announce(current);
            return;
        }
        if (waiting && waiting.window === window && waiting.draft === draft && waiting.restoring === restoring) return;
        if (waiting) cancelRender(waiting.scene);
        retireSpeech(current);
        const renderer = host.graphics.app?.renderer;
        if (typeof renderer?.once !== 'function' || typeof renderer.off !== 'function') return;
        const task = { scene, window, draft, renderer, restoring, complete };
        function complete() {
            if (waiting !== task) return;
            waiting = null;
            try {
                if (!restoring) return confirm(scene, window, draft);
                if (!restoreReady(scene, window, gameQuest)) return leave(scene);
                // A failed recovery can retry after the next native paint,
                // which clears this marker. An unchanged frame cannot retry.
                window._wqaQuestDraft = false;
                const restored = restoreQuestPaint(window, gameQuest);
                if (!restored) return leave(scene);
                window._wqaQuestDraft = restored;
                confirm(scene, window, restored);
            } catch { leave(scene); }
        }
        waiting = task;
        scene._wqaQuestTracking = scene._wqaPresentation = true;
        renderer.once('postrender', complete);
    }

    return {
        paint, observe, leave,
        suspend(scene) {
            cancelRender(scene);
            if (current?.scene === scene) retireSpeech(current);
        },
        available(scene) { return current?.scene === scene && ready(current); },
        visibleObjective(scene) {
            const window = scene._questNavWindow;
            const draft = window?._wqaQuestDraft;
            if (drawable(scene, window, draft)) return drawnQuestPage(window, draft, host.graphics)?.objective;
        },
        command(scene, action) {
            const page = current;
            if (page?.scene !== scene || !ready(page)) return false;
            if (action === 'details') speak(page, detail(page));
            else if (REVIEW.has(action)) speak(page, { ...moveReview(page, action), indexed: preferences().indexing });
            else return false;
            return true;
        }
    };
}

module.exports = { createQuestTracker };
