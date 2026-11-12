'use strict';

const { DEFAULT_KEYS, PUZZLE_KEYS, REVIEW_KEYS, keyName, nativeConflict, normalizeKeys, puzzleGesture, reviewGesture } = require('./keyboard');
const { openSettings } = require('./storage');
const { ACTIONS, DEFAULTS: NAVIGATION_DEFAULTS, LAYOUT_NAMES, navigationGesture, nativeNavigationConflict,
    normalizeNavigation, navigationAction, gestureName } = require('./navigation-keys');
const { FIELD_ACTIONS, ACTION_NAMES, buttonBit, buttonName, bindingAllowed,
    normalizeController, canUnassign } = require('./controller-bindings');
const { SOUNDSCAPE, normalizeSoundscape } = require('./soundscape-preferences');
const { createBookmarkMenu } = require('./bookmark-menu');

const LABELS = Object.freeze({ settings: 'Open mod settings', repeat: 'Repeat dialogue',
    puzzleGuide: 'Start or review puzzle guidance', puzzleStop: 'Stop puzzle guidance',
    details: 'Read details', reviewPrevious: 'Previous review line', reviewNext: 'Next review line',
    reviewFirst: 'First review line', reviewLast: 'Last review line' });
const POINTER_EVENTS = ['mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel'];
const AUDIO_PREVIEWS = [
    ['ahead', [0, 0, 1]], ['left', [-1, 0, 0]], ['right', [1, 0, 0]],
    ['behind', [0, 0, -1]], ['above', [0, 1, 0]]
];
const audioGroup = group => group === 'audio' || group === 'soundscape' || group === 'soundscapeCategory';

function normalizeAudio(value) {
    const volume = value?.wallVolume;
    const beaconVolume = value?.beaconVolume;
    const caveVolume = value?.caveVolume;
    return { enabled: value?.enabled !== false, hrtf: value?.hrtf !== false, wall: value?.wall === true,
        wallVolume: Number.isInteger(volume) && volume >= 0 && volume <= 100 ? volume : 65,
        beacon: value?.beacon === true,
        beaconVolume: Number.isInteger(beaconVolume) && beaconVolume >= 0 && beaconVolume <= 100 ? beaconVolume : 65,
        caveTiming: value?.caveTiming === true,
        caveVolume: Number.isInteger(caveVolume) && caveVolume >= 0 && caveVolume <= 100 ? caveVolume : 65,
        soundscape: normalizeSoundscape(value?.soundscape) };
}

