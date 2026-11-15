'use strict';

const { fieldArt, portraitArt } = require('./character-art');
const { rewardIconArt } = require('../services/dialogue-icons.cjs');
const { readMomentum } = require('../battle/outcomes');
// The six native Ability Obelisk callers use a blank event over a
// painted statue. Their speaking character has no bitmap of its own.
const DAVE_STATUES = new Map([[12, 46], [25, 33], [45, 36], [59, 42], [76, 87], [94, 36]]);
const DAVE_STATUE_ART = [
    'A golden stone bust of a smiling man with swept hair, square glasses and a tie.',
    'Thin green lines run down its sides to a green W at the base, above a round stone platform.'
];

const { renderedSprite } = require('../runtime/rendered-sprite');
const { readNumberFocus } = require('./number-entry');
const { moveReview } = require('../menus/review');

// In these shared conversations the interpreter's event owns the message,
// while the rendered name identifies a different character on the same map.
const SHARED_SPEAKERS = new Map([
    [130, new Map([8, 9].map(id => [id, new Map([['Kennick', 8], ['Joanne', 9]])]))],
    [181, new Map([
        [11, new Map([['Mari & Shari', 0]])],
        [20, new Map([['Lusya', 14]])]
    ])],
    [184, new Map([[11, new Map([['Kathryn', 4]])]])],
    [186, new Map([15, 16].map(id => [id, new Map([['Jay', 15], ['Kitty', 16]])]))]
]);

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
        const victoryMomentum = scene._wqaBattleWon && scene._wqaMomentumPending &&
            host.graphics.frameCount >= scene._wqaMomentumNextFrame;
        // A delayed crystal can still reach the visible HUD after the final
        // reward page closes, before the native battle handback.
        const rewardsClosed = victoryMomentum && window.openness === 0 && !host.gameMessage().hasText();
        if (!context.epoch && !diagram && !rewardsClosed &&
            (!paint || (autoPaint && !pageVisible)) && !choices?.active && !number?.active) {
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
            if (!paint.spoken) {
                paint.speaker = speaker;
                if (!autoPaint) paint.portrait = speakerPortrait(context);
            }
            paint.spoken = paint.end;
            // The draw tracker survives explicit pauses on the same page.
            // Keep the rendered extent and its original name for manual review.
            context.page = { paint, end: paint.end, automatic: !!autoPaint };
            if (!autoPaint) scene._wqaControllerReady = true;
            window._wqaAutoPaint = null;
            host.dialoguePresented?.(scene, paint);
            submit(context, { kind: 'dialoguePage', text, speaker });
        }

        const rewardShown = pageVisible && paint && context.epoch &&
            context.page?.paint === paint && paint.spoken === paint.end;
        if ((rewardShown && (scene._wqaVictoryCondition || victoryMomentum)) || rewardsClosed) {
            const lines = [];
            if (rewardShown && scene._wqaVictoryCondition) {
                lines.push(scene._wqaVictoryCondition);
                scene._wqaVictoryCondition = null;
            }
            if (victoryMomentum) {
                const momentum = readMomentum(scene, host.graphics);
                if (momentum) lines.push(momentum);
            }
            if (lines.length) submit(context, { kind: 'battleLog', lines, append: true });
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

    function speakerPortrait({ window }) {
        const message = host.gameMessage?.();
        const name = message?.faceName?.();
        // The custom message window keeps its prior face key after a
        // portraitless line clears the bitmap.
        const face = window._faceSprite;
        if (name && name === window._lastFaceName && face?.bitmap?.isReady?.() && face.parent === window &&
            face.worldVisible && face.worldAlpha > 0 && face.alpha > 0) return portraitArt(name);
        return '';
    }

    function speakerAppearance(context, speaker) {
        const message = host.gameMessage?.();
        if (message?.faceName?.()) return speakerPortrait(context);
        if (!speaker || !context.scene._wqaMapRestored) return '';
        const owner = message?._wqaSpeakerEvent;
        const map = host.mapId?.();
        if (map === 49 && owner === 14 && speaker === 'Mech Grunts') {
            if ([18, 19, 20, 22].some(id => fieldSpeaker(context, id, speaker)))
                return ['Squat gray robots with rounded helmets, narrow yellow visors and broad red shoulder plates.',
                    'Their thick jointed arms end in dark fists, and their feet are red.'];
            return '';
        }
        const eventId = SHARED_SPEAKERS.get(map)?.get(owner)?.get(speaker) ?? owner;
        return fieldSpeaker(context, eventId, speaker);
    }

    function fieldSpeaker({ scene }, eventId, speaker) {
        const event = host.mapEvent?.(eventId);
        const spriteset = scene._spriteset;
        const sprites = spriteset?._characterSprites;
        if (!event || event._erased || event._transparent || !Array.isArray(sprites) || sprites.length > 512) return '';
        const sprite = sprites.find(item => item._character === event);
        const pose = sprite?.worldTransform;
        if (!pose || !(pose.tx >= 0 && pose.tx <= host.graphics.width &&
            pose.ty >= 0 && pose.ty <= host.graphics.height + 16)) return '';
        const tilemap = spriteset._tilemap;
        if (speaker === 'Dave' && DAVE_STATUES.get(host.mapId?.()) === eventId &&
            event._characterName === '' && sprite.parent === tilemap && tilemap.worldVisible && tilemap.worldAlpha > 0)
            return DAVE_STATUE_ART;
        if (!renderedSprite(sprite, tilemap) || sprite._characterName !== event._characterName ||
            sprite._characterIndex !== event._characterIndex) return '';
        return fieldArt(sprite._characterName, sprite._characterIndex, sprite._frame);
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
        command(scene, action) {
            const context = current;
            if (context?.scene !== scene) return false;
            if (action !== 'speakerDetails' && diagramCommand(context, action)) return true;
            if (action !== 'details' && action !== 'speakerDetails' || !pageIsCurrent(context) ||
                context.page.automatic) return false;
            const { paint, end } = context.page;
            const icon = rewardIconArt(paint.text.slice(0, end));
            if (icon) {
                submit(context, { kind: 'menuDetails', lines: icon });
                return true;
            }
            const speaker = paint.speaker;
            const description = paint.portrait || speakerAppearance(context, speaker);
            if (!description && !speaker) return false;
            const lines = description ? [speaker, ...description].filter(Boolean) : ['No visual description for this speaker.'];
            submit(context, { kind: 'menuDetails', lines });
            return true;
        },
        controllerOwner(scene) {
            if (!current || current.scene !== scene || current.page?.automatic) return null;
            current.diagramAvailable = current.hasReview = !!diagramIsCurrent(current);
            const pageVisible = pageIsCurrent(current);
            current.speakerAvailable = !!(pageVisible && (current.page.paint.speaker || current.page.paint.portrait ||
                rewardIconArt(current.page.paint.text.slice(0, current.page.end))));
            return current.diagramAvailable || pageVisible ? current : null;
        },
        announce(context, record) {
            if (context === current && (pageIsCurrent(context) || diagramIsCurrent(context))) submit(context, record);
        }
    };
}

module.exports = { createDialogueObserver };
