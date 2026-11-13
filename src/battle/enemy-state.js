'use strict';

const { visibleSprite } = require('./presentation');

// The installed IconSet reuses these frames across several native states.
// Use the shared meaning visible in the icon and leave the variants private.
const SHARED_ICONS = new Map([
    [7, 'Rage or spicy'], [65, 'Frozen or frosted'], [72, 'Regeneration'], [81, 'Crispy']
]);

function enemyIconIndex(root, sprite) {
    const icon = sprite._stateIconSprite;
    if (!visibleSprite(sprite, icon) || icon._battler !== sprite._enemy) return 0;
    const index = icon._iconIndex;
    const frame = icon._frame;
    const width = root.ImageManager?.iconWidth;
    const height = root.ImageManager?.iconHeight;
    if (!Number.isInteger(index) || index <= 0 || !Number.isInteger(width) || !Number.isInteger(height) ||
        width <= 0 || height <= 0 || frame?.width !== width || frame.height !== height ||
        frame.x !== index % 16 * width || frame.y !== Math.floor(index / 16) * height ||
        frame.x + width > icon.bitmap.width || frame.y + height > icon.bitmap.height) return 0;
    return index;
}

function parameterIcon(root, index) {
    const base = root.Game_BattlerBase;
    const raised = index - base?.ICON_BUFF_START;
    const lowered = index - base?.ICON_DEBUFF_START;
    const raise = raised >= 0 && raised < 16;
    const offset = raise ? raised : lowered;
    if (!Number.isInteger(offset) || offset < 0 || offset >= 16) return '';
    const name = root.TextManager?.param?.(offset % 8);
    if (typeof name !== 'string' || !name || name.length > 24) return '';
    return name + (raise ? ' up' : ' down') + (offset >= 8 ? ', strong' : '');
}

function enemyState(root, sprite) {
    const index = enemyIconIndex(root, sprite);
    if (!index) return '';
    const shared = SHARED_ICONS.get(index);
    if (shared) return shared;
    const states = root.$dataStates;
    if (Array.isArray(states) && states.length <= 64) {
        const match = states.find(state => state?.iconIndex === index);
        if (typeof match?.name === 'string' && match.name && match.name.length <= 24) return match.name;
    }
    return parameterIcon(root, index) || 'Status icon';
}

module.exports = { enemyState, enemyIconIndex };