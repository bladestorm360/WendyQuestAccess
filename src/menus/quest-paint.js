'use strict';

const MAX_DRAWS = 24;
const MAX_TEXT = 96;

// The installed tracker calls Bitmap.drawText for the name, objective text
// runs and numeric counters. Capture the actual calls inside one native paint.
function captureQuestPaint(window) {
    const bitmap = window.contents;
    const original = bitmap?.drawText;
    if (typeof original !== 'function' || typeof bitmap.measureTextWidth !== 'function') return;
    const ownsMethod = Object.prototype.hasOwnProperty.call(bitmap, 'drawText');
    const draws = [];
    const capture = {
        title: false, row: 0, nextRow: 0,
        beginRow() { this.row = ++this.nextRow; },
        endRow() { this.row = 0; }
    };
    function draw(text, x, y, width, height, align) {
        const result = original.apply(this, arguments);
        if (draws.length >= MAX_DRAWS || typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT ||
            !Number.isFinite(x) || !Number.isFinite(y) || !(width > 0) || !(height > 0) ||
            !(this.paintOpacity > 0)) return result;
        let measured;
        try { measured = Math.min(width, this.measureTextWidth(text)); }
        catch { return result; }
        const left = align === 'right' ? x + width - measured : align === 'center' ? x + (width - measured) / 2 : x;
        if (Number.isFinite(measured) && measured > 0) {
            draws.push({ text, left, right: left + measured, top: y, bottom: y + height,
                title: capture.title, row: capture.row, count: align === 'right' && /^\d+\/\d+$/.test(text) });
        }
        return result;
    }
    bitmap.drawText = draw;
    window._wqaQuestCapture = capture;
    return success => {
        if (bitmap.drawText === draw) {
            if (ownsMethod) bitmap.drawText = original;
            else delete bitmap.drawText;
        }
        window._wqaQuestCapture = null;
        if (success && draws.length) window._wqaQuestDraft = { bitmap, quest: window._questData, id: window._questId,
            revision: window._wqaQuestRevision, draws };
    };
}

function drawnQuestPage(window, draft, graphics) {
    const sprite = window._contentsSprite;
    const pose = sprite?.worldTransform;
    if (!sprite?.worldVisible || !(sprite.worldAlpha > 0) || sprite.bitmap !== draft.bitmap ||
        !pose || pose.b !== 0 || pose.c !== 0 || !(pose.a > 0) || !(pose.d > 0) ||
        !Number.isFinite(pose.tx) || !Number.isFinite(pose.ty) ||
        !(graphics.width > 0) || !(graphics.height > 0)) return null;
    const width = Math.min(window.innerWidth, draft.bitmap.width);
    const height = Math.min(window.innerHeight, draft.bitmap.height);
    const rows = new Map();
    const trailing = [];
    let title = '';
    for (const draw of draft.draws) {
        // Contents are cropped by the client area as well as the viewport.
        const { left, right, top, bottom } = draw;
        if (left < 0 || right > width || top < 0 || bottom > height ||
            pose.tx + pose.a * left < 0 || pose.tx + pose.a * right > graphics.width ||
            pose.ty + pose.d * top < 0 || pose.ty + pose.d * bottom > graphics.height) continue;
        const text = draw.text.trim();
        if (draw.title) title = text;
        else if (!draw.row) trailing.push(text);
        else {
            let row = rows.get(draw.row);
            if (!row) rows.set(draw.row, row = { text: [], progress: null });
            if (draw.count) row.progress = text.split('/').map(Number);
            else row.text.push(text);
        }
    }
    let first = '';
    let incomplete = '';
    const lines = [];
    for (const row of rows.values()) {
        if (!row.text.length) continue;
        const text = row.text.join(' ');
        const line = row.progress ? `${text}. ${row.progress[0]} of ${row.progress[1]}` : text;
        first ||= line;
        if (row.progress && row.progress[0] < row.progress[1]) incomplete ||= line;
        lines.push(line);
    }
    return { title, lines: [...lines, ...trailing], first: incomplete || first || trailing[0] || '' };
}

module.exports = { captureQuestPaint, drawnQuestPage };
