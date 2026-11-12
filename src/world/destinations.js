'use strict';

const CATEGORY_LABELS = Object.freeze({ all: 'All', objects: 'Objects', people: 'NPC', merchants: 'Merchants', exits: 'Exits',
    events: 'Events', treasure: 'Treasure', enemies: 'Enemies', vehicles: 'Vehicles', quests: 'Quests', bookmarks: 'Bookmarks' });

function eventName(entry) {
    const raw = typeof entry.name === 'string' ? entry.name.trim() : '';
    return raw.length <= 64 && !/^ev(?:ent)?\s*\d+$/i.test(raw)
        ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').trim() : '';
}

function treasureName(entry, page) {
    const sprite = page.image?.characterName || '';
    return /chest|treasure|loot|collectible/i.test(entry.name + ' ' + sprite)
        ? /chest/i.test(sprite) ? 'Chest' : 'Treasure' : '';
}

function destination(entry, page, trigger) {
    if (!page || page.list.length < 2 || trigger < 0 || trigger > 2 || !Number.isInteger(trigger)) return null;
    const raw = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (/^(?:test|debug|developer)/i.test(raw)) return null;
    const name = eventName(entry);
    const sprite = page.image?.characterName || '';
    let shop = false;
    let battle = false;
    let transfer = false;
    let reward = false;
    for (const command of page.list) {
        if (command.code === 302) shop = true;
        else if (command.code === 301) battle = true;
        else if (command.code === 201 && command.indent === 0) transfer = true;
        else if (command.code >= 125 && command.code <= 128) reward = true;
    }
    const treasure = treasureName(entry, page);
    if (treasure) return trigger === 0 ? { category: 'treasure', name: treasure } : null;
    if (shop && trigger === 0) return { category: 'merchants', name: !reward && name || 'Merchant' };
    if (transfer && /^(?:(?:go\s+)?to\s|exit\b)|\b(?:exit|door|stairs)\b/i.test(name)) {
        return { category: 'exits', name: name || 'Exit' };
    }
    if (battle && /enemy|patrol|guard|encounter/i.test(name + ' ' + sprite)) {
        return { category: 'enemies', name: name || 'Enemy' };
    }
    if (trigger !== 0) return null;
    if (/^~|npc/i.test(sprite)) return { category: 'people', name: !reward && name || 'Person' };
    if (reward) return { category: 'objects', name: 'Interaction' };
    if (/^distraction\s*crystal/i.test(name)) return { category: 'objects', name: 'Distraction crystal' };
    if (/^final\s*crystal/i.test(name)) return { category: 'objects', name: 'Crystal' };
    return name ? { category: 'objects', name } : null;
}

// Give eligible native interactions a generic alias. Never use the event's
// name, dialogue text or command parameters for these labels.
function eventDescription(entry, page, event, target) {
    if (target?.category === 'exits' || target?.category === 'vehicles' || /^(?:test|debug|developer)/i.test(entry.name?.trim()))
        return null;
    if ((event._trigger === 1 || event._trigger === 2) && event._priorityType !== 1)
        return { category: 'events', name: 'Scene trigger', eventAction: 'step' };
    if (event._trigger === 0 && target?.category === 'people' && page.list.some(command => command.code === 101))
        return { category: 'events', name: 'Conversation', eventAction: 'talk' };
    return null;
}

function createDestinationBrowser() { return { category: null, selections: Object.create(null) }; }

function browse(state, snapshot, changes) {
    const groups = new Map();
    const all = new Map();
    for (const target of snapshot.objects) {
        if (!groups.has(target.category)) groups.set(target.category, []);
        groups.get(target.category).push(target);
        // Prefer the ordinary identity in All, then a generic event alias,
        // then a quest marker. Keep each alias in its own category.
        const previous = all.get(target.id);
        if (!previous || (previous.category === 'quests' && target.category !== 'quests') ||
            (previous.category === 'events' && target.category !== 'events' && target.category !== 'quests'))
            all.set(target.id, target);
    }
    if (all.size) groups.set('all', [...all.values()]);
    const categories = Object.keys(CATEGORY_LABELS).filter(category => groups.has(category));
    const selectionMissing = !changes.length && state.selections[state.category] !== undefined &&
        !groups.get(state.category)?.some(item => item.id === state.selections[state.category]);
    if (selectionMissing) {
        const selected = state.selections[state.category];
        // Keep the selected live target so Directions can still explain the
        // closed approach or the native event at the end of its safe prefix.
        if (snapshot.eligibleObjects?.some(item => item.id === selected &&
            (state.category === 'all' || item.category === state.category)))
            return { status: 'Selected destination is out of reach' };
        delete state.selections[state.category];
        return { status: 'Selected destination is unavailable' };
    }
    if (!categories.length) return { status: snapshot.eligibleObjects ? 'No reachable destinations here' : 'No destinations here' };
    const closest = items => {
        let nearest = 0;
        const distance = item => item.saved ? Infinity : Math.abs(item.x - snapshot.x) + Math.abs(item.y - snapshot.y);
        for (let index = 1; index < items.length; index++) if (distance(items[index]) < distance(items[nearest])) nearest = index;
        return nearest;
    };
    const relative = (length, index, offset) => (length + index + offset) % length;
    const previousCategory = state.category;
    if (!state.category) state.category = categories.find(category => category !== 'all') || 'all';
    for (const action of changes) {
        if (action === 'previousCategory' || action === 'nextCategory') {
            const index = categories.indexOf(state.category);
            const previous = action === 'previousCategory';
            state.category = categories[index < 0 ? (previous ? categories.length - 1 : 0) :
                relative(categories.length, index, previous ? -1 : 1)];
        } else {
            const items = groups.get(state.category);
            if (!items) continue;
            let index = items.findIndex(item => item.id === state.selections[state.category]);
            if (index < 0) index = closest(items);
            const offset = action === 'previousDestination' ? -1 : 1;
            state.selections[state.category] = items[relative(items.length, index, offset)].id;
        }
    }
    const items = groups.get(state.category);
    if (!items) return { status: 'No ' + (snapshot.eligibleObjects ? 'reachable ' : '') +
        'destinations in ' + CATEGORY_LABELS[state.category] };
    const selection = state.selections[state.category];
    const target = items.find(item => item.id === selection) || items[closest(items)];
    state.selections[state.category] = target.id;
    return { target, category: changes.some(action => action.endsWith('Category')) ||
        (previousCategory && previousCategory !== state.category) ? CATEGORY_LABELS[state.category] : '' };
}

module.exports = { destination, eventDescription, eventName, treasureName, createDestinationBrowser, browse };
