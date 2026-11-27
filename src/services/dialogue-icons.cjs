'use strict';

// Labels for the game's 36-pixel atlas cells used by map and common-event
// dialogue. Shared equipment art identifies the category.
const labels = Object.freeze({
    0: '',
    2: 'wooden idol',
    4: 'map scroll',
    5: 'musical notes',
    11: 'Frygor',
    12: 'Frostyna',
    13: 'Sir Chicken',
    14: 'Baconator',
    15: 'Chomps',
    16: 'health',
    17: 'freshness',
    18: 'momentum pip',
    96: 'crossed spatulas',
    129: 'armor',
    130: 'gloves',
    131: 'amulet',
    160: 'salt shaker',
    161: 'pepper grinder',
    176: 'medium soda',
    177: 'Junior Bacon Cheeseburger',
    178: 'Dave’s Single',
    179: 'crispy fries',
    180: 'baked potato',
    181: 'chili cheese fries',
    182: 'Frosty',
    183: 'Frysty',
    192: 'small soda',
    193: 'large soda',
    194: 'napkin',
    195: 'Dave’s Double',
    196: 'Baconator',
    197: 'four spicy nuggets',
    198: 'ten spicy nuggets',
    199: 'spicy chicken sandwich',
    200: 'hot coffee',
    201: 'Frosty Coldbrew',
    202: 'Breakfast Baconator',
    203: 'Biggie Bag'
});

function rewardIcon(text) {
    // The native item-reward message already spells out the name after
    // its leading atlas cell. Keep inline icons in other dialogue.
    if (typeof text !== 'string' || text.length > 384) return null;
    return /^\s*\x01(\d+)\x02\s+([^\x01]{1,140}?\s+acquired!)\s*$/i.exec(text.replace(/\u202B/g, ''));
}

function rewardIconArt(text) {
    const match = rewardIcon(text);
    if (!match) return null;
    const index = Number(match[1]);
    if (index === 177) return ['Item icon. A small cheeseburger with a golden bun and layers of bacon, cheese and lettuce.'];
    return labels[index] ? ['Item icon. ' + labels[index] + '.'] : null;
}

function dialogueIconArt(text) {
    const reward = rewardIconArt(text);
    if (reward) return reward;
    if (typeof text === 'string' && text.length <= 384 && /\x0118\x02/.test(text))
        return ['Momentum pip. A golden diamond with a white border.'];
    return null;
}

function dialogueText(text, reward = false) {
    if (typeof text !== 'string' || text.length > 384) return '';
    if (reward) text = rewardIcon(text)?.[2] ?? text;
    // Dialogue already spells out Momentum and its numeric cost/gain. Keep
    // the decorative pip artwork on Details, without changing native text.
    return text.replace(/\x01(\d+)\x02/g, (_, index) => reward && index === '18' ? ' ' : ` ${labels[index] ?? 'icon'} `)
        .replace(/\u202B/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { dialogueText, rewardIconArt, dialogueIconArt };
