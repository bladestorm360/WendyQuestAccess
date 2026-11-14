'use strict';

const NON_INTERACTION_COMMANDS = new Set([0, 108, 214, 408, 657]);
const WEATHER_SETUP_COMMANDS = new Set([0, 108, 223, 224, 225, 230, 236, 245, 246, 250, 408, 657]);
const SENSITIVE_NAME = /\b(?:gold|coins?|reward|easter\s*egg)\b/i;
const CATEGORY_LABELS = Object.freeze({ all: 'All', objects: 'Objects', people: 'NPC', merchants: 'Merchants', exits: 'Exits',
    events: 'Events', treasure: 'Treasure', enemies: 'Enemies', vehicles: 'Vehicles', quests: 'Quests', bookmarks: 'Bookmarks' });

function eventName(entry) {
    const raw = typeof entry.name === 'string' ? entry.name.trim() : '';
    return raw.length <= 64 && !/^ev(?:ent)?\s*\d+$/i.test(raw)
        ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').trim() : '';
}

function treasureName(entry, page) {
    const sprite = page.image?.characterName || '';
    const visual = sprite || entry.name || '';
    if (/barrel/i.test(visual)) return 'Barrel';
    if (/pantry/i.test(visual)) return 'Pantry';
    if (/chest/i.test(visual)) return 'Chest';
    return /treasure|loot|collectible/i.test(visual) ? 'Treasure' : '';
}

function bookName(entry) {
    const name = entry.name || '';
    if (/book\s*case|book\s*shelf|^books$/i.test(name)) return 'Bookcase';
    return /book|\bdiary\b|guide to combat|combat\s*volume|^woa\s+easter egg\b/i.test(name) ? 'Book' : '';
}

function excludedDestination(entry, page) {
    if (typeof entry.name === 'string' && /^(?:play[ _-]?test|test|debug|developer)/i.test(entry.name.trim()))
        return true;
    // A blank event may still be a real interaction with an independently
    // drawn prop. Omit only pages that set weather and have no other effects
    // beyond presentation, audio, comments and waits.
    return !page.image?.characterName && !page.image?.tileId &&
        page.list.some(command => command.code === 236) &&
        page.list.every(command => WEATHER_SETUP_COMMANDS.has(command.code));
}

function destination(entry, page, trigger, map) {
    if (!page || page.list.length < 2 || trigger < 0 || trigger > 2 || !Number.isInteger(trigger)) return null;
    const name = eventName(entry);
    const sprite = page.image?.characterName || '';
    const npc = /^~|npc/i.test(sprite);
    let shop = false;
    let battle = false;
    let transfer = false;
    let warp = false;
    let reward = false;
    let speaker = '';
    let conversation = false;
    let activeCommand = false;
    for (const command of page.list) {
        if (!NON_INTERACTION_COMMANDS.has(command.code)) activeCommand = true;
        if (npc && command.code === 101) {
            conversation = true;
            const label = command.parameters?.[4];
            // The speaker field also works without a face graphic. Skip
            // Wendy and text-control labels before choosing the NPC name.
            if (!speaker && typeof label === 'string' && label.length <= 48) {
                const candidate = label.trim();
                if (candidate.toLowerCase() !== 'wendy' && !/[\\<>]/.test(candidate) && /\p{L}/u.test(candidate))
                    speaker = candidate;
            }
        }
        if (command.code === 302) shop = true;
        else if (command.code === 301) battle = true;
        else if (command.code === 201 && command.indent === 0) {
            if (command.parameters?.[0] === 0 && command.parameters[1] === map) warp = true;
            else transfer = true;
        } else if (command.code >= 125 && command.code <= 128) reward = true;
    }
    // A completed encounter can leave an invisible action page whose only
    // effect is to erase itself. Keep native collision, but omit the entry.
    if (trigger === 0 && !activeCommand) return null;
    const treasure = treasureName(entry, page);
    if (treasure && trigger === 0) return { category: ['Barrel', 'Pantry'].includes(treasure) ? 'objects' : 'treasure', name: treasure };
    const book = trigger === 0 && bookName(entry);
    if (book) return { category: 'objects', name: book };
    if (warp && !transfer) return { category: 'objects', name: 'Warp tile',
        ...(trigger !== 0 ? { eventAction: page.priorityType === 1 ? 'bump' : 'step' } : {}) };
    const safeName = !SENSITIVE_NAME.test(name) && name;
    if (shop && trigger === 0) return { category: 'merchants', name: !reward && safeName || 'Merchant' };
    if (transfer && /^(?:(?:go\s+)?to\s|exit\b)|\b(?:exit|door|stairs)\b/i.test(name))
        return { category: 'exits', name: safeName || 'Exit',
            ...(trigger !== 0 && page.priorityType === 1 ? { eventAction: 'bump' } : {}) };
    if (battle && (!sprite || /ambush/i.test(name))) return { category: 'events', name: 'Scene trigger',
        ...(trigger !== 0 ? { eventAction: page.priorityType === 1 ? 'bump' : 'step' } : {}) };
    if (battle && sprite && (trigger === 0 || page.priorityType === 1) &&
        (/^~/.test(sprite) || /enemy|patrol|guard|encounter/i.test(name)))
        return { category: 'enemies', name: safeName || 'Enemy' };
    if (trigger !== 0) return null;
    if (npc) return { category: 'people',
        name: speaker || safeName || 'Person',
        ...(conversation ? { eventAction: 'talk' } : {}) };
    if (reward || SENSITIVE_NAME.test(name))
        return { category: 'objects', name: 'Interaction' };
    if (/^distraction\s*crystal/i.test(name)) return { category: 'objects', name: 'Distraction crystal' };
    if (/^final\s*crystal/i.test(name)) return { category: 'objects', name: 'Crystal' };
    return name ? { category: 'objects', name } : null;
}

