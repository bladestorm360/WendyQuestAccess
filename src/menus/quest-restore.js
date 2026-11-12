'use strict';

const { captureQuestPaint } = require('./quest-paint');

const MAX_OBJECTIVES = 4;
const TEXT_METHODS = ['drawNavContents', 'drawQuestTitle', 'drawQuestObjectives', 'drawTextLines', 'drawText', 'drawTextEx',
    'drawQuestIcon', 'drawIconWithSpacing', 'lineHeight', 'convertEscapeCharacters', 'calcTextHeight', 'maxFontSizeInLine',
    'createTextState', 'createTextBuffer', 'processAllText', 'processCharacter', 'processControlCharacter',
    'processNewLine', 'flushTextState', 'textWidth', 'changePaintOpacity', 'translucentOpacity'];

function plainText(text) {
    return typeof text === 'string' && text.length <= 96 && /^[\x20-\x7e\n]*$/.test(text) &&
        !text.includes('\\') && text.split('\n', 4).length <= 3;
}

function restoreQuestPaint(window, gameQuest) {
    const bitmap = window.contents;
    const quest = window._questData;
    const rows = gameQuest.getAllObjectives(window._questId);
    // The pinned database has at most three plain-text objectives. Bound
    // the saved data as well, since an older save can supply the live rows.
    if ((rows !== null && (!Array.isArray(rows) || rows.length > MAX_OBJECTIVES ||
        rows.some(row => !plainText(row?._content) || !Number.isSafeInteger(row._target) ||
            !Number.isSafeInteger(row._finishAmount)))) ||
        (window._transitionTimer > 0 && !plainText(quest._questName)) ||
        (quest._questClearContent !== null && !plainText(quest._questClearContent))) return null;
    const font = bitmap.fontBitmap?.();
    if (!font?.bitmaps || !(bitmap.bitmapFontSize > 0 && bitmap.bitmapFontSize <= 4) ||
        !(bitmap.fontSize > 0 && bitmap.fontSize <= 96) ||
        typeof bitmap.measureTextWidth !== 'function' || typeof bitmap.getTextX !== 'function') return null;

    // The exact installed methods draw into this detached receiver after
    // the native window has finished its only paint. Keep live sprites,
    // contexts, input listeners and resource methods out of the receiver.
    const noop = () => {};
    const contents = {
        width: bitmap.width, fontFace: bitmap.fontFace, fontSize: bitmap.fontSize,
        bitmapFontSize: bitmap.bitmapFontSize, fontBitmap: () => font,
        measureTextWidth: bitmap.measureTextWidth, getTextX: bitmap.getTextX,
        paintOpacity: bitmap.paintOpacity, clear: noop, blt: noop, fillRect: noop, drawText: noop,
        _context: { createLinearGradient: () => ({ addColorStop: noop }), fillRect: noop }
    };
    const shadow = {
        contents, _needContentRefresh: true, _questData: quest, _questId: window._questId,
        _wqaQuestRevision: window._wqaQuestRevision, _globalSettings: window._globalSettings,
        _bgMargin: window._bgMargin, _transitionTime: window._transitionTime, _transitionTimer: window._transitionTimer,
        _transitionState: window._transitionState, _targetTransitionState: window._targetTransitionState,
        _questModeFailing: window._questModeFailing,
        drawNavBackground: noop, drawIcon: noop, changeTextColor: noop, resetTextColor: noop
    };
    for (const name of TEXT_METHODS) {
        if (typeof window[name] !== 'function') return null;
        shadow[name] = window[name];
    }

    const finish = captureQuestPaint(shadow);
    let complete = false;
    try {
        shadow.drawNavContents();
        complete = true;
    } finally {
        finish(complete);
    }
    const draft = shadow._wqaQuestDraft;
    return draft ? { ...draft, bitmap } : null;
}

module.exports = { restoreQuestPaint };
