'use strict';

const { battlePresented, visibleSprite } = require('./presentation');

const START_PROMPT = { kind: 'menuReview', name: 'Confirm to start timing. Confirm for power, then for accuracy.' };
const MAX_TARGET_PAINT_WAIT = 3;
const MAX_PAINT_ATTEMPTS = 8;

function createBattleTiming(root, host, notifications, targets) {
    let current = null;
    let pending = null;
    let renderOwner = null;
    let attempts = null;

    function ready(scene, action) {
        const battle = root.BattleManager;
        return battlePresented(root, host, scene) && battle._phase === 'ActionCommand' &&
            action === battle._currentActionCommand && action._wqaTimingWaiting &&
            action._cancelable && action._coroutineContainer && action._spriteBase?.parent === scene;
    }

    function retire(scene) {
        if (!scene) return;
        if (pending?.scene === scene) pending = null;
        if (attempts?.scene === scene) {
            attempts.action._wqaTimingPromptSeen = false;
            attempts = null;
        }
        if (current?.scene === scene) {
            if (current.epoch) notifications.close(current.epoch);
            current.action._wqaTimingPromptSeen = false;
            current = null;
        }
        scene._wqaBattleTimingActive = false;
    }

    function publish(job) {
        const { scene, action } = job;
        if (!ready(scene, action)) return;
        const count = ++attempts.count;
        if (!visibleSprite(action._spriteBase, action._backing)) {
            if (count >= MAX_PAINT_ATTEMPTS) action._wqaTimingPromptSeen = true;
            return;
        }
        const appended = targets.appendTiming(scene, action, START_PROMPT);
        if (!appended && root.BattleManager._targets?.length && count < MAX_TARGET_PAINT_WAIT) return;
        const owner = current = { scene, action, epoch: 0 };
        action._wqaTimingPromptSeen = true;
        if (!appended) owner.epoch = notifications.open(START_PROMPT, () => current === owner && ready(scene, action));
    }

    return {
        observe(scene, action) {
            if (!ready(scene, action) || action._wqaTimingPromptSeen) return;
            const renderer = host.graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return;
            if (current && (current.scene !== scene || current.action !== action)) retire(current.scene);
            if (attempts?.scene !== scene || attempts.action !== action) attempts = { scene, action, count: 0 };
            scene._wqaBattleTimingActive = scene._wqaPresentation = true;
            pending = { scene, action };
            if (renderOwner === renderer) return;
            renderOwner = renderer;
            renderer.once('postrender', () => {
                if (renderOwner !== renderer) return;
                renderOwner = null;
                const job = pending;
                pending = null;
                if (!job) return;
                try { publish(job); } catch { retire(job.scene); }
            });
        },
        retire
    };
}

module.exports = { createBattleTiming };