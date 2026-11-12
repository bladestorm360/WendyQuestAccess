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

module.exports = { couponListItem, couponListFocus };
