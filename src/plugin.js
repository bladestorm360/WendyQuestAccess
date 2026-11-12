'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createTitleObserver, presented } = require('./frontend/title');
const { createFilesObserver, fileWindow, isReady } = require('./frontend/files');
const { createMapBannerObserver } = require('./world/map-banner');
const { createDialogueObserver } = require('./dialogue/observer');
const { createSettingsMenu } = require('./settings/menu');

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let files = null;
    let mapBanner = null;
    let dialogue = null;
    let settings = null;
    let settingsScene = null;
    let titleWaiting = null;
    let filesWaiting = null;

    const view = () => ({ manager: root.SceneManager, graphics: root.Graphics });
    const supported = () => root.Utils?.RPGMAKER_NAME === 'MZ' && root.Utils.RPGMAKER_VERSION === '1.8.0';

    function initialize() {
        const host = {
            manager: root.SceneManager,
            graphics: root.Graphics,
            window: root,
            hasFocus: () => root.document.hasFocus(),
            screenFading: () => root.$gameScreen?._fadeOutDuration > 0,
            battleDialogueIdle: () => root.BattleManager?._wqaDialogueBusy === false,
            saveInfo: index => root.DataManager.savefileInfo(index),
            actor: id => root.$dataActors?.[id],
            variable: id => root.$gameVariables?.value(id),
            makeWord() { return new Int32Array(new SharedArrayBuffer(4)); },
            schedule(task) { root.setTimeout(task, 0); },
            titleStillReady() {
                const scene = root.SceneManager._scene;
                return scene instanceof root.Scene_Title && root.document.hasFocus() &&
                    presented(host, scene, scene._commandWindow);
            },
            createWorker(admission) {
                const path = nodeRequire('path');
                const { Worker } = nodeRequire('worker_threads');
                const packagePath = path.dirname(nodeProcess.mainModule.filename);
                const script = path.join(packagePath, 'wendyquest-access', 'speech-worker.cjs');
                return new Worker(script, { workerData: admission });
            }
        };
        const { notifications } = createRenderer(host);
        title = createTitleObserver(host, notifications);
        files = createFilesObserver(host, notifications);
        mapBanner = createMapBannerObserver(host, notifications);
        dialogue = createDialogueObserver(host, notifications);
        settings = createSettingsMenu(root, {
            readyScene() {
                const scene = host.manager._scene;
                if (settingsScene !== scene || !scene?._wqaPresentation || !host.hasFocus() ||
                    host.manager._wqaNativeAutosaves) return null;
                if (scene instanceof root.Scene_Title) return presented(host, scene, scene._commandWindow) ? scene : null;
                if ((scene._wqaFileKind === 1 || scene._wqaFileKind === 4) && isReady(host, scene, fileWindow(scene))) {
                    return scene;
                }
                return null;
            },
            suspend() {
                settingsScene = null;
                title.suspend();
                files.suspend();
                root.Input?.clear();
                root.TouchInput?.clear();
            },
            capturePads: () => root.Input?._pollGamepads?.(),
            resume(scene) { if (host.manager._scene === scene) root.WendyQuestAccessResizeReady(); },
            repeat() { try { dialogue.repeatPage(); } catch { /* Leave native input in charge. */ } }
        });
        root.addEventListener('gamepaddisconnected', event => {
            if (root.Input?._wqaSettingsPads) delete root.Input._wqaSettingsPads[event.gamepad.index];
        });
        root.Graphics._wqaFrontEndObserved = true;
    }

    // The installer's source-checked notification invokes this after the
    // native title intro activates its own command window. Loading the plugin
    // only registers the callback. No game functions are wrapped at startup.
    root.WendyQuestAccessTitleReady = function (scene) {
        try {
            if (!supported() || !(scene instanceof root.Scene_Title) || scene === titleWaiting ||
                root.SceneManager._scene !== scene || root.SceneManager._nextScene) return;
            const app = root.Graphics.app;
            if (root.Graphics._wqaResize || !app || app.stage !== scene ||
                !app.renderer || typeof app.renderer.once !== 'function') return;
            titleWaiting = scene;
            scene._wqaPresentation = true;
            app.renderer.once('postrender', () => {
                if (titleWaiting !== scene) return;
                titleWaiting = null;
                try {
                    if (!presented(view(), scene, scene._commandWindow)) return;
                    if (!title) initialize();
                    if (title.observe(scene)) settingsScene = scene;
                } catch {
                    // Fail closed. The original title and native input stay live.
                }
            });
        } catch {
            titleWaiting = null;
        }
    };

    root.WendyQuestAccessFilesReady = function (scene) {
        try {
            if (!supported() || !scene || scene === filesWaiting || !isReady(view(), scene, fileWindow(scene))) return;
            const renderer = root.Graphics.app.renderer;
            if (typeof renderer?.once !== 'function') return;
            filesWaiting = scene;
            scene._wqaPresentation = true;
            renderer.once('postrender', () => {
                if (filesWaiting !== scene) return;
                filesWaiting = null;
                try {
                    if (!isReady(view(), scene, fileWindow(scene))) return;
                    if (!files) initialize();
                    if (files.observe(scene)) settingsScene = scene;
                } catch { /* Leave native file controls in charge. */ }
            });
        } catch {
            filesWaiting = null;
        }
    };

    root.WendyQuestAccessFilesLeaving = function (scene) {
        if (settingsScene === scene) settingsScene = null;
        settings?.retire(scene);
        if (filesWaiting === scene) filesWaiting = null;
        if (scene?._wqaFileKind) scene._wqaPresentation = false;
        files?.leave(scene);
    };

    root.WendyQuestAccessMapBannerReady = function (scene, revision) {
        try {
            if (!supported() || root.SceneManager._scene !== scene || !root.document.hasFocus()) return;
            if (!mapBanner) initialize();
            mapBanner.observe(scene, revision);
        } catch { mapBanner?.leave(scene); }
    };

    root.WendyQuestAccessDialogueReady = function (scene) {
        try {
            if (!supported() || root.SceneManager._scene !== scene || !root.document.hasFocus()) return;
            if (!dialogue) initialize();
            dialogue.observe(scene);
        } catch { dialogue?.leave(scene); }
    };

    // Direct native scene changes and developer reload can bypass the active
    // window's accepted actions. Their entry marker invokes this once before
    // any new scene is constructed or Chromium reload begins.
    root.WendyQuestAccessSceneLeaving = function (scene) {
        if (settingsScene === scene) settingsScene = null;
        settings?.retire(scene);
        if (titleWaiting === scene) titleWaiting = null;
        if (filesWaiting === scene) filesWaiting = null;
        title?.leave(scene);
        files?.leave(scene);
        mapBanner?.leave(scene);
        dialogue?.leave(scene);
    };

    root.WendyQuestAccessResizeStarting = function () {
        titleWaiting = null;
        filesWaiting = null;
        const scene = root.SceneManager._scene;
        settingsScene = null;
        settings?.retire(scene);
        if (scene?._wqaPresentation) scene._wqaPresentation = false;
        mapBanner?.leave(scene);
        dialogue?.leave(scene);
        title?.suspend();
        files?.suspend();
    };

    root.WendyQuestAccessResizeReady = function () {
        const scene = root.SceneManager?._scene;
        if (!scene) return;
        if (scene instanceof root.Scene_Title) root.WendyQuestAccessTitleReady(scene);
        else if (scene._wqaFileKind) root.WendyQuestAccessFilesReady(scene);
    };
}

module.exports = { boot };
