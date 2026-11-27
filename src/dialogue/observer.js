'use strict';

const { enemyArt, fieldArt, portraitArt } = require('./character-art');
const { dialogueIconArt } = require('../services/dialogue-icons.cjs');
const { readMomentum } = require('../battle/outcomes');
// These blank events sit over the obelisks painted in the tilemap.
const DAVE_STATUES = new Map([
    [12, 46], [25, 33], [45, 36], [59, 42], [76, 87], [94, 36], [197, 11], [206, 14]
]);
const COMPUTERS = new Map([[104, 78], [105, 73]]);
const COMPUTER_ART = [
    'A gray desktop computer has a blue screen covered in rows of green characters.',
    'Small yellow, green and pink lights sit above the screen, with a compact keyboard below.'
];

const DAVE_STATUE_ART = [
    'A golden stone bust of a smiling man with swept hair, square glasses and a tie.',
    'Thin green lines run down its sides to a green W at the base, above a round stone platform.'
];

const { renderedSprite } = require('../runtime/rendered-sprite');
const { readNumberFocus } = require('./number-entry');
const { moveReview } = require('../menus/review');

// In these shared conversations the interpreter's event owns the message,
// while the rendered name identifies a different character on the same map.
const SHARED_SPEAKERS = new Map();
function bindSpeakers(map, owners, speakers) {
    if (!SHARED_SPEAKERS.has(map)) SHARED_SPEAKERS.set(map, new Map());
    const conversations = SHARED_SPEAKERS.get(map);
    for (const owner of owners) conversations.set(owner, speakers);
}

bindSpeakers(43, [1], { 'Mech Grunts': [6, 7] });
bindSpeakers(46, [1], { 'Mech Grunt': [3] });
bindSpeakers(47, [1], { 'Mech Grunt': [3], 'Mech Grunts': [2, 4] });
bindSpeakers(49, [14], { 'Mech Grunts': [18, 19, 20, 22] });
for (const [map, actor] of [[54, 9], [56, 6], [64, 8], [88, 5], [95, 5]])
    bindSpeakers(map, [2], { Kathryn: [actor] });
bindSpeakers(57, [6, 7, 8, 9, 10, 11, 12, 23, 24, 25], { 'Mech Grunt': [1, 2] });
bindSpeakers(58, [6, 7, 8, 9, 10, 11, 12, 20, 24, 25], { 'Mech Grunt': [1, 2] });
bindSpeakers(60, [87], { Archaeologist: [3] });
bindSpeakers(76, [50, 51, 54], { Eggward: [49] });
bindSpeakers(89, [1], { 'Mech Grunt 1': [2, 4], 'Mech Grunt 2': [4, 2], 'Mech Grunts': [2, 4] });
bindSpeakers(103, [2, 3, 4, 16, 17, 18, 19], { 'Mysterious Person': [9] });
bindSpeakers(105, [5], { Kathryn: [7], Toby: [8], Willie: [9], Tyler: [10], Veronica: [61] });
bindSpeakers(107, [3], { 'Frygor?': [5] });
bindSpeakers(108, [3], { 'Mech Grunt': [6], 'Mech Grunts': [4, 5] });
bindSpeakers(110, [4], { 'Mech Grunt': [6] });
bindSpeakers(112, [4], { 'Mech Grunt 1': [6, 7], 'Mech Grunt 2': [7, 6], 'Mech Grunts': [6, 7] });
bindSpeakers(114, [3], { 'Mech Grunts': [7, 8] });
bindSpeakers(130, [8, 9], { Kennick: [8], Joanne: [9] });
bindSpeakers(150, [6], { Helly: [5] });
bindSpeakers(151, [6], { Shelly: [5] });
for (const map of [181, 182, 183, 184, 186]) bindSpeakers(map, [5], { Kathryn: [4] });
bindSpeakers(181, [11], { 'Mari & Shari': [12, 13] });
bindSpeakers(181, [15], { Tyler: [7] });
bindSpeakers(181, [20], { Lusya: [14] });
bindSpeakers(184, [11], { Kathryn: [4] });
bindSpeakers(186, [15, 16], { Jay: [15], Kitty: [16] });
bindSpeakers(190, [24], { 'Son of Baconator': [9] });
bindSpeakers(197, [18], { Dave: [11] });
bindSpeakers(200, [5], { 'Patrolling Mech': [4] });
bindSpeakers(206, [11], { Dave: [14] });
bindSpeakers(239, [1], { Tyler: [7] });

