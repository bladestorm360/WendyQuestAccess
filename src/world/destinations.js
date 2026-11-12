'use strict';

const CATEGORY_LABELS = Object.freeze({ objects: 'Objects', people: 'People', merchants: 'Merchants', exits: 'Exits',
    treasure: 'Treasure', enemies: 'Enemies', vehicles: 'Vehicles' });

function destination(entry, page, trigger) {
    if (!page || page.list.length < 2 || trigger < 0 || trigger > 2 || !Number.isInteger(trigger)) return null;
    const raw = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (/^(?:test|debug|developer)/i.test(raw)) return null;
    const name = raw.length <= 64 && !/^ev(?:ent)?\s*\d+$/i.test(raw)
        ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').trim() : '';
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
    if (/chest|treasure|loot|collectible/i.test(raw + ' ' + sprite)) {
        return trigger === 0 ? { category: 'treasure', name: /chest/i.test(sprite) ? 'Chest' : 'Treasure' } : null;
    }
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

function createDestinationBrowser() { return { category: null, selections: Object.create(null) }; }

function browse(state, snapshot, changes) {
    const groups = new Map();
    for (const target of snapshot.objects) {
        if (!groups.has(target.category)) groups.set(target.category, []);
        groups.get(target.category).push(target);
    }
    const categories = Object.keys(CATEGORY_LABELS).filter(category => groups.has(category));
    if (!categories.length) return { status: 'No destinations here' };
    const closest = items => {
        let nearest = 0;
        const distance = item => Math.abs(item.x - snapshot.x) + Math.abs(item.y - snapshot.y);
        for (let index = 1; index < items.length; index++) if (distance(items[index]) < distance(items[nearest])) nearest = index;
        return nearest;
    };
    const relative = (length, index, offset) => (length + index + offset) % length;
    const previousCategory = state.category;
    if (!state.category) state.category = categories[0];
    for (const action of changes) {
        if (action === 'previousCategory' || action === 'nextCategory') {
            const index = categories.indexOf(state.category);
            state.category = categories[index < 0 ? 0 : relative(categories.length, index, action === 'previousCategory' ? -1 : 1)];
        } else {
            if (!groups.has(state.category)) state.category = categories[0];
            const items = groups.get(state.category);
            let index = items.findIndex(item => item.id === state.selections[state.category]);
            if (index < 0) index = closest(items);
            const offset = action === 'previousDestination' ? -1 : 1;
            state.selections[state.category] = items[relative(items.length, index, offset)].id;
        }
    }
    const items = groups.get(state.category);
    const selection = state.selections[state.category];
    const existing = items?.find(item => item.id === selection);
    if (!changes.length && selection !== undefined && !existing) {
        delete state.selections[state.category];
        if (!items) state.category = categories[0];
        return { status: 'Selected destination is unavailable' };
    }
    if (!items) state.category = categories[0];
    const current = groups.get(state.category);
    const target = existing || current[closest(current)];
    state.selections[state.category] = target.id;
    return { target, category: changes.some(action => action.endsWith('Category')) ||
        (previousCategory && previousCategory !== state.category) ? CATEGORY_LABELS[state.category] : '' };
}

module.exports = { destination, createDestinationBrowser, browse };
