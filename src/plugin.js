'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createAudio } = require('./runtime/audio');
const { createTitleObserver, presented } = require('./frontend/title');
const { createFilesObserver, fileWindow, isReady } = require('./frontend/files');
const { createMenuObserver } = require('./menus/observer');
const { createBattleFocus } = require('./battle/focus');
const { createBattleTargets } = require('./battle/targets');
const { createBattleTiming } = require('./battle/timing');
const { createBattleCues } = require('./battle/timing-cues');
const { createBattleLog } = require('./battle/action-log');
const { createRadialResult } = require('./battle/radial-result');
const { partyVitals, menuVitals } = require('./battle/party-vitals');
const { createQuestTracker } = require('./menus/quest-tracker');
const { createMapBannerObserver } = require('./world/map-banner');
const { createAutosaveNotice } = require('./world/autosave-notice');
const { createField } = require('./world/field');
const { createWallAudio } = require('./world/wall-audio');
const { createBeacon } = require('./world/beacon');
const { createCaveTiming } = require('./world/cave-timing');
const { createSoundscape } = require('./world/soundscape');
const { createDialogueObserver } = require('./dialogue/observer');
const { createSettingsMenu } = require('./settings/menu');
const { createController, modeAnnouncement } = require('./settings/controller');

const QUEST_ACTIONS = Object.freeze({ questDetails: 'details', questPrevious: 'reviewPrevious',
    questNext: 'reviewNext', questFirst: 'reviewFirst', questLast: 'reviewLast' });

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let files = null;
    let menus = null;
    let battleFocus = null;
    let battleTargets = null;
    let battleTiming = null;
    let battleCues = null;
    let battleLog = null;
    let radialResult = null;
    let quests = null;
    let mapBanner = null;
    let autosaveNotice = null;
    let dialogue = null;
    let audio = null;
    let wall = null;
    let beacon = null;
    let caveTiming = null;
    let soundscape = null;
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
            now: () => root.performance.now(),
            screenFading: () => root.$gameScreen?._fadeOutDuration > 0,
            battleDialogueReady(scene) {
                const battle = root.BattleManager;
                if (battle?._phase === 'battleEnd') {
                    return battle._wqaBattleSpritesBusy === false && !scene._wqaBattleInterpreter?._list &&
                        !root.$gameTroop?._interpreter?._list && !root.$gameTemp?._animationQueue?.length &&
                        !scene._spriteset?._animationSprites?.length;
                }
                return battle?._wqaDialogueBusy === false && scene._wqaBattleInterpreter?._waitMode === 'message' &&
                    !!scene._wqaBattleInterpreter._list;
            },
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
                const geometryDirectory = path.join(packagePath, 'wendyquest-access-geometry');
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
        const speech = createRenderer(host, !!root.indexedDB);
        const { notifications } = speech;
        let audioPreferences = {};
        let navigationPreferences = {};
        let speechPreferences = {};
        host.navigationPreferences = () => navigationPreferences;
        host.bookmarks = () => settings?.bookmarkEntries() || [];
        audio = createAudio(host);
        title = createTitleObserver(host, notifications);
        files = createFilesObserver(host, notifications);
        menus = createMenuObserver(root, host, notifications, () => speechPreferences);
        battleCues = createBattleCues(root, host, audio, () => audioPreferences);
        const warmBattleAudio = scene => {
            try { battleCues.prepare(scene); } catch { battleCues.retire(scene); }
        };
        battleFocus = createBattleFocus(root, host, notifications, () => speechPreferences, warmBattleAudio);
        battleTargets = createBattleTargets(root, host, notifications, () => speechPreferences);
        battleTiming = createBattleTiming(root, host, notifications, battleTargets, warmBattleAudio);
        battleLog = createBattleLog(root, host, notifications, battleFocus.appendFeedback);
        radialResult = createRadialResult(root, host);
        mapBanner = createMapBannerObserver(host, notifications);
        dialogue = createDialogueObserver(host, notifications);
        field = createField(root, host, notifications);
        autosaveNotice = createAutosaveNotice(host, field.ready, notifications, mapBanner.append);
        quests = createQuestTracker(root, host, field.ready, notifications, () => speechPreferences);
        wall = createWallAudio(root, field.ready, audio, () => audioPreferences);
        beacon = host.beacon = createBeacon(root, field.ready, audio, () => audioPreferences, field.report);
        caveTiming = host.caveTiming = createCaveTiming(root, field.ready, audio, () => audioPreferences, field.report);
        soundscape = createSoundscape(root, field.ready, audio, () => audioPreferences);
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
            const menu = menus.controlOwner(scene) || battleFocus.controlOwner(scene) || battleTargets.controlOwner(scene);
            if (menu) return menu;
            const speaking = dialogue.controllerOwner(scene);
            if (!speaking) {
                const control = field.controlOwner(scene);
                if (control) control.quest = !control.navigationOnly && quests.available(scene);
                return control;
            }
            speaking.puzzleActive = field.puzzleActive(scene);
            return speaking;
        }
        function announce(context, text) {
            if (controlContext() !== context) return;
            const record = { kind: 'controllerStatus', name: text };
            if (context.kind === 'field') field.report(text);
            else if (context.kind === 'menu') menus.announce(context, record);
            else if (context.kind === 'battle') battleFocus.announce(context, record);
            else if (context.kind === 'battleTarget') battleTargets.announce(context, record);
            else if (context.kind === 'dialogue') dialogue.announce(context, record);
            else if (context.scene instanceof root.Scene_Title) title.announce(context.scene, record);
            else files.announce(context.scene, record);
        }
        function battleLogAction(context) {
            const scene = host.manager._scene;
            const owner = context || battleFocus.controlOwner(scene);
            if (!owner) return battleLog.repeat(scene);
            const record = battleLog.latest(scene);
            if (!record && !context) return false;
            battleFocus.announce(owner, record || { kind: 'menuReview', name: 'No battle log yet.' });
            return true;
        }
        function battleVitalsAction(action, context) {
            const scene = host.manager._scene;
            const owner = context || battleFocus.controlOwner(scene) || battleTargets.controlOwner(scene) ||
                menus.controlOwner(scene);
            if (!owner) return action !== 'battleSlot2' && field.command('fieldVitals', action === 'battleHP');
            if (owner.scene !== scene) return false;
            if (owner.kind === 'menu') {
                if (!owner.vitals || action === 'battleSlot2') return false;
                const record = menuVitals(scene, host.graphics, action === 'battleHP');
                if (!record) return false;
                menus.announce(owner, record);
                return true;
            }
            const main = scene._spriteset?._actorSprites?.[0];
            const active = owner.kind === 'battle' ? owner.option._followTarget :
                main?._actor === root.BattleManager?._subject ? main : null;
            const sprite = action === 'battleSlot1' ? main : action === 'battleSlot2' ? scene._spriteset?._subActorSprite : active;
            const record = partyVitals(scene, host.graphics, sprite, action === 'battleHP');
            if (!record) return false;
            (owner.kind === 'battle' ? battleFocus : battleTargets).announce(owner, record);
            return true;
        }
        function fieldAction(action) {
            const questAction = QUEST_ACTIONS[action];
            if (questAction) return quests.command(host.manager._scene, questAction);
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
                return readyScene() || ((menus.controlOwner(scene) || battleFocus.controlOwner(scene) || field.ready(scene)) ? scene : null);
            },
            fieldReady: field.ready,
            bookmarkContext: field.bookmarkContext,
            selectBookmark: field.selectBookmark,
            nativeButton,
            controllerChanged: () => controller?.reset(),
            navigationChanged(value) { navigationPreferences = value; },
            speechChanged(value, owner) {
                speechPreferences = value;
                speech.setSpeechEnabled(value.enabled, () => owner && controlContext() === owner &&
                    owner.scene._wqaSettingsActive && !host.screenFading());
            },
            retireSpeechSilence: speech.retireSilence,
            audioStop: audio.retire,
            audioChanged(value) {
                const master = value.enabled !== audioPreferences.enabled || value.hrtf !== audioPreferences.hrtf;
                if (master || value.wall !== audioPreferences.wall || value.wallVolume !== audioPreferences.wallVolume) wall.leave();
                if (master || value.beacon !== audioPreferences.beacon || value.beaconVolume !== audioPreferences.beaconVolume) beacon.stop();
                if (master || value.caveTiming !== audioPreferences.caveTiming || value.caveVolume !== audioPreferences.caveVolume)
                    caveTiming.stop();
                if (master || value.soundscape !== audioPreferences.soundscape) soundscape.leave();
                if (master || value.battleTiming !== audioPreferences.battleTiming ||
                    value.battleTimingVolume !== audioPreferences.battleTimingVolume) battleCues.retire();
                audioPreferences = value;
                root.Graphics._wqaWallEnabled = value.enabled && value.wall && value.wallVolume > 0;
                root.Graphics._wqaCaveTimingEnabled = value.enabled && value.caveTiming && value.caveVolume > 0;
                root.Graphics._wqaBattleCueEnabled = value.enabled && value.battleTiming && value.battleTimingVolume > 0;
                root.Graphics._wqaSoundscapeEnabled = value.enabled && value.soundscape.enabled && value.soundscape.volume > 0 &&
                    Object.values(value.soundscape.categories).some(category => category.enabled && category.volume > 0);
                const scene = host.manager._scene;
                if ((root.Graphics._wqaWallEnabled || root.Graphics._wqaCaveTimingEnabled) && field.ready(scene))
                    root.WendyQuestAccessFieldReady(scene);
            },
            previewAudio(owner, hrtf, bearing, report, cue, gain) {
                const panel = owner.group;
                return audio.preview(owner.scene, hrtf, bearing, () =>
                    owner.group === panel && controlContext() === owner && !host.screenFading(), report, audio.cues[cue], gain);
            },
            suspend(scene) {
                wall.leave(scene);
                beacon.stop(scene);
                caveTiming.stop(scene);
                soundscape.leave(scene);
                setSettingsScene(null);
                title.suspend();
                files.suspend();
                menus.suspend(scene);
                battleFocus.retire(scene);
                battleTargets.retire(scene);
                battleTiming.retire(scene);
                battleCues.retire(scene);
                battleLog.retire(scene);
                radialResult.retire(scene);
                quests.suspend(scene);
                field.autowalk.stop(scene);
                field.changed(scene);
                scene._wqaPresentation = true;
                root.Input?.clear();
                root.TouchInput?.clear();
            },
            capturePads: () => root.Input?._pollGamepads?.(),
            resume(scene) { if (host.manager._scene === scene) root.WendyQuestAccessResizeReady(); },
            repeat() { try { return dialogue.repeatPage() || battleLogAction(); } catch { return false; } },
            menuCommand(action) {
                const scene = host.manager._scene;
                try { return menus.command(menus.controlOwner(scene), action) ||
                    battleFocus.command(battleFocus.controlOwner(scene), action) ||
                    battleTargets.command(battleTargets.controlOwner(scene), action) || quests.command(scene, action); }
                catch { return false; }
            },
            battleCommand(action) { try { return battleVitalsAction(action); } catch { return false; } },
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
                else if (action === 'battleVitals') battleVitalsAction(action, context);
                else if (action === 'battleLog') battleLogAction(context);
                else if (action === 'puzzleStop') field.command(action);
                else if (action === 'modeLeft') announce(context, 'Mod mode off');
                else if (action === 'modeEntered') announce(context,
                    modeAnnouncement(family, context, settings.controllerBindings()));
                else if (context.kind === 'menu') menus.command(context, action);
                else if (context.kind === 'battle') battleFocus.command(context, action);
                else if (context.kind === 'battleTarget') battleTargets.command(context, action);
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
            soundscape.leave();
            audio.retire();
            menus.retire(host.manager._scene);
            battleFocus.retire(host.manager._scene);
            battleTargets.retire(host.manager._scene);
            battleTiming.retire(host.manager._scene);
            battleCues.retire(host.manager._scene);
            battleLog.retire(host.manager._scene);
            radialResult.retire(host.manager._scene);
            quests.leave(host.manager._scene);
            autosaveNotice.leave(host.manager._scene);
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

    root.WendyQuestAccessMenuReady = function (scene, kind) {
        if (!menus || root.SceneManager._scene !== scene) return;
        try { menus.observe(scene, kind); } catch { menus.retire(scene); }
    };
    root.WendyQuestAccessMenuLeaving = function (scene) { menus?.retire(scene); };

    root.WendyQuestAccessBattleFocusReady = function (scene, option) {
        try { battleFocus?.observe(scene, option); } catch { battleFocus?.retire(scene, option); }
    };
    root.WendyQuestAccessBattleFocusLeaving = function (scene, option) { battleFocus?.retire(scene, option); };

    root.WendyQuestAccessBattleTargetReady = function (scene) {
        try { battleTargets?.observe(scene); } catch { battleTargets?.retire(scene); }
    };
    root.WendyQuestAccessBattleTargetLeaving = function (scene) { battleTargets?.retire(scene); };

    root.WendyQuestAccessBattleTimingReady = function (scene, action) {
        try { battleTiming?.observe(scene, action); } catch { battleTiming?.retire(scene); }
    };
    root.WendyQuestAccessBattleTimingLeaving = function (scene) { battleTiming?.retire(scene); };

    root.WendyQuestAccessBattleCueBegin = function (scene, action) {
        try { battleCues?.begin(scene, action); } catch { battleCues?.retire(scene); }
    };
    root.WendyQuestAccessBattleCueSample = function (scene, action, phase, progress, duration, start, end, limit,
        iceStart, iceEnd, paused, frosty, accepted) {
        try { battleCues?.sample(scene, action, phase, progress, duration, start, end, limit, iceStart, iceEnd, paused, frosty, accepted); }
        catch { battleCues?.retire(scene); }
    };
    root.WendyQuestAccessBattleCueEndSweep = function (scene, action) { battleCues?.endSweep(scene, action); };
    root.WendyQuestAccessBattleCueLeaving = function (scene) { battleCues?.retire(scene); };

    root.WendyQuestAccessBattleRadialReady = function (scene, action) {
        try { radialResult?.observe(scene, action); } catch { radialResult?.retire(scene); }
    };
    root.WendyQuestAccessBattleRadialLeaving = function (scene) { radialResult?.retire(scene); };

    root.WendyQuestAccessBattleLogReady = function (scene, window) {
        try { battleLog?.observe(scene, window); } catch { battleLog?.retire(scene); }
    };
    root.WendyQuestAccessBattleLogLeaving = function (scene) { battleLog?.retire(scene); };

    root.WendyQuestAccessQuestPaint = function (window) {
        try { return quests?.paint(window); } catch { return null; }
    };
    root.WendyQuestAccessQuestUpdate = function (scene, gameQuest) {
        try { quests?.observe(scene, gameQuest); } catch { quests?.leave(scene); }
    };
    root.WendyQuestAccessQuestNavigationLeaving = function (scene) {
        try { field?.questRefresh(scene); } catch { /* Preserve the native marker rebuild. */ }
    };

    root.WendyQuestAccessAutosaveNotice = function (scene, sprite) {
        try { autosaveNotice?.observe(scene, sprite); } catch { autosaveNotice?.leave(scene); }
    };
    root.WendyQuestAccessAutosaveNoticeEnd = function (scene, sprite) { autosaveNotice?.removed(scene, sprite); };

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
            !root.Graphics._wqaBookmarkTransferPending && !root.Graphics._wqaWallEnabled && !root.Graphics._wqaCaveTimingEnabled) ||
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
                field.observeReady(scene);
                if (root.Graphics._wqaWallEnabled) wall.arm(scene);
                if (root.Graphics._wqaCaveTimingEnabled) caveTiming.warm(scene);
            } catch { /* Native field input remains available. */ }
        });
    };

    root.WendyQuestAccessCaveEventAccepted = function (scene, event) {
        try { field?.caveEventAccepted(scene, event); } catch { /* Preserve native event acceptance. */ }
    };

    root.WendyQuestAccessBookmarkEntranceAccepted = function (scene, event) {
        try { field?.bookmarkEntranceAccepted(scene, event); } catch { /* Preserve native event acceptance. */ }
    };

    root.WendyQuestAccessBookmarkLandingAccepted = function (scene, player) {
        try { field?.bookmarkLandingAccepted(scene, player); } catch { /* Preserve native landing. */ }
    };

    root.WendyQuestAccessBookmarkTransferReserved = function (scene, player, map, x, y, direction) {
        try { field?.bookmarkTransferReserved(scene, player, map, x, y, direction); } catch { /* Preserve the native transfer. */ }
    };

    root.WendyQuestAccessFieldChanged = function (scene) {
        quests?.suspend(scene);
        soundscape?.invalidate(scene);
        wall?.leave(scene);
        caveTiming?.stop(scene);
        if (scene?._wqaTerrainWork) beacon?.stop(scene);
        else beacon?.invalidate(scene);
        field?.changed(scene);
    };
    root.WendyQuestAccessFieldControlLost = function (scene) {
        quests?.suspend(scene);
        soundscape?.leave(scene);
        wall?.leave(scene);
        caveTiming?.stop(scene);
        beacon?.stop(scene);
        field?.controlLost(scene);
        autosaveNotice?.leave(scene);
        controller?.reset();
    };

    root.WendyQuestAccessFieldMove = function (scene, direction, succeeded) {
        try { field?.autowalk.moved(scene, direction, succeeded); } catch { field?.autowalk.stop(scene); }
        try { beacon?.moved(scene, direction, succeeded); } catch { beacon?.stop(scene); }
        try { wall?.move(scene, direction, succeeded); } catch { wall?.leave(scene); }
    };
    root.WendyQuestAccessFieldEvent = function (scene) {
        autosaveNotice?.leave(scene);
        quests?.suspend(scene);
        soundscape?.leave(scene);
        caveTiming?.stop(scene);
        const stopped = field?.autowalk.stop(scene);
        if (stopped || scene?._wqaCaveReview || scene?._wqaQuestNavigation || scene?._wqaRouteActive) field?.changed(scene);
        beacon?.stop(scene);
        wall?.interrupt(scene);
    };
    root.WendyQuestAccessAutowalkInput = function (scene, player, direction, manual) {
        try { return field?.autowalk.input(scene, player, direction, manual) ?? direction; }
        catch {
            field?.autowalk.stop(scene);
            beacon?.stop(scene);
            return direction;
        }
    };
    root.WendyQuestAccessWallExpire = function (scene) { wall?.expire(scene); };
    root.WendyQuestAccessCaveTimingUpdate = function (scene) {
        try { caveTiming?.update(scene); } catch { caveTiming?.stop(scene); }
    };
    root.WendyQuestAccessCaveTimingStop = function (scene) { caveTiming?.stop(scene); };
    root.WendyQuestAccessCaveTimingPose = function (scene) { caveTiming?.pose(scene); };
    root.WendyQuestAccessSoundscapeUpdate = function (scene) {
        try { soundscape?.update(scene); } catch { soundscape?.leave(scene); }
    };
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
        quests?.leave(scene);
        soundscape?.leave(scene);
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
        menus?.retire(scene);
        battleFocus?.retire(scene);
        battleTargets?.retire(scene);
        battleTiming?.retire(scene);
        battleCues?.retire(scene);
        battleLog?.leave(scene);
        radialResult?.retire(scene);
        mapBanner?.leave(scene);
        autosaveNotice?.leave(scene);
        dialogue?.leave(scene);
        field?.leave(scene);
    };

    root.WendyQuestAccessResizeStarting = function () {
        titleWaiting = null;
        filesWaiting = null;
        fieldWaiting = null;
        const scene = root.SceneManager._scene;
        quests?.leave(scene);
        soundscape?.leave(scene);
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
        autosaveNotice?.leave(scene);
        dialogue?.leave(scene);
        field?.leave(scene);
        title?.suspend();
        files?.suspend();
        menus?.retire(scene);
        battleFocus?.retire(scene);
        battleTargets?.retire(scene);
        battleTiming?.retire(scene);
        battleCues?.retire(scene);
        battleLog?.retire(scene);
        radialResult?.retire(scene);
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
