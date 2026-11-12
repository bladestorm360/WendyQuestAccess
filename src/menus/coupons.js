'use strict';

const { drawnText, visibleSprite } = require('../battle/presentation');

// The installed five-frame atlas and item names share this native order.
const STONES = ['Fry Stone', 'Frosty Stone', 'Spicy Stone', 'Breakfast Stone', 'Beef Stone'];

function couponListItem(window) {
    const sprites = window.sprites;
    const index = window._index;
    if (!Array.isArray(sprites) || sprites.length !== STONES.length || !Number.isInteger(index)) return null;
    if (index === -1) return window.titleText;
    const sprite = sprites[index];
    return visibleSprite(window._clientArea, sprite) ? sprite : null;
}

function couponListFocus(window) {
    const item = couponListItem(window);
    const index = window._index;
    if (!item || !drawnText(window, window.titleText, 64)) return null;
    if (index === -1) return { item, name: 'No reward selected', enabled: true };
    // The locked cell presents just a padlock. The name is available when the
    // correct stone artwork is attached and its native frame is visible.
    if (item.bitmap === window.lockBitmap) return { item, name: 'Locked reward', enabled: false };
    const frame = item._frame;
    if (item.bitmap !== window.stonesBitmap || frame?.x !== index * 64 || frame.y !== 0 ||
        frame.width !== 64 || frame.height !== 64) return null;
    return { item, name: STONES[index], enabled: true };
}

function couponResponseItem(window) {
    const index = window._index;
    if (!window._ready || !visibleSprite(window, window.backButton)) return null;
    if (index === -1) return window.titleText;
    if (index === 0) return window.backButton;
    const button = index === 1 ? window._button1 : index === 2 ? window._button2 : null;
    return visibleSprite(window._clientArea, button) ? button : null;
}

function paragraph(window, sprite) {
    const text = drawnText(window._clientArea, sprite, 512);
    if (!text) return [];
    // Sprite_Text creates glyph children in line order. The inner window
    // clips text outside its client area, even when the sprite is visible.
    const shown = [];
    let offset = 0;
    for (const line of text.split('\n')) {
        const glyph = sprite.children[offset];
        offset += line.length;
        const y = sprite.y + glyph?.y;
        if (!line.trim() || (y >= 0 && y < window.innerHeight)) shown.push(line.trim());
    }
    const lines = [];
    for (const block of shown.join('\n').split(/\n\n+/)) {
        let remaining = block.replace(/\n/g, ' ').trim();
        while (remaining.length > 96) {
            const boundary = remaining.lastIndexOf(' ', 96);
            const end = boundary > 0 ? boundary : 96;
            lines.push(remaining.slice(0, end));
            remaining = remaining.slice(end).trimStart();
        }
        if (remaining) lines.push(remaining);
    }
    return lines;
}

function couponResponseFocus(window) {
    const item = couponResponseItem(window);
    if (!item) return null;
    const area = window._clientArea;
    const title = paragraph(window, window.titleText).join(' ');
    if (!title || title.length > 144) return null;
    const index = window._index;
    const code = visibleSprite(area, window._button1) ?
        drawnText(window._button1, window._wqaCouponCodeText, 64).trim() : '';
    let name = title;
    if (index === 0) name = 'Back';
    else if (index === 1) name = code ? 'Copy coupon code' : drawnText(item, window._wqaCouponButton1Text, 64);
    else if (index === 2) name = drawnText(item, window._wqaCouponButton2Text, 64);
    if (!name) return null;
    const publicLines = [window.titleText, window.bodyText, window.subTitleText1, window.bodyText1,
        window.subTitleText2, window.bodyText2].flatMap(sprite => paragraph(window, sprite));
    const privateLines = [];
    if (code) {
        // Only explicit review reads the code, from its presented button.
        const characters = Array.from(code, char => char === '-' ? 'dash' : char === ' ' ? 'space' : char);
        for (let offset = 0; offset < characters.length; offset += 12)
            privateLines.push('Coupon code, ' + characters.slice(offset, offset + 12).join(' '));
    }
    return { item, name, title, publicLines, lines: [...publicLines, ...privateLines] };
}

module.exports = { couponListItem, couponListFocus, couponResponseItem, couponResponseFocus };
