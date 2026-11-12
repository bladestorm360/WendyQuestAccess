'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createTitleObserver, presented } = require('./frontend/title');
const { createFilesObserver, fileWindow, isReady } = require('./frontend/files');

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let files = null;
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
            app.renderer.once('postrender', () => {
                if (titleWaiting !== scene) return;
                titleWaiting = null;
                try {
                    if (!presented(view(), scene, scene._commandWindow)) return;
                    if (!title) initialize();
                    title.observe(scene);
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
            renderer.once('postrender', () => {
                if (filesWaiting !== scene) return;
                filesWaiting = null;
                try {
                    if (!isReady(view(), scene, fileWindow(scene))) return;
                    if (!files) initialize();
                    files.observe(scene);
                } catch { /* Leave native file controls in charge. */ }
            });
        } catch {
            filesWaiting = null;
        }
    };

    root.WendyQuestAccessFilesLeaving = function (scene) {
        if (filesWaiting === scene) filesWaiting = null;
        files?.leave(scene);
    };

    root.WendyQuestAccessResizeStarting = function () {
        titleWaiting = null;
        filesWaiting = null;
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