function createSettingsMenu(root, host) {
    let session = null;
    let keys = normalizeKeys(DEFAULT_KEYS);
    let pad = normalizeController();
    let navigation = normalizeNavigation();
    let audio = normalizeAudio();
    let speech = { enabled: true, autodetail: false, indexing: false };
    let storage = null;
    let loading = true;
    let saving = false;
    let resumeOnFocus = null;
    const down = new Set();
    const held = new Set();
    const touching = new Set();
    const heldTouches = new Set();
    let mouseDown = false;
    let heldMouse = false;
    const bookmarks = createBookmarkMenu(root, {
        button, status,
        active: owner => session === owner,
        back: owner => showNavigation(owner, 'bookmarks'),
        select(owner, entry) {
            if (host.selectBookmark(owner.scene, entry)) close(owner.scene, true);
            else status(owner, 'This bookmark is unavailable here.');
        }
    });

    openSettings(root.indexedDB).then(async database => {
        // A failed read for another settings group cannot erase a saved mute.
        const results = await Promise.allSettled([
            database.read(), database.read('controller'), database.read('navigation'), database.read('audio'),
            database.read('speech'), database.read('bookmarks')]);
        const [keyboard, controller, savedNavigation, savedAudio, savedSpeech] = results.map(result => result.value);
        keys = normalizeKeys(keyboard);
        pad = normalizeController(controller);
        navigation = normalizeNavigation(savedNavigation, [keys.puzzleGuide, keys.puzzleStop]);
        audio = normalizeAudio(savedAudio);
        speech = { enabled: savedSpeech?.enabled !== false, autodetail: savedSpeech?.autodetail === true,
            indexing: savedSpeech?.indexing === true };
        host.controllerChanged();
        host.navigationChanged(navigation);
        host.audioChanged(audio);
        bookmarks.load(database, results[5]);
        storage = database;
    }).catch(() => bookmarks.load(null)).finally(() => {
        loading = false;
        host.speechChanged(speech);
        if (session?.group) showGroup(session, session.selected);
    });

    function button(owner, label, activate) {
        const node = root.document.createElement('button');
        node.type = 'button';
        node.textContent = label;
        node.addEventListener('click', () => { if (session === owner) activate(); });
        owner.contents.append(node);
        return node;
    }

    function showRoot(owner, selection = 'keyboard') {
        if (audioGroup(owner.group)) host.audioStop(owner.scene);
        owner.group = false;
        owner.capture = null;
        owner.heading.textContent = 'WendyQuest accessibility settings';
        owner.status.textContent = '';
        owner.contents.textContent = '';
        const groups = {
            keyboard: button(owner, 'Keyboard bindings', () => showKeyboard(owner)),
            controller: button(owner, 'Controller bindings', () => showController(owner)),
            speech: button(owner, 'Speech', () => showSpeech(owner)),
            navigation: button(owner, 'Navigation', () => showNavigation(owner)),
            audio: button(owner, 'Audio', () => showAudio(owner))
        };
        button(owner, 'Close settings', () => close(owner.scene, true));
        (groups[selection] || groups.keyboard).focus();
    }

    function status(owner, message) {
        if (session === owner) owner.status.textContent = message;
    }

    function change(owner, next, selection, key = 'keyboard', failure) {
        if (loading || saving) return false;
        const isController = key === 'controller';
        const isNavigation = key === 'navigation';
        const isAudio = key === 'audio';
        const isSpeech = key === 'speech';
        const previous = isController ? pad : isNavigation ? navigation : isAudio ? audio : isSpeech ? speech : keys;
        const origin = owner?.group;
        function apply(value) {
            if (isController) {
                pad = value;
                host.controllerChanged();
            } else if (isNavigation) {
                navigation = value;
                host.navigationChanged(navigation);
            }
            else if (isAudio) {
                audio = value;
                if (owner) host.audioStop(owner.scene);
                host.audioChanged(audio);
            } else if (isSpeech) {
                speech = value;
                host.speechChanged(speech, owner);
            } else keys = value;
        }
        function refresh(message) {
            if (owner && session === owner) {
                showGroup(owner, selection);
                status(owner, message);
            }
        }
        apply(next);
        if (!storage) {
            refresh('Changed for this session. Settings storage is unavailable.');
            return true;
        }
        const subject = { controller: 'Controller settings', navigation: 'Navigation settings',
            audio: 'Audio settings', speech: 'Speech settings', keyboard: 'Keyboard bindings' }[key];
        saving = true;
        refresh(`Saving ${subject.toLowerCase()}`);
        storage.save(next, key).then(() => {
            saving = false;
            if (owner && owner.group === origin) status(owner, `${subject} saved`);
        }, () => {
            saving = false;
            apply(previous);
            if (session && (session.group === key || (isAudio && audioGroup(session.group))))
                showGroup(session, session.selected);
            if (owner && owner.group === origin) {
                status(owner, `Could not save ${subject.toLowerCase()}. Previous settings restored.`);
            }
            if (failure) failure();
        });
        return true;
    }

    function showGroup(owner, selection) {
        if (owner.group === 'controller') showController(owner, selection);
        else if (owner.group === 'keyboard') showKeyboard(owner, selection);
        else if (owner.group === 'speech') showSpeech(owner, selection);
        else if (owner.group === 'navigation') showNavigation(owner, selection);
        else if (owner.group === 'bookmarks') bookmarks.show(owner);
        else if (owner.group === 'audio') showAudio(owner, selection);
        else if (owner.group === 'soundscape') showSoundscape(owner, selection);
        else if (owner.group === 'soundscapeCategory') showSoundscape(owner, selection, owner.category);
    }

    function showSpeech(owner, selection = 'enabled') {
        owner.group = 'speech';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Speech';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const labels = { enabled: 'Speech enabled', autodetail: 'Autodetail', indexing: 'Menu indexing' };
        let focused;
        for (const [key, name] of Object.entries(labels)) {
            const item = button(owner, `${name}, ${speech[key] ? 'on' : 'off'}`, () =>
                change(owner, { ...speech, [key]: !speech[key] }, key, 'speech'));
            item.setAttribute('aria-pressed', String(speech[key]));
            if (selection === key || !focused) focused = item;
        }
        button(owner, 'Back', () => showRoot(owner, 'speech'));
        focused.focus();
    }

    function previewAudio(owner, bearing, cue, gain) {
        if (loading || saving) return;
        if (!audio.enabled) return status(owner, 'Mod sounds are off.');
        if (gain === 0) return status(owner, 'This cue’s volume is zero.');
        status(owner, 'Preparing audio preview.');
        if (!host.previewAudio(owner, audio.hrtf, bearing, text => status(owner, text), cue, gain)) status(owner, '');
    }

    function showSoundscape(owner, selection = 'enabled', category = '') {
        host.audioStop(owner.scene);
        owner.group = category ? 'soundscapeCategory' : 'soundscape';
        owner.category = category;
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = category ? SOUNDSCAPE[category].label : 'Soundscape';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const prefs = audio.soundscape;
        const value = category ? prefs.categories[category] : prefs;
        const label = category ? SOUNDSCAPE[category].label : 'Soundscape';
        function update(key, next) {
            const soundscape = category ? { ...prefs, categories: { ...prefs.categories, [category]: next } } : next;
            change(owner, { ...audio, soundscape }, key, 'audio');
        }
        const items = {
            enabled: button(owner, `${label}, ${value.enabled ? 'on' : 'off'}`, () =>
                update('enabled', { ...value, enabled: !value.enabled })),
            lower: button(owner, `Decrease volume, ${value.volume} percent`, () =>
                update('lower', { ...value, volume: Math.max(0, value.volume - 10) })),
            raise: button(owner, `Increase volume, ${value.volume} percent`, () =>
                update('raise', { ...value, volume: Math.min(100, value.volume + 10) }))
        };
        if (category) {
            for (const [name, cue] of SOUNDSCAPE[category].previews) {
                button(owner, 'Preview ' + name.toLowerCase(), () =>
                    previewAudio(owner, [0, 0, 1], cue, prefs.volume * value.volume / 10000));
            }
            button(owner, 'Back', () => showSoundscape(owner, category));
        } else {
            for (const [id, { label: name }] of Object.entries(SOUNDSCAPE))
                items[id] = button(owner, name, () => showSoundscape(owner, 'enabled', id));
            button(owner, 'Back', () => {
                host.audioStop(owner.scene);
                showAudio(owner, 'soundscape');
            });
        }
        (items[selection] || items.enabled).focus();
    }

    function showAudio(owner, selection = 'enabled') {
        owner.group = 'audio';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Audio';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const update = (key, value) => change(owner, value, key, 'audio');
        const items = {
            enabled: button(owner, `Mod sounds, ${audio.enabled ? 'on' : 'off'}`, () =>
                update('enabled', { ...audio, enabled: !audio.enabled })),
            hrtf: button(owner, `HRTF, ${audio.hrtf ? 'on' : 'off'}`, () =>
                update('hrtf', { ...audio, hrtf: !audio.hrtf })),
            wall: button(owner, `Wall sounds, ${audio.wall ? 'on' : 'off'}`, () =>
                update('wall', { ...audio, wall: !audio.wall })),
            lower: button(owner, `Decrease wall volume, ${audio.wallVolume} percent`, () =>
                update('lower', { ...audio, wallVolume: Math.max(0, audio.wallVolume - 10) })),
            raise: button(owner, `Increase wall volume, ${audio.wallVolume} percent`, () =>
                update('raise', { ...audio, wallVolume: Math.min(100, audio.wallVolume + 10) })),
            beacon: button(owner, `Navigation beacon, ${audio.beacon ? 'on' : 'off'}`, () =>
                update('beacon', { ...audio, beacon: !audio.beacon })),
            beaconLower: button(owner, `Decrease beacon volume, ${audio.beaconVolume} percent`, () =>
                update('beaconLower', { ...audio, beaconVolume: Math.max(0, audio.beaconVolume - 10) })),
            beaconRaise: button(owner, `Increase beacon volume, ${audio.beaconVolume} percent`, () =>
                update('beaconRaise', { ...audio, beaconVolume: Math.min(100, audio.beaconVolume + 10) })),
            caveTiming: button(owner, `Cave timing cues, ${audio.caveTiming ? 'on' : 'off'}`, () =>
                update('caveTiming', { ...audio, caveTiming: !audio.caveTiming })),
            caveLower: button(owner, `Decrease cave timing volume, ${audio.caveVolume} percent`, () =>
                update('caveLower', { ...audio, caveVolume: Math.max(0, audio.caveVolume - 10) })),
            caveRaise: button(owner, `Increase cave timing volume, ${audio.caveVolume} percent`, () =>
                update('caveRaise', { ...audio, caveVolume: Math.min(100, audio.caveVolume + 10) })),
            soundscape: button(owner, 'Soundscape', () => showSoundscape(owner))
        };
        const preview = (bearing, cue, gain) => previewAudio(owner, bearing, cue, gain);
        button(owner, 'Preview wall bump ahead', () => preview([0, 0, 1], 'wallBump', audio.wallVolume / 100));
        button(owner, 'Preview wall brush on the left', () => preview([-1, 0, 0], 'wallBrush', audio.wallVolume / 100));
        button(owner, 'Preview beacon ahead', () => preview([0, 0, 1], 'beaconPulse', audio.beaconVolume / 100));
        button(owner, 'Preview beacon turn to the right', () => preview([1, 0, 0], 'beaconTurn', audio.beaconVolume / 100));
        button(owner, 'Preview beacon arrival', () => preview([0, 0, 1], 'beaconArrival', audio.beaconVolume / 100));
        button(owner, 'Preview cave crossing tone', () => preview([0, 0, 1], 'caveGo', audio.caveVolume / 100));
        for (const [direction, bearing] of AUDIO_PREVIEWS) {
            button(owner, `Preview ${direction}`, () => preview(bearing));
        }
        button(owner, 'Back', () => showRoot(owner, 'audio'));
        (items[selection] || items.enabled).focus();
    }

    function showNavigation(owner, selection = 'layout') {
        owner.group = 'navigation';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Navigation';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const { layout, bindings } = navigation;
        const autowalk = button(owner, `Autowalk, ${navigation.autowalk ? 'on' : 'off'}`, () => change(owner,
            { ...navigation, autowalk: !navigation.autowalk }, 'autowalk', 'navigation'));
        const narration = button(owner, `Speak autowalk path, ${navigation.speakAutowalkPath ? 'on' : 'off'}`, () => change(owner,
            { ...navigation, speakAutowalkPath: !navigation.speakAutowalkPath }, 'speakAutowalkPath', 'navigation'));
        const keymap = button(owner, `Navigation keymap, ${LAYOUT_NAMES[layout]}`, () => change(owner,
            { ...navigation, layout: layout === 'letters' ? 'brackets' : 'letters' }, 'layout', 'navigation'));
        let focused = { autowalk, speakAutowalkPath: narration }[selection] || keymap;
        for (const [action, name] of Object.entries(ACTIONS)) {
            const gesture = bindings[layout][action];
            const occupied = nativeNavigationConflict(root, gesture) ? ', used by the game' : '';
            const item = button(owner, `${name}, ${gestureName(gesture)}${occupied}`, () => {
                if (loading || saving) return;
                owner.capture = owner.selected = action;
                status(owner, 'Press a letter, bracket or backslash, with or without Shift. Delete unassigns. Escape cancels.');
            });
            if (selection === action) focused = item;
        }
        const savedPlaces = button(owner, 'Bookmarks', () => bookmarks.show(owner));
        if (selection === 'bookmarks') focused = savedPlaces;
        button(owner, 'Reset this navigation keymap', () => change(owner,
            normalizeNavigation({ ...navigation, bindings: { ...bindings, [layout]: { ...NAVIGATION_DEFAULTS[layout] } } },
                [keys.puzzleGuide, keys.puzzleStop]), selection, 'navigation'));
        button(owner, 'Back', () => showRoot(owner, 'navigation'));
        focused.focus();
    }

    function captureNavigation(owner, gesture, eventCode, unassign) {
        if (!gesture && !unassign) return;
        const { layout, bindings } = navigation;
        const action = owner.capture;
        const duplicate = navigationAction(navigation, gesture);
        if (!unassign && (nativeNavigationConflict(root, gesture, eventCode) || gesture === keys.settings || gesture === keys.puzzleGuide ||
            (duplicate && duplicate !== action))) {
            status(owner, `${gestureName(gesture)} is already in use. Choose another key.`);
            return;
        }
        const selected = { ...bindings[layout], [action]: unassign ? null : gesture };
        change(owner, { ...navigation, bindings: { ...bindings, [layout]: selected } }, action, 'navigation');
    }

    function showKeyboard(owner, selection = 'settings') {
        owner.group = 'keyboard';
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Keyboard bindings';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        let focused = null;
        for (const action of Object.keys(LABELS)) {
            const binding = keys[action];
            const occupied = PUZZLE_KEYS[action] && (nativeConflict(root, binding) || navigationAction(navigation, binding));
            const item = button(owner, `${LABELS[action]}, ${binding?.replace('Arrow', '') ?? 'unassigned'}${occupied ? ', in use elsewhere' : ''}`, () => {
                if (loading || saving) return;
                owner.capture = owner.selected = action;
                const available = REVIEW_KEYS[action] ? 'Shift and an arrow or letter' : { settings: 'a letter or F8', puzzleGuide: 'Shift and a letter',
                    puzzleStop: 'Ctrl and a letter' }[action] || 'a letter';
                status(owner, `Press ${available} for ${LABELS[action].toLowerCase()}. Press Escape to cancel.`);
            });
            if (action === selection) focused = item;
        }
        button(owner, 'Unassign repeat dialogue', () => change(owner, { ...keys, repeat: null }, 'repeat'));
        button(owner, 'Reset keyboard defaults', () => change(owner, normalizeKeys(DEFAULT_KEYS), selection));
        button(owner, 'Back', () => showRoot(owner));
        focused.focus();
    }

    function showController(owner, selection = 'enabled') {
        owner.group = 'controller';
        owner.unbinding = false;
        owner.selected = selection;
        owner.capture = null;
        owner.heading.textContent = 'Controller bindings';
        owner.status.textContent = loading ? 'Loading settings' : '';
        owner.contents.textContent = '';
        const master = button(owner, `Controller support, ${pad.enabled ? 'on' : 'off'}`, () => toggleController(owner));
        let focused = master;
        for (const action of Object.keys(ACTION_NAMES)) {
            const reserved = action === 'recovery' ? pad.recovery.some(host.nativeButton) :
                (action === 'mode' || FIELD_ACTIONS.includes(action)) && host.nativeButton(pad[action]);
            const occupied = reserved ? ', used by the game' : '';
            const item = button(owner, `${ACTION_NAMES[action]}, ${buttonName(owner.family, pad[action])}${occupied}`, () => {
                if (loading || saving) return;
                owner.capture = { action };
                owner.selected = action;
                const gesture = action === 'recovery' ? 'Hold two buttons together, then release' : 'Press and release a button or stick direction';
                const cancel = buttonName(owner.family, [pad.confirm, pad.back]);
                const clear = canUnassign(action) ? ' Delete unassigns.' : '';
                status(owner, `${gesture}. To cancel, press Escape or hold ${cancel} together and release.${clear}`);
            });
            if (action === selection) focused = item;
        }
        button(owner, 'Unassign a controller binding', () => showControllerUnassign(owner));
        button(owner, 'Reset controller defaults', () => change(owner,
            { ...normalizeController(), enabled: pad.enabled }, selection, 'controller'));
        button(owner, 'Back', () => showRoot(owner, 'controller'));
        focused.focus();
    }

    function showControllerUnassign(owner) {
        owner.unbinding = true;
        owner.heading.textContent = 'Unassign a controller binding';
        owner.status.textContent = '';
        owner.contents.textContent = '';
        let first = null;
        for (const [action, name] of Object.entries(ACTION_NAMES)) {
            if (!canUnassign(action) || pad[action] === null) continue;
            const item = button(owner, `Unassign ${name.toLowerCase()}`, () =>
                change(owner, { ...pad, [action]: null }, action, 'controller'));
            if (!first) first = item;
        }
        const cancel = button(owner, 'Back', () => showController(owner));
        (first || cancel).focus();
    }

    function toggleController(owner, failure) {
        const accepted = change(owner, { ...pad, enabled: !pad.enabled }, 'enabled', 'controller', failure);
        return accepted ? (pad.enabled ? 'Controller support on' : 'Controller support off') : '';
    }

    function toggleFieldAudio(action, failure) {
        const key = action === 'beaconToggle' ? 'beacon' : 'wall';
        if (!change(null, { ...audio, [key]: !audio[key] }, key, 'audio', failure)) return '';
        if (!audio[key]) return key === 'beacon' ? 'Navigation beacon off.' : 'Wall sounds off.';
        const label = key === 'beacon' ? 'Navigation beacon on.' : 'Wall sounds on.';
        if (!audio.enabled) return `${label} Mod sounds are off.`;
        return key === 'beacon' ? `${label} Request directions.` : label;
    }

    function back(owner) {
        if (owner.capture) showGroup(owner, owner.selected);
        else if (owner.group === 'bookmarks') bookmarks.back(owner);
        else if (owner.unbinding) showController(owner);
        else if (owner.group === 'soundscapeCategory') showSoundscape(owner, owner.category);
        else if (owner.group === 'soundscape') {
            host.audioStop(owner.scene);
            showAudio(owner, 'soundscape');
        }
        else if (owner.group) showRoot(owner, owner.group);
        else close(owner.scene, true);
    }

    function captureController(owner, family, mask) {
        const action = owner.capture?.action;
        if (!action) return;
        const buttons = [];
        for (let index = 0; index < 24; index++) {
            if (mask & buttonBit(index)) buttons.push(index);
        }
        if (mask === (buttonBit(pad.confirm) | buttonBit(pad.back))) return back(owner);
        const value = action === 'recovery' ? buttons : buttons.length === 1 ? buttons[0] : null;
        if (!bindingAllowed(action, value, pad, host.nativeButton)) {
            status(owner, 'That controller binding is unavailable. Try another.');
            return;
        }
        owner.family = family;
        change(owner, { ...pad, [action]: value }, action, 'controller');
    }

    function close(scene, resume = false) {
        if (!session || session.scene !== scene) return;
        const retired = session;
        bookmarks.retire(retired);
        for (const pressed of down) held.add(pressed);
        host.audioStop(scene);
        host.retireSpeechSilence();
        // Take the last native physical sample before handing back control.
        // Boundary-driven retirement bypasses this call and stays synchronous.
        if (resume) {
            try { host.capturePads(); } catch { /* Native input will continue. */ }
        }
        session = null;
        scene._wqaSettingsActive = false;
        try { retired.dialog.remove(); }
        finally { if (resume) host.resume(scene); }
    }

    function open(scene, family = '') {
        if (session) return false;
        const document = root.document;
        const dialog = document.createElement('dialog');
        if (typeof dialog.showModal !== 'function') return false;
        const owner = { kind: 'settings', scene, family, dialog, heading: document.createElement('h1'),
            contents: document.createElement('div'), status: document.createElement('p'),
            bookmarkContext: host.bookmarkContext(scene) };
        owner.heading.id = 'wqa-settings-heading';
        dialog.setAttribute('aria-labelledby', owner.heading.id);
        owner.status.setAttribute('role', 'status');
        dialog.style.cssText = 'font: 18px system-ui; max-width: 92vw; max-height: 85vh; overflow: auto;';
        dialog.append(owner.heading, owner.contents, owner.status);
        dialog.addEventListener('cancel', event => event.preventDefault());
        for (const type of POINTER_EVENTS) dialog.addEventListener(type, event => event.stopPropagation());
        try {
            document.body.append(dialog);
            session = owner;
            scene._wqaSettingsActive = true;
            heldMouse = mouseDown;
            for (const touch of touching) heldTouches.add(touch);
            for (const pressed of down) held.add(pressed);
            host.capturePads();
            host.suspend(scene);
            dialog.showModal();
            showRoot(owner);
            return true;
        } catch {
            close(scene, true);
            dialog.remove();
            return false;
        }
    }

    function capture(key, puzzleKey, event, owner) {
        const action = owner.capture;
        if (PUZZLE_KEYS[action]) {
            const gesture = puzzleKey;
            if (!PUZZLE_KEYS[action].test(gesture)) return;
            if (nativeConflict(root, gesture, event.keyCode) ||
                Object.values(navigation.bindings).some(layout => Object.values(layout).includes(gesture))) {
                status(owner, `${gesture} is already in use. Choose another key.`);
                return;
            }
            change(owner, { ...keys, [action]: gesture }, action);
            return;
        }
        if (REVIEW_KEYS[action]) {
            const review = reviewGesture(event);
            if (!review) return;
            if ((!review.includes('Arrow') && nativeConflict(root, review, event.keyCode)) ||
                Object.keys(REVIEW_KEYS).some(other => other !== action && keys[other] === review)) {
                status(owner, `${review.replace('Arrow', '')} is already in use. Choose another key.`);
                return;
            }
            change(owner, { ...keys, [action]: review }, action);
            return;
        }
        if (!key || (key === 'F8' && action !== 'settings')) return;
        const other = action === 'settings' ? 'repeat' : 'settings';
        if (nativeConflict(root, key, event.keyCode) || key === keys[other] ||
            (action === 'settings' && key === keys.details) ||
            (action === 'settings' && navigationAction(navigation, key))) {
            status(owner, `${key} is already in use. Choose another key.`);
            return;
        }
        change(owner, { ...keys, [action]: key }, action);
    }

    function keydown(event) {
        const physical = event.code || event.key;
        if (held.has(physical)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const owner = session;
        const ready = owner ? null : host.readyScene();
        if (physical && (owner || ready) && down.size < 64) down.add(physical);
        if (owner) {
            event.stopPropagation();
            const goBack = event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
            if (!goBack && bookmarks.textInput(owner, event)) return;
            if (goBack || owner.capture) {
                const key = keyName(event);
                const gesture = navigationGesture(event);
                const puzzleKey = puzzleGesture(event);
                const unassign = event.key === 'Delete' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
                event.preventDefault();
                if (!event.repeat && physical && held.size < 64) held.add(physical);
                if (event.repeat) return;
                if (goBack) back(owner);
                else if (owner.group === 'keyboard') capture(key, puzzleKey, event, owner);
                else if (owner.group === 'navigation') captureNavigation(owner, gesture, event.keyCode, unassign);
                else if (owner.group === 'controller' && unassign && canUnassign(owner.capture?.action)) {
                    const action = owner.capture.action;
                    change(owner, { ...pad, [action]: null }, action, 'controller');
                }
            } else if (physical && held.size < 64 && !event.repeat) {
                held.add(physical);
            }
            return;
        }
        if (event.repeat || event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
        const key = keyName(event);
        const review = reviewGesture(event);
        const menuAction = review ? Object.keys(REVIEW_KEYS).find(action => keys[action] === review &&
            (review.includes('Arrow') || !nativeConflict(root, review, event.keyCode))) :
            key && key === keys.details && !nativeConflict(root, key, event.keyCode) ? 'details' : '';
        if (menuAction && host.menuCommand(menuAction)) {
            if (physical && held.size < 64) held.add(physical);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const gesture = navigationGesture(event);
        const action = navigationAction(navigation, gesture);
        if (action && !nativeNavigationConflict(root, gesture, event.keyCode) && host.fieldCommand(action)) return;
        const chord = puzzleGesture(event);
        const puzzle = chord && (chord === keys.puzzleGuide ? 'puzzleGuide' : chord === keys.puzzleStop ? 'puzzleStop' : '');
        if (!action && puzzle && !nativeConflict(root, chord, event.keyCode) && host.fieldCommand(puzzle)) {
            if (physical && held.size < 64) held.add(physical);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (!key || nativeConflict(root, key, event.keyCode)) return;
        if (key === keys.repeat && host.repeat()) return;
        const recover = key === 'F8' && (nativeConflict(root, keys.settings) ||
            (ready && host.fieldReady(ready) && navigationAction(navigation, keys.settings)));
        if (ready && (key === keys.settings || recover) && open(ready)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    root.addEventListener('keydown', keydown, true);
    // Native keyup may still need to retire a key pressed before the menu.
    root.addEventListener('keyup', event => {
        if (!down.size && !held.size) return;
        const physical = event.code || event.key;
        down.delete(physical);
        held.delete(physical);
    }, true);
    root.addEventListener('mousedown', event => {
        if (event.button !== 0 || (!session && !host.readyScene())) return;
        mouseDown = true;
        if (session) heldMouse = true;
    }, true);
    root.addEventListener('mouseup', event => {
        if (event.button !== 0) return;
        if (heldMouse && (!session || !session.dialog.contains(event.target))) event.stopPropagation();
        mouseDown = heldMouse = false;
    }, true);
    root.addEventListener('touchstart', event => {
        if (!session && !host.readyScene()) return;
        for (let index = 0; index < Math.min(event.changedTouches.length, 16); index++) {
            if (touching.size >= 16) break;
            const touch = event.changedTouches[index];
            touching.add(touch.identifier);
            if (session) heldTouches.add(touch.identifier);
        }
    }, true);
    for (const type of ['touchend', 'touchcancel']) root.addEventListener(type, event => {
        if (!touching.size && !heldTouches.size) return;
        let consumed = false;
        for (let index = 0; index < Math.min(event.changedTouches.length, 16); index++) {
            const touch = event.changedTouches[index];
            touching.delete(touch.identifier);
            consumed = heldTouches.delete(touch.identifier) || consumed;
        }
        if (consumed && (!session || !session.dialog.contains(event.target))) event.stopPropagation();
    }, true);
    for (const type of ['blur', 'pagehide']) root.addEventListener(type, () => {
        down.clear();
        held.clear();
        touching.clear();
        heldTouches.clear();
        mouseDown = heldMouse = false;
        if (session) {
            resumeOnFocus = type === 'blur' ? session.scene : null;
            close(session.scene);
        }
    });
    root.addEventListener('focus', () => {
        const scene = resumeOnFocus;
        resumeOnFocus = null;
        if (scene) host.resume(scene);
    });
    return {
        open,
        controllerOwner: () => session,
        bookmarkEntries: bookmarks.entries,
        controllerBindings: () => pad,
        toggleController,
        toggleFieldAudio,
        controllerInput(owner, action, family, mask) {
            if (session !== owner) return;
            if (action === 'capture') return captureController(owner, family, mask);
            if (owner.capture) return;
            if (action === 'back') return back(owner);
            owner.family = family;
            const active = root.document.activeElement;
            if (action === 'confirm') {
                if (owner.contents.contains(active)) active.click();
                return;
            }
            const items = owner.contents.children;
            const index = Array.prototype.indexOf.call(items, active);
            const offset = action === 'previous' ? -1 : 1;
            const next = index === -1 ? 0 : (index + offset + items.length) % items.length;
            items[next]?.focus();
        },
        retire(scene) {
            if (resumeOnFocus === scene) resumeOnFocus = null;
            close(scene);
            down.clear();
            touching.clear();
            mouseDown = false;
        }
    };
}

module.exports = { createSettingsMenu };
