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
PIXI_HASH = '6eca31989af44e87ac64319da69b9e484a7fdf0cbbdcaf3cd85869362588cee1'
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import OBJECTS_REL, objects_notification


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
    pixi = installed / 'package.nw' / 'js' / 'libs' / 'pixi.js'
    if sha(pixi) != PIXI_HASH:
        raise ValueError('Unexpected installed PIXI runtime')
    shutil.copyfile(pixi, app / 'pixi.js')
    (app / 'package.json').write_text(json.dumps({
        'name': 'wendyquest-access-offline-fixture', 'main': 'index.html',
        'window': {'show': False, 'width': 320, 'height': 200},
        'chromium-args': '--in-process-gpu --disable-devtools'
    }), encoding='utf8')
    (app / 'index.html').write_text('''<!doctype html><title>WendyQuest Access Offline Fixture</title>
<script src="pixi.js"></script><script src="fixture.js"></script><script src="plugin.js"></script><script src="resize-markers.js"></script>
<script src="native-movement.js"></script>
<script src="run.js"></script>
''', encoding='utf8')
    objects = objects_notification((installed / OBJECTS_REL).read_bytes()).decode('utf8')
    start = objects.index('Game_Player.prototype.moveByInput = function(')
    end = objects.index('\n};', start) + 3
    (app / 'native-movement.js').write_text('function Game_Player() {}\n' + objects[start:end], encoding='utf8')
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
    this.spr_ui_start = { alpha: 1 };
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
var $dataSystem = { tileSize: 32 };
var Input = { keyMapper: { 90: 'ok' }, clear() {} };
Input.gamepadMapper = { 0: 'ok', 1: 'cancel', 3: 'menu', 9: 'menu', 12: 'up', 13: 'down' };
''', encoding='utf8')
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
let fieldStep = 0;
let autowalkStep = 0;
let repeated = false;
let numberShown = false;
let settingsStep = 0;
let audioStarted = 0;
let wallPreviewStarted = 0;
let beaconStarted = 0;
let caveCueStarted = 0;
let soundscapeStarted = 0;
let controllerStep = 0;
let dialoguePadStep = 0;
let endingStep = 0;
let restartStep = 0;
let restartSettings;
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
    const geometry = path.join(profile, 'wendyquest-access-geometry');
    fs.mkdirSync(geometry);
    for (const name of ['1.wqg', '196.wqg', 'manifest.json']) fs.copyFileSync(path.join(root, 'geometry', name), path.join(geometry, name));
}
document.addEventListener('keydown', event => { if (event.code === 'KeyZ') nativeZ++; });
function key(type, key, code, repeat = false, modifiers = {}) {
    document.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true, ...modifiers }));
}
function tap(keyValue, code = keyValue, modifiers) {
    key('keydown', keyValue, code, false, modifiers);
    key('keyup', keyValue, code);
}
function pad(...buttons) {
    return WendyQuestAccessPadSample(0, 'standard', 'Xbox fixture', buttons.reduce((mask, button) => mask | 1 << button, 0));
}
function padTap(button) { const mask = pad(button); pad(); return mask; }
function padStick(x, y) { return WendyQuestAccessPadSample(0, 'standard', 'Xbox fixture', 0, x, y); }
function choose(label) {
    const button = Array.from(document.querySelectorAll('dialog button')).find(item => item.textContent.startsWith(label));
    if (!button) throw Error('Missing settings control ' + label);
    button.click();
}
function menuStatus() { return document.querySelector('dialog [role=status]')?.textContent; }
function verifySettings() {
    if (settingsStep === 0) {
        key('keydown', 'z', 'KeyZ');
        tap('F8');
        if (!SceneManager._scene._wqaSettingsActive || document.activeElement.textContent !== 'Keyboard bindings') {
            throw Error(`F8 did not focus settings: modal ${!!document.querySelector('dialog')}, ` +
                `focused ${document.activeElement.tagName}, Chromium ${process.versions.chromium}`);
        }
        choose('Keyboard bindings');
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
        tap('Escape');
        if (document.activeElement.textContent !== 'Navigation') throw Error('Navigation parent focus was lost');
        choose('Audio');
        if (document.activeElement.textContent !== 'Mod sounds, on') throw Error('Sound defaults were not applied');
        audioStarted = performance.now();
        choose('Preview ahead');
        settingsStep++;
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
        choose('Preview wall brush on the left');
        settingsStep++;
    } else if (settingsStep === 13 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        require('fs').writeFileSync(receipt + '.wall-preview-ms', String(performance.now() - wallPreviewStarted));
        choose('Navigation beacon');
        settingsStep++;
    } else if (settingsStep === 14 && menuStatus() === 'Audio settings saved') {
        choose('Preview beacon arrival');
        settingsStep++;
    } else if (settingsStep === 15 && menuStatus() === 'Preview uses stereo and rear pitch.') {
        choose('Cave timing cues');
        settingsStep++;
    } else if (settingsStep === 16 && menuStatus() === 'Audio settings saved') {
        choose('Preview cave crossing tone');
        settingsStep++;
    } else if (settingsStep === 17 && menuStatus() === 'Preview uses stereo and rear pitch.') {
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
            const navigation = Array.from(document.querySelectorAll('dialog button')).slice(0, 5).map(item => item.textContent);
            tap('Escape');
            choose('Audio');
            const audio = Array.from(document.querySelectorAll('dialog button')).slice(0, 11).map(item => item.textContent);
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
            restartSettings = { bindings, controller, navigation, audio, soundscape };
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
        const scene = { _wqaFileKind: 1, _started: true, _active: true, _fadeDuration: 0, _fadeOpacity: 0,
            _listWindow: { active: true, visible: true, openness: 255, _index: 1, _wqaCards: true,
                select() {}, callHandler() {}, isHandled() {} } };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessFilesReady(scene);
        Graphics.app.renderer.emit('postrender');
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
            { _eventId: 2, _x: 2, _y: 1, _pageIndex: 0, _trigger: 0, _priorityType: 1 }], _tileEvents: [], _vehicles: [],
            roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0),
            roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0) };
        $dataMap = { width: 3, height: 2, scrollType: 0, tilesetId: 1, data: new Array(36).fill(0),
            events: [null, { name: 'Synthetic wall', pages: [{ list: [{}, {}] }] },
                { name: 'Synthetic switch', pages: [{ list: [{}, {}] }] }] };
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
        const scene = SceneManager._scene;
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
        fieldStep++;
        tap('p', 'KeyP');
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 1 && require('fs').existsSync(receipt + '.field-target-1')) {
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
        if (!require('fs').existsSync(receipt + '.beacon')) return;
        require('fs').writeFileSync(receipt + '.beacon-ms', String(performance.now() - beaconStarted));
        fieldStep++;
        padTap(6);
    }
    if (fieldStep === 5) Graphics.app.renderer.emit('postrender');
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
            const scene = SceneManager._scene = Graphics.app.stage = new Scene_Title();
            WendyQuestAccessTitleReady(scene);
            Graphics.app.renderer.emit('postrender');
            tap('v', 'KeyV');
            choose('Speech');
            choose('Speech enabled, on');
            endingStep++;
        } else if (endingStep === 1 && menuStatus() === 'Speech settings saved' && fs.existsSync(receipt + '.silenced')) {
            if (document.activeElement.textContent !== 'Speech enabled, off') throw Error('The mute switch did not retain focus');
            tap('Escape');
            choose('Audio');
            choose('Preview right');
            endingStep++;
        } else if (endingStep === 2 && menuStatus() === 'Preview uses stereo and rear pitch.') {
            fs.writeFileSync(receipt + '.muted-preview', '');
            clearInterval(interval);
            nw.App.quit();
        }
    }
}, 40);
setTimeout(() => {
    write({ error: 'No worker receipt', settingsStep, controllerStep, fieldStep, dialoguePadStep, endingStep, restartStep,
        status: menuStatus(), focus: document.activeElement?.tagName === 'BUTTON' ? document.activeElement.textContent : '' });
    nw.App.quit();
}, 7000);
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
    if (fs.existsSync(receipt + '.closing-pass')) {
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
    for name in ('route-worker.cjs', 'geometry.cjs', 'routes.cjs', 'WendyQuestAudio.node'):
        shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / name, service / name)
    shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / 'audio-worker.cjs', service / 'production-audio-worker.cjs')
    (service / 'audio-worker.cjs').write_text('''
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
let active;
parentPort.on('message', request => { active = request; });
const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = packet => {
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 3 && active.forward === 1) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.beacon'), String(packet.status));
    }
    if (packet.status > 0 && packet.epoch === active.epoch && active.cue === 6 && active.forward === -1) {
        fs.writeFileSync(path.join(__dirname, '..', 'receipt.json.cave-cue'), String(packet.status));
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
    cave = struct.pack('<4sHHHBBI', b'WQG1', 196, 23, 52, 0, 0, 0) + bytes([15] * 23 * 52)
    (geometry / '196.wqg').write_bytes(cave)
    (geometry / 'manifest.json').write_text(json.dumps({
        'build': '26578620', 'maps': {key: {'geometry': hashlib.sha256(data).hexdigest()}
                                    for key, data in [('1', synthetic), ('196', cave)]}
    }), encoding='utf8')
    return app / 'receipt.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--installed', type=Path, required=True)
    args = parser.parse_args()
    temp_base = Path(tempfile.gettempdir()).resolve()
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
        environment = {**os.environ, 'SDL_AUDIO_DRIVER': 'dummy'}
        result = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25, env=environment)
        if not receipt.exists():
            raise RuntimeError(f'NW exited {result.returncode} without a receipt: {result.stderr[:1024]!r}')
        data = json.loads(receipt.read_text(encoding='utf8'))
        records = data.get('records', [])
        if result.returncode or data.get('error') or len(records) != 19 or not all(r.get('sameEpoch') for r in records):
            raise RuntimeError(f'NW fixture did not deliver the expected packet: {data}')
        title, returned_title, title_mode, controller_title, slot, banner, first, second, third, route, pad_route, cave, timed, page, choice, repeat, dialogue_mode, pad_repeat, number = records
        if any(item['name'] != title['name'] for item in (returned_title, controller_title)) or \
                len({title['epoch'], returned_title['epoch'], controller_title['epoch']}) != 3:
            raise RuntimeError(f'NW fixture did not restore the title focus: {data}')
        if title['kind'] != 'title' or title.get('name') != 'Synthetic title command' or slot['kind'] != 'saveSlot' or \
                slot.get('slot') != 2 or not slot.get('empty') or banner['kind'] != 'mapBanner' or \
                banner.get('name') != 'Synthetic map banner' or len({record['epoch'] for record in records[:14]}) != 13:
            raise RuntimeError(f'NW fixture did not deliver distinct presentation epochs: {data}')
        if [item.get('name') for item in (first, second, third)] != ['Synthetic wall', 'Synthetic switch', 'Synthetic wall'] or \
                any(item['kind'] != 'fieldTarget' for item in (first, second, third)):
            raise RuntimeError(f'NW field selection or layout priority failed: {data}')
        if any(item['kind'] != 'routeDirections' or item['speech'] != 'Synthetic wall. 1 east. face east.'
               for item in (route, pad_route)):
            raise RuntimeError(f'NW field did not publish a route through the packaged worker: {data}')
        submit_ms = float(receipt.with_suffix('.json.route-submit-ms').read_text(encoding='utf8'))
        if receipt.with_suffix('.json.autowalk').read_text(encoding='utf8') != 'At Synthetic wall. face east.':
            raise RuntimeError('NW autowalk did not announce its verified arrival')
        if receipt.with_suffix('.json.autowalk-path').read_text(encoding='utf8') != 'Synthetic wall. 1 east. face east.' or \
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
        if receipt.with_suffix('.json.beacon').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW route beacon did not publish stereo PCM to SDL')
        beacon_ms = float(receipt.with_suffix('.json.beacon-ms').read_text(encoding='utf8'))
        if receipt.with_suffix('.json.cave-cue').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW cave cue did not publish stereo PCM to SDL')
        if receipt.with_suffix('.json.soundscape').read_text(encoding='utf8') != '1':
            raise RuntimeError('NW ambient object cue did not publish stereo PCM to SDL')
        if not receipt.with_suffix('.json.muted-preview').is_file():
            raise RuntimeError('NW sound preview was unavailable with speech disabled')
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
        restarted = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25, env=environment)
        reloaded = json.loads(receipt.read_text(encoding='utf8')) if receipt.exists() else {}
        if restarted.returncode or not reloaded.get('speechRestored') or reloaded.get('bindings') != ['Open mod settings, V', 'Repeat dialogue, T',
                'Start or review puzzle guidance, Shift+U', 'Stop puzzle guidance, Ctrl+U'] or \
                reloaded.get('controller') != ['Controller support, on', 'Toggle mod mode, RT', 'Next category, Unassigned'] or \
                reloaded.get('navigation') != ['Autowalk, on', 'Speak autowalk path, on',
                                               'Navigation keymap, Brackets and backslash', 'Previous destination, Left bracket',
                                               'Next destination, N'] or reloaded.get('audio') != [
                    'Mod sounds, on', 'HRTF, off', 'Wall sounds, on', 'Decrease wall volume, 55 percent',
                    'Increase wall volume, 55 percent', 'Navigation beacon, on', 'Decrease beacon volume, 65 percent',
                    'Increase beacon volume, 65 percent', 'Cave timing cues, on', 'Decrease cave timing volume, 65 percent',
                    'Increase cave timing volume, 65 percent'] or reloaded.get('soundscape') != [
                    'Soundscape, on', 'Decrease volume, 35 percent', 'Exits, off']:
            raise RuntimeError(f'NW settings did not survive restart in the isolated profile: {reloaded}')
        print(f"Verified hidden window resize, settings, dialogue repeat and route worker in NW {versions.get('nw', VERSION)}, "
              f"Node {versions['node']}, modules ABI {versions['modules']}.")
        print(f'Throttled synthetic renderer command and cold worker submission: {submit_ms:.1f} ms.')
        print('Verified native autowalk dispatch, both narration settings, spoken arrival and explicit cancellation.')
        print('Verified ambient object submission, door preview, settings persistence and native event retirement.')
        print('Verified saved mute before title speech, audio preview during mute and controller restoration.')
        print(f'Throttled cave review from key press through postrender speech enqueue: {cave_ms:.1f} ms.')
        print(f'Throttled timed preview from key press through postrender worker enqueue: {timed_ms:.1f} ms.')
        print(f'Verified native HRTF and stereo wall preview on the silent SDL driver and settings persistence. '
              f'Throttled cold HRTF status observed after {audio_ms:.1f} ms with 40 ms polling.')
        print(f'Throttled warm wall preview status observed after {wall_ms:.1f} ms with 40 ms polling.')
        print(f'Verified a live stereo route beacon and its retirement in field settings. '
              f'Throttled warm native submission observed after {beacon_ms:.1f} ms with 40 ms polling.')
        print(f'Verified late forecast replacement, native cue submission and retirement at cave exit. '
              f'Throttled warm submission observed after {cave_cue_ms:.1f} ms with 40 ms polling.')


if __name__ == '__main__':
    main()
