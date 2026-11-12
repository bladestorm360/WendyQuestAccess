'use strict';

const { readBookmarks, changeBookmarks, bookmarkName, BOOKMARK_NAME_LIMIT, MODES } = require('../world/bookmark-records');

const GROUPS = Object.freeze({ 'A through F': 'abcdef', 'G through L': 'ghijkl', 'M through R': 'mnopqr',
    'S through Z': 'stuvwxyz', 'Numbers': '0123456789', 'Space and punctuation': " -'." });
const CHARACTERS = Object.freeze({ ' ': 'Space', '-': 'Hyphen', "'": 'Apostrophe', '.': 'Period' });

function createBookmarkMenu(root, host) {
    const { button, status, active } = host;
    let book = null;
    let storage = null;
    let pending = null;
    let loading = true;

    function load(database, saved) {
        loading = false;
        book = saved?.status === 'fulfilled' ? readBookmarks(saved.value) : null;
        storage = book ? database : null;
    }

    function view(owner, kind, heading, entry, editor) {
        owner.group = 'bookmarks';
        owner.capture = null;
        owner.bookmarkView = { kind, entry, editor };
        owner.heading.textContent = heading;
        owner.status.textContent = '';
        owner.contents.textContent = '';
    }

    function where(owner, entry) {
        const point = owner.bookmarkContext?.point;
        const map = point?.map === entry.map ? 'This map' : 'Map ' + entry.map;
        return map + ', saved ' + MODES[entry.mode];
    }

    function show(owner, selection) {
        view(owner, 'list', 'Bookmarks');
        const location = owner.bookmarkContext;
        const add = (name, place) => button(owner, name, () => edit(owner, { type: 'add', place }, value => {
            const id = value.nextId - 1;
            show(owner, id);
            status(owner, 'Bookmark ' + id + ' saved.');
        }));
        let focused;
        if (book && location?.point) focused = add('Save current location', location.point);
        if (book && location?.entity) add('Bookmark current destination', location.entity);
        for (const entry of book?.entries || []) {
            const item = button(owner, entry.name + ', ' + where(owner, entry), () => details(owner, entry));
            if (entry.id === selection || !focused) focused = item;
        }
        const back = button(owner, 'Back', () => host.back(owner));
        if (loading) status(owner, 'Loading bookmarks.');
        else if (!book) status(owner, 'Bookmarks storage is unavailable.');
        else if (!book.entries.length) status(owner, 'No bookmarks saved.');
        (focused || back).focus();
    }

    function edit(owner, change, done) {
        if (pending) return status(owner, 'Saving bookmark changes.');
        if (!storage) return status(owner, 'Bookmarks storage is unavailable.');
        const page = owner.bookmarkView;
        let operation;
        try { operation = storage.edit('bookmarks', value => changeBookmarks(value, change)); }
        catch { return status(owner, 'Could not save bookmark changes.'); }
        pending = { owner, operation };
        status(owner, 'Saving bookmark changes.');
        const presented = () => active(owner) && owner.group === 'bookmarks' && owner.bookmarkView === page;
        operation.result.then(value => {
            book = value;
            if (presented()) done(value);
        }, error => {
            if (error?.current) book = error.current;
            if (!presented()) return;
            if (error?.current) show(owner, change.entry.id);
            const known = ['The bookmark list is full.', 'This bookmark changed in another session.',
                'This bookmark name is unavailable.', 'This location is unavailable.'];
            status(owner, known.includes(error?.message) ? error.message : 'Could not save bookmark changes.');
        }).finally(() => { pending = null; });
    }

    function details(owner, entry, focus = 'select') {
        view(owner, 'details', entry.name, entry);
        const items = {};
        if (owner.bookmarkContext?.canSelect(entry))
            items.select = button(owner, 'Select for directions', () => host.select(owner, entry));
        items.rename = button(owner, 'Rename bookmark', () => editorPage(owner, { entry, value: entry.name, upper: false }));
        items.remove = button(owner, 'Remove bookmark', () => confirmRemove(owner, entry));
        button(owner, 'Back', () => show(owner, entry.id));
        status(owner, where(owner, entry) + '.');
        (items[focus] || items.select || items.rename).focus();
    }

    function confirmRemove(owner, entry) {
        view(owner, 'remove', 'Remove ' + entry.name, entry);
        const keep = button(owner, 'Keep bookmark', () => details(owner, entry, 'remove'));
        button(owner, 'Confirm removal', () => edit(owner, { type: 'remove', entry }, () => {
            show(owner);
            status(owner, 'Bookmark removed.');
        }));
        keep.focus();
    }

    function saveName(owner, editor) {
        const name = bookmarkName(editor.input.value);
        if (!name) return status(owner, 'Enter a name of 1 to ' + BOOKMARK_NAME_LIMIT + ' characters.');
        edit(owner, { type: 'rename', entry: editor.entry, name }, value => {
            const entry = value.entries.find(item => item.id === editor.entry.id);
            details(owner, entry, 'rename');
            status(owner, 'Bookmark name saved.');
        });
    }

    function editorPage(owner, editor, focus = 'input') {
        view(owner, 'name', 'Rename bookmark', editor.entry, editor);
        const input = editor.input = root.document.createElement('input');
        input.type = 'text';
        input.maxLength = BOOKMARK_NAME_LIMIT;
        input.setAttribute('aria-label', 'Bookmark name');
        input.value = editor.value;
        owner.contents.append(input);
        const choose = button(owner, 'Choose character', () => {
            editor.value = input.value;
            characterGroups(owner, editor);
        });
        button(owner, 'Remove last character', () => {
            const characters = Array.from(input.value);
            characters.pop();
            input.value = characters.join('');
            status(owner, input.value ? 'Name ' + input.value : 'Name cleared.');
        });
        button(owner, 'Clear name', () => {
            input.value = '';
            status(owner, 'Name cleared.');
        });
        button(owner, 'Save name', () => saveName(owner, editor));
        button(owner, 'Cancel', () => details(owner, editor.entry, 'rename'));
        (focus === 'choose' ? choose : input).focus();
    }

    function characterGroups(owner, editor, selection) {
        view(owner, 'groups', 'Choose a character group', editor.entry, editor);
        let focused;
        for (const group of Object.keys(GROUPS)) {
            const item = button(owner, group, () => characters(owner, editor, group));
            if (!focused || group === selection) focused = item;
        }
        button(owner, 'Letter case, ' + (editor.upper ? 'uppercase' : 'lowercase'), () => {
            editor.upper = !editor.upper;
            characterGroups(owner, editor, selection);
        });
        button(owner, 'Back', () => editorPage(owner, editor, 'choose'));
        focused.focus();
    }

    function characters(owner, editor, group) {
        view(owner, 'characters', group, editor.entry, editor);
        owner.bookmarkView.characterGroup = group;
        const options = editor.upper ? GROUPS[group].toUpperCase() : GROUPS[group];
        let first;
        for (const character of options) {
            const item = button(owner, CHARACTERS[character] || character, () => {
                if (editor.value.length + character.length > BOOKMARK_NAME_LIMIT)
                    return status(owner, 'The bookmark name is full.');
                editor.value += character;
                editorPage(owner, editor, 'choose');
                status(owner, 'Name ' + editor.value);
            });
            if (!first) first = item;
        }
        button(owner, 'Back', () => characterGroups(owner, editor, group));
        first.focus();
    }

    return {
        load, show,
        entries: () => book?.entries || [],
        back(owner) {
            const { kind, entry, editor, characterGroup } = owner.bookmarkView;
            if (kind === 'list') host.back(owner);
            else if (kind === 'details') show(owner, entry.id);
            else if (kind === 'groups') editorPage(owner, editor, 'choose');
            else if (kind === 'characters') characterGroups(owner, editor, characterGroup);
            else details(owner, entry, kind === 'remove' ? 'remove' : 'rename');
        },
        textInput(owner, event) {
            const view = owner.bookmarkView;
            if (owner.group !== 'bookmarks' || view?.kind !== 'name' || event.target !== view.editor.input) return false;
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                if (!event.repeat) saveName(owner, view.editor);
            }
            return true;
        },
        retire(owner) { if (pending?.owner === owner) pending.operation.abort(); }
    };
}

module.exports = { createBookmarkMenu };
