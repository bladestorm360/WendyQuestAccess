'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createTitleObserver, presented } = require('./frontend/title');
const { createFilesObserver, fileWindow, isReady } = require('./frontend/files');
const { createMapBannerObserver } = require('./world/map-banner');
const { createDialogueObserver } = require('./dialogue/observer');
const { createSettingsMenu } = require('./settings/menu');
const { createController, modeAnnouncement } = require('./settings/controller');

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let files = null;
    let mapBanner = null;
    let dialogue = null;
    let settings = null;
    let settingsScene = null;
    let frontendControl = null;
    let controller = null;
    let titleWaiting = null;
    let filesWaiting = null;

    const view = () => ({ manager: root.SceneManager, graphics: root.Graphics });
    const supported = () => root.Utils?.RPGMAKER_NAME === 'MZ' && root.Utils.RPGMAKER_VERSION === '1.8.0';

    function setSettingsScene(scene) {
        if (settingsScene && settingsScene !== scene) settingsScene._wqaControllerReady = false;
        settingsScene = scene;
        if (scene && frontendControl?.scene !== scene) frontendControl = { kind: 'front', scene };
        else if (!scene) frontendControl = null;
        if (scene) scene._wqaControllerReady = scene instanceof root.Scene_Title ||
            scene._wqaFileKind === 1 || scene._wqaFileKind === 4;
    }

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
        function readyScene() {
            const scene = host.manager._scene;
            if (settingsScene !== scene || !scene?._wqaPresentation || !host.hasFocus() ||
                host.manager._wqaNativeAutosaves) return null;
            if (scene instanceof root.Scene_Title) return presented(host, scene, scene._commandWindow) ? scene : null;
            if ((scene._wqaFileKind === 1 || scene._wqaFileKind === 4) && isReady(host, scene, fileWindow(scene))) return scene;
            return null;
        }
        function controlContext() {
            const scene = host.manager._scene;
            if (!scene || !host.hasFocus() || host.manager._nextScene || host.manager._exiting ||
                host.manager._wqaNativeAutosaves || host.graphics._wqaResize || host.graphics.app?.stage !== scene) return null;
            const panel = settings?.controllerOwner();
            if (panel?.scene === scene && scene._wqaSettingsActive) return panel;
            if (readyScene()) return frontendControl;
            return dialogue.controllerOwner(scene);
        }
        function announce(context, text) {
            if (controlContext() !== context) return;
            const record = { kind: 'controllerStatus', name: text };
            if (context.kind === 'dialogue') dialogue.announce(context, record);
            else if (context.scene instanceof root.Scene_Title) title.announce(context.scene, record);
            else files.announce(context.scene, record);
        }
        const nativeButton = button => root.Input?.gamepadMapper?.[button];
        settings = createSettingsMenu(root, {
            readyScene,
            nativeButton,
            controllerChanged: () => controller?.reset(),
            suspend() {
                setSettingsScene(null);
                title.suspend();
                files.suspend();
                root.Input?.clear();
                root.TouchInput?.clear();
            },
            capturePads: () => root.Input?._pollGamepads?.(),
            resume(scene) { if (host.manager._scene === scene) root.WendyQuestAccessResizeReady(); },
            repeat() { try { dialogue.repeatPage(); } catch { /* Leave native input in charge. */ } }
        });
        controller = createController({
            schedule: host.schedule, context: controlContext, bindings: settings.controllerBindings, nativeButton,
            dispatch(context, action, family, buttons) {
                if (action === 'recovery') {
                    const owner = context.kind === 'settings' ? context : null;
                    const text = settings.toggleController(owner, () => announce(context, 'Controller setting could not be saved'));
                    if (text && !owner) announce(context, text);
                } else if (context.kind === 'settings') settings.controllerInput(context, action, family, buttons);
                else if (action === 'settings') settings.open(context.scene, family);
                else if (action === 'repeat') dialogue.repeatPage();
                else if (action === 'modeLeft') announce(context, 'Mod mode off');
                else if (action === 'modeEntered') announce(context,
                    modeAnnouncement(family, context, settings.controllerBindings()));
            }
        });
        root.WendyQuestAccessPadSample = function (index, mapping, id, pressed) {
            try { return controller.sample(index, mapping, id, pressed); } catch { return 0; }
        };
        root.addEventListener('gamepaddisconnected', event => {
            controller.disconnect(event.gamepad.index);
            if (root.Input?._wqaSettingsPads) delete root.Input._wqaSettingsPads[event.gamepad.index];
        });
        for (const type of ['blur', 'pagehide']) root.addEventListener(type, controller.reset);
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
                    if (title.observe(scene)) setSettingsScene(scene);
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
                    if (files.observe(scene)) setSettingsScene(scene);
                } catch { /* Leave native file controls in charge. */ }
            });
        } catch {
            filesWaiting = null;
        }
    };

    root.WendyQuestAccessFilesLeaving = function (scene) {
        if (settingsScene === scene) setSettingsScene(null);
        if (scene) scene._wqaControllerReady = false;
        controller?.reset();
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
        if (settingsScene === scene) setSettingsScene(null);
        if (scene) scene._wqaControllerReady = false;
        controller?.reset();
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
        setSettingsScene(null);
        if (scene) scene._wqaControllerReady = false;
        controller?.reset();
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
