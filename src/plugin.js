'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createAudio } = require('./runtime/audio');
const { createTitleObserver, presented } = require('./frontend/title');
const { createFilesObserver, fileWindow, isReady } = require('./frontend/files');
const { createMapBannerObserver } = require('./world/map-banner');
const { createField } = require('./world/field');
const { createWallAudio } = require('./world/wall-audio');
const { createBeacon } = require('./world/beacon');
const { createCaveTiming } = require('./world/cave-timing');
const { createDialogueObserver } = require('./dialogue/observer');
const { createSettingsMenu } = require('./settings/menu');
const { createController, modeAnnouncement } = require('./settings/controller');

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let files = null;
    let mapBanner = null;
    let dialogue = null;
    let audio = null;
    let wall = null;
    let beacon = null;
    let caveTiming = null;
    let field = null;
    let settings = null;
    let settingsScene = null;
    let frontendControl = null;
    let controller = null;
    let titleWaiting = null;
    let filesWaiting = null;
    let fieldWaiting = null;

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
            },
            createRouteWorker(admission) {
                const path = nodeRequire('path');
                const { Worker } = nodeRequire('worker_threads');
                const packagePath = path.dirname(nodeProcess.mainModule.filename);
                const script = path.join(packagePath, 'wendyquest-access', 'route-worker.cjs');
                const geometryDirectory = path.join(root.nw.App.dataPath, 'wendyquest-access-geometry');
                return new Worker(script, { workerData: { admission, geometryDirectory } });
            },
            createAudioWorker(admission) {
                const path = nodeRequire('path');
                const { Worker } = nodeRequire('worker_threads');
                const packagePath = path.dirname(nodeProcess.mainModule.filename);
                const script = path.join(packagePath, 'wendyquest-access', 'audio-worker.cjs');
                return new Worker(script, { workerData: admission });
            }
        };
        const { notifications } = createRenderer(host);
        let audioPreferences = {};
        audio = createAudio(host);
        title = createTitleObserver(host, notifications);
        files = createFilesObserver(host, notifications);
        mapBanner = createMapBannerObserver(host, notifications);
        dialogue = createDialogueObserver(host, notifications);
        field = createField(root, host, notifications);
        wall = createWallAudio(root, field.ready, audio, () => audioPreferences);
        beacon = host.beacon = createBeacon(root, field.ready, audio, () => audioPreferences, field.report);
        caveTiming = host.caveTiming = createCaveTiming(root, field.ready, audio, () => audioPreferences, field.report);
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
            const speaking = dialogue.controllerOwner(scene);
            if (!speaking) return field.controlOwner(scene);
            speaking.puzzleActive = field.puzzleActive(scene);
            return speaking;
        }
        function announce(context, text) {
            if (controlContext() !== context) return;
            const record = { kind: 'controllerStatus', name: text };
            if (context.kind === 'field') field.report(text);
            else if (context.kind === 'dialogue') dialogue.announce(context, record);
            else if (context.scene instanceof root.Scene_Title) title.announce(context.scene, record);
            else files.announce(context.scene, record);
        }
        function fieldAction(action) {
            if (action !== 'beaconToggle' && action !== 'wallToggle') return field.command(action);
            const scene = host.manager._scene;
            if (!field.ready(scene)) return false;
            const text = settings.toggleFieldAudio(action, () => {
                if (host.manager._scene === scene) field.report('Could not save audio settings. Previous setting restored.');
            });
            if (text) field.report(text);
            return !!text;
        }
        const nativeButton = button => root.Input?.gamepadMapper?.[button];
        settings = createSettingsMenu(root, {
            readyScene() {
                const scene = host.manager._scene;
                return readyScene() || (field.ready(scene) ? scene : null);
            },
            fieldReady: field.ready,
            nativeButton,
            controllerChanged: () => controller?.reset(),
            audioStop: audio.retire,
            audioChanged(value) {
                const master = value.enabled !== audioPreferences.enabled || value.hrtf !== audioPreferences.hrtf;
                if (master || value.wall !== audioPreferences.wall || value.wallVolume !== audioPreferences.wallVolume) wall.leave();
                if (master || value.beacon !== audioPreferences.beacon || value.beaconVolume !== audioPreferences.beaconVolume) beacon.stop();
                if (master || value.caveTiming !== audioPreferences.caveTiming || value.caveVolume !== audioPreferences.caveVolume)
                    caveTiming.stop();
                audioPreferences = value;
                root.Graphics._wqaWallEnabled = value.enabled && value.wall && value.wallVolume > 0;
                root.Graphics._wqaCaveTimingEnabled = value.enabled && value.caveTiming && value.caveVolume > 0;
                const scene = host.manager._scene;
                if ((root.Graphics._wqaWallEnabled || root.Graphics._wqaCaveTimingEnabled) && field.ready(scene))
                    root.WendyQuestAccessFieldReady(scene);
            },
            previewAudio(owner, hrtf, bearing, report, cue, gain) {
                return audio.preview(owner.scene, hrtf, bearing, () =>
                    owner.group === 'audio' && controlContext() === owner && !host.screenFading(), report, audio.cues[cue], gain);
            },
            suspend(scene) {
                wall.leave(scene);
                beacon.stop(scene);
                caveTiming.stop(scene);
                setSettingsScene(null);
                title.suspend();
                files.suspend();
                field.changed(scene);
                scene._wqaPresentation = true;
                root.Input?.clear();
                root.TouchInput?.clear();
            },
            capturePads: () => root.Input?._pollGamepads?.(),
            resume(scene) { if (host.manager._scene === scene) root.WendyQuestAccessResizeReady(); },
            repeat() { try { return dialogue.repeatPage(); } catch { return false; } },
            fieldCommand(key) { try { return fieldAction(key); } catch { return false; } }
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
                else if (action === 'puzzleStop') field.command(action);
                else if (action === 'modeLeft') announce(context, 'Mod mode off');
                else if (action === 'modeEntered') announce(context,
                    modeAnnouncement(family, context, settings.controllerBindings()));
                else if (context.kind === 'field') fieldAction(action);
            }
        });
        host.dialoguePresented = field.dialoguePresented;
        root.WendyQuestAccessPadSample = function (index, mapping, id, pressed, axisX, axisY) {
            try { return controller.sample(index, mapping, id, pressed, axisX, axisY); } catch { return 0; }
        };
        root.addEventListener('gamepaddisconnected', event => {
            controller.disconnect(event.gamepad.index);
            if (root.Input?._wqaSettingsPads) delete root.Input._wqaSettingsPads[event.gamepad.index];
        });
        for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => {
            wall.leave();
            beacon.stop();
            caveTiming.stop();
            audio.retire();
            controller.reset();
        });
        root.addEventListener('focus', () => {
            const scene = host.manager._scene;
            if ((root.Graphics._wqaWallEnabled || root.Graphics._wqaCaveTimingEnabled) && field.ready(scene))
                root.WendyQuestAccessFieldReady(scene);
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
        audio?.retire(scene);
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

    root.WendyQuestAccessFieldReady = function (scene) {
        if ((field && !root.Graphics._wqaCaveRecoveryPending && !root.Graphics._wqaCaveProgressPending &&
            !root.Graphics._wqaWallEnabled && !root.Graphics._wqaCaveTimingEnabled) ||
            fieldWaiting === scene || !supported() || root.SceneManager._scene !== scene ||
            !root.document.hasFocus()) return;
        const renderer = root.Graphics.app?.renderer;
        if (typeof renderer?.once !== 'function') return;
        fieldWaiting = scene;
        renderer.once('postrender', () => {
            if (fieldWaiting !== scene) return;
            fieldWaiting = null;
            if (!scene._wqaFieldReady || root.SceneManager._scene !== scene ||
                root.Graphics.app?.stage !== scene || root.SceneManager._nextScene || root.Graphics._wqaResize ||
                root.SceneManager._wqaNativeAutosaves || !root.document.hasFocus()) return;
            try {
                if (!field) initialize();
                field.observeCaveReady(scene);
                if (root.Graphics._wqaWallEnabled) wall.arm(scene);
                if (root.Graphics._wqaCaveTimingEnabled) caveTiming.warm(scene);
            } catch { /* Native field input remains available. */ }
        });
    };

    root.WendyQuestAccessCaveEventAccepted = function (scene, event) {
        try { field?.caveEventAccepted(scene, event); } catch { /* Preserve native event acceptance. */ }
    };

    root.WendyQuestAccessFieldChanged = function (scene) {
        wall?.leave(scene);
        caveTiming?.stop(scene);
        if (scene?._wqaTerrainWork) beacon?.stop(scene);
        else beacon?.invalidate(scene);
        field?.changed(scene);
    };
    root.WendyQuestAccessFieldControlLost = function (scene) {
        wall?.leave(scene);
        caveTiming?.stop(scene);
        beacon?.stop(scene);
        field?.controlLost(scene);
        controller?.reset();
    };

    root.WendyQuestAccessFieldMove = function (scene, direction, succeeded) {
        try { beacon?.moved(scene, direction, succeeded); } catch { beacon?.stop(scene); }
        try { wall?.move(scene, direction, succeeded); } catch { wall?.leave(scene); }
    };
    root.WendyQuestAccessFieldEvent = function (scene) {
        caveTiming?.stop(scene);
        if (scene?._wqaCaveReview) field?.changed(scene);
        beacon?.stop(scene);
        wall?.interrupt(scene);
    };
    root.WendyQuestAccessWallExpire = function (scene) { wall?.expire(scene); };
    root.WendyQuestAccessCaveTimingUpdate = function (scene) {
        try { caveTiming?.update(scene); } catch { caveTiming?.stop(scene); }
    };
    root.WendyQuestAccessCaveTimingStop = function (scene) { caveTiming?.stop(scene); };
    root.WendyQuestAccessCaveTimingPose = function (scene) { caveTiming?.pose(scene); };
    root.WendyQuestAccessBeaconUpdate = function (scene) {
        try { beacon?.update(scene); } catch { beacon?.stop(scene); }
    };
    root.WendyQuestAccessBeaconExpire = function (scene) { beacon?.expire(scene); };
    root.WendyQuestAccessBeaconActor = function (scene, actor, direction) {
        try { beacon?.actor(scene, actor, direction); } catch { beacon?.stop(scene); }
    };

    // Direct native scene changes and developer reload can bypass the active
    // window's accepted actions. Their entry marker invokes this once before
    // any new scene is constructed or Chromium reload begins.
    root.WendyQuestAccessSceneLeaving = function (scene) {
        wall?.leave(scene);
        beacon?.stop(scene);
        caveTiming?.stop(scene);
        audio?.retire(scene);
        if (settingsScene === scene) setSettingsScene(null);
        if (scene) scene._wqaControllerReady = false;
        controller?.reset();
        settings?.retire(scene);
        if (titleWaiting === scene) titleWaiting = null;
        if (filesWaiting === scene) filesWaiting = null;
        if (fieldWaiting === scene) fieldWaiting = null;
        title?.leave(scene);
        files?.leave(scene);
        mapBanner?.leave(scene);
        dialogue?.leave(scene);
        field?.leave(scene);
    };

    root.WendyQuestAccessResizeStarting = function () {
        titleWaiting = null;
        filesWaiting = null;
        fieldWaiting = null;
        const scene = root.SceneManager._scene;
        wall?.leave(scene);
        beacon?.stop(scene);
        caveTiming?.stop(scene);
        audio?.retire(scene);
        setSettingsScene(null);
        if (scene) scene._wqaControllerReady = false;
        controller?.reset();
        settings?.retire(scene);
        if (scene?._wqaPresentation) scene._wqaPresentation = false;
        mapBanner?.leave(scene);
        dialogue?.leave(scene);
        field?.leave(scene);
        title?.suspend();
        files?.suspend();
    };

    root.WendyQuestAccessResizeReady = function () {
        const scene = root.SceneManager?._scene;
        if (!scene) return;
        if (scene instanceof root.Scene_Title) root.WendyQuestAccessTitleReady(scene);
        else if (scene._wqaFileKind) root.WendyQuestAccessFilesReady(scene);
        else if (scene._wqaFieldReady && (root.Graphics._wqaWallEnabled || root.Graphics._wqaCaveTimingEnabled))
            root.WendyQuestAccessFieldReady(scene);
    };
}

module.exports = { boot };
