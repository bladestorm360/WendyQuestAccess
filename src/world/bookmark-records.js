'use strict';

const { MAX_CELLS, MAX_EVENTS } = require('./geometry.cjs');

const BOOKMARK_LIMIT = 64;
const BOOKMARK_NAME_LIMIT = 64;
const ID_LIMIT = 0x7ffffffe;
const BUILD = '26578620';
const MODES = Object.freeze({ walk: 'on foot', boat: 'in the small boat', ship: 'aboard the boat', airship: 'in flight' });
const ENTITY_CATEGORIES = ['objects', 'people', 'merchants', 'exits', 'treasure', 'enemies', 'quests', 'checkpoints'];

function positive(value, limit) { return Number.isInteger(value) && value > 0 && value <= limit; }

function bookmarkName(value) {
    if (typeof value !== 'string') return '';
    const name = value.trim();
    return name.length <= BOOKMARK_NAME_LIMIT && !/[\x00-\x1f\x7f]/.test(name) ? name : '';
}

function location(value) {
    if (!value || !positive(value.map, 999) || !Object.prototype.hasOwnProperty.call(MODES, value.mode)) return null;
    const { map, mode, kind } = value;
    if (kind === 'point' && [value.x, value.y].every(axis => Number.isInteger(axis) && axis >= 0 && axis < MAX_CELLS))
        return { map, mode, kind, x: value.x, y: value.y };
    if (kind === 'entity' && positive(value.event, MAX_EVENTS) && ENTITY_CATEGORIES.includes(value.category))
        return { map, mode, kind, event: value.event, category: value.category };
    return null;
}

function readBookmarks(value) {
    if (value === undefined) return { build: BUILD, version: 1, nextId: 1, entries: [] };
    if (!value || value.build !== BUILD || value.version !== 1 || !positive(value.nextId, ID_LIMIT + 1) ||
        !Array.isArray(value.entries) || value.entries.length > BOOKMARK_LIMIT) return null;
    const entries = [];
    const ids = new Set();
    for (const entry of value.entries) {
        const place = location(entry);
        const name = bookmarkName(entry?.name);
        if (!place || !name || !positive(entry.id, value.nextId - 1) || !positive(entry.revision, ID_LIMIT) ||
            ids.has(entry.id)) return null;
        ids.add(entry.id);
        entries.push({ ...place, id: entry.id, revision: entry.revision, name });
    }
    return { build: BUILD, version: 1, nextId: value.nextId, entries };
}

function changeBookmarks(stored, edit) {
    const book = readBookmarks(stored);
    if (!book) throw Error('Bookmarks storage could not be read.');
    if (edit.type === 'add') {
        const place = location(edit.place);
        if (!place) throw Error('This location is unavailable.');
        if (book.entries.length >= BOOKMARK_LIMIT || book.nextId > ID_LIMIT) throw Error('The bookmark list is full.');
        const id = book.nextId++;
        book.entries.push({ ...place, id, revision: 1, name: 'Bookmark ' + id });
        return book;
    }
    const index = book.entries.findIndex(entry => entry.id === edit.entry?.id);
    const entry = book.entries[index];
    if (!entry || entry.revision !== edit.entry.revision) {
        const conflict = Error('This bookmark changed in another session.');
        conflict.current = book;
        throw conflict;
    }
    if (edit.type === 'remove') book.entries.splice(index, 1);
    else if (edit.type === 'rename') {
        const name = bookmarkName(edit.name);
        if (!name || entry.revision >= ID_LIMIT) throw Error('This bookmark name is unavailable.');
        book.entries[index] = { ...entry, name, revision: entry.revision + 1 };
    } else throw Error('This bookmark change is unavailable.');
    return book;
}

module.exports = { readBookmarks, changeBookmarks, bookmarkName, BOOKMARK_NAME_LIMIT, MODES };
