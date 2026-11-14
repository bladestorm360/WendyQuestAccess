'use strict';

const { readNumberFocus } = require('./number-entry');
const { moveReview } = require('../menus/review');

function visible(scene, window) {
    return window?.parent && window.parent === scene._windowLayer && window.worldVisible &&
        window.worldAlpha > 0 && window.openness === 255;
}

function createDialogueObserver(host, notifications) {
    let current = null;

    function leave(scene) {
        if (scene?._messageWindow?._wqaAutoPaint) scene._messageWindow._wqaAutoPaint = null;
        if (scene?._wqaDiagramShown || scene?._wqaDiagramAttempts) {
            scene._wqaDiagramShown = false;
            scene._wqaDiagramAttempts = 0;
        }
        if (!current || current.scene !== scene) return;
        const epoch = current.epoch;
        current = null;
        scene._wqaDialogue = false;
        scene._wqaControllerReady = false;
        scene._wqaDialoguePending = false;
        scene._wqaPresentation = false;
        if (epoch) notifications.close(epoch);
    }

    function currentScene(context) {
        const { scene, window } = context;
        return current === context && scene === host.manager._scene && scene._messageWindow === window &&
            scene._active && !host.manager._nextScene && !host.manager._exiting &&
            !host.manager._wqaNativeAutosaves && !host.graphics._wqaResize &&
            scene._fadeDuration === 0 && scene._fadeOpacity === 0 && !host.screenFading() &&
            (!scene._wqaBattleStarted || host.battleDialogueReady(scene)) &&
            host.graphics.app?.stage === scene && host.hasFocus();
    }

    function submit(context, record) {
        if (context.epoch) notifications.focus(context.epoch, record);
        else context.epoch = notifications.open(record, () => currentScene(context));
    }

    function publish(context, diagramWaiting) {
        const { scene, window } = context;
        if (!currentScene(context)) return leave(scene);
        const autoPaint = window._wqaAutoPaint;
        const paint = window._wqaDialoguePaint || autoPaint;
        const choices = window._choiceListWindow;
        const number = window._numberInputWindow;
        const pageVisible = visible(scene, window) && window.contentsOpacity > 0;
        const diagram = diagramWaiting && !scene._wqaDiagramShown && host.dialogueDiagram?.(scene, window);
        if (!context.epoch && !diagram && (!paint || (autoPaint && !pageVisible)) && !choices?.active && !number?.active) {
            if (!diagramWaiting) leave(scene);
            return;
        }
        const name = window._nameSprite;
        if (pageVisible && paint && paint.end > paint.spoken) {
            if (window._faceBitmap || (!autoPaint && name?._currentString && name._animationRunning)) return;
            const text = paint.text.slice(paint.spoken, paint.end);
            const speaker = !paint.spoken && name?.worldVisible && name.worldAlpha > 0 &&
                !name._animationRunning && typeof name._currentString === 'string' &&
                name._currentString.length <= 96 ? name._currentString : '';
            if (!paint.spoken) paint.speaker = speaker;
            paint.spoken = paint.end;
            // The draw tracker survives explicit pauses on the same page.
            // Keep the rendered extent and its original name for manual review.
            context.page = { paint, end: paint.end, automatic: !!autoPaint };
            if (!autoPaint) scene._wqaControllerReady = true;
            window._wqaAutoPaint = null;
            host.dialoguePresented?.(scene, paint);
            submit(context, { kind: 'dialoguePage', text, speaker });
        }

        if (pageVisible && paint && context.epoch && scene._wqaVictoryCondition &&
            context.page?.paint === paint && paint.spoken === paint.end) {
            const condition = scene._wqaVictoryCondition;
            scene._wqaVictoryCondition = null;
            submit(context, { kind: 'battleLog', lines: [condition], append: true });
        }

        if (diagram) {
            context.diagram = diagram;
            context.hasReview = true;
            scene._wqaControllerReady = scene._wqaDiagramShown = true;
            submit(context, { kind: 'mapBanner', name: diagram.title, append: !!context.epoch });
            if (host.speechPreferences?.().autodetail)
                submit(context, { kind: 'menuDetails', lines: diagram.lines, append: true });
        }

        if (number?.active && visible(scene, number) && number.contentsOpacity > 0) {
            const record = readNumberFocus(number);
            if (record) submit(context, { ...record, append: record.first && !!context.epoch });
            return;
        }
        if (!choices?.active || !visible(scene, choices) || choices.contentsOpacity <= 0) return;
        const index = choices._index;
        if (!Number.isInteger(index) || index < -1 || choices._wqaChoiceShown === index) return;
        const row = index < 0 ? null : choices._wqaChoiceRows?.[index % 16];
        if (index >= 0 && row?.index !== index) return;
        const first = choices._wqaChoiceShown === null;
        choices._wqaChoiceShown = index;
        submit(context, { kind: 'dialogueChoice', text: row?.text || '', first, append: first && !!context.epoch });
    }

    function pageIsCurrent(context) {
        const { scene, window, page } = context;
        return page && currentScene(context) && visible(scene, window) && window.contentsOpacity > 0 &&
            (page.automatic ? !window._wqaDialoguePaint : window._wqaDialoguePaint === page.paint);
    }

    function diagramIsCurrent(context) {
        return context?.diagram && currentScene(context) && context.diagram.live();
    }

    function diagramCommand(context, action) {
        if (!diagramIsCurrent(context)) return false;
        const diagram = context.diagram;
        if (action === 'details') submit(context, { kind: 'menuDetails', lines: diagram.lines });
        else if (action.startsWith('review')) {
            const record = moveReview(diagram, action);
            if (!host.speechPreferences?.().indexing) {
                delete record.position;
                delete record.total;
            }
            submit(context, record);
        } else return false;
        return true;
    }

    function repeatPage() {
        const context = current;
        if (!context || !pageIsCurrent(context)) return diagramCommand(context, 'details');
        const { page } = context;
        const record = {
            kind: 'dialoguePage', text: page.paint.text.slice(0, page.end), speaker: page.paint.speaker
        };
        if (context.epoch) notifications.focus(context.epoch, record);
        else context.epoch = notifications.open(record, () => pageIsCurrent(context));
        return true;
    }

    function suspend() {
        const context = current;
        if (!context) return;
        if (!context.page && !context.diagram) return leave(context.scene);
        if (context.epoch) notifications.close(context.epoch);
        // Retain only the previously presented page. Invalidate any queued
        // render callback, but leave native retirement armed across blur.
        current = { ...context, epoch: 0 };
        context.scene._wqaDialoguePending = false;
    }

    function observe(scene, diagramWaiting) {
        const window = scene._messageWindow;
        const renderer = host.graphics.app?.renderer;
        if (!window || typeof renderer?.once !== 'function' || scene._wqaDialoguePending) return;
        if (current && (current.scene !== scene || current.window !== window)) leave(current.scene);
        if (!current) current = { kind: 'dialogue', scene, window, epoch: 0 };
        const context = current;
        scene._wqaDialogue = scene._wqaDialoguePending = scene._wqaPresentation = true;
        if (diagramWaiting) scene._wqaDiagramAttempts = (scene._wqaDiagramAttempts || 0) + 1;
        try {
            renderer.once('postrender', () => {
                if (current !== context) return;
                scene._wqaDialoguePending = false;
                try { publish(context, diagramWaiting); }
                catch { leave(scene); }
            });
        } catch { leave(scene); }
    }

    if (host.window) {
        host.window.addEventListener('blur', suspend);
        host.window.addEventListener('pagehide', () => { if (current) leave(current.scene); });
    }
    return {
        observe, leave, repeatPage,
        diagramCommand(scene, action) {
            return current?.scene === scene && diagramCommand(current, action);
        },
        controllerOwner(scene) {
            if (!current || current.scene !== scene || current.page?.automatic) return null;
            current.diagramAvailable = current.hasReview = !!diagramIsCurrent(current);
            return current.diagramAvailable || pageIsCurrent(current) ? current : null;
        },
        announce(context, record) {
            if (context === current && (pageIsCurrent(context) || diagramIsCurrent(context))) submit(context, record);
        }
    };
}

module.exports = { createDialogueObserver };
