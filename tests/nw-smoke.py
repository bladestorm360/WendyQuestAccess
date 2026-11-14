"""Check the production plugin bundle on the official standalone NW.js host.

Run inside the resource runner. The hidden fixture uses synthetic game state,
the installed open-source PIXI runtime and a silent speech worker receipt.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile


VERSION = '0.48.4'
ARCHIVE_HASH = '1731a5ed81139a63a5d1d7e7c521b5f08add023ffe4b719d06796a1ba77dc8a3'

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import OBJECTS_REL, PIXI_REL, PIXI_SHA, SYSTEM_REL, SYSTEM_SHA, objects_notification


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def unpack(archive, destination):
    if sha(archive) != ARCHIVE_HASH:
        raise ValueError('Unexpected upstream NW.js archive hash')
    prefix = f'nwjs-v{VERSION}-win-x64'
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            relative = PurePosixPath(entry.filename)
            if not relative.parts or relative.parts[0] != prefix or '..' in relative.parts:
                raise ValueError('Unexpected archive member')
            if entry.is_dir():
                continue
            target = destination.joinpath(*relative.parts[1:])
            if not target.resolve().is_relative_to(destination):
                raise ValueError('Archive member escaped the fixture')
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.open(entry) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, 128 * 1024)


def fixture(runtime, installed):
    app = runtime / 'package.nw'
    app.mkdir()
    pixi = installed / PIXI_REL
    if sha(pixi) != PIXI_SHA:
        raise ValueError('Unexpected installed PIXI runtime')
    shutil.copyfile(pixi, app / 'pixi.js')
    (app / 'package.json').write_text(json.dumps({
        'name': 'wendyquest-access-offline-fixture', 'main': 'index.html',
        'window': {'show': False, 'width': 320, 'height': 200},
        'chromium-args': '--in-process-gpu --disable-devtools --mute-audio'
    }), encoding='utf8')
    (app / 'index.html').write_text('''<!doctype html><title>WendyQuest Access Offline Fixture</title>
<script src="pixi.js"></script><script src="fixture.js"></script><script src="plugin.js"></script><script src="resize-markers.js"></script>
<script src="native-movement.js"></script>
<script src="run.js"></script>
''', encoding='utf8')
    objects = objects_notification((installed / OBJECTS_REL).read_bytes()).decode('utf8')
    movement = ['function Game_Player() {}', 'function Game_Map() {}', 'function Game_Interpreter() {}']
    for method in ('Game_Player.prototype.moveByInput', 'Game_Player.prototype.reserveTransfer',
                   'Game_Map.prototype.setupStartingMapEvent', 'Game_Interpreter.prototype.command201',
                   'Game_Interpreter.prototype.command205'):
        start = objects.index(method + ' = function(')
        end = objects.index('\n};', start) + 3
        movement.append(objects[start:end])
    (app / 'native-movement.js').write_text('\n'.join(movement), encoding='utf8')
    system = installed / SYSTEM_REL
    if sha(system) != SYSTEM_SHA:
        raise ValueError('Unexpected installed system locale source')
    game_locale = json.loads(system.read_text(encoding='utf8'))['locale']
    (app / 'fixture.js').write_text('''
const receipt = require('path').join(require('path').dirname(process.mainModule.filename), 'receipt.json');
const write = data => require('fs').writeFileSync(receipt, JSON.stringify(data));
window.addEventListener('error', event => { write({ error: event.message }); nw.App.quit(); });
document.hasFocus = () => true;
var Utils = { RPGMAKER_NAME: 'MZ', RPGMAKER_VERSION: '1.8.0' };
function Scene_Title() {
    this._started = true;
    this._active = true;
    this._fadeDuration = 0;
    const art = { parent: this, worldVisible: true, worldAlpha: 1, texture: { valid: true } };
    this.spr_logo = art;
    this.spr_ui_start = { ...art, alpha: 1 };
    this.spr_black_rect = { alpha: 0 };
    this._commandWindow = { active: true, visible: true, openness: 255, _index: 0,
        _list: [{ name: 'Synthetic title command', enabled: true }], select() {}, callHandler() {},
        isHandled(symbol) { return symbol === 'continue'; } };
}
Scene_Title.prototype.update = function () { return 123; };
var SceneManager = { _scene: new Scene_Title() };
var Graphics = { width: 320, height: 200,
    app: { stage: SceneManager._scene, renderer: new (require('events').EventEmitter)() } };
const nativeSelect = SceneManager._scene._commandWindow.select;
var DataManager = { savefileInfo: () => null };
var $gameMap, $gamePlayer, $gameScreen, $gameTemp, $dataMap, $dataTilesets, $gameTileChanges;
var $gameMessage = { isBusy: () => false };
var $dataSystem = { tileSize: 32, locale: GAME_LOCALE }, $dataMapInfos = [null, { id: 1 }, { id: 2 }, { id: 3 }];
var Input = { keyMapper: { 81: 'pageup', 90: 'ok' }, clear() {} };
Input.gamepadMapper = { 0: 'ok', 1: 'cancel', 3: 'menu', 9: 'menu', 12: 'up', 13: 'down' };
'''.replace('GAME_LOCALE', json.dumps(game_locale)), encoding='utf8')
    (app / 'run.js').write_text('''
if (SceneManager._scene.update() !== 123) throw Error('Native result changed');
if (SceneManager._scene._commandWindow.select !== nativeSelect) throw Error('Hook installed at boot');
const transition = Graphics._wqaBeginResize();
WendyQuestAccessTitleReady(SceneManager._scene); // A ready title during resize is still gated.
Graphics.app.renderer.emit('postrender');
if (SceneManager._scene._commandWindow.select !== nativeSelect) throw Error('Hook installed before geometry');
function updatedViewport() {
    Graphics._wqaViewportWidth = window.innerWidth;
    Graphics._wqaViewportHeight = window.innerHeight;
    Graphics._wqaTryResumeResize();
    if (Graphics._wqaResize) return;
    window.removeEventListener('resize', updatedViewport);
    if (SceneManager._scene._commandWindow.select !== nativeSelect) throw Error('Hook installed before render');
    Graphics.app.renderer.emit('postrender');
    if (SceneManager._scene._commandWindow.select === nativeSelect) throw Error('No hook after render');
}
window.addEventListener('resize', updatedViewport);
nw.Window.get().resizeTo(440, 320);
Graphics._wqaFinishResize(transition, true, 440, 320);
let fileShown = false;
let mapShown = false;
let caveShown = false;
let caveRoute = false;
let dialogueShown = false;
let routeRequested = false;
let beaconDetourStep = 0;
let fieldStep = 0;
let mapVitalsStep = 0;
let diagramViewport;
let browseStarted = 0;
let autowalkStep = 0;
let repeated = false;
let numberShown = false;
let settingsStep = 0;
let battleAudioStep = 0;
let footstepSettingsStep = 0;
let audioStarted = 0;
let wallPreviewStarted = 0;
let beaconStarted = 0;
let caveCueStarted = 0;
let battleCueStarted = 0;
let soundscapeStarted = 0;
let crossMapStarted = 0;
let crossMapLeg = 0;
let bookmarkDirectionsRequested = false;
let controllerStep = 0;
let dialoguePadStep = 0;
let endingStep = 0;
let restartStep = 0;
let restartSettings;
let nativeMenuArrows = 0;
let nativeZ = 0;
const restart = require('fs').existsSync(receipt + '.restart');
if (!restart) {
    const path = require('path');
    const fs = require('fs');
    const root = path.dirname(receipt);
    const profile = fs.realpathSync(nw.App.dataPath);
    const relative = path.relative(path.dirname(root), profile);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
        throw Error('Synthetic geometry profile escaped the fixture');
    }
    const geometry = path.join(root, 'wendyquest-access-geometry');
    fs.mkdirSync(geometry);
    for (const name of ['1.wqg', '2.wqg', '3.wqg', '196.wqg', 'manifest.json'])
        fs.copyFileSync(path.join(root, 'geometry', name), path.join(geometry, name));
}
document.addEventListener('keydown', event => { if (event.code === 'KeyZ') nativeZ++; });
document.addEventListener('keydown', event => { if (event.code === 'ArrowDown') nativeMenuArrows++; });
function key(type, key, code, repeat = false, modifiers = {}) {
    return document.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true, ...modifiers }));
}
function tap(keyValue, code = keyValue, modifiers) {
    const native = key('keydown', keyValue, code, false, modifiers);
    key('keyup', keyValue, code);
    return native;
}
function pad(...buttons) {
    return WendyQuestAccessPadSample(0, 'standard', 'Xbox fixture', buttons.reduce((mask, button) => mask | 1 << button, 0));
}
function padTap(button) { const mask = pad(button); pad(); return mask; }
function battleText(parent, value) {
    const sprite = { parent, y: 0, worldVisible: true, worldAlpha: 1, _dirty: false, _currentString: value, children: [] };
    for (let position = 0; position < value.length; position++) {
        if (value[position] === '\\n') continue;
        sprite.children.push({ parent: sprite, y: 0, worldVisible: true, worldAlpha: 1, alpha: 1,
            scale: { x: 1, y: 1 }, bitmap: { isReady: () => true } });
    }
    return sprite;
}
function padStick(x, y) { return WendyQuestAccessPadSample(0, 'standard', 'Xbox fixture', 0, x, y); }
function choose(label) {
    const button = Array.from(document.querySelectorAll('dialog button')).find(item => item.textContent.startsWith(label));
    if (!button) throw Error('Missing settings control ' + label);
    button.click();
}
function menuStatus() { return document.querySelector('dialog [role=status]')?.textContent; }
function installTransferPage(map, destination) {
    const list = [{ code: 201, indent: 0, parameters: [0, destination, 0, 0, 6, 0] }, { code: 0 }];
    const event = { _eventId: 1, _x: 1, _y: 0, _pageIndex: 0, _trigger: 1, _priorityType: 0,
        isStarting() { return this._starting; }, clearStartingFlag() { this._starting = false; },
        eventId: () => 1, list: () => list };
    const interpreter = Object.assign(new Game_Interpreter(), {
        setup(rows, id) { this._list = rows; this._eventId = id; },
        setWaitMode(mode) { this._waitMode = mode; }
    });
    Object.setPrototypeOf($gameMap, Game_Map.prototype);
    Object.assign($gameMap, { _mapId: map, _events: [null, event], _interpreter: interpreter,
        events() { return this._events.filter(Boolean); } });
    $dataMap.events = [null, { id: 1, name: 'Synthetic transfer', pages: [
        { trigger: 1, priorityType: 0, moveType: 0, conditions: {}, list }
    ] }];
    $gameParty.inBattle = () => false;
    $gamePlayer.findEventsAt = (x, y) => x === 1 && y === 0 ? [event] : [];
    $gamePlayer.canTriggerEvent = (target, triggers, normal) => target === event && triggers.includes(1) && !normal;
}
function verifySettings() {
    if (settingsStep === 0) {
        key('keydown', 'z', 'KeyZ');
        tap('F8');
        if (!SceneManager._scene._wqaSettingsActive || document.activeElement.textContent !== 'Keyboard bindings') {
            throw Error(`F8 did not focus settings: modal ${!!document.querySelector('dialog')}, ` +
                `focused ${document.activeElement.tagName}, Chromium ${process.versions.chromium}`);
        }
        tap('ArrowUp');
        if (document.activeElement.textContent !== 'Close settings') throw Error('Up did not wrap mod-menu focus');
        tap('ArrowUp');
        if (document.activeElement.textContent !== 'Help') throw Error('Settings Help is missing');
        tap('Enter');
        choose('Pathfinder');
        if (!document.activeElement.textContent.includes('Directions P')) throw Error('Help did not show the current directions key');
        tap('Enter');
        if (!menuStatus()?.includes('Previous category Shift+J')) throw Error('Help did not expose the pathfinder instructions');
        tap('ArrowDown');
        if (!document.activeElement.textContent.includes('map name M')) throw Error('Help did not show the map key');
        tap('ArrowDown');
        if (!document.activeElement.textContent.includes('Shift+P') ||
            !document.activeElement.textContent.includes('all active destinations and reachable destinations only'))
            throw Error('Help did not explain the optional reachable filter');
        tap('Escape');
        if (document.activeElement.textContent !== 'Pathfinder') throw Error('Help section did not restore focus');
        choose('Battle');
        if (!document.activeElement.textContent.includes('then for accuracy')) throw Error('Battle Help is missing');
        tap('Escape');
        tap('Escape');
        if (document.activeElement.textContent !== 'Help') throw Error('Help did not return to its parent');
        tap('ArrowDown');
        tap('ArrowRight');
        tap('ArrowDown');
        if (document.activeElement.textContent !== 'Controller bindings') throw Error('Down did not move mod-menu focus');
        tap('ArrowLeft');
        tap('Enter');
        if (document.activeElement.textContent !== 'Open mod settings, F8') throw Error('Enter did not activate the focused group');
        tap('Escape');
        if (document.activeElement.textContent !== 'Keyboard bindings') throw Error('Escape did not restore parent focus');
        tap('Enter');
        settingsStep++;
    } else if (settingsStep === 1 && menuStatus() !== 'Loading settings') {
        choose('Repeat dialogue');
        tap('w', 'KeyW'); // W is given a native action before capture.
        if (menuStatus() !== 'W is already in use. Choose another key.') throw Error('Native conflict was accepted');
        tap('t', 'KeyT');
        settingsStep++;
    } else if (settingsStep === 2 && menuStatus() === 'Keyboard bindings saved') {
        if (document.activeElement.textContent !== 'Repeat dialogue, T') throw Error('Focus lost on binding change');
        choose('Open mod settings');
        tap('j', 'KeyJ');
        if (menuStatus() !== 'J is already in use. Choose another key.') throw Error('Field binding collision was accepted');
        tap('v', 'KeyV');
        settingsStep++;
    } else if (settingsStep === 3 && menuStatus() === 'Keyboard bindings saved') {
        choose('Start or review puzzle guidance');
        tap('J', 'KeyJ', { shiftKey: true });
        if (menuStatus() !== 'Shift+J is already in use. Choose another key.') throw Error('Puzzle chord collision was accepted');
        tap('U', 'KeyU', { shiftKey: true });
        settingsStep++;
    } else if (settingsStep === 4 && menuStatus() === 'Keyboard bindings saved') {
        choose('Stop puzzle guidance');
        tap('u', 'KeyU', { ctrlKey: true });
        settingsStep++;
    } else if (settingsStep === 5 && menuStatus() === 'Keyboard bindings saved') {
        if (document.activeElement.textContent !== 'Stop puzzle guidance, Ctrl+U') throw Error('Puzzle binding did not retain focus');
        tap('Escape');
        if (document.activeElement.textContent !== 'Keyboard bindings') throw Error('Parent focus not restored');
        choose('Navigation');
        choose('Navigation keymap');
        settingsStep++;
    } else if (settingsStep === 6 && menuStatus() === 'Navigation settings saved') {
        if (document.activeElement.textContent !== 'Navigation keymap, Brackets and backslash') throw Error('Layout did not change');
        choose('Next destination');
        tap('n', 'KeyN');
        settingsStep++;
    } else if (settingsStep === 7 && menuStatus() === 'Navigation settings saved') {
        if (document.activeElement.textContent !== 'Spoiler mode, on') {
            choose('Spoiler mode, off');
            return;
        }
        tap('Escape');
        if (document.activeElement.textContent !== 'Navigation') throw Error('Navigation parent focus was lost');
        choose('Audio');
        if (document.activeElement.textContent !== 'Mod sounds, on') throw Error('Sound defaults were not applied');
        audioStarted = performance.now();
        choose('Preview ahead');
        settingsStep = 8;
    } else if (settingsStep === 8 && menuStatus() === 'Preview uses HRTF.') {
        require('fs').writeFileSync(receipt + '.audio-init-ms', String(performance.now() - audioStarted));
        choose('HRTF');
        settingsStep++;
    } else if (settingsStep === 9 && menuStatus() === 'Audio settings saved') {
        choose('Preview behind');
        settingsStep++;
    } else if (settingsStep === 10 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Wall sounds');
        settingsStep++;
    } else if (settingsStep === 11 && menuStatus() === 'Audio settings saved') {
        if (document.activeElement.textContent !== 'Wall sounds, on') throw Error('Wall sound setting failed');
        choose('Decrease wall volume');
        settingsStep++;
    } else if (settingsStep === 12 && menuStatus() === 'Audio settings saved') {
        if (document.activeElement.textContent !== 'Decrease wall volume, 55 percent') throw Error('Wall gain setting failed');
        wallPreviewStarted = performance.now();
        choose('Preview wall tone on the left');
        settingsStep++;
    } else if (settingsStep === 13 && footstepSettingsStep === 0 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        require('fs').writeFileSync(receipt + '.wall-preview-ms', String(performance.now() - wallPreviewStarted));
        choose('Footstep sounds, off');
        footstepSettingsStep = 1;
    } else if (settingsStep === 13 && footstepSettingsStep === 1 && menuStatus() === 'Audio settings saved') {
        if (document.activeElement.textContent !== 'Footstep sounds, on') throw Error('Footstep setting failed');
        choose('Preview footstep');
        footstepSettingsStep = 2;
    } else if (settingsStep === 13 && footstepSettingsStep === 2 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Navigation beacon');
        settingsStep = 14;
    } else if (settingsStep === 14 && menuStatus() === 'Audio settings saved') {
        choose('Preview beacon arrival');
        settingsStep++;
    } else if (settingsStep === 15 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Cave timing cues');
        settingsStep++;
    } else if (settingsStep === 16 && menuStatus() === 'Audio settings saved') {
        choose('Preview cave crossing tone');
        settingsStep++;
    } else if (settingsStep === 17 && battleAudioStep === 0 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Battle timing assist, off');
        battleAudioStep++;
    } else if (settingsStep === 17 && battleAudioStep === 1 && menuStatus() === 'Audio settings saved') {
        if (document.activeElement.textContent !== 'Battle timing assist, on') throw Error('Battle cue setting failed');
        choose('Preview battle accuracy tone');
        battleAudioStep++;
    } else if (settingsStep === 17 && battleAudioStep === 2 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Mod sounds');
        settingsStep++;
    } else if (settingsStep === 18 && menuStatus() === 'Audio settings saved') {
        choose('Preview right');
        if (menuStatus() !== 'Mod sounds are off.') throw Error('The sound switch did not prevent preview');
        choose('Mod sounds');
        settingsStep++;
    } else if (settingsStep === 19 && menuStatus() === 'Audio settings saved') {
        choose('Soundscape');
        if (document.activeElement.textContent !== 'Soundscape, off') throw Error('Soundscape default is not off');
        choose('Soundscape, off');
        settingsStep++;
    } else if (settingsStep === 20 && menuStatus() === 'Audio settings saved') {
        choose('Decrease volume');
        settingsStep++;
    } else if (settingsStep === 21 && menuStatus() === 'Audio settings saved') {
        choose('Exits');
        choose('Preview door');
        settingsStep++;
    } else if (settingsStep === 22 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Exits, on');
        settingsStep++;
    } else if (settingsStep === 23 && menuStatus() === 'Audio settings saved') {
        tap('Escape');
        if (document.activeElement.textContent !== 'Exits') throw Error('Soundscape category focus was lost');
        tap('Escape');
        if (document.activeElement.textContent !== 'Soundscape') throw Error('Soundscape parent focus was lost');
        tap('Escape');
        if (document.activeElement.textContent !== 'Audio') throw Error('Audio parent focus was lost');
        key('keydown', 'Escape', 'Escape');
        if (document.querySelector('dialog') || SceneManager._scene._wqaSettingsActive) throw Error('Modal did not close');
        key('keydown', 'z', 'KeyZ', true);
        key('keyup', 'Escape', 'Escape');
        key('keyup', 'z', 'KeyZ');
        tap('z', 'KeyZ');
        if (nativeZ !== 2) throw Error('A held key replayed or the next press did not return to native input');
        tap('F8');
        if (document.querySelector('dialog')) throw Error('Old settings key still opens the menu');
        Graphics.app.renderer.emit('postrender');
        settingsStep++;
    }
}
function verifyController() {
    const focus = document.activeElement.textContent;
    if (controllerStep === 0) {
        pad();
        if (padTap(8) !== 1 << 8) throw Error('View was not owned at the title');
    } else if (controllerStep === 1 && require('fs').existsSync(receipt + '.title-mode')) {
        if (padTap(9) !== 1 << 9) throw Error('Start was not consumed in mode');
    } else if (controllerStep === 2 && document.querySelector('dialog')) {
        pad();
        padTap(13);
    } else if (controllerStep === 3 && focus === 'Controller bindings') padTap(0);
    else if (controllerStep === 4 && focus === 'Controller support, on') padTap(13);
    else if (controllerStep === 5 && focus === 'Toggle mod mode, View') padTap(0);
    else if (controllerStep === 6 && menuStatus()?.startsWith('Press and release a button')) {
        const node = document.querySelector('dialog [role=status]');
        const watch = new MutationObserver(() => {
            if (node.textContent !== 'Saving controller settings') return;
            watch.disconnect();
            Array.from(document.querySelectorAll('dialog button')).find(item => item.textContent === 'Back').focus();
        });
        watch.observe(node, { childList: true });
        padTap(7);
    }
    else if (controllerStep === 7 && menuStatus() === 'Controller settings saved') {
        const mode = Array.from(document.querySelectorAll('dialog button')).some(item => item.textContent === 'Toggle mod mode, RT');
        if (!mode || focus !== 'Back') throw Error('Controller remap, family label, or save focus failed');
        choose('Unassign a controller binding');
        choose('Unassign next category');
    } else if (controllerStep === 8 && menuStatus() === 'Controller settings saved' && focus === 'Next category, Unassigned') {
        choose('Controller support');
    } else if (controllerStep === 9 && menuStatus() === 'Controller settings saved' && focus === 'Controller support, off') {
        pad();
        padTap(13); // No controller navigation while passthrough is selected.
        pad(10, 11);
        pad();
    } else if (controllerStep === 10 && menuStatus() === 'Controller settings saved' && focus === 'Controller support, on') {
        pad(); // Applying a setting retires the previous device baseline.
        padTap(1);
    } else if (controllerStep === 11 && focus === 'Controller bindings') padTap(1);
    else if (controllerStep === 12 && !document.querySelector('dialog')) Graphics.app.renderer.emit('postrender');
    else return;
    controllerStep++;
}
Input.keyMapper[87] = 'up';
let narrationAudio;
let narrationStarted;
let narrationFrame;
const interval = setInterval(() => {
    if (restart) {
        const fs = require('fs');
        if (fs.existsSync(receipt + '.unexpected-speech')) throw Error('Speech started before the saved mute was restored');
        if (restartStep === 0 && fs.existsSync(receipt + '.muted-title')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Muted title did not admit the controller mode binding');
            restartStep++;
        } else if (restartStep === 1 && fs.existsSync(receipt + '.muted-mode')) {
            if (padTap(9) !== 1 << 9) throw Error('Muted controller mode did not open settings');
            restartStep++;
        } else if (restartStep === 2 && document.querySelector('dialog')) {
            choose('Keyboard bindings');
            const bindings = Array.from(document.querySelectorAll('dialog button')).slice(0, 4).map(item => item.textContent);
            tap('Escape');
            choose('Controller bindings');
            const buttons = Array.from(document.querySelectorAll('dialog button')).map(item => item.textContent);
            const controller = [...buttons.slice(0, 2), buttons.find(item => item.startsWith('Next category, '))];
            tap('Escape');
            choose('Navigation');
            const navigation = Array.from(document.querySelectorAll('dialog button')).slice(0, 7).map(item => item.textContent);
            choose('Bookmarks');
            const bookmarks = Array.from(document.querySelectorAll('dialog button')).map(item => item.textContent);
            if (bookmarks.join('|') !== 'Return marker, Map 1, saved on foot|Back')
                throw Error('The saved and removed bookmarks were not restored correctly on the title screen');
            tap('Escape');
            tap('Escape');
            choose('Audio');
            const audio = Array.from(document.querySelectorAll('dialog button')).slice(0, 17).map(item => item.textContent);
            const narration = Array.from(document.querySelectorAll('dialog button'))
                .map(button => button.textContent).filter(line => /Cutscene descriptions|cutscene description/i.test(line));
            choose('Soundscape');
            const soundscape = Array.from(document.querySelectorAll('dialog button')).slice(0, 2).map(item => item.textContent);
            choose('Exits');
            soundscape.push(document.activeElement.textContent);
            tap('Escape');
            tap('Escape');
            tap('Escape');
            choose('Speech');
            const mute = document.activeElement;
            if (mute.textContent !== 'Speech enabled, off' || mute.getAttribute('aria-pressed') !== 'false')
                throw Error('The persisted speech switch was not accessible while muted');
            const speechChoices = Array.from(document.querySelectorAll('dialog button')).map(item => item.textContent);
            if (!speechChoices.includes('Autodetail, on') || !speechChoices.includes('Menu indexing, on'))
                throw Error('The independent menu speech preferences were not restored');
            if (!speechChoices.includes('Language, English') || document.querySelector('dialog').lang !== 'en-US')
                throw Error('The manual language choice was not restored');
            restartSettings = { bindings, controller, navigation, audio, soundscape, narration };
            fs.writeFileSync(receipt + '.allow-restoration', '');
            pad();
            padTap(0);
            restartStep++;
        } else if (restartStep === 3 && menuStatus() === 'Speech settings saved') {
            if (document.activeElement.textContent !== 'Speech enabled, on' ||
                document.activeElement.getAttribute('aria-pressed') !== 'true') throw Error('Speech recovery lost focus or state');
            tap('Escape');
            if (document.activeElement.textContent !== 'Speech') throw Error('Speech submenu lost parent focus');
            tap('Escape');
            Graphics.app.renderer.emit('postrender');
            restartStep++;
        } else if (restartStep === 4 && fs.existsSync(receipt + '.restored-title')) {
            write({ ...restartSettings, speechRestored: true });
            clearInterval(interval);
            nw.App.quit();
        }
        return;
    }
    if (!fileShown && require('fs').existsSync(receipt + '.title')) {
        if (settingsStep < 24) return verifySettings();
        if (!require('fs').existsSync(receipt + '.returned-title')) return;
        if (controllerStep < 13) return verifyController();
        if (!require('fs').existsSync(receipt + '.controller-returned-title')) return;
        fileShown = true;
        tap('v', 'KeyV');
        if (!document.querySelector('dialog')) throw Error('Remapped settings key is inactive');
        WendyQuestAccessSceneLeaving(SceneManager._scene);
        if (document.querySelector('dialog') || SceneManager._scene._wqaSettingsActive) {
            throw Error('Native scene entry retained the settings modal');
        }
        SceneManager._scene._commandWindow.callHandler('continue');
        const scene = { _wqaFileKind: 1, _started: true, _active: true, _fadeDuration: 60, _fadeOpacity: 255, _fadeSign: 1,
            _listWindow: { active: true, visible: true, openness: 255, _index: 1,
                select() {}, callHandler() {}, isHandled() {} } };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessFilesReady(scene);
        // The first slot should reach the worker without a graphics frame.
    }
    if (!mapShown && require('fs').existsSync(receipt + '.slot')) {
        mapShown = true;
        WendyQuestAccessSceneLeaving(SceneManager._scene);
        const layer = {};
        const scene = { _active: true, _wqaFieldReady: true, _fadeDuration: 0, _fadeOpacity: 0,
            _windowLayer: layer, _mapNameWindow: {
            parent: layer, worldVisible: true, worldAlpha: 1, contentsOpacity: 255,
            _wqaBannerDrawnRevision: 1, _wqaBannerText: 'Synthetic map banner' } };
        $gameMap = { _mapId: 1, _tilesetId: 1, inactiveTime: 0, _events: [null,
            { _eventId: 1, _x: 2, _y: 0, _pageIndex: 0, _trigger: 0, _priorityType: 1 },
            { _eventId: 2, _x: 2, _y: 1, _pageIndex: 0, _trigger: 0, _priorityType: 1 },
            { _eventId: 3, _x: 2, _y: 0, _pageIndex: 0, _trigger: 0, _priorityType: 1 }], _tileEvents: [], _vehicles: [],
            roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
            roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0) };
        $dataMap = { width: 3, height: 2, scrollType: 0, tilesetId: 1, data: new Array(36).fill(0),
            events: [null, { name: 'Synthetic wall', pages: [{ list: [{}, {}] }] },
                { name: 'Synthetic switch', pages: [{ list: [{}, {}] }] },
                { name: 'Synthetic covered event', pages: [{ list: [{}, {}] }] }] };
        $dataTilesets = [null, { flags: [0] }];
        $gameTileChanges = { 1: { 6: 0 } };
        $gamePlayer = { _x: 0, _y: 0, _realX: 0, _realY: 0, _vehicleType: 'walk', _direction: 6,
            canPass: (x, y, d) => x === 0 && y === 0 && d === 6 };
        $gameScreen = { _brightness: 255 };
        SceneManager._scene = Graphics.app.stage = scene;
        Graphics.frameCount = 100;
        WendyQuestAccessMapBannerReady(scene, 1);
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 0 && require('fs').existsSync(receipt + '.map')) {
        const fs = require('fs');
        const scene = SceneManager._scene;
        if (mapVitalsStep === 0) {
            if (!$gamePlayer._interactIcon) {
                const icon = $gamePlayer._interactIcon = { parent: scene, visible: true, worldVisible: true,
                    worldAlpha: 1, scale: { x: 1, y: 1 }, x: 32, y: 32 };
                icon.children = [{ parent: icon, worldVisible: true, worldAlpha: 1, texture: { valid: true } }];
                $gamePlayer._iconState = 1;
                WendyQuestAccessInteractionUpdate(scene, icon);
                Graphics.app.renderer.emit('postrender');
                return;
            }
            if (!fs.existsSync(receipt + '.interaction-prompt')) return;
            $gamePlayer._iconState = 2;
            WendyQuestAccessInteractionUpdate(scene, null);
            fs.writeFileSync(receipt + '.field-vitals-stage', '');
            const visible = parent => ({ parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            const hud = scene._statusWindow = { ...visible(scene), offsetY: 0, y: 0, states: [4],
                isLowHealth: true, _frame: { x: 128, y: 0, width: 128, height: 128 },
                battler: { actor: () => ({ name: 'Synthetic map hero' }) } };
            const row = { ...visible(hud), y: 120 };
            const icon = visible(row);
            hud.stateIcons = { 4: row };
            row.children = [null, icon];
            icon.children = [battleText(icon, 'Synthetic condition')];
            for (const [key, value] of Object.entries({ _numberSprite: '8', _totalSprite: '14', _dividerSprite: '/',
                _FPSprite: '3', _totalSpriteFP: '5', _dividerSpriteFP: '/', levelNumberSprite: '7' }))
                hud[key] = battleText(hud, value);
            for (const [fillName, maskName, radius, end, ratio] of [
                ['fillSprite', 'fillMask', 43, 1.21 * Math.PI, 0.25],
                ['fillFPSprite', 'fillFPMask', 57, Math.PI, 3 / 5],
            ]) {
                const mask = hud[maskName] = new PIXI.Graphics();
                mask.parent = hud;
                mask.lineStyle({ width: 18, color: 0xffffff });
                const base = 0.43 * Math.PI;
                mask.arc(-47, 47, radius, base - 0.05, base + (end - base) * ratio);
                mask.finishPoly();
                hud[fillName] = { ...visible(hud), mask };
            }
            hud.backingFP = visible(hud);
            fs.writeFileSync(receipt + '.field-vitals-keyboard', '');
            tap('h', 'KeyH');
            Graphics.app.renderer.emit('postrender');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 1 && fs.existsSync(receipt + '.field-vitals-h')) {
            fs.unlinkSync(receipt + '.field-vitals-keyboard');
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Map vitals did not enter controller mod mode');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 2) {
            Graphics.app.renderer.emit('postrender');
            if (!fs.existsSync(receipt + '.field-vitals-mode')) return;
            if (padTap(2) !== 1 << 2 || padTap(2) !== 0) throw Error('Map vitals did not return to native input');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 3) {
            Graphics.app.renderer.emit('postrender');
            if (!fs.existsSync(receipt + '.field-vitals-full')) return;
            fs.unlinkSync(receipt + '.field-vitals-stage');
            delete scene._statusWindow;
            mapVitalsStep++;
        }
        if (mapVitalsStep === 4) {
            fs.writeFileSync(receipt + '.autosave-notice-stage', '');
            const banner = scene.fixtureSaveBanner = battleText(scene, 'GAME SAVED');
            SceneManager._wqaNativeAutosaves = 1;
            WendyQuestAccessAutosaveNotice(scene, banner);
            Graphics.app.renderer.emit('postrender');
            if (scene._wqaAutosaveNotice) throw Error('Map autosave admitted a pending native write');
            SceneManager._wqaNativeAutosaves = 0;
            WendyQuestAccessAutosaveNotice(scene, banner);
            WendyQuestAccessAutosaveNotice(scene, banner);
            Graphics.app.renderer.emit('postrender');
            WendyQuestAccessAutosaveNotice(scene, banner);
            Graphics.app.renderer.emit('postrender');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 5 && fs.existsSync(receipt + '.autosave-notice')) {
            WendyQuestAccessAutosaveNoticeEnd(scene, scene.fixtureSaveBanner);
            const next = scene.fixtureSaveBanner = battleText(scene, 'GAME SAVED');
            WendyQuestAccessAutosaveNotice(scene, next);
            Graphics.app.renderer.emit('postrender');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 6) {
            if (fs.readFileSync(receipt + '.autosave-notice', 'utf8').split('\\n').length < 3) return;
            WendyQuestAccessAutosaveNoticeEnd(scene, scene.fixtureSaveBanner);
            delete scene.fixtureSaveBanner;
            fs.unlinkSync(receipt + '.autosave-notice-stage');
            mapVitalsStep++;
        }
        if (mapVitalsStep === 7) {
            fs.writeFileSync(receipt + '.map-diagram-stage', '');
            scene._wqaMapRestored = true;
            const spriteset = scene._spriteset = { parent: scene };
            const layer = spriteset._pictureContainer_upper = { parent: spriteset, children: [] };
            $gameScreen._pictures = [];
            $gameMessage.interpreter = { _list: [{}], _index: 1, _waitMode: 'message' };
            scene._messageWindow = { parent: scene._windowLayer, pause: true, openness: 255, contentsOpacity: 0 };
            const title = 'system/Caffeine Caverns Map';
            for (const [id, name, alpha] of [[27, title, 1], [35, title + ' Trail 1', 1], [37, title + ' Trail 3', 0]]) {
                $gameScreen._pictures[id] = { _name: name, _duration: 0 };
                layer.children.push({ _pictureId: id, _pictureName: name, parent: layer, worldVisible: true,
                    worldAlpha: alpha, texture: { valid: true }, bitmap: { isReady: () => true },
                    anchor: { x: 0.5, y: 0.5 }, _frame: { width: 380, height: 300 },
                    worldTransform: { a: 1, d: 1, b: 0, c: 0, tx: 320, ty: 180 } });
            }
            diagramViewport = { width: Graphics.width, height: Graphics.height };
            Object.assign(Graphics, { width: 640, height: 360 });
            WendyQuestAccessDialogueReady(scene, true);
            Graphics.app.renderer.emit('postrender');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 8 && fs.existsSync(receipt + '.map-diagram-title')) {
            tap('i', 'KeyI');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 9 && fs.existsSync(receipt + '.map-diagram-details')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Map diagram did not enter controller mod mode');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 10 && fs.existsSync(receipt + '.map-diagram-mode')) {
            if (padTap(15) !== 1 << 15 || padTap(15) !== 0) throw Error('Diagram review did not return to native input');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 11 && fs.existsSync(receipt + '.map-diagram-review')) {
            WendyQuestAccessSceneLeaving(scene);
            scene._wqaFieldReady = true;
            delete scene._messageWindow;
            delete $gameScreen._pictures;
            delete $gameMessage.interpreter;
            delete scene._wqaMapRestored;
            Object.assign(Graphics, diagramViewport);
            fs.unlinkSync(receipt + '.map-diagram-stage');
            mapVitalsStep++;
        }
        if (mapVitalsStep < 12) return;
        if (mapVitalsStep === 12) {
            $gameMap._mapId = 15;
            tap('M', 'KeyM', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            mapVitalsStep++;
            return;
        }
        if (mapVitalsStep === 13) {
            if (!fs.existsSync(receipt + '.field-description')) return;
            $gameMap._mapId = 1;
            mapVitalsStep++;
        }
        if (!soundscapeStarted) {
            Object.assign($gameMap, { tileWidth: () => 32, deltaX: (x, y) => x - y, deltaY: (x, y) => x - y });
            const actor = $gameMap._events[1];
            Object.assign(actor, { _realX: 2, _realY: 0, _opacity: 255, _tileId: 0, _characterName: 'Fixture' });
            $dataMap.events[1].pages[0].trigger = 0;
            scene._spriteset = { _characterSprites: [{ _character: actor, _tileId: 0, _characterName: 'Fixture',
                _frame: { width: 32, height: 32 }, renderable: true, worldVisible: true, worldAlpha: 1, texture: { valid: true },
                worldTransform: { tx: 100, ty: 100, d: 1 } }] };
            soundscapeStarted = performance.now();
            WendyQuestAccessSoundscapeUpdate(scene);
            Graphics.app.renderer.emit('postrender');
            if (!scene._wqaSoundscapeSample) throw Error('Rendered ambient observation was rejected');
        }
        if (!require('fs').existsSync(receipt + '.soundscape')) return;
        if (!scene._wqaSoundscapeSample) throw Error('Ambient sample lost its native scene ownership');
        WendyQuestAccessFieldEvent(scene);
        if (scene._wqaSoundscapeActive || scene._wqaSoundscapeSample) throw Error('Native event retained ambient audio');
        fieldStep = 100;
        tap('|', 'Backslash', { shiftKey: true });
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 100 && require('fs').existsSync(receipt + '.filter-on')) {
        fieldStep = 101;
        tap('|', 'Backslash', { shiftKey: true });
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 101 && require('fs').existsSync(receipt + '.filter-off')) {
        fieldStep = 1;
        browseStarted = performance.now();
        tap('p', 'KeyP');
        Graphics.app.renderer.emit('postrender');
        require('fs').writeFileSync(receipt + '.browse-submit-ms', String(performance.now() - browseStarted));
    }
    if (fieldStep === 1 && require('fs').existsSync(receipt + '.field-target-1')) {
        require('fs').writeFileSync(receipt + '.browse-receipt-ms', String(performance.now() - browseStarted));
        fieldStep++;
        tap(']', 'BracketRight');
        Graphics.app.renderer.emit('postrender');
        tap('n', 'KeyN');
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 2 && require('fs').existsSync(receipt + '.field-target-2')) {
        fieldStep++;
        padStick(0, 0);
        padStick(-0.8, 0);
        padStick(0, 0);
    }
    if (fieldStep === 3) Graphics.app.renderer.emit('postrender');
    if (fieldStep === 3 && !routeRequested && require('fs').existsSync(receipt + '.field-target-3')) {
        routeRequested = true;
        fieldStep++;
        const start = performance.now();
        tap(String.fromCharCode(92), 'Backslash');
        Graphics.app.renderer.emit('postrender');
        require('fs').writeFileSync(receipt + '.route-submit-ms', String(performance.now() - start));
    }
    if (fieldStep === 4 && require('fs').existsSync(receipt + '.route-1')) {
        const scene = SceneManager._scene;
        if (!scene._wqaBeaconActive) throw Error('The worker did not arm its route beacon');
        if (!beaconStarted) beaconStarted = performance.now();
        Graphics.frameCount++;
        if (scene._wqaBeaconDue && Graphics.frameCount >= scene._wqaBeaconDue) WendyQuestAccessBeaconUpdate(scene);
        Graphics.app.renderer.emit('postrender');
        const fs = require('fs');
        if (!beaconDetourStep) {
            if (!fs.existsSync(receipt + '.beacon')) return;
            fs.writeFileSync(receipt + '.beacon-ms', String(performance.now() - beaconStarted));
            fs.unlinkSync(receipt + '.beacon');
            fs.writeFileSync(receipt + '.beacon-detour', '');
            const player = $gamePlayer;
            player._x = player._realX = 0;
            player._y = player._realY = 1;
            player._direction = 6;
            player.canPass = () => true;
            WendyQuestAccessFieldMove(scene, 2, true);
            beaconDetourStep = 1;
            return;
        }
        // Check that the detour produced an updated absolute cue through the real worker.
        if (beaconDetourStep === 1 && fs.existsSync(receipt + '.beacon-refresh')) {
            fs.unlinkSync(receipt + '.beacon-detour');
            const player = $gamePlayer;
            player._y = player._realY = 0;
            player._direction = 6;
            WendyQuestAccessFieldMove(scene, 8, true);
            beaconDetourStep = 2;
        }
        if (beaconDetourStep !== 2 || !fs.existsSync(receipt + '.beacon')) return;
        fieldStep++;
        padTap(6);
    }
    if (fieldStep === 5) Graphics.app.renderer.emit('postrender');
    if (fieldStep === 4 && beaconDetourStep) {
        const scene = SceneManager._scene;
        if (!scene._wqaBeaconActive) throw Error('The beacon lost its destination after a manual detour');
    }
    if (autowalkStep < 7 && require('fs').existsSync(receipt + '.route-2')) {
        const scene = SceneManager._scene;
        if (autowalkStep === 0) {
            tap('v', 'KeyV');
            if (!document.querySelector('dialog') || !scene._wqaSettingsActive) throw Error('Field settings did not open');
            if (scene._wqaBeaconActive) throw Error('The settings modal retained the route beacon');
            choose('Navigation');
            choose('Autowalk, off');
            autowalkStep++;
        } else if (autowalkStep === 1 && menuStatus() === 'Navigation settings saved') {
            tap('Escape');
            tap('Escape');
            if (document.querySelector('dialog')) throw Error('Field settings did not return control');
            Object.setPrototypeOf($gamePlayer, Game_Player.prototype);
            Object.assign($gamePlayer, {
                isMoving: () => false, canMove: () => true, getInputDirection: () => 0,
                canStartLocalEvents: () => true, findEventsAt: () => [],
                executeMove(direction) {
                    if (direction !== 6 || this._x !== 0) throw Error('Unexpected native movement dispatch');
                    this._realX = this._x = 1;
                    this._movementSuccess = true;
                }
            });
            $gameTemp = { isDestinationValid: () => false };
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            autowalkStep++;
        } else if (autowalkStep === 2 && scene._wqaAutowalkActive) {
            $gamePlayer.moveByInput();
            if ($gamePlayer._x !== 1 || !scene._wqaAutowalkActive) throw Error('The directions key did not follow its course');
            $gamePlayer.moveByInput();
            if (scene._wqaAutowalkActive) throw Error('The route did not retire at arrival');
            Graphics.app.renderer.emit('postrender');
            autowalkStep++;
        } else if (autowalkStep === 3 && require('fs').existsSync(receipt + '.autowalk')) {
            tap('v', 'KeyV');
            choose('Navigation');
            choose('Speak autowalk path, off');
            autowalkStep++;
        } else if (autowalkStep === 4 && menuStatus() === 'Navigation settings saved') {
            tap('Escape');
            tap('Escape');
            $gamePlayer._realX = $gamePlayer._x = 0;
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            autowalkStep++;
        } else if (autowalkStep === 5 && require('fs').existsSync(receipt + '.autowalk-path')) {
            if (!scene._wqaAutowalkActive) throw Error('The narrated route did not arm');
            $gamePlayer._realX = -0.5;
            tap('V', 'KeyV', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            if (scene._wqaAutowalkActive) throw Error('The stop command did not retire the moving route');
            $gamePlayer._realX = $gamePlayer._x;
            $gamePlayer.moveByInput();
            if ($gamePlayer._x !== 0) throw Error('The stopped route dispatched movement');
            autowalkStep++;
        } else if (autowalkStep === 6 && require('fs').existsSync(receipt + '.autowalk-stop')) {
            autowalkStep++;
        }
        return;
    }
    if (!caveShown && autowalkStep === 7) {
        caveShown = true;
        WendyQuestAccessSceneLeaving(SceneManager._scene);
        const tilemap = new PIXI.Container();
        Object.assign(tilemap, { tileWidth: 32, tileHeight: 32, origin: new PIXI.Point(),
            _isOverpassPosition: () => false, _readMapData: () => 0, _isHigherTile: () => false });
        tilemap.position.set(32, 0);
        const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
        sprite.position.set(24, 48);
        tilemap.addChild(sprite);
        const parent = tilemap.enableTempParent();
        tilemap.updateTransform();
        tilemap.disableTempParent(parent);
        const patrol = { _eventId: 4, _x: 5, _realX: 4.5, _y: 24, _realY: 24, _pageIndex: 0, _trigger: 2,
            _priorityType: 1, _moveType: 0, _moveSpeed: 4, _moveFrequency: 5, _direction: 6,
            _stopCount: 0, _waitCount: 0, _jumpCount: 0, _moveRouteIndex: 0, _moveRoute: { list: [{ code: 0 }] },
            getMapSprite: () => sprite };
        sprite._character = patrol;
        const control = { _eventId: 2, _x: 6, _realX: 6, _y: 29, _realY: 29, _pageIndex: 0, _trigger: 0,
            _priorityType: 1, _moveType: 0 };
        const events = [null, null, control, null, patrol];
        const scene = { _active: true, _wqaMapRestored: true, _wqaFieldReady: true, _fadeDuration: 0, _fadeOpacity: 0,
            _spriteset: { _tilemap: tilemap } };
        $gameMap = { _mapId: 196, _tilesetId: 1, inactiveTime: 0, _events: events, _displayX: 0, _displayY: 20,
            _tileEvents: [], _vehicles: [], _commonEvents: [] };
        $dataMap = { width: 23, height: 52, scrollType: 0, tilesetId: 1, disableDashing: false, data: new Array(23 * 52 * 6).fill(0),
            events: [null, null, { name: 'Synthetic cave switch', pages: [{ list: [{}, {}] }] },
                null, { name: 'Synthetic patrol', pages: [{ list: [{}, {}] }] }] };
        $gamePlayer = { _x: 6, _y: 26, _realX: 6, _realY: 26, _vehicleType: 'walk', _moveSpeed: 4, _direction: 8 };
        SceneManager._scene = Graphics.app.stage = scene;
        Object.assign(Graphics, { width: 640, height: 360, frameCount: 400 });
        Graphics.app.renderer.screen = new PIXI.Rectangle(0, 0, 320, 200);
        const started = performance.now();
        tap('U', 'KeyU', { shiftKey: true });
        Graphics.app.renderer.emit('postrender');
        require('fs').writeFileSync(receipt + '.cave-review-ms', String(performance.now() - started));
    }
    if (!caveRoute && require('fs').existsSync(receipt + '.cave')) {
        caveRoute = true;
        const started = performance.now();
        tap(String.fromCharCode(92), 'Backslash');
        Graphics.app.renderer.emit('postrender');
        require('fs').writeFileSync(receipt + '.timed-submit-ms', String(performance.now() - started));
        // Let the first receipt arrive after the fixture's useful window.
        // This stationary patrol's native stop counter advances once per update.
        Graphics.frameCount += 40;
        $gameMap._events[4]._stopCount += 40;
    }
    if (caveRoute && !dialogueShown) Graphics.app.renderer.emit('postrender');
    if (!dialogueShown && require('fs').existsSync(receipt + '.timed')) {
        const timingScene = SceneManager._scene;
        if (!caveCueStarted) {
            if (timingScene._wqaCaveCueDue !== Graphics.frameCount) throw Error('The late cave forecast was not replaced');
            caveCueStarted = performance.now();
            WendyQuestAccessCaveTimingUpdate(timingScene);
            Graphics.app.renderer.emit('postrender');
        }
        if (!require('fs').existsSync(receipt + '.cave-cue')) return;
        require('fs').writeFileSync(receipt + '.cave-cue-ms', String(performance.now() - caveCueStarted));
        dialogueShown = true;
        WendyQuestAccessSceneLeaving(SceneManager._scene);
        if (timingScene._wqaCaveTimingActive) throw Error('Native scene entry retained the cave timing cue');
        const layer = {};
        const visible = { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255 };
        const choice = { ...visible, active: true, _index: 0, _wqaChoiceShown: null,
            _wqaChoiceRows: [{ index: 0, text: 'Synthetic choice' }] };
        const message = { ...visible, _wqaDialoguePaint: { text: 'Synthetic prompt', end: 16, spoken: 0 },
            _choiceListWindow: choice };
        const scene = { _active: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: layer, _messageWindow: message };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessDialogueReady(scene);
        Graphics.app.renderer.emit('postrender');
    }
    if (!repeated && require('fs').existsSync(receipt + '.choice')) {
        repeated = true;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true }));
        tap('r', 'KeyR');
        tap('t', 'KeyT');
    }
    if (dialoguePadStep === 0 && require('fs').existsSync(receipt + '.repeat')) {
        dialoguePadStep++;
        pad();
        if (padTap(8) !== 0 || padTap(7) !== 1 << 7) throw Error('Old and new mode bindings did not hand back correctly');
    }
    if (dialoguePadStep === 1 && require('fs').existsSync(receipt + '.dialogue-mode')) {
        dialoguePadStep++;
        if (padTap(0) !== 1) throw Error('Dialogue repeat did not consume native confirm');
    }
    if (!numberShown && require('fs').existsSync(receipt + '.controller-repeat')) {
        numberShown = true;
        WendyQuestAccessSceneLeaving(SceneManager._scene);
        const layer = {};
        const number = { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255,
            active: true, _index: 1, _wqaNumberDrawn: '07', _wqaNumberChange: 0, _wqaNumberShownChange: null };
        const scene = { _active: true, _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: layer,
            _messageWindow: { _numberInputWindow: number } };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessDialogueReady(scene);
        Graphics.app.renderer.emit('postrender');
    }
    const fs = require('fs');
    if (fs.existsSync(receipt) && fs.existsSync(receipt + '.route-2')) {
        if (endingStep === 0) {
            fs.writeFileSync(receipt + '.closing-pass', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const layer = {};
            const item = { name: 'Synthetic supply' };
            const visible = { parent: layer, active: true, worldVisible: true, worldAlpha: 1, openness: 255,
                contentsOpacity: 255, contents: { isReady: () => true }, innerWidth: 200, innerHeight: 120 };
            const scene = SceneManager._scene = Graphics.app.stage = {
                _started: true, _active: true, _fadeOpacity: 0, _fadeDuration: 0, _windowLayer: layer,
                _itemWindow: { ...visible, _index: 0, _data: [item], isFocused: true,
                    itemRect: () => ({ x: 0, y: 0, width: 100, height: 30 }),
                    itemIsEquipment: () => false, isEnabled: () => true, needsNumber: () => true },
                _helpWindow: { ...visible, _selectedItem: item, _wqaMenuHelpPaint: 1,
                    _text: 'Visible first line\\nVisible second line' }
            };
            $gameParty = { numItems: () => 3 };
            WendyQuestAccessMenuReady(scene, 2);
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 1 && fs.existsSync(receipt + '.menuFocus')) {
            tap('i', 'KeyI');
            endingStep++;
        } else if (endingStep === 2 && fs.existsSync(receipt + '.menuDetails')) {
            tap('ArrowDown', 'ArrowDown', { shiftKey: true });
            if (nativeMenuArrows !== 0) throw Error('The review chord reached native selection');
            tap('ArrowDown', 'ArrowDown');
            if (nativeMenuArrows !== 1) throw Error('An ordinary arrow did not reach the native menu');
            endingStep++;
        } else if (endingStep === 3 && fs.existsSync(receipt + '.menu-review-second')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Menu mod mode did not claim its binding');
            endingStep++;
        } else if (endingStep === 4 && fs.existsSync(receipt + '.menu-mode')) {
            if (padTap(14) !== 1 << 14) throw Error('Menu review did not consume the controller direction');
            endingStep++;
        } else if (endingStep === 5 && fs.existsSync(receipt + '.menu-review-first')) {
            tap('v', 'KeyV');
            choose('Speech');
            choose('Autodetail, off');
            endingStep++;
        } else if (endingStep === 6 && menuStatus() === 'Speech settings saved') {
            choose('Menu indexing, off');
            endingStep++;
        } else if (endingStep === 7 && menuStatus() === 'Speech settings saved') {
            tap('Escape');
            tap('Escape');
            fs.writeFileSync(receipt + '.menu-autodetail', '');
            WendyQuestAccessMenuReady(SceneManager._scene, 2);
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 8 && fs.existsSync(receipt + '.menuDetails-auto')) {
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            fs.writeFileSync(receipt + '.quest-stage', '');
            const scene = SceneManager._scene = Graphics.app.stage = {
                _wqaFieldReady: true, _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true,
                _fadeOpacity: 0, _fadeDuration: 0, _windowLayer: {}
            };
            $gameMap = { _mapId: 1, inactiveTime: 0, _interpreter: {} };
            $gamePlayer = { _x: 0, _realX: 0, _y: 0, _realY: 0, _vehicleType: 'walk' };
            $gameScreen = { _brightness: 255 };
            const bitmap = { width: 200, height: 80, paintOpacity: 255, drawText() {},
                measureTextWidth: text => text.length * 5, isReady: () => true };
            const tracker = scene._questNavWindow = {
                _init: true, _questData: {}, _questId: 'fixture', _needContentRefresh: false,
                _transitionState: 'full', _targetTransitionState: 'full',
                parent: scene._windowLayer, visible: true, worldVisible: true, worldAlpha: 1, openness: 255, offsetY: 0,
                contents: bitmap, contentsOpacity: 255, innerWidth: 200, innerHeight: 80,
                _contentsSprite: { bitmap, worldVisible: true, worldAlpha: 1,
                    worldTransform: { a: 1, b: 0, c: 0, d: 1, tx: 8, ty: 8 } }
            };
            const finish = WendyQuestAccessQuestPaint(tracker);
            if (!finish) throw Error('The ready tracker was rejected');
            tracker._wqaQuestCapture.title = true;
            bitmap.drawText('Synthetic quest', 4, 4, 180, 16);
            tracker._wqaQuestCapture.title = false;
            tracker._wqaQuestCapture.beginRow();
            bitmap.drawText('A shown clue', 4, 24, 180, 16);
            bitmap.drawText('1/2', 4, 24, 180, 16, 'right');
            tracker._wqaQuestCapture.endRow();
            finish(true);
            WendyQuestAccessQuestUpdate(scene);
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 9 && fs.existsSync(receipt + '.quest-detail-auto')) {
            let nativeQ = false;
            document.addEventListener('keydown', event => { nativeQ = event.code === 'KeyQ' && !event.defaultPrevented; },
                { once: true });
            tap('q', 'KeyQ');
            if (!nativeQ) throw Error('Quest review swallowed native Page Up input');
            endingStep = 90;
        } else if (endingStep === 90 && fs.existsSync(receipt + '.quest-objective')) {
            tap('i', 'KeyI');
            endingStep = 10;
        } else if (endingStep === 10 && fs.existsSync(receipt + '.quest-detail')) {
            fs.renameSync(receipt + '.quest-detail', receipt + '.quest-detail-key');
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Field mod mode did not claim its binding');
            endingStep++;
        } else if (endingStep === 11) {
            Graphics.app.renderer.emit('postrender');
            if (fs.existsSync(receipt + '.quest-mode')) {
                if (padTap(3) !== 1 << 3) throw Error('Quest review did not consume the native menu button');
                endingStep++;
            }
        } else if (endingStep === 12 && fs.existsSync(receipt + '.quest-detail')) {
            const scene = SceneManager._scene;
            scene._questNavWindow.visible = false;
            WendyQuestAccessQuestUpdate(scene);
            if (scene._wqaQuestTracking || padTap(3) !== 0) throw Error('A hidden tracker retained field ownership');
            fs.writeFileSync(receipt + '.quest-restore-stage', '');
            WendyQuestAccessSceneLeaving(scene);
            const next = SceneManager._scene = Graphics.app.stage = {
                _wqaFieldReady: false, _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true,
                _fadeOpacity: 1, _fadeDuration: 1, _windowLayer: {}
            };
            const noop = () => {};
            const tracker = next._questNavWindow = {
                ...scene._questNavWindow, _wqaQuestDraft: undefined, parent: next._windowLayer, visible: true,
                _questData: { _questClearContent: '' }, _transitionState: 'small', _targetTransitionState: 'small',
                _transitionTimer: 0, _transitionTime: 0.2, _bgMargin: 12,
                drawNavContents() {
                    this._wqaQuestCapture.beginRow();
                    this.contents.drawText('Recovered clue', 4, 4, 160, 16);
                    this.contents.drawText('0/1', 4, 4, 160, 16, 'right');
                    this._wqaQuestCapture.endRow();
                },
                drawQuestTitle: noop, drawQuestObjectives: noop, drawTextLines: noop, drawText: noop, drawTextEx: noop,
                drawQuestIcon: noop, drawIconWithSpacing: noop, lineHeight: noop, convertEscapeCharacters: noop,
                calcTextHeight: noop, maxFontSizeInLine: noop, createTextState: noop, createTextBuffer: noop,
                processAllText: noop, processCharacter: noop, processControlCharacter: noop, processNewLine: noop,
                flushTextState: noop, textWidth: noop, changePaintOpacity: noop, translucentOpacity: noop
            };
            Object.assign(tracker.contents, { bitmapFontSize: 1, fontSize: 16, fontBitmap: () => ({ bitmaps: {} }),
                getTextX: (_text, x) => x, drawText() { throw Error('Quest restoration touched the live bitmap'); } });
            $gameParty = { getNav: () => 'fixture' };
            const gameQuest = { getAllObjectives: () => [], questInNavi: () => true };
            WendyQuestAccessQuestUpdate(next, gameQuest);
            Graphics.app.renderer.emit('postrender');
            if (tracker._wqaQuestDraft !== undefined) throw Error('Quest restored during native loading');
            Object.assign(next, { _wqaFieldReady: true, _fadeOpacity: 0, _fadeDuration: 0 });
            WendyQuestAccessQuestUpdate(next, gameQuest);
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 13 && fs.existsSync(receipt + '.quest-restore-focus')) {
            fs.unlinkSync(receipt + '.quest-stage');
            fs.writeFileSync(receipt + '.quest-navigation-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const parent = {};
            const scene = SceneManager._scene = Graphics.app.stage = {
                _wqaFieldReady: true, _active: true, _fadeOpacity: 0, _fadeDuration: 0,
                _spriteset: { _tilemap: { parent }, _ayatamQuestIconSprite: [{
                    parent, _active: true, _questId: 'quest1', _eventId: 1, worldVisible: true, worldAlpha: 1,
                    renderable: true, texture: { valid: true }, bitmap: {}, x: 40, y: 50
                }] }
            };
            window.Ayatam = { QUEST: { needsRefresh: false, QuestDatabase: [] } };
            $gameParty = { getNav: () => 'quest1' };
            $gameMap = { _mapId: 1, _tilesetId: 1, inactiveTime: 0, _events: [null,
                { _eventId: 1, _x: 2, _y: 0, _pageIndex: 0, _trigger: 0, _priorityType: 1 }],
                _tileEvents: [], _vehicles: [] };
            $gamePlayer = { _x: 0, _y: 0, _realX: 0, _realY: 0, _vehicleType: 'walk', _direction: 6 };
            $dataMap = { width: 3, height: 2, scrollType: 0, tilesetId: 1, data: new Array(36).fill(0),
                events: [null, { name: 'Synthetic quest anchor', pages: [{ list: [
                    { code: 357, parameters: ['Ayatam_HighQualityQuestSystem', 'questMarker', '',
                        { questId: '1', objectiveId: '0' }] }, { code: 101, parameters: [] }, { code: 0 }
                ] }] }] };
            $dataTilesets = [null, { flags: [0] }];
            $gameTileChanges = {};
            tap(']', 'BracketRight', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            if (!scene._wqaQuestNavigation) throw Error('The published quest marker did not own the selection');
            endingStep++;
        } else if (endingStep === 14 && fs.existsSync(receipt + '.quest-nav-target')) {
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 15 && fs.existsSync(receipt + '.quest-nav-route')) {
            const scene = SceneManager._scene;
            if (!scene._wqaAutowalkActive || !scene._wqaBeaconActive)
                throw Error('Quest directions did not arm movement and beacon owners');
            WendyQuestAccessQuestNavigationLeaving(scene);
            if (scene._wqaAutowalkActive || scene._wqaBeaconActive || scene._wqaQuestNavigation)
                throw Error('The marker rebuild retained a quest route');
            scene._spriteset._ayatamQuestIconSprite = [];
            tap('p', 'KeyP');
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 16 && fs.existsSync(receipt + '.quest-nav-unavailable')) {
            fs.unlinkSync(receipt + '.quest-navigation-stage');
            fs.writeFileSync(receipt + '.bookmark-stage', '');
            tap('v', 'KeyV');
            choose('Navigation');
            choose('Bookmarks');
            choose('Save current location');
            endingStep++;
        } else if (endingStep === 17 && menuStatus() === 'Bookmark 1 saved.') {
            choose('Bookmark 1, This map, saved on foot');
            choose('Rename bookmark');
            choose('Clear name');
            choose('Choose character');
            choose('A through F');
            pad();
            padTap(0);
            endingStep++;
        } else if (endingStep === 18 && menuStatus() === 'Name a') {
            const input = document.querySelector('dialog input');
            if (input.value !== 'a') throw Error('The controller character did not enter the bookmark name');
            input.value = 'Return marker';
            for (const type of ['keydown', 'keyup'])
                input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            endingStep++;
        } else if (endingStep === 19 && menuStatus() === 'Bookmark name saved.') {
            choose('Remove bookmark');
            if (document.activeElement.textContent !== 'Keep bookmark') throw Error('Remove did not focus Keep bookmark');
            tap('Escape');
            if (document.activeElement.textContent !== 'Remove bookmark') throw Error('Remove did not restore detail focus');
            for (let level = 0; level < 4; level++) tap('Escape');
            if (document.querySelector('dialog')) throw Error('Bookmark management did not return to the field');
            $gamePlayer._realY = $gamePlayer._y = 1;
            Object.setPrototypeOf($gamePlayer, Game_Player.prototype);
            Object.assign($gamePlayer, {
                isMoving: () => false, canMove: () => true, getInputDirection: () => 0,
                canPass: () => true, canStartLocalEvents: () => true, findEventsAt: () => [],
                executeMove(direction) {
                    if (direction !== 8 || this._y !== 1) throw Error('Bookmark dispatched the wrong native move');
                    this._realY = this._y = 0;
                    this._movementSuccess = true;
                }
            });
            $gameTemp = { isDestinationValid: () => false };
            $gameMap.roundXWithDirection = (x, direction) => x + (direction === 6 ? 1 : direction === 4 ? -1 : 0);
            $gameMap.roundYWithDirection = (y, direction) => y + (direction === 2 ? 1 : direction === 8 ? -1 : 0);
            padStick(0, 0);
            padStick(0, -0.8);
            padStick(0, 0);
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 20) {
            if (!bookmarkDirectionsRequested) {
                Graphics.app.renderer.emit('postrender');
                if (!fs.existsSync(receipt + '.bookmark-browse')) return;
                tap(String.fromCharCode(92), 'Backslash');
                Graphics.app.renderer.emit('postrender');
                bookmarkDirectionsRequested = true;
                return;
            }
            if (!fs.existsSync(receipt + '.bookmark-route')) return;
            const scene = SceneManager._scene;
            if (!scene._wqaAutowalkActive || !scene._wqaBeaconActive)
                throw Error('Bookmark directions did not arm movement and beacon owners');
            $gamePlayer.moveByInput();
            if ($gamePlayer._y !== 0 || !scene._wqaAutowalkActive) throw Error('Autowalk did not reach the bookmark');
            $gamePlayer.moveByInput();
            if (scene._wqaAutowalkActive) throw Error('Autowalk did not retire at the bookmark');
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 21 && fs.existsSync(receipt + '.bookmark-arrival')) {
            tap('[', 'BracketLeft', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            endingStep++;
        } else if (endingStep === 22 && fs.existsSync(receipt + '.bookmark-entity')) {
            tap('v', 'KeyV');
            choose('Navigation');
            choose('Bookmarks');
            choose('Bookmark current destination');
            endingStep++;
        } else if (endingStep === 23 && menuStatus() === 'Bookmark 2 saved.') {
            choose('Bookmark 2, This map, saved on foot');
            choose('Select for directions');
            if (document.querySelector('dialog')) throw Error('The optional bookmark shortcut did not return to the field');
            tap('v', 'KeyV');
            choose('Navigation');
            choose('Bookmarks');
            choose('Bookmark 2, This map, saved on foot');
            choose('Remove bookmark');
            choose('Confirm removal');
            endingStep++;
        } else if (endingStep === 24 && menuStatus() === 'Bookmark removed.') {
            if (Array.from(document.querySelectorAll('dialog button')).some(item => item.textContent.startsWith('Bookmark 2,')))
                throw Error('Removed bookmark stayed in the list');
            fs.unlinkSync(receipt + '.bookmark-stage');
            fs.writeFileSync(receipt + '.cross-map-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            SceneManager._scene = Graphics.app.stage = { _wqaFieldReady: true, _active: true, _fadeOpacity: 0, _fadeDuration: 0 };
            installTransferPage(3, 2);
            tap('[', 'BracketLeft', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            endingStep = 68;
        } else if (endingStep === 68 && fs.existsSync(receipt + '.cross-map-event')) {
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            endingStep = 69;
        } else if (endingStep === 69 && fs.existsSync(receipt + '.cross-map-event-route')) {
            $gamePlayer.moveByInput();
            if ($gamePlayer._x !== 0 || $gameMap._events[1]._starting)
                throw Error('Generic event directions crossed the native boundary');
            tap(']', 'BracketRight', { shiftKey: true });
            Graphics.app.renderer.emit('postrender');
            endingStep = 25;
        } else if (endingStep === 25 && crossMapStarted === 0 && fs.existsSync(receipt + '.cross-map-browse')) {
            crossMapStarted = performance.now();
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            fs.writeFileSync(receipt + '.cross-map-submission-ms', String(performance.now() - crossMapStarted));
        } else if (endingStep === 25 && fs.existsSync(receipt + (crossMapLeg === 0 ? '.cross-map-next' : '.cross-map-entrance'))) {
            if (crossMapLeg === 0)
                fs.writeFileSync(receipt + '.cross-map-receipt-ms', String(performance.now() - crossMapStarted));
            const source = SceneManager._scene;
            if (!source._wqaBookmarkEntrance || !source._wqaAutowalkActive || !source._wqaBeaconActive)
                throw Error('The entrance did not arm native movement and handback owners');
            $gamePlayer.moveByInput();
            if ($gamePlayer._x !== 0 || source._wqaAutowalkActive)
                throw Error('Autowalk crossed the transfer boundary');
            $gamePlayer._realX = $gamePlayer._x = 1;
            $gameMap._events[1]._starting = true;
            if (!$gameMap.setupStartingMapEvent() || !Graphics._wqaBookmarkTransferPending)
                throw Error('The native accepted event did not arm bookmark handback');
            const interpreter = $gameMap._interpreter;
            if (!interpreter.command201(interpreter._list[0].parameters) || interpreter._waitMode !== 'transfer' ||
                !Graphics._wqaBookmarkTransferPending || source._wqaFieldReady)
                throw Error('The native reservation did not close the source and preserve the expected landing');
            if ($gamePlayer._newMapId !== 2 - crossMapLeg) throw Error('Cross-map directions selected the wrong landing');
            const loading = SceneManager._scene = Graphics.app.stage = {
                _wqaFieldReady: false, _active: true, _fadeOpacity: 1, _fadeDuration: 1
            };
            $gameMap._mapId = $gamePlayer._newMapId;
            $gamePlayer._realX = $gamePlayer._x = $gamePlayer._newX;
            $gamePlayer._realY = $gamePlayer._y = $gamePlayer._newY;
            $gamePlayer._transferring = false;
            $gameMap._events = $dataMap.events = [null];
            interpreter._list = null;
            if (crossMapLeg === 0) installTransferPage(2, 1);
            WendyQuestAccessFieldReady(loading);
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            if (!Graphics._wqaBookmarkTransferPending || loading._wqaRouteActive)
                throw Error('Bookmark directions resumed before native readiness');
            endingStep++;
        } else if (endingStep === 26) {
            const loading = SceneManager._scene;
            Object.assign(loading, { _wqaFieldReady: true, _fadeOpacity: 0, _fadeDuration: 0 });
            const handback = performance.now();
            WendyQuestAccessFieldReady(loading);
            Graphics.app.renderer.emit('postrender');
            if (crossMapLeg === 0)
                fs.writeFileSync(receipt + '.cross-map-handback-ms', String(performance.now() - handback));
            if (Graphics._wqaBookmarkTransferPending || loading._wqaAutowalkActive || loading._wqaBeaconActive)
                throw Error('Handback did not finish without movement or audio');
            tap(String.fromCharCode(92), 'Backslash');
            Graphics.app.renderer.emit('postrender');
            endingStep = ++crossMapLeg === 1 ? 25 : 27;
        } else if (endingStep === 27 && fs.existsSync(receipt + '.cross-map-arrived')) {
            fs.unlinkSync(receipt + '.cross-map-stage');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            fs.writeFileSync(receipt + '.battle-stage', '');
            const layer = {};
            const scene = SceneManager._scene = Graphics.app.stage = {
                _wqaBattleStarted: true, _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0, _uiLayer: layer
            };
            window.BattleManager = { _phase: 'input', _inputting: true, _wqaDialogueBusy: false };
            const option = { parent: layer, _hasFocus: true, _animationPosition: 1, _animationPositionTarget: 1,
                worldVisible: true, worldAlpha: 1, _prerequisitesMet: true };
            option._nameSprite = battleText(option, 'Synthetic guard');
            option._subTextSprite = battleText(option, 'Shield raised');
            option._costTextSprite = battleText(option, '2 MP');
            const actorData = { name: 'Synthetic hero', battlerName: 'Hero animation' };
            const actor = { actor: () => actorData };
            const visible = parent => ({ parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            const main = option._followTarget = { _battleOptionsActive: 0, battleOptions: [[option]],
                _actor: actor, _battlerName: actorData.battlerName };
            main._mainSprite = visible(main);
            const companion = { ...visible(layer), _actor: { name: 'Synthetic companion', battlerName: 'Companion animation' },
                _battlerName: 'Companion animation' };
            companion._mainSprite = companion;
            const battlefield = {};
            const paintedEnemy = { parent: battlefield, texture: { valid: true }, worldVisible: true, worldAlpha: 1,
                _enemy: { originalName: () => 'Synthetic archer', isAlive: () => true } };
            scene._spriteset = { _actorSprites: [main], _subActorSprite: companion,
                _battleField: battlefield, _enemySprites: [paintedEnemy] };
            const hud = scene._statusWindow = { ...visible(scene), battler: actor, offsetY: 0, states: [] };
            for (const [key, value] of Object.entries({ _numberSprite: '8', _totalSprite: '14', _dividerSprite: '/',
                _FPSprite: '3', _totalSpriteFP: '5', _dividerSpriteFP: '/', levelNumberSprite: '7' }))
                hud[key] = battleText(hud, value);
            hud._HPIcon = visible(hud);
            hud._FPIcon = visible(hud);
            BattleManager._subject = actor;
            WendyQuestAccessBattleFocusReady(scene, option);
            if (!option._wqaBattleCommandSeen) throw Error('Battle focus did not observe the command');
            Graphics.app.renderer.emit('postrender');
            endingStep = 30;
        } else if (endingStep === 30 && fs.existsSync(receipt + '.battle-autodetail')) {
            tap('i', 'KeyI');
            endingStep = 31;
        } else if (endingStep === 31 && fs.existsSync(receipt + '.battle-details')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Battle mod mode did not claim its binding');
            endingStep = 32;
        } else if (endingStep === 32 && fs.existsSync(receipt + '.battle-mode')) {
            if (padTap(15) !== 1 << 15) throw Error('Battle mod mode did not claim the review direction');
            if (padTap(15) !== 0) throw Error('Battle review did not return to native input');
            endingStep = 33;
        } else if (endingStep === 33 && fs.existsSync(receipt + '.battle-review')) {
            const scene = SceneManager._scene;
            const layer = scene._windowLayer = {};
            BattleManager._wqaBattleSpritesBusy = false;
            const row = { pos: 1 };
            const log = scene._actionLogWindow = { parent: layer, worldVisible: true, worldAlpha: 1, openness: 255,
                contentsOpacity: 255, contents: { isReady: () => true }, items: [row],
                _wqaBattleLogRows: [{ row, text: 'Synthetic turn result.' }] };
            WendyQuestAccessBattleLogReady(scene, log);
            Graphics.app.renderer.emit('postrender');
            endingStep = 43;
        } else if (endingStep === 43 && fs.existsSync(receipt + '.battle-log-auto')) {
            tap('t', 'KeyT');
            endingStep = 44;
        } else if (endingStep === 44 && fs.existsSync(receipt + '.battle-log-repeat')) {
            fs.unlinkSync(receipt + '.battle-log-repeat');
            pad();
            if (padTap(7) !== 1 << 7 || padTap(3) !== 1 << 3) throw Error('Battle results controller action was not claimed');
            if (padTap(3) !== 0) throw Error('Battle results action did not return to native input');
            endingStep = 45;
        } else if (endingStep === 45 && fs.existsSync(receipt + '.battle-log-repeat')) {
            const scene = SceneManager._scene;
            const hero = scene._spriteset._actorSprites[0];
            const companion = scene._spriteset._subActorSprite;
            const option = hero.battleOptions[0][0];
            Object.assign(companion, { _battleOptionsActive: 0, battleOptions: [[option]] });
            WendyQuestAccessBattleFocusLeaving(scene);
            option._followTarget = companion;
            WendyQuestAccessBattleFocusReady(scene, option);
            Graphics.app.renderer.emit('postrender');
            endingStep = 37;
        } else if (endingStep === 37 && fs.existsSync(receipt + '.battle-companion-focus')) {
            for (const digit of ['1', '2', '3', '4'])
                if (!tap(digit, 'Digit' + digit)) throw Error('A numbered party shortcut claimed native input');
            const scene = SceneManager._scene;
            const companion = scene._spriteset._subActorSprite;
            companion.parent = scene._spriteset._battleField;
            companion._battlerName = companion._actor.battlerName = 'Frygor';
            Object.assign(companion, { texture: { valid: true }, _frame: { x: 0, y: 0, width: 64, height: 64 } });
            companion.__FrozenOverlay = { parent: companion, worldVisible: true, worldAlpha: 1, texture: { valid: true } };
            companion._frameAnimator = { _sprite: companion, bitmap: companion.bitmap,
                _animationData: { fileName: 'sv_actors/Frygor' } };
            tap('I', 'KeyI', { shiftKey: true });
            endingStep = 85;
        } else if (endingStep === 85 && fs.existsSync(receipt + '.battle-appearance')) {
            tap('h', 'KeyH');
            endingStep = 38;
        } else if (endingStep === 38 && fs.existsSync(receipt + '.battle-wendy-status')) {
            const scene = SceneManager._scene;
            WendyQuestAccessBattleFocusLeaving(scene);
            fs.writeFileSync(receipt + '.battle-target-stage', '');
            const enemy = { isAlive: () => true };
            const sprite = { _enemy: enemy, _isSelected: true, x: 12, worldVisible: true, worldAlpha: 1 };
            const drawn = parent => ({ parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            sprite._nameSprite = battleText(sprite, 'Synthetic target');
            sprite._selectorIconPivot = { parent: sprite };
            sprite._selectorIcon = drawn(sprite._selectorIconPivot);
            sprite._gaugeSprite = { ...drawn(sprite), _statusType: 'hp', _battler: enemy, gaugeRate: () => 0.5 };
            sprite._gaugeSprite.bitmap.width = 64;
            window.ImageManager = { iconWidth: 32, iconHeight: 32 };
            sprite._stateIconSprite = { ...drawn(sprite), _battler: enemy, _iconIndex: 65,
                _frame: { x: 32, y: 128, width: 32, height: 32 },
                bitmap: { width: 576, height: 720, isReady: () => true } };
            scene._spriteset._enemySprites = [sprite];
            const action = { _cancelable: true, _coroutineContainer: {}, _wqaTimingWaiting: true,
                _spriteBase: { parent: scene } };
            action._backing = drawn(action._spriteBase);
            Object.assign(BattleManager, { _phase: 'ActionCommand', _targets: [enemy], _currentActionCommand: action });
            WendyQuestAccessBattleTargetReady(scene);
            WendyQuestAccessBattleTimingReady(scene, action);
            Graphics.app.renderer.emit('postrender');
            endingStep = 34;
        } else if (endingStep === 34 && fs.existsSync(receipt + '.battle-target-autodetail')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Battle target mod mode did not claim its binding');
            endingStep = 35;
        } else if (endingStep === 35 && fs.existsSync(receipt + '.battle-target-mode')) {
            if (padTap(0) !== 1) throw Error('Target mode did not claim its details action');
            if (padTap(0) !== 0) throw Error('Target review did not return to native confirmation');
            endingStep = 36;
        } else if (endingStep === 36 && fs.existsSync(receipt + '.battle-target-details')) {
            if (padTap(7) !== 1 << 7 || padTap(2) !== 1 << 2) throw Error('Controller did not claim battle vitals');
            if (padTap(2) !== 0) throw Error('Vitals review did not return to native input');
            endingStep = 39;
        } else if (endingStep === 39 && fs.existsSync(receipt + '.battle-target-vitals')) {
            const scene = SceneManager._scene;
            WendyQuestAccessBattleTargetLeaving(scene);
            WendyQuestAccessBattleTimingLeaving(scene);
            if (scene._wqaBattleTargetControl) throw Error('Retired target still owns controller review');
            if (fs.existsSync(receipt + '.battle-target-timing')) throw Error('The old timing prompt was spoken');
            const action = BattleManager._currentActionCommand;
            action._cancelable = action._wqaTimingWaiting = false;
            WendyQuestAccessBattleCueBegin(scene, action);
            if (!action._wqaBattleCueActive) throw Error('Warm battle timing audio did not acquire its action');
            battleCueStarted = Date.now();
            WendyQuestAccessBattleCueSample(scene, action, 0, 0.95, 0.94, 1, 1, false);
            endingStep = 42;
        } else if (endingStep === 42 && fs.existsSync(receipt + '.battle-cue')) {
            const cueReceipt = JSON.parse(fs.readFileSync(receipt + '.battle-cue', 'utf8'));
            fs.writeFileSync(receipt + '.battle-cue-ms', String(cueReceipt.at - battleCueStarted));
            const scene = SceneManager._scene;
            WendyQuestAccessBattleCueEndSweep(scene, BattleManager._currentActionCommand);
            WendyQuestAccessBattleCueLeaving(scene);
            if (scene._wqaBattleCueActive) throw Error('Battle timing cue did not retire');
            fs.unlinkSync(receipt + '.battle-target-stage');
            const action = BattleManager._currentActionCommand;
            const backing = action._backing;
            const badge = () => ({ parent: backing, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            const paint = action._wqaRadialPaint = { power: battleText(backing, '81%'), accuracy: battleText(backing, '93%'),
                powerBadge: badge(), accuracyBadge: badge(), words: battleText(backing, 'NICE'), attempts: 0 };
            paint.accuracyBadge.worldVisible = false;
            WendyQuestAccessBattleRadialReady(scene, action);
            Graphics.app.renderer.emit('postrender');
            if (scene._wqaRadialReport) throw Error('Hidden accuracy badge exposed the result');
            paint.accuracyBadge.worldVisible = true;
            WendyQuestAccessBattleRadialReady(scene, action);
            Graphics.app.renderer.emit('postrender');
            if (!scene._wqaRadialReport) throw Error('Final radial score did not follow its paint');
            BattleManager._phase = 'action';
            WendyQuestAccessBattleLogReady(scene, scene._actionLogWindow);
            Graphics.app.renderer.emit('postrender');
            endingStep = 46;
        } else if (endingStep === 46 && fs.existsSync(receipt + '.battle-radial')) {
            const scene = SceneManager._scene;
            const field = scene._spriteset._battleField = {};
            const target = scene._spriteset._enemySprites[0];
            const popup = { parent: field, _duration: 90, worldVisible: true, worldAlpha: 1, _colorType: 0 };
            const text = battleText(popup, '17)');
            text.worldTransform = { tx: 120, ty: 90 };
            popup._wqaDamageCaption = { text, target: target._enemy };
            popup._wqaDamageQueued = true;
            Object.assign(target, { parent: field, _battler: target._enemy, _damages: [popup] });
            scene._wqaDamageRows = [popup];
            WendyQuestAccessBattleLogReady(scene, scene._actionLogWindow);
            Graphics.app.renderer.emit('postrender');
            endingStep = 47;
        } else if (endingStep === 47 && fs.existsSync(receipt + '.battle-damage')) {
            const scene = SceneManager._scene;
            fs.writeFileSync(receipt + '.battle-bag-stage', '');
            Object.assign(BattleManager, { _phase: 'input', _targets: [] });
            const item = { name: 'Unpainted item name' };
            const layer = scene._windowLayer = {};
            const bag = scene._itemWindow = { parent: layer, _index: 0, _data: [item], _openAmount: 1, active: true,
                worldVisible: true, worldAlpha: 1, openness: 255, contentsOpacity: 255, innerWidth: 120, innerHeight: 120,
                contents: { isReady: () => true }, itemRect: () => ({ x: 0, y: 0, width: 100, height: 40 }), maxItems: () => 1 };
            bag._wqaBattleBagRows = new Map([[0, { item, description: 'Synthetic item effect', list: bag._data,
                contents: bag.contents, enabled: true, quantity: 4 }]]);
            WendyQuestAccessMenuReady(scene, 3);
            Graphics.app.renderer.emit('postrender');
            endingStep = 40;
        } else if (endingStep === 40 && fs.existsSync(receipt + '.battle-bag-autodetail')) {
            tap('i', 'KeyI');
            endingStep = 41;
        } else if (endingStep === 41 && fs.existsSync(receipt + '.battle-bag-details')) {
            fs.unlinkSync(receipt + '.battle-bag-stage');
            const scene = SceneManager._scene;
            scene._itemWindow.active = false;
            WendyQuestAccessMenuLeaving(scene);
            Object.assign(BattleManager, { _phase: 'battleEnd', _wqaBattleSpritesBusy: false, _wqaDialogueBusy: true });
            const text = 'Synthetic victory reward.';
            scene._messageWindow = { parent: scene._windowLayer, worldVisible: true, worldAlpha: 1, openness: 255,
                contentsOpacity: 255, _wqaDialoguePaint: { text, end: text.length, spoken: 0 } };
            WendyQuestAccessDialogueReady(scene);
            Graphics.app.renderer.emit('postrender');
            endingStep = 48;
        } else if (endingStep === 48 && fs.existsSync(receipt + '.battle-outcome')) {
            fs.unlinkSync(receipt + '.battle-stage');
            fs.writeFileSync(receipt + '.manual-save-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const scene = SceneManager._scene = Graphics.app.stage = { _active: true, _started: true,
                _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {} };
            scene._commandWindow = { parent: scene._windowLayer, active: true, worldVisible: true, worldAlpha: 1,
                openness: 255, contentsOpacity: 255, contents: { isReady: () => true },
                _index: 0, _list: [{ symbol: 'save', name: 'Save' }], innerWidth: 120, innerHeight: 80,
                itemRect: () => ({ x: 0, y: 0, width: 100, height: 32 }) };
            scene._wqaMenuSave = { status: 1, banner: battleText(scene, 'Synthetic save finished.') };
            SceneManager._wqaNativeAutosaves = 1;
            WendyQuestAccessMenuReady(scene, 1);
            Graphics.app.renderer.emit('postrender');
            if (scene._wqaMenuSave.text) throw Error('Manual Save spoke before the native write settled');
            SceneManager._wqaNativeAutosaves = 0;
            WendyQuestAccessMenuReady(scene, 1);
            Graphics.app.renderer.emit('postrender');
            endingStep = 49;
        } else if (endingStep === 49 && fs.existsSync(receipt + '.manual-save')) {
            tap('i', 'KeyI');
            endingStep = 50;
        } else if (endingStep === 50 && fs.existsSync(receipt + '.manual-save-details')) {
            fs.writeFileSync(receipt + '.manual-save-late-stage', '');
            const scene = SceneManager._scene;
            scene._wqaMenuSave = { status: 1, bannerDone: true };
            WendyQuestAccessMenuReady(scene, 1);
            endingStep = 55;
        } else if (endingStep === 55 && fs.existsSync(receipt + '.manual-save-late')) {
            fs.unlinkSync(receipt + '.manual-save-late-stage');
            fs.unlinkSync(receipt + '.manual-save-stage');
            fs.writeFileSync(receipt + '.shop-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const scene = SceneManager._scene = Graphics.app.stage = { _active: true, _started: true,
                _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {} };
            const window = () => ({ parent: scene._windowLayer, active: true, worldVisible: true, worldAlpha: 1,
                openness: 255, contentsOpacity: 255, contents: { isReady: () => true },
                _index: 0, innerWidth: 120, innerHeight: 80, itemRect: () => ({ x: 0, y: 0, width: 100, height: 32 }) });
            const item = { name: 'Synthetic shop item', description: 'Shown effect' };
            const buy = scene._buyWindow = { ...window(), _data: [item], maxItems: () => 1 };
            buy._wqaShopRows = new Map([[0, { item, price: 19, enabled: false, contents: buy.contents, list: buy._data }]]);
            const gold = scene._goldWindow = window();
            gold._wqaShopGold = { contents: gold.contents, value: 12, currency: 'Gold' };
            const help = scene._helpWindow = window();
            help._wqaShopHelp = { contents: help.contents, text: item.description };
            const status = scene._statusWindow = window();
            status._wqaShopPossession = { contents: status.contents, item, count: 2 };
            WendyQuestAccessMenuReady(scene, 4);
            Graphics.app.renderer.emit('postrender');
            endingStep = 51;
        } else if (endingStep === 51 && fs.existsSync(receipt + '.shop-focus')) {
            tap('i', 'KeyI');
            endingStep = 52;
        } else if (endingStep === 52 && fs.existsSync(receipt + '.shop-details')) {
            const scene = SceneManager._scene;
            WendyQuestAccessMenuLeaving(scene);
            const buy = scene._buyWindow;
            buy.active = false;
            const item = buy._data[0];
            const quantity = scene._numberWindow = { ...buy, active: true, _index: -1, _item: item, _number: 3 };
            quantity._wqaShopQuantity = { contents: quantity.contents, item, count: 3, price: 57, currency: 'Gold' };
            fs.writeFileSync(receipt + '.shop-quantity-stage', '');
            WendyQuestAccessMenuReady(scene, 5);
            Graphics.app.renderer.emit('postrender');
            endingStep = 53;
        } else if (endingStep === 53 && fs.existsSync(receipt + '.shop-quantity')) {
            tap('i', 'KeyI');
            endingStep = 54;
        } else if (endingStep === 54 && fs.existsSync(receipt + '.shop-quantity-details')) {
            fs.unlinkSync(receipt + '.shop-quantity-stage');
            fs.unlinkSync(receipt + '.shop-stage');
            fs.writeFileSync(receipt + '.menu-vitals-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const scene = SceneManager._scene = Graphics.app.stage = { _active: true, _started: true,
                _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {} };
            scene._commandWindow = { parent: scene._windowLayer, active: true, worldVisible: true, worldAlpha: 1,
                openness: 255, contentsOpacity: 255, contents: { isReady: () => true },
                _index: 0, _list: [{ symbol: 'save', name: 'Save' }], innerWidth: 120, innerHeight: 80,
                itemRect: () => ({ x: 0, y: 0, width: 100, height: 32 }) };
            const visible = parent => ({ parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            const gold = scene._goldWindow = { ...scene._commandWindow, active: false };
            gold._wqaShopGold = { contents: gold.contents, value: 17, currency: 'Gold' };
            const hud = scene._wqaMenuStatus = scene._statusWindow = { ...visible(scene), offsetY: 0, y: 0, states: [4],
                battler: { actor: () => ({ name: 'Synthetic menu hero' }) } };
            const row = { ...visible(hud), y: 120 };
            const icon = visible(row);
            hud.stateIcons = { 4: row };
            row.children = [null, icon];
            icon.children = [battleText(icon, 'Synthetic condition')];
            for (const [key, value] of Object.entries({ _numberSprite: '8', _totalSprite: '14', _dividerSprite: '/',
                _FPSprite: '3', _totalSpriteFP: '5', _dividerSpriteFP: '/', levelNumberSprite: '7' }))
                hud[key] = battleText(hud, value);
            hud._HPIcon = visible(hud);
            hud._FPIcon = visible(hud);
            hud.levelMetreSprite = visible(hud);
            const mask = hud.fillXPMask = { parent: hud, geometry: { graphicsData: [
                { shape: { x: -39, y: 98, width: 32, height: 16 } }
            ] } };
            hud.levelMetreFillSprite = { ...visible(hud), mask };
            WendyQuestAccessMenuReady(scene, 1);
            Graphics.app.renderer.emit('postrender');
            tap('g', 'KeyG');
            endingStep = 70;
        } else if (endingStep === 70 && fs.existsSync(receipt + '.menu-gold')) {
            fs.writeFileSync(receipt + '.menu-vitals-keyboard', '');
            tap('h', 'KeyH');
            endingStep = 56;
        } else if (endingStep === 56 && fs.existsSync(receipt + '.menu-vitals-h')) {
            fs.unlinkSync(receipt + '.menu-vitals-keyboard');
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Menu vitals mod mode did not claim the binding');
            endingStep = 57;
        } else if (endingStep === 57 && fs.existsSync(receipt + '.menu-vitals-mode')) {
            if (padTap(2) !== 1 << 2 || padTap(2) !== 0) throw Error('Menu vitals did not return to native input');
            endingStep = 58;
        } else if (endingStep === 58 && fs.existsSync(receipt + '.menu-vitals-full')) {
            fs.unlinkSync(receipt + '.menu-vitals-stage');
            fs.writeFileSync(receipt + '.coupon-list-stage', '');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const scene = SceneManager._scene = Graphics.app.stage = { _active: true, _started: true,
                _fadeDuration: 0, _fadeOpacity: 0, _windowLayer: {} };
            const list = scene._couponsWindow = { parent: scene._windowLayer, active: true, worldVisible: true,
                worldAlpha: 1, openness: 255, contentsOpacity: 255, contents: { isReady: () => true },
                _index: 0, innerWidth: 600, innerHeight: 180, _clientArea: {},
                itemRect: i => ({ x: 50 + 100 * i, y: 40, width: 80, height: 80 }) };
            list.titleText = battleText(list, 'AVAILABLE REWARDS');
            list.stonesBitmap = { isReady: () => true };
            list.lockBitmap = { isReady: () => true };
            list.sprites = Array.from({ length: 5 }, (_, i) => ({ parent: list._clientArea, worldVisible: true,
                worldAlpha: 1, bitmap: i === 0 ? list.stonesBitmap : list.lockBitmap,
                _frame: { x: i * 64, y: 0, width: 64, height: 64 } }));
            WendyQuestAccessMenuReady(scene, 6);
            Graphics.app.renderer.emit('postrender');
            endingStep = 59;
        } else if (endingStep === 59 && fs.existsSync(receipt + '.coupon-list-stone')) {
            const scene = SceneManager._scene;
            scene._couponsWindow._index = 1;
            WendyQuestAccessMenuReady(scene, 6);
            Graphics.app.renderer.emit('postrender');
            endingStep = 60;
        } else if (endingStep === 60 && fs.existsSync(receipt + '.coupon-list-locked')) {
            fs.unlinkSync(receipt + '.coupon-list-stage');
            fs.writeFileSync(receipt + '.coupon-response-stage', '');
            const scene = SceneManager._scene;
            WendyQuestAccessMenuLeaving(scene);
            scene._couponsWindow = null;
            const area = {};
            const visible = parent => ({ parent, worldVisible: true, worldAlpha: 1, bitmap: { isReady: () => true } });
            const response = scene._couponResponseWindow = { ...visible(scene._windowLayer), active: true, _ready: true,
                _index: 1, openness: 255, contentsOpacity: 255, contents: { isReady: () => true },
                innerHeight: 330, _clientArea: area, maxItems: () => 3 };
            response.backButton = visible(response);
            response._button1 = visible(area);
            response._button2 = visible(area);
            response._wqaCouponCodeText = battleText(response._button1, 'X1-Z9');
            response._wqaCouponButton2Text = battleText(response._button2, 'Open in app');
            response.titleText = battleText(area, 'SYNTHETIC COUPON');
            response.subTitleText1 = battleText(area, 'REDEEM');
            response.bodyText1 = battleText(area, 'Shown instructions.');
            WendyQuestAccessMenuReady(scene, 7);
            Graphics.app.renderer.emit('postrender');
            endingStep = 61;
        } else if (endingStep === 61 && fs.existsSync(receipt + '.coupon-response-focus') &&
            fs.existsSync(receipt + '.coupon-response-auto')) {
            tap('i', 'KeyI');
            endingStep = 62;
        } else if (endingStep === 62 && fs.existsSync(receipt + '.coupon-response-details')) {
            const scene = SceneManager._scene;
            const response = scene._couponResponseWindow;
            response.clipboardText = { ...battleText(response._clientArea, 'Copied to Clipboard'), alpha: 1 };
            for (const glyph of response.clipboardText.children) glyph.parent = response.clipboardText;
            response._wqaCouponCopy = 1;
            WendyQuestAccessMenuReady(scene, 7);
            Graphics.app.renderer.emit('postrender');
            endingStep = 63;
        } else if (endingStep === 63 && fs.existsSync(receipt + '.coupon-response-copy')) {
            fs.unlinkSync(receipt + '.coupon-response-stage');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const scene = SceneManager._scene = Graphics.app.stage = {
                _wqaMapRestored: true, _mapLoaded: true, _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0
            };
            const spriteset = scene._spriteset = { parent: scene };
            const layer = spriteset._pictureContainer_upper = { parent: spriteset, children: [] };
            const picture = { _text: 'Synthetic heading\\nSynthetic description.', _opacity: 255, _duration: 0 };
            $gameMap = { _mapId: 189, _interpreter: { _list: [{}] } };
            $gameScreen = { _brightness: 255, _pictures: [] };
            $gameScreen._pictures[4] = picture;
            const sprite = { _pictureId: 4, parent: layer, worldVisible: true, worldAlpha: 1 };
            sprite._textSprite = battleText(sprite, picture._text.replaceAll('\\\\n', '\\n'));
            sprite._textSprite.worldTransform = { tx: 120, ty: 60 };
            layer.children.push(sprite);
            fs.writeFileSync(receipt + '.credits-stage', '');
            WendyQuestAccessCreditsReady(scene);
            if (scene._wqaControllerReady) throw Error('Credit controls activated before paint');
            Graphics.app.renderer.emit('postrender');
            endingStep = 65;
        } else if (endingStep === 65 && fs.existsSync(receipt + '.credits-page')) {
            pad();
            if (padTap(7) !== 1 << 7) throw Error('Credits did not enter controller mod mode');
            endingStep = 66;
        } else if (endingStep === 66 && fs.existsSync(receipt + '.credits-mode')) {
            if (padTap(15) !== 1 << 15 || padTap(15) !== 0) throw Error('Credits review did not restore native input');
            endingStep = 67;
        } else if (endingStep === 67 && fs.existsSync(receipt + '.credits-review')) {
            delete $gameScreen._pictures[4];
            WendyQuestAccessCreditsObscured(SceneManager._scene);
            if (SceneManager._scene._wqaControllerReady || padTap(7) !== 0)
                throw Error('Erased credits retained controller ownership');
            fs.unlinkSync(receipt + '.credits-stage');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const title = SceneManager._scene = Graphics.app.stage = new Scene_Title();
            WendyQuestAccessTitleReady(title);
            Graphics.app.renderer.emit('postrender');
            tap('v', 'KeyV');
            choose('Speech');
            if (document.querySelector('dialog').lang !== 'en-US') throw Error('The settings language tag is missing');
            tap('Escape');
            const locale = $dataSystem.locale;
            $dataSystem.locale = 'und';
            choose('Speech');
            if (!Array.from(document.querySelectorAll('dialog button')).some(item =>
                item.textContent === 'Language, Auto, English fallback')) throw Error('No automatic language fallback');
            tap('Escape');
            $dataSystem.locale = locale;
            choose('Speech');
            choose('Language, Auto, English');
            endingStep = 64;
        } else if (endingStep === 64 && menuStatus() === 'Speech settings saved') {
            if (document.activeElement.textContent !== 'Language, English') throw Error('Manual language did not retain focus');
            choose('Speech enabled, on');
            endingStep = 28;
        } else if (endingStep === 28 && menuStatus() === 'Speech settings saved' && fs.existsSync(receipt + '.silenced')) {
            if (document.activeElement.textContent !== 'Speech enabled, off') throw Error('The mute switch did not retain focus');
            tap('Escape');
            choose('Audio');
            choose('Preview right');
            endingStep++;
        } else if (endingStep === 29 && menuStatus() === 'Preview uses stereo and rear pitch.') {
            fs.writeFileSync(receipt + '.muted-preview', '');
            choose('Cutscene descriptions, off');
            endingStep = 80;
        } else if (endingStep === 80 && menuStatus() === 'Audio settings saved') {
            choose('Increase cutscene description speed, 200 percent');
            endingStep++;
        } else if (endingStep === 81 && menuStatus() === 'Audio settings saved') {
            choose('Decrease cutscene description volume');
            endingStep++;
        } else if (endingStep === 82 && menuStatus() === 'Audio settings saved') {
            tap('Escape');
            tap('Escape');
            WendyQuestAccessSceneLeaving(SceneManager._scene);
            const tilemap = {};
            const actor = { _realX: 24, _realY: 32, _characterName: 'Elder', forceMoveRoute() {} };
            const sprite = { _character: actor, parent: tilemap, worldVisible: true,
                _characterName: 'Elder', worldAlpha: 1, texture: { valid: true }, worldTransform: { tx: 24, ty: 32 } };
            const scene = SceneManager._scene = Graphics.app.stage = {
                _wqaMapRestored: true, _mapLoaded: true, _wqaFieldReady: true, _started: true, _active: true,
                srcWendy: true, srcStones: true, _fadeDuration: 0, _fadeOpacity: 0,
                _spriteset: { _tilemap: tilemap, _characterSprites: [sprite] }
            };
            const interpreter = Object.assign(new Game_Interpreter(), {
                _eventId: 36, _mapId: 16, _index: 57, character: () => actor
            });
            const list = [{}];
            const events = [];
            events[36] = { pages: [{ list }] };
            window.$dataMap = { events };
            $gameScreen._brightness = 255;
            $gameScreen._fadeOutDuration = 0;
            $gamePlayer._transferring = false;
            $gameMap.refreshIfNeeded = () => {};
            $gameMap._needsTilemapRefresh = false;
            $gameMap._mapId = 16;
            $gameMap._events = [];
            $gameMap._events[35] = actor;
            $gameMap._interpreter = interpreter;
            const nativeAudio = window.Audio;
            window.Audio = function () { narrationAudio = new nativeAudio(); return narrationAudio; };
            narrationStarted = performance.now();
            narrationFrame = () => {
                Graphics.frameCount++;
                WendyQuestAccessNarrationPresent(scene);
                Graphics.app.renderer.emit('postrender');
            };
            WendyQuestAccessNarrationWarm(scene);
            endingStep++;
        } else if (endingStep === 83 && Graphics._wqaNarrationPackFinished) {
            const scene = SceneManager._scene;
            const interpreter = $gameMap._interpreter;
            interpreter._list = $dataMap.events[36].pages[0].list;
            interpreter.command205([35, { wait: false }]);
            if (!scene._wqaNarrationActive) throw Error('Native cue did not arm');
            narrationFrame();
            if (narrationAudio) throw Error('Narration started before native motion');
            $gameMap._events[35]._realY--;
            narrationFrame();
            if (!narrationAudio || narrationAudio.volume !== 0.55 ||
                narrationAudio.playbackRate !== 2.1) throw Error('Narration did not use saved speed and volume');
            narrationStarted = performance.now();
            endingStep++;
        } else if (endingStep === 84 && narrationAudio?.currentTime > 0.005) {
            $gamePlayer.reserveTransfer(2, 0, 0, 2, 0);
            if (SceneManager._scene._wqaNarrationActive || !narrationAudio.paused || narrationAudio.getAttribute('src'))
                throw Error('Native transfer failed to retire narration');
            fs.writeFileSync(receipt + '.cutscene-narration-ms', String(performance.now() - narrationStarted));
            clearInterval(interval);
            nw.App.quit();
        }
    }
}, 40);
setTimeout(() => {
    const fs = require('fs');
    const last = receipt + '.cross-map-last';
    write({ error: 'No worker receipt', settingsStep, controllerStep, fieldStep, mapVitalsStep, dialoguePadStep, endingStep, restartStep,
        crossMapLeg, crossMapRequested: crossMapStarted > 0, lastTransferMessage: fs.existsSync(last) ? fs.readFileSync(last, 'utf8') : '',
        narrationState: narrationAudio && { paused: narrationAudio.paused, ready: narrationAudio.readyState,
            time: narrationAudio.currentTime, error: narrationAudio.error?.message },
        status: menuStatus(), focus: document.activeElement?.tagName === 'BUTTON' ? document.activeElement.textContent : '' });
    nw.App.quit();
}, 18000);
''', encoding='utf8')
    service = app / 'wendyquest-access'
    service.mkdir()
    (service / 'speech-worker.cjs').write_text('''
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { formatSpeech } = require('./speech-text.cjs');
const records = [];
parentPort.on('message', message => {
    const receipt = require('path').join(__dirname, '..', 'receipt.json');
    if (message.kind === 'cancel') return;
    if (message.kind === 'fieldStatus') {
        const state = { 'Destination filter. Reachable only.': 'on', 'Destination filter. All destinations.': 'off' }[message.name];
        if (state) {
            if (Atomics.load(new Int32Array(workerData), 0) === message.epoch)
                fs.writeFileSync(receipt + '.filter-' + state, message.name);
            parentPort.postMessage('ack');
            return;
        }
    }
    if (message.kind === 'silence') {
        if (Atomics.load(new Int32Array(workerData), 0) === message.epoch) {
            fs.writeFileSync(receipt + '.silenced', '');
            parentPort.postMessage('silenced');
        }
        return;
    }
    if (fs.existsSync(receipt + '.restart')) {
        if (message.brailleOnly) {
            if (message.kind === 'title') fs.writeFileSync(receipt + '.muted-title', '');
            if (message.kind === 'controllerStatus') fs.writeFileSync(receipt + '.muted-mode', '');
        } else if (!fs.existsSync(receipt + '.allow-restoration')) {
            fs.writeFileSync(receipt + '.unexpected-speech', '');
        } else if (message.kind === 'title') {
            fs.writeFileSync(receipt + '.restored-title', '');
        }
        parentPort.postMessage('ack');
        return;
    }
    if (fs.existsSync(receipt + '.credits-stage')) {
        const label = { dialoguePage: 'page', controllerStatus: 'mode', menuReview: 'review' }[message.kind];
        if (label) fs.writeFileSync(receipt + '.credits-' + label, formatSpeech(message));
        parentPort.postMessage('ack');
        return;
    }
    if (fs.existsSync(receipt + '.map-diagram-stage')) {
        const label = { mapBanner: 'title', menuDetails: 'details', controllerStatus: 'mode', menuReview: 'review' }[message.kind];
        if (label) fs.writeFileSync(receipt + '.map-diagram-' + label, formatSpeech(message));
        parentPort.postMessage('ack');
        return;
    }
    if (fs.existsSync(receipt + '.autosave-notice-stage')) {
        if (message.kind === 'mapBanner') fs.appendFileSync(receipt + '.autosave-notice', formatSpeech(message) + '\\n');
        parentPort.postMessage('ack');
        return;
    }
    if (fs.existsSync(receipt + '.field-vitals-stage')) {
        const speech = formatSpeech(message);
        if (message.kind === 'menuDetails')
            fs.writeFileSync(receipt + (fs.existsSync(receipt + '.field-vitals-keyboard') ? '.field-vitals-h' : '.field-vitals-full'), speech);
        if (message.kind === 'fieldStatus' && speech.includes('X reads vitals'))
            fs.writeFileSync(receipt + '.field-vitals-mode', speech);
        parentPort.postMessage('ack');
        return;
    }
    if (fs.existsSync(receipt + '.closing-pass')) {
        const speech = formatSpeech(message);
        const automatic = fs.existsSync(receipt + '.menu-autodetail');
        if (fs.existsSync(receipt + '.coupon-response-stage')) {
            if (message.kind === 'menuFocus') fs.writeFileSync(receipt + '.coupon-response-focus', speech);
            if (message.kind === 'menuDetails')
                fs.writeFileSync(receipt + (message.append ? '.coupon-response-auto' : '.coupon-response-details'), speech);
            if (message.kind === 'menuReview') fs.writeFileSync(receipt + '.coupon-response-copy', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.coupon-list-stage')) {
            if (message.kind === 'menuFocus')
                fs.writeFileSync(receipt + (message.enabled ? '.coupon-list-stone' : '.coupon-list-locked'), speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.menu-vitals-stage')) {
            if (message.kind === 'menuReview') fs.writeFileSync(receipt + '.menu-gold', speech);
            if (message.kind === 'menuDetails')
                fs.writeFileSync(receipt + (fs.existsSync(receipt + '.menu-vitals-keyboard') ? '.menu-vitals-h' : '.menu-vitals-full'), speech);
            if (message.kind === 'controllerStatus' && speech.includes('X reads vitals'))
                fs.writeFileSync(receipt + '.menu-vitals-mode', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.shop-stage')) {
            const quantity = fs.existsSync(receipt + '.shop-quantity-stage');
            if (message.kind === 'menuFocus') fs.writeFileSync(receipt + (quantity ? '.shop-quantity' : '.shop-focus'), speech);
            if (message.kind === 'menuDetails' && !message.append)
                fs.writeFileSync(receipt + (quantity ? '.shop-quantity-details' : '.shop-details'), speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.manual-save-stage')) {
            if (message.kind === 'dialoguePage') {
                const suffix = fs.existsSync(receipt + '.manual-save-late-stage') ? '.manual-save-late' : '.manual-save';
                fs.writeFileSync(receipt + suffix, speech);
            }
            if (message.kind === 'menuDetails') fs.writeFileSync(receipt + '.manual-save-details', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.battle-stage')) {
            const target = fs.existsSync(receipt + '.battle-target-stage');
            const vitals = message.lines?.[0];
            if (vitals === 'Enemy formation') {
                if (fs.existsSync(receipt + '.battle-formation')) throw Error('Formation was spoken again');
                fs.writeFileSync(receipt + '.battle-formation', speech);
                fs.writeFileSync(receipt + '.battle-opening-epoch', String(message.epoch));
                parentPort.postMessage('ack');
                return;
            }
            if (message.kind === 'menuFocus' && !target && !fs.existsSync(receipt + '.battle-focus') &&
                (!message.append || String(message.epoch) !== fs.readFileSync(receipt + '.battle-opening-epoch', 'utf8')))
                throw Error('First battle menu speech did not queue behind the formation');
            const suffix = message.kind === 'menuFocus' ? (speech.startsWith('Synthetic companion') ? 'companion-focus' : 'focus') :
                message.kind === 'battleLog' ? (vitals?.startsWith('Power ') ? 'radial' :
                    vitals?.startsWith('Synthetic target, 17 HP damage') ? 'damage' : message.append ? 'log-auto' : 'log-repeat') :
                message.kind === 'menuDetails' ? (vitals === 'Synthetic companion' ? 'appearance' : vitals === 'Synthetic hero' ? (target ? 'vitals' : 'wendy-status') :
                    message.append ? 'autodetail' : 'details') :
                message.kind === 'menuReview' ? (target && message.append ? 'timing' : 'review') :
                message.kind === 'dialoguePage' ? 'outcome' :
                message.kind === 'controllerStatus' ? 'mode' : '';
            const prefix = target ? '.battle-target-' :
                fs.existsSync(receipt + '.battle-bag-stage') ? '.battle-bag-' : '.battle-';
            if (suffix) fs.writeFileSync(receipt + prefix + suffix, speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.cross-map-stage')) {
            if (message.kind === 'fieldStatus' || message.kind === 'fieldTarget')
                fs.writeFileSync(receipt + '.cross-map-last', speech);
            if (message.kind === 'fieldTarget' && message.category === 'Events')
                fs.writeFileSync(receipt + '.cross-map-event', speech);
            if (message.kind === 'routeDirections' && message.name === 'Scene trigger')
                fs.writeFileSync(receipt + '.cross-map-event-route', speech);
            if (message.kind === 'fieldStatus' && message.name.startsWith('Bookmarks, Return marker.'))
                fs.writeFileSync(receipt + '.cross-map-browse', speech);
            if (message.kind === 'routeDirections' && message.name === 'Next entrance toward Return marker')
                fs.writeFileSync(receipt + '.cross-map-next', speech);
            if (message.kind === 'routeDirections' && message.name === 'Entrance for Return marker')
                fs.writeFileSync(receipt + '.cross-map-entrance', speech);
            if (message.kind === 'routeDirections' && message.name === 'Return marker')
                fs.writeFileSync(receipt + '.cross-map-arrived', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.bookmark-stage')) {
            if (message.kind === 'fieldTarget' && message.name === 'Return marker')
                fs.writeFileSync(receipt + '.bookmark-browse', speech);
            if (message.kind === 'routeDirections' && message.name === 'Return marker')
                fs.writeFileSync(receipt + '.bookmark-route', speech);
            if (message.kind === 'routeDirections' && message.name === 'At Return marker')
                fs.writeFileSync(receipt + '.bookmark-arrival', speech);
            if (message.kind === 'fieldTarget' && message.name.includes('Synthetic quest anchor'))
                fs.writeFileSync(receipt + '.bookmark-entity', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.quest-navigation-stage')) {
            if (message.kind === 'fieldTarget') fs.writeFileSync(receipt + '.quest-nav-target', speech);
            if (message.kind === 'routeDirections') fs.writeFileSync(receipt + '.quest-nav-route', speech);
            if (message.kind === 'fieldStatus') fs.writeFileSync(receipt + '.quest-nav-unavailable', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (fs.existsSync(receipt + '.quest-stage')) {
            if (fs.existsSync(receipt + '.quest-restore-stage')) {
                if (message.kind === 'questFocus') fs.writeFileSync(receipt + '.quest-restore-focus', speech);
                parentPort.postMessage('ack');
                return;
            }
            if (message.kind === 'questFocus')
                fs.writeFileSync(receipt + (message.name ? '.quest-focus' : '.quest-objective'), speech);
            if (message.kind === 'menuDetails')
                fs.writeFileSync(receipt + (message.append ? '.quest-detail-auto' : '.quest-detail'), speech);
            if (message.kind === 'fieldStatus' && message.name.includes('reads the quest'))
                fs.writeFileSync(receipt + '.quest-mode', speech);
            parentPort.postMessage('ack');
            return;
        }
        if (message.kind === 'menuFocus' || message.kind === 'menuDetails') {
            fs.writeFileSync(receipt + '.' + message.kind + (automatic ? '-auto' : ''), speech);
        }
        if (message.kind === 'menuReview') fs.writeFileSync(receipt +
            (message.position === 1 ? '.menu-review-first' : '.menu-review-second'), speech);
        if (message.kind === 'controllerStatus' && message.name.includes('reads details'))
            fs.writeFileSync(receipt + '.menu-mode', speech);
        parentPort.postMessage('ack');
        return;
    }
    if (message.kind === 'routeDirections' && message.name === 'At Synthetic wall') {
        if (Atomics.load(new Int32Array(workerData), 0) === message.epoch)
            fs.writeFileSync(receipt + '.autowalk', formatSpeech(message));
        parentPort.postMessage('ack');
        return;
    }
    if ((message.kind === 'routeDirections' && message.name === 'Synthetic wall' && fs.existsSync(receipt + '.autowalk')) ||
        (message.kind === 'fieldStatus' && message.name === 'Autowalk stopped.')) {
        const suffix = message.kind === 'routeDirections' ? '.autowalk-path' : '.autowalk-stop';
        if (Atomics.load(new Int32Array(workerData), 0) === message.epoch)
            fs.writeFileSync(receipt + suffix, formatSpeech(message));
        parentPort.postMessage('ack');
        return;
    }
    if (message.kind === 'interactionPrompt') {
        if (Atomics.load(new Int32Array(workerData), 0) === message.epoch)
            fs.writeFileSync(receipt + '.interaction-prompt', formatSpeech(message));
        parentPort.postMessage('ack');
        return;
    }
    if (message.kind === 'mapDescription') {
        const description = formatSpeech(message);
        if (Atomics.load(new Int32Array(workerData), 0) === message.epoch && description.includes('French Fry Forest'))
            fs.writeFileSync(receipt + '.field-description', description);
        parentPort.postMessage('ack');
        return;
    }
    records.push({ sameEpoch: Atomics.load(new Int32Array(workerData), 0) === message.epoch,
        epoch: message.epoch, name: message.name, kind: message.kind, slot: message.slot, empty: message.empty,
        text: message.text, append: message.append, speech: formatSpeech(message) });
    parentPort.postMessage('ack');
    if (message.kind === 'title') {
        const titleCount = records.filter(record => record.kind === 'title').length;
        fs.writeFileSync(receipt + ['.title', '.returned-title', '.controller-returned-title'][titleCount - 1], '');
    }
    if (message.kind === 'controllerStatus') {
        const kind = message.name.includes('opens settings') ? '.title-mode' : '.dialogue-mode';
        fs.writeFileSync(receipt + kind, '');
    }
    if (message.kind === 'saveSlot') fs.writeFileSync(receipt + '.slot', '');
    if (message.kind === 'mapBanner') fs.writeFileSync(receipt + '.map', '');
    if (message.kind === 'fieldTarget') {
        const count = records.filter(record => record.kind === 'fieldTarget').length;
        fs.writeFileSync(receipt + '.field-target-' + count, '');
    }
    if (message.kind === 'routeDirections' || message.kind === 'fieldStatus') {
        const count = records.filter(record => record.kind === 'routeDirections' || record.kind === 'fieldStatus').length;
        fs.writeFileSync(receipt + '.route-' + count, '');
    }
    if (message.kind === 'fieldStatus' && message.name.startsWith('Secret cave.')) fs.writeFileSync(receipt + '.cave', '');
    if (message.kind === 'timedCue') fs.writeFileSync(receipt + '.timed', '');
    if (message.kind === 'dialogueChoice') fs.writeFileSync(receipt + '.choice', '');
    if (message.kind === 'dialoguePage' && fs.existsSync(receipt + '.choice')) {
        fs.writeFileSync(receipt + (fs.existsSync(receipt + '.repeat') ? '.controller-repeat' : '.repeat'), '');
    }
    if (message.kind === 'numberEntry') {
        fs.writeFileSync(receipt + '.tmp', JSON.stringify({ versions: process.versions, records }));
        fs.renameSync(receipt + '.tmp', receipt);
    }
});
''', encoding='utf8')
    shutil.copyfile(ROOT / '.build' / 'payload' / 'js' / 'plugins' / 'WendyQuestAccess.js', app / 'plugin.js')
    shutil.copyfile(ROOT / 'src' / 'runtime' / 'resize-markers.js', app / 'resize-markers.js')
    for name in ('speech-text.cjs', 'dialogue-icons.cjs'):
        shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / name, service / name)
    for name in ('route-worker.cjs', 'geometry.cjs', 'routes.cjs', 'walking-catalog.cjs', 'transfer-gates.cjs', 'terrain-controls.cjs', 'WendyQuestAudio.node'):
        shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / name, service / name)
    shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / 'narration.webmpack',
                    service / 'narration.webmpack')
    shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / 'audio-worker.cjs', service / 'production-audio-worker.cjs')
    (service / 'audio-worker.cjs').write_text('''
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
let active;
parentPort.on('message', request => { active = request; });
const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = packet => {
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 3 && active.right === 1) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.beacon'), String(packet.status));
    }
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 3 && (active.right === 1 || active.forward === 1) &&
        fs.existsSync(path.join(__dirname, '..', 'receipt.json.beacon-detour'))) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.beacon-refresh'), String(packet.status));
    }
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 6 && active.forward === -1) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.cave-cue'), String(packet.status));
    }
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 15 && active.right === 0 && active.forward === 1) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.battle-cue'),
            JSON.stringify({ status: packet.status, pitch: active.pitch, at: Date.now() }));
    }
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 12 && active.forward === 2) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.soundscape'), String(packet.status));
    }
    return post(packet);
};
require('./production-audio-worker.cjs');
''', encoding='utf8')
    for directory in ('puzzles', 'audio-deps'):
        shutil.copytree(ROOT / '.build' / 'payload' / 'wendyquest-access' / directory, service / directory)
    geometry = app / 'geometry'
    geometry.mkdir()
    synthetic = struct.pack('<4sHHHBBI', b'WQG1', 1, 3, 2, 0, 0, 0) + bytes([15] * 6)
    (geometry / '1.wqg').write_bytes(synthetic)
    neighbor = struct.pack('<4sHHHBBI', b'WQG1', 2, 3, 2, 0, 0, 0) + bytes([15] * 6)
    (geometry / '2.wqg').write_bytes(neighbor)
    distant = struct.pack('<4sHHHBBI', b'WQG1', 3, 3, 2, 0, 0, 0) + bytes([15] * 6)
    (geometry / '3.wqg').write_bytes(distant)
    cave = struct.pack('<4sHHHBBI', b'WQG1', 196, 23, 52, 0, 0, 0) + bytes([15] * 23 * 52)
    (geometry / '196.wqg').write_bytes(cave)
    catalog = {'version': 1, 'landings': [[2, 0, 0, 'Pw==', [1, 0]], [1, 0, 0, 'Pw==', []]]}
    catalog_hash = hashlib.sha256(json.dumps(catalog, separators=(',', ':')).encode('utf8')).hexdigest()
    inputs = [('1', synthetic, 3, 2), ('2', neighbor, 3, 2), ('3', distant, 3, 2), ('196', cave, 23, 52)]
    (geometry / 'manifest.json').write_text(json.dumps({
        'build': '26578620', 'maps': {key: {'geometry': hashlib.sha256(data).hexdigest(), 'width': width, 'height': height, 'tileset': 1}
                                    for key, data, width, height in inputs},
        'walking': {'hash': catalog_hash, 'catalog': catalog}
    }), encoding='utf8')
    return app / 'receipt.json'


def run_fixture(launch, runtime, environment):
    # Chromium children can keep inherited pipes open after a timed-out
    # parent. File redirection and a tree-scoped stop give the fixture a
    # finite timeout even when native audio does not shut down.
    error_log = runtime / 'nw-stderr.log'
    with error_log.open('wb') as errors:
        process = subprocess.Popen(launch, cwd=runtime, stdout=subprocess.DEVNULL, stderr=errors, env=environment)
        try:
            code = process.wait(timeout=25)
        except subprocess.TimeoutExpired as failure:
            if process.poll() is None:
                taskkill = Path(os.environ['SystemRoot']) / 'System32' / 'taskkill.exe'
                try:
                    subprocess.run([str(taskkill), '/PID', str(process.pid), '/T', '/F'], timeout=5,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=5)
            raise RuntimeError('The standalone NW fixture exceeded its process deadline') from failure
    with error_log.open('rb') as errors:
        return code, errors.read(1024)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--installed', type=Path, required=True)
    parser.add_argument('--scratch-root', type=Path, required=True,
                        help='Existing workspace scratch directory outside every Git tree')
    args = parser.parse_args()
    temp_base = args.scratch_root.resolve(strict=True)
    if not temp_base.is_dir() or any((parent / '.git').exists() for parent in (temp_base, *temp_base.parents)):
        parser.error('The scratch directory must be outside every Git tree')
    with tempfile.TemporaryDirectory(prefix='wendy-nw-fixture-', dir=temp_base) as name:
        runtime = Path(name).resolve()
        if runtime.parent != temp_base or runtime.is_relative_to(ROOT):
            raise ValueError('Offline fixture must stay outside the repository')
        unpack(args.archive, runtime)
        for module in ('nw.dll', 'nw_elf.dll', 'node.dll'):
            print(module, 'matches installed' if sha(runtime / module) == sha(args.installed / module)
                  else 'differs from installed', flush=True)
        receipt = fixture(runtime, args.installed)
        launch = [str(runtime / 'nw.exe'), f'--user-data-dir={runtime / "profile"}']
        environment = {**os.environ, 'SDL_AUDIO_DRIVER': 'dummy', 'TEMP': str(runtime), 'TMP': str(runtime)}
        result, errors = run_fixture(launch, runtime, environment)
        if not receipt.exists():
            raise RuntimeError(f'NW exited {result} without a receipt: {errors!r}')
        data = json.loads(receipt.read_text(encoding='utf8'))
        records = data.get('records', [])
        if result or data.get('error') or len(records) != 19 or not all(r.get('sameEpoch') for r in records):
            raise RuntimeError(f'NW fixture did not deliver the expected packet: {data}')
        title, returned_title, title_mode, controller_title, slot, banner, first, second, third, route, pad_route, cave, timed, page, choice, repeat, dialogue_mode, pad_repeat, number = records
        if any(item['name'] != title['name'] for item in (returned_title, controller_title)) or \
                len({title['epoch'], returned_title['epoch'], controller_title['epoch']}) != 3:
            raise RuntimeError(f'NW fixture did not restore the title focus: {data}')
        if title['kind'] != 'title' or title.get('name') != 'Synthetic title command' or slot['kind'] != 'saveSlot' or \
                slot.get('slot') != 2 or not slot.get('empty') or banner['kind'] != 'mapBanner' or \
                banner.get('name') != 'Synthetic map banner' or len({record['epoch'] for record in records[:14]}) != 13:
            raise RuntimeError(f'NW fixture did not deliver distinct presentation epochs: {data}')
        if title['speech'] != 'WendyQuest. Legend of the Four Corner Stones. Start. Synthetic title command' or \
                receipt.with_suffix('.json.interaction-prompt').read_text(encoding='utf8') != 'Interact':
            raise RuntimeError('NW did not speak the presented title artwork and interaction prompt')
        if [item.get('name') for item in (first, second, third)] != ['Synthetic wall', 'Synthetic covered event', 'Synthetic wall'] or \
                any(item['kind'] != 'fieldTarget' for item in (first, second, third)):
            raise RuntimeError(f'NW field selection or layout priority failed: {data}')
        if any(item['kind'] != 'routeDirections' or item['speech'] != '1 east. face east.'
               for item in (route, pad_route)):
            raise RuntimeError(f'NW field did not publish a route through the packaged worker: {data}')
        submit_ms = float(receipt.with_suffix('.json.route-submit-ms').read_text(encoding='utf8'))
        browse_submit_ms = float(receipt.with_suffix('.json.browse-submit-ms').read_text(encoding='utf8'))
        browse_receipt_ms = float(receipt.with_suffix('.json.browse-receipt-ms').read_text(encoding='utf8'))
        if receipt.with_suffix('.json.autowalk').read_text(encoding='utf8') != 'At Synthetic wall. face east.':
            raise RuntimeError('NW autowalk did not announce its verified arrival')
        if receipt.with_suffix('.json.autowalk-path').read_text(encoding='utf8') != '1 east. face east.' or \
                receipt.with_suffix('.json.autowalk-stop').read_text(encoding='utf8') != 'Autowalk stopped.':
            raise RuntimeError('NW autowalk narration or explicit stop failed')
        if cave['kind'] != 'fieldStatus' or '2 west, 2 north, moving east' not in cave.get('speech', ''):
            raise RuntimeError(f'NW fixture did not qualify the transformed patrol sprite: {data}')
        if timed['kind'] != 'timedCue' or timed.get('speech') != 'One tile south on the tone.':
            raise RuntimeError(f'NW fixture did not publish the one-step timing cue: {data}')
        cave_ms = float(receipt.with_suffix('.json.cave-review-ms').read_text(encoding='utf8'))
        timed_ms = float(receipt.with_suffix('.json.timed-submit-ms').read_text(encoding='utf8'))
        audio_ms = float(receipt.with_suffix('.json.audio-init-ms').read_text(encoding='utf8'))
        wall_ms = float(receipt.with_suffix('.json.wall-preview-ms').read_text(encoding='utf8'))
        if receipt.with_suffix('.json.beacon').read_text(encoding='utf8') != '1' or \
                receipt.with_suffix('.json.beacon-refresh').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW route beacon did not publish stereo PCM to SDL')
        beacon_ms = float(receipt.with_suffix('.json.beacon-ms').read_text(encoding='utf8'))
        battle_cue_ms = float(receipt.with_suffix('.json.battle-cue-ms').read_text(encoding='utf8'))
        battle_cue = json.loads(receipt.with_suffix('.json.battle-cue').read_text(encoding='utf8'))
        if battle_cue['status'] != 1 or abs(battle_cue['pitch'] - 1) > 0.00001:
            raise RuntimeError('NW battle timing cue did not submit stereo PCM to SDL')
        if receipt.with_suffix('.json.cave-cue').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW cave cue did not publish stereo PCM to SDL')
        if receipt.with_suffix('.json.soundscape').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW ambient object cue did not publish stereo PCM to SDL')
        if not receipt.with_suffix('.json.muted-preview').is_file():
            raise RuntimeError('NW sound preview was unavailable with speech disabled')
        expected_menu = {
            'menuFocus': 'Inventory, Synthetic supply, 3',
            'menuDetails': 'Visible first line. Visible second line',
            'menu-review-first': 'Visible first line',
            'menu-review-second': 'Visible second line',
            'menuFocus-auto': 'Inventory, Synthetic supply, 3, 1 of 1',
            'menuDetails-auto': 'Visible first line. Visible second line',
            'quest-focus': 'Synthetic quest. A shown clue. 1 of 2',
            'quest-objective': 'Quest objective. A shown clue. 1 of 2',
            'quest-detail-auto': 'A shown clue. 1 of 2',
            'quest-detail-key': 'Synthetic quest. A shown clue. 1 of 2',
            'quest-detail': 'Synthetic quest. A shown clue. 1 of 2',
            'quest-restore-focus': 'Quest objective. Recovered clue. 0 of 1',
            'quest-nav-target': 'Quests, Synthetic quest anchor, 2 east',
            'quest-nav-route': '1 east. face east.',
            'quest-nav-unavailable': 'Selected destination is unavailable',
            'bookmark-route': '1 north.',
            'bookmark-browse': 'Bookmarks, Return marker, 1 north',
            'bookmark-arrival': 'At Return marker. you are here.',
            'bookmark-entity': 'Objects, Synthetic quest anchor, 2 east',
            'cross-map-entrance': 'Move east to activate.',
            'cross-map-event': 'Events, Scene trigger, 1 east',
            'cross-map-event-route': 'Move east to activate.',
            'cross-map-browse': 'Bookmarks, Return marker. Saved on another map, on foot.',
            'cross-map-next': 'Move east to activate.',
            'cross-map-arrived': 'You are here.',
            'battle-formation': 'Enemy formation. 1 Synthetic archer.',
            'battle-focus': 'Synthetic hero, Battle commands, Synthetic guard, 1 of 1',
            'battle-companion-focus': 'Synthetic companion, Battle commands, Synthetic guard, 1 of 1',
            'battle-appearance': 'Synthetic companion. His gold crest sticks up from a red headband. He crouches with a short red bow held low. Blue ice streaks coat the sprite.',
            'battle-wendy-status': 'Synthetic hero. HP 8 of 14. FP 3 of 5. Level 7',
            'battle-log-auto': 'Synthetic turn result.',
            'battle-log-repeat': 'Synthetic turn result.',
            'battle-radial': 'Power 81%. Accuracy 93%, NICE.',
            'battle-damage': 'Synthetic target, 17 HP damage, elemental resistance.',
            'battle-outcome': 'Synthetic victory reward.',
            'manual-save': 'Synthetic save finished.',
            'manual-save-details': 'Synthetic save finished.',
            'manual-save-late': 'Save completed.',
            'shop-focus': 'Shop, Synthetic shop item, Price 19 Gold, unavailable, 1 of 1',
            'shop-details': 'Shown effect. Owned 2. Balance 12 Gold',
            'shop-quantity': 'Purchase quantity, Synthetic shop item, quantity 3, Total 57 Gold',
            'shop-quantity-details': 'Quantity 3, total 57 Gold. Shown effect. Owned 2. Balance 12 Gold',
            'menu-gold': '17 Gold',
            'menu-vitals-h': 'Synthetic menu hero. HP 8 of 14. FP 3 of 5. Level 7, experience bar 50 percent. Status, Synthetic condition',
            'menu-vitals-full': 'Synthetic menu hero. HP 8 of 14. FP 3 of 5. Level 7, experience bar 50 percent. Status, Synthetic condition',
            'coupon-list-stone': 'Available rewards, Fry Stone, 1 of 5',
            'coupon-list-locked': 'Locked reward, unavailable, 2 of 5',
            'coupon-response-focus': 'Coupon response, SYNTHETIC COUPON. Copy coupon code, 2 of 3',
            'coupon-response-auto': 'SYNTHETIC COUPON. REDEEM. Shown instructions.',
            'coupon-response-details': 'SYNTHETIC COUPON. REDEEM. Shown instructions. Coupon code, X 1 dash Z 9',
            'coupon-response-copy': 'Copied to Clipboard',
            'battle-target-vitals': 'Synthetic hero. HP 8 of 14. FP 3 of 5. Level 7',
            'battle-autodetail': 'Shield raised. Cost 2 MP',
            'battle-details': 'Shield raised. Cost 2 MP',
            'battle-review': 'Cost 2 MP, 2 of 2',
            'battle-target-focus': 'Target, Synthetic target: 50%, 1 of 1',
            'battle-target-autodetail': 'Synthetic target, Frozen or frosted',
            'battle-target-details': 'Synthetic target, HP 50%, Frozen or frosted',
            'battle-bag-focus': 'Battle Bag, Synthetic item effect, 4, 1 of 1',
            'battle-bag-autodetail': 'Synthetic item effect',
            'battle-bag-details': 'Synthetic item effect',
        }
        for name, speech in expected_menu.items():
            if receipt.with_suffix('.json.' + name).read_text(encoding='utf8') != speech:
                raise RuntimeError(f'NW menu output failed for {name}')
        cave_cue_ms = float(receipt.with_suffix('.json.cave-cue-ms').read_text(encoding='utf8'))
        if page['kind'] != 'dialoguePage' or page.get('text') != 'Synthetic prompt' or choice['kind'] != 'dialogueChoice' or \
                choice.get('speech') != 'Choices. Synthetic choice' or not choice.get('append') or choice['epoch'] != page['epoch']:
            raise RuntimeError(f'NW fixture did not deliver the page and appended choice in one epoch: {data}')
        if repeat != page or pad_repeat != page or title_mode['speech'] != 'Mod mode. Menu opens settings. View cancels.' or \
                dialogue_mode['speech'] != 'Mod mode. A repeats dialogue. RT cancels.':
            raise RuntimeError(f'NW fixture did not deliver the controller mode prompt and current page repeat: {data}')
        if number['kind'] != 'numberEntry' or number.get('speech') != 'Number entry. 0, 7. Digit 2 of 2, 7' or \
                number['epoch'] in {record['epoch'] for record in records[:-1]}:
            raise RuntimeError(f'NW fixture did not deliver the padded number in a fresh epoch: {data}')
        versions = data['versions']
        receipt.unlink()
        receipt.with_suffix('.json.restart').touch()
        restarted, _ = run_fixture(launch, runtime, environment)
        reloaded = json.loads(receipt.read_text(encoding='utf8')) if receipt.exists() else {}
        if restarted or not reloaded.get('speechRestored') or reloaded.get('bindings') != ['Open mod settings, V', 'Repeat dialogue, T',
                'Start or review puzzle guidance, Shift+U', 'Stop puzzle guidance, Ctrl+U'] or \
                reloaded.get('controller') != ['Controller support, on', 'Toggle mod mode, RT', 'Next category, Unassigned'] or \
                reloaded.get('navigation') != ['Autowalk, on', 'Speak autowalk path, on',
                                               'Navigation keymap, Brackets and backslash', 'Reachable destinations only, off', 'Spoiler mode, on', 'Previous destination, Left bracket',
                                               'Next destination, N'] or reloaded.get('audio') != [
                    'Mod sounds, on', 'HRTF, off', 'Wall sounds, on', 'Decrease wall volume, 55 percent',
                    'Increase wall volume, 55 percent', 'Footstep sounds, on', 'Decrease footstep volume, 50 percent',
                    'Increase footstep volume, 50 percent', 'Navigation beacon, on', 'Decrease beacon volume, 65 percent',
                    'Increase beacon volume, 65 percent', 'Cave timing cues, on', 'Decrease cave timing volume, 65 percent',
                    'Increase cave timing volume, 65 percent', 'Battle timing assist, on',
                    'Decrease battle timing volume, 65 percent', 'Increase battle timing volume, 65 percent'] or reloaded.get('soundscape') != [
                    'Soundscape, on', 'Decrease volume, 35 percent', 'Exits, off']:
            raise RuntimeError(f'NW settings did not survive restart in the isolated profile: {reloaded}')
        if reloaded.get('narration') != ['Cutscene descriptions, on', 'Decrease cutscene description volume, 55 percent',
                'Increase cutscene description volume, 55 percent', 'Decrease cutscene description speed, 210 percent',
                'Increase cutscene description speed, 210 percent']:
            raise RuntimeError(f'Cutscene narration preferences did not survive restart: {reloaded}')
        narration_ms = float(receipt.with_suffix('.json.cutscene-narration-ms').read_text(encoding='utf8'))
        print(f'Verified cutscene clip decode, volume, rate, delay until visible movement, and transfer retirement. '
              f'Throttled progress observed after {narration_ms:.1f} ms with 40 ms polling.')
        print(f"Verified hidden window resize, settings, dialogue repeat and route worker in NW {versions.get('nw', VERSION)}, "
              f"Node {versions['node']}, modules ABI {versions['modules']}.")
        print(f'Throttled synthetic cold browse submission {browse_submit_ms:.1f} ms, speech receipt '
              f'{browse_receipt_ms:.1f} ms with 40 ms polling, warm route submission {submit_ms:.1f} ms.')
        print('Verified native autowalk dispatch, both narration settings, spoken arrival and explicit cancellation.')
        print('Verified ambient object submission, door preview, settings persistence and native event retirement.')
        print('Verified Auto language detection and fallback, manual persistence, saved mute and controller restoration.')
        print('Verified menu and quest focus, keyboard and controller review, Autodetail, indexing and quest restoration.')
        for suffix, expected in {
            'field-vitals-h': 'Synthetic map hero. HP bar 25 percent, critical. FP bar 60 percent. Level 7. Status, Synthetic condition',
            'field-vitals-full': 'Synthetic map hero. HP bar 25 percent, critical. FP bar 60 percent. Level 7. Status, Synthetic condition',
        }.items():
            if receipt.with_suffix('.json.' + suffix).read_text(encoding='utf8') != expected:
                raise AssertionError(f'Unexpected {suffix} receipt')
        if receipt.with_suffix('.json.autosave-notice').read_text(encoding='utf8').splitlines() != ['GAME SAVED', 'GAME SAVED']:
            raise AssertionError('The packaged map save notifications did not follow two distinct completed presentations')
        diagram = {name: receipt.with_suffix('.json.map-diagram-' + name).read_text(encoding='utf8')
                   for name in ('title', 'details', 'mode', 'review')}
        if diagram['title'] != 'Caffeine Caverns map, 1 pathway shown' or \
                'Pathway 1' not in diagram['details'] or 'Pathway 3' in diagram['details'] or \
                'A reads the map' not in diagram['mode'] or not diagram['review'].startswith('Pathway 1'):
            raise AssertionError('Unexpected map diagram review')
        credits = {name: receipt.with_suffix('.json.credits-' + name).read_text(encoding='utf8')
                   for name in ('page', 'mode', 'review')}
        if 'Synthetic heading' not in credits['page'] or 'Synthetic description.' not in credits['page'] or \
                'A reads the credits' not in credits['mode'] or not credits['review'].startswith('Synthetic description.'):
            raise AssertionError('Unexpected credits review')
        print('Verified map HUD, map save, diagrams, credits review, battle commands, targets, vitals and rendered Bag items.')
        print('Verified the Battle timing setting, preview and action retirement. '
              f'Throttled warm battle cue reached silent SDL submission in {battle_cue_ms:.0f} ms.')
        print('Verified the Quests category, packaged route and marker replacement handback.')
        print('Verified controller bookmark naming, keyboard save, native tile arrival, linked event removal and persistence.')
        print('Verified packaged Events speech and the manual activation step, two native transfers and restored bookmark selection.')
        print('Verified the bracket-layout filter shortcut changed both spoken destination modes.')
        cross_map = [float(receipt.with_suffix('.json.cross-map-' + name + '-ms').read_text(encoding='utf8'))
                     for name in ('submission', 'receipt', 'handback')]
        print(f'Throttled cross-map submission {cross_map[0]:.1f} ms, silent speech receipt {cross_map[1]:.1f} ms '
              f'with 40 ms polling, ready handback {cross_map[2]:.1f} ms.')
        print(f'Throttled cave review from key press through postrender speech enqueue: {cave_ms:.1f} ms.')
        print(f'Throttled timed preview from key press through postrender worker enqueue: {timed_ms:.1f} ms.')
        print(f'Verified native HRTF and stereo wall preview on the silent SDL driver and settings persistence. '
              f'Throttled cold HRTF status observed after {audio_ms:.1f} ms with 40 ms polling.')
        print(f'Throttled warm wall preview status observed after {wall_ms:.1f} ms with 40 ms polling.')
        print(f'Verified a live stereo route beacon, off-course refresh and retirement in field settings. '
              f'Throttled warm native submission observed after {beacon_ms:.1f} ms with 40 ms polling.')
        print(f'Verified late forecast replacement, native cue submission and retirement at cave exit. '
              f'Throttled warm submission observed after {cave_cue_ms:.1f} ms with 40 ms polling.')


if __name__ == '__main__':
    main()
