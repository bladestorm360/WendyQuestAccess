'use strict';

const { battleScenePresented, drawnText, visibleSprite } = require('./presentation');

const MAX_RENDER_ATTEMPTS = 30;

function createRadialResult(root, host) {
    let pending = null;
    let renderOwner = null;

    function ready(scene, action) {
        const battle = root.BattleManager;
        return battleScenePresented(root, host, scene) && battle._phase === 'ActionCommand' &&
            battle._wqaBattleSpritesBusy === false && !root.$gameTemp?._animationQueue?.length &&
            !scene._spriteset?._animationSprites?.length && action === battle._currentActionCommand &&
            !action._resolved && action._coroutineContainer && action._spriteBase?.parent === scene;
    }

    function retire(scene) {
        if (!scene) return;
        if (pending?.scene === scene) pending = null;
        const action = root.BattleManager?._currentActionCommand;
        if (action?._spriteBase?.parent === scene) {
            action._wqaRadialPaint = action._wqaRadialWords = action._wqaRadialPowerWords = null;
        }
        scene._wqaRadialReport = null;
        scene._wqaRadialActive = false;
    }

    function publish({ scene, action, paint }) {
        const backing = action._backing;
        if (action._wqaRadialPaint !== paint || !ready(scene, action)) return;
        paint.attempts++;
        if (!visibleSprite(action._spriteBase, backing)) {
            if (paint.attempts >= MAX_RENDER_ATTEMPTS) action._wqaRadialPaint = null;
            return;
        }
        const words = drawnText(backing, paint.words, 48).replace(/\s+/g, ' ').trim();
        if (!paint.accuracy) {
            if (words || paint.attempts >= MAX_RENDER_ATTEMPTS) {
                action._wqaRadialPowerWords = words;
                action._wqaRadialPaint = null;
            }
            return;
        }

        const power = visibleSprite(backing, paint.powerBadge) && drawnText(backing, paint.power, 8);
        const accuracy = visibleSprite(backing, paint.accuracyBadge) && drawnText(backing, paint.accuracy, 8);
        if ((!paint.copied || words) && /^\d{1,7}%$/.test(power) && /^\d{1,7}%$/.test(accuracy)) {
            // Preserve only the rendered string through native action entry.
            // The battle log admits it once native animation work has settled.
            const powerWords = action._wqaRadialPowerWords;
            scene._wqaRadialReport = 'Power ' + power + (powerWords ? ', ' + powerWords : '') +
                '. Accuracy ' + accuracy + (words ? ', ' + words : '') + '.';
            paint.copied = true;
            if (words || !paint.words) action._wqaRadialPaint = null;
        }
        if (paint.attempts >= MAX_RENDER_ATTEMPTS) action._wqaRadialPaint = null;
    }

    return {
        observe(scene, action) {
            const paint = action._wqaRadialPaint;
            if (!paint || !ready(scene, action)) return;
            const renderer = host.graphics.app?.renderer;
            if (typeof renderer?.once !== 'function') return;
            scene._wqaRadialActive = scene._wqaPresentation = true;
            pending = { scene, action, paint };
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

module.exports = { createRadialResult };
