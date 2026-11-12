'use strict';

const MAX_LINE = 96;
const MAX_LINES = 8;

function reviewLines(lines) {
    // This adapter's native pages fit in one detail utterance. Keep logical
    // lines and equal-text rows so a later review never changes native order.
    return lines.filter(line => typeof line === 'string' && line.trim() && line.length <= MAX_LINE).slice(0, MAX_LINES);
}

function moveReview(page, action) {
    const end = page.lines.length - 1;
    if (action === 'reviewFirst') page.position = 0;
    else if (action === 'reviewLast') page.position = end;
    else if (action === 'reviewPrevious') page.position = Math.max(0, page.position - 1);
    else if (action === 'reviewNext') page.position = Math.min(end, page.position + 1);
    return { kind: 'menuReview', name: page.lines[page.position], position: page.position + 1, total: end + 1 };
}

module.exports = { reviewLines, moveReview };