// Classify only otherwise unlisted native touch events. Authored names
// and dialogue never enter this generic description.
function eventDescription(entry, page, event, keepCleanup) {
    if (![1, 2].includes(event._trigger)) return null;
    if (!keepCleanup && !page.list.some(command => !NON_INTERACTION_COMMANDS.has(command.code))) return null;
    if (event._priorityType !== 1) return { category: 'events', name: 'Scene trigger', eventAction: 'step' };
    if (page.list.some(command => command.code === 101 || command.code === 301))
        return { category: 'events', name: 'Scene trigger', eventAction: 'bump' };
    return null;
}

function createDestinationBrowser() { return { category: null, selections: Object.create(null) }; }

function browse(state, snapshot, changes) {
    const groups = new Map();
    const all = new Map();
    for (const target of snapshot.objects) {
        if (!groups.has(target.category)) groups.set(target.category, []);
        groups.get(target.category).push(target);
        // Use the ordinary identity in All if it also has a quest marker.
        const previous = all.get(target.id);
        if (!previous || (previous.category === 'quests' && target.category !== 'quests'))
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
    // Rank the current snapshot once per command, including local bookmarks.
    // Native event order is the tie-breaker. Remote bookmarks have no tile here.
    const distances = new Map();
    for (const item of snapshot.objects) {
        let dx = Math.abs(item.x - snapshot.x);
        let dy = Math.abs(item.y - snapshot.y);
        if (snapshot.scrollType & 2) dx = Math.min(dx, snapshot.width - dx);
        if (snapshot.scrollType & 1) dy = Math.min(dy, snapshot.height - dy);
        distances.set(item, Number.isFinite(dx + dy) ? dx + dy : Infinity);
    }
    for (const items of groups.values()) items.sort((a, b) => distances.get(a) - distances.get(b));
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
            const offset = action === 'previousDestination' ? -1 : 1;
            // A fresh category or an expired target starts at the nearest.
            state.selections[state.category] = items[index < 0 ? 0 : relative(items.length, index, offset)].id;
        }
    }
    const items = groups.get(state.category);
    if (!items) return { status: 'No ' + (snapshot.eligibleObjects ? 'reachable ' : '') +
        'destinations in ' + CATEGORY_LABELS[state.category] };
    const selection = state.selections[state.category];
    const target = items.find(item => item.id === selection) || items[0];
    state.selections[state.category] = target.id;
    return { target, category: changes.some(action => action.endsWith('Category')) ||
        (previousCategory && previousCategory !== state.category) ? CATEGORY_LABELS[state.category] : '' };
}

const encounterPages = new WeakMap();

function movingEnemy(page) {
    // Authored pages are immutable. Cache the command-list check so the
    // first snapshot classifies each candidate and subsequent steps reuse it.
    if (!(page?.moveType > 0 && page.priorityType === 1 && !page.through &&
        [0, 1, 2].includes(page.trigger) && page.image?.characterName?.startsWith('~'))) return false;
    if (!encounterPages.has(page)) {
        const list = page.list;
        encounterPages.set(page, Array.isArray(list) && list.length <= 192 && list.some(command => command.code === 301));
    }
    return encounterPages.get(page);
}

function activeMovingEnemy(root, event) {
    return !!(event && !event._erased && !event._through && event._priorityType === 1 &&
        movingEnemy(root.$dataMap?.events?.[event._eventId]?.pages?.[event._pageIndex]));
}

module.exports = { destination, excludedDestination, eventDescription, eventName, treasureName, createDestinationBrowser, browse, movingEnemy, activeMovingEnemy };
