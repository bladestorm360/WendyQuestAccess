'use strict';

function visible(scene, window) {
    return window?.parent && window.parent === scene._windowLayer && window.worldVisible &&
        window.worldAlpha > 0 && window.openness === 255;
}

function createDialogueObserver(host, notifications) {
    let current = null;

    function leave(scene) {
        if (current?.scene !== scene) return;
        const epoch = current.epoch;
        current = null;
        scene._wqaDialogue = false;
        scene._wqaDialoguePending = false;
        scene._wqaPresentation = false;
        if (epoch) notifications.close(epoch);
    }

    function currentScene(context) {
        const { scene, window } = context;
        return current === context && scene === host.manager._scene && scene._messageWindow === window &&
            scene._active && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize &&
            host.graphics.app?.stage === scene && host.hasFocus();
    }

    function publish(context) {
        const { scene, window } = context;
        if (!currentScene(context)) return leave(scene);
        const paint = window._wqaDialoguePaint;
        const choices = window._choiceListWindow;
        const pageVisible = visible(scene, window) && window.contentsOpacity > 0;
        const name = window._nameSprite;
        if (pageVisible && paint && paint.end > paint.spoken) {
            if (window._faceBitmap || (name?._currentString && name._animationRunning)) return;
            const text = paint.text.slice(paint.spoken, paint.end);
            const speaker = !paint.spoken && name?.worldVisible && name.worldAlpha > 0 &&
                typeof name._currentString === 'string' && name._currentString.length <= 96 ? name._currentString : '';
            paint.spoken = paint.end;
            const record = { kind: 'dialoguePage', text, speaker };
            if (context.epoch) notifications.focus(context.epoch, record);
            else context.epoch = notifications.open(record, () => currentScene(context));
        }

        if (!choices?.active || !visible(scene, choices) || choices.contentsOpacity <= 0) return;
        const index = choices._index;
        if (!Number.isInteger(index) || index < -1 || choices._wqaChoiceShown === index) return;
        const row = index < 0 ? null : choices._wqaChoiceRows?.[index % 16];
        if (index >= 0 && row?.index !== index) return;
        const first = choices._wqaChoiceShown === null;
        choices._wqaChoiceShown = index;
        const record = { kind: 'dialogueChoice', text: row?.text || '', first,
            append: first && !!context.epoch };
        if (context.epoch) notifications.focus(context.epoch, record);
        else context.epoch = notifications.open(record, () => currentScene(context));
    }

    function observe(scene) {
        const window = scene._messageWindow;
        const renderer = host.graphics.app?.renderer;
        if (!window || typeof renderer?.once !== 'function' || scene._wqaDialoguePending) return;
        if (current && (current.scene !== scene || current.window !== window)) leave(current.scene);
        if (!current) current = { scene, window, epoch: 0 };
        const context = current;
        scene._wqaDialogue = scene._wqaDialoguePending = scene._wqaPresentation = true;
        try {
            renderer.once('postrender', () => {
                if (current !== context) return;
                scene._wqaDialoguePending = false;
                try { publish(context); }
                catch { leave(scene); }
            });
        } catch { leave(scene); }
    }

    if (host.window) {
        for (const event of ['blur', 'pagehide']) {
            host.window.addEventListener(event, () => { if (current) leave(current.scene); });
        }
    }
    return { observe, leave };
}

module.exports = { createDialogueObserver };