const MECH_GRUNTS_ART = [
    'Squat gray robots with rounded helmets, narrow yellow visors and broad red shoulder plates.',
    'Their thick jointed arms end in dark fists, and their feet are red.'
];

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
        if (context.epoch && (!notifications.current || notifications.current(context.epoch)))
            notifications.focus(context.epoch, record);
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
            const record={ kind: 'dialoguePage', text, speaker };
            // Automatic text has no player-held pause. Once its glyphs have
            // actually rendered, retain this same speech through native close
            // and resource handoff instead of retiring it with the window.
            const confirmed=autoPaint&&notifications.confirmedPage?.(record,()=>currentScene(context));
            if(confirmed)context.epoch=confirmed;
            else submit(context, record);
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
        if (!speaker) return '';
        const { scene } = context;
        if (!scene._wqaMapRestored) {
            // The paired robot battler has unportrayed dialogue during its encounter.
            const sprites = scene._spriteset?._enemySprites;
            if (scene._wqaBattleStarted && speaker === 'Mech Double' && Array.isArray(sprites) &&
                sprites.length <= 16 && sprites.some(sprite => sprite?._battlerName === 'MechDouble' &&
                    renderedSprite(sprite, scene._spriteset._battleField))) return enemyArt('MechDouble');
            return '';
        }
        if (speaker === 'Wendy') return fieldSpeaker(context, host.fieldPlayer?.(), speaker);
        const owner = message?._wqaSpeakerEvent;
        const map = host.mapId?.();
        const bindings = SHARED_SPEAKERS.get(map)?.get(owner);
        // An audited shared speaker must never fall back to the caller's sprite.
        const speakers = bindings && Object.prototype.hasOwnProperty.call(bindings, speaker) ? bindings[speaker] : [owner];
        for (const id of speakers) {
            const event = host.mapEvent?.(id);
            const description = fieldSpeaker(context, event, speaker, id);
            if (!description) continue;
            if (speaker === 'Mech Grunts' && event._characterName === '~MechGrunt') return MECH_GRUNTS_ART;
            return description;
        }
        return '';
    }

    function fieldSpeaker({ scene }, event, speaker, eventId) {
        const spriteset = scene._spriteset;
        const sprites = spriteset?._characterSprites;
        if (!event || event._erased || event._transparent || !Array.isArray(sprites) || sprites.length > 512) return '';
        const sprite = sprites.find(item => item._character === event);
        const pose = sprite?.worldTransform;
        if (!pose || !(pose.tx >= 0 && pose.tx <= host.graphics.width &&
            pose.ty >= 0 && pose.ty <= host.graphics.height + 16)) return '';
        const tilemap = spriteset._tilemap;
        // These audited blank anchors cover the same six computer tiles.
        if (speaker === 'Computer' && COMPUTERS.get(host.mapId?.()) === eventId &&
            event._characterName === '' && sprite.parent === tilemap && tilemap.worldVisible && tilemap.worldAlpha > 0)
            return COMPUTER_ART;
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
            const icon = dialogueIconArt(paint.text.slice(0, end));
            if (icon) {
                submit(context, { kind: 'menuDetails', lines: icon });
                return true;
            }
            const speaker = paint.speaker;
            const description = paint.portrait || speakerAppearance(context, speaker);
            const lines = description ? [speaker, ...description].filter(Boolean) : ['No visual description for this speaker.'];
            submit(context, { kind: 'menuDetails', lines });
            return true;
        },
        controllerOwner(scene) {
            if (!current || current.scene !== scene || current.page?.automatic) return null;
            current.diagramAvailable = current.hasReview = !!diagramIsCurrent(current);
            const pageVisible = pageIsCurrent(current);
            current.speakerAvailable = !!(pageVisible && (current.page.paint.speaker || current.page.paint.portrait ||
                dialogueIconArt(current.page.paint.text.slice(0, current.page.end))));
            return current.diagramAvailable || pageVisible ? current : null;
        },
        announce(context, record) {
            if (context === current && (pageIsCurrent(context) || diagramIsCurrent(context))) submit(context, record);
        }
    };
}

module.exports = { createDialogueObserver };
