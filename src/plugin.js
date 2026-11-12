'use strict';

const { createRenderer } = require('./runtime/renderer');
const { createTitleObserver, presented } = require('../frontend/title');

function boot(root, nodeRequire, nodeProcess) {
    let title = null;
    let waiting = null;

    function initialize() {
        const host = {
            manager: root.SceneManager,
            graphics: root.Graphics,
            window: root,
            hasFocus: () => root.document.hasFocus(),
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
        title = createTitleObserver(host, createRenderer(host).notifications);
    }

    // The installer's source-checked notification invokes this after the
    // native title intro activates its own command window. Loading the plugin
    // only registers the callback. No game functions are wrapped at startup.
    root.WendyQuestAccessTitleReady = function (scene) {
        try {
            if (!root.Utils || root.Utils.RPGMAKER_NAME !== 'MZ' ||
                root.Utils.RPGMAKER_VERSION !== '1.8.0' || !(scene instanceof root.Scene_Title) ||
                scene === waiting || root.SceneManager._scene !== scene || root.SceneManager._nextScene) return;
            const app = root.Graphics.app;
            if (!app || app.stage !== scene || !app.renderer || typeof app.renderer.once !== 'function') return;
            waiting = scene;
            app.renderer.once('postrender', () => {
                waiting = null;
                try {
                    if (!presented({ manager: root.SceneManager, graphics: root.Graphics }, scene, scene._commandWindow)) return;
                    if (!title) initialize();
                    title(scene);
                } catch {
                    // Fail closed. The original title and native input stay live.
                }
            });
        } catch {
            waiting = null;
        }
    };
}

module.exports = { boot };
