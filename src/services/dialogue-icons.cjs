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

function dialogueText(text) {
    if (typeof text !== 'string' || text.length > 384) return '';
    return text.replace(/\x01(\d+)\x02/g, (_, index) => ` ${labels[index] ?? 'icon'} `)
        .replace(/\u202B/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = { dialogueText };
