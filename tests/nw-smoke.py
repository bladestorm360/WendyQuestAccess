"""Check the production plugin bundle on the official standalone NW.js host.

Run inside the resource runner. The hidden fixture uses synthetic game state,
the installed open-source PIXI runtime and a silent speech worker receipt.
"""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import tempfile
import zipfile


VERSION = '0.48.4'
ARCHIVE_HASH = '1731a5ed81139a63a5d1d7e7c521b5f08add023ffe4b719d06796a1ba77dc8a3'
PIXI_HASH = '6eca31989af44e87ac64319da69b9e484a7fdf0cbbdcaf3cd85869362588cee1'
ROOT = Path(__file__).resolve().parents[1]


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
<script src="run.js"></script>
''', encoding='utf8')
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
var Graphics = { app: { stage: SceneManager._scene, renderer: new (require('events').EventEmitter)() } };
const nativeSelect = SceneManager._scene._commandWindow.select;
var DataManager = { savefileInfo: () => null };
var $gameMap, $gamePlayer, $gameScreen, $dataMap, $dataTilesets, $gameTileChanges;
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
let dialogueShown = false;
let routeRequested = false;
let fieldStep = 0;
let repeated = false;
let numberShown = false;
let settingsStep = 0;
let controllerStep = 0;
let dialoguePadStep = 0;
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
    for (const name of ['1.wqg', 'manifest.json']) fs.copyFileSync(path.join(root, 'geometry', name), path.join(geometry, name));
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
        choose('Navigation keyboard');
        choose('Navigation keymap');
        settingsStep++;
    } else if (settingsStep === 6 && menuStatus() === 'Navigation keyboard saved') {
        if (document.activeElement.textContent !== 'Navigation keymap, Brackets and backslash') throw Error('Layout did not change');
        choose('Next destination');
        tap('n', 'KeyN');
        settingsStep++;
    } else if (settingsStep === 7 && menuStatus() === 'Navigation keyboard saved') {
        tap('Escape');
        if (document.activeElement.textContent !== 'Navigation keyboard') throw Error('Navigation parent focus was lost');
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
        if (!document.querySelector('dialog')) {
            tap('v', 'KeyV');
            if (document.querySelector('dialog')) choose('Keyboard bindings');
        }
        if (document.querySelector('dialog') && menuStatus() !== 'Loading settings') {
            const bindings = Array.from(document.querySelectorAll('dialog button')).slice(0, 4).map(item => item.textContent);
            tap('Escape');
            choose('Controller bindings');
            const buttons = Array.from(document.querySelectorAll('dialog button')).map(item => item.textContent);
            const controller = [...buttons.slice(0, 2), buttons.find(item => item.startsWith('Next category, '))];
            tap('Escape');
            choose('Navigation keyboard');
            const navigation = Array.from(document.querySelectorAll('dialog button')).slice(0, 3).map(item => item.textContent);
            write({ bindings, controller, navigation });
            clearInterval(interval);
            nw.App.quit();
        }
        return;
    }
    if (!fileShown && require('fs').existsSync(receipt + '.title')) {
        if (settingsStep < 8) return verifySettings();
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
            { _eventId: 2, _x: 2, _y: 1, _pageIndex: 0, _trigger: 0, _priorityType: 1 }], _tileEvents: [], _vehicles: [] };
        $dataMap = { width: 3, height: 2, scrollType: 0, tilesetId: 1, data: new Array(36).fill(0),
            events: [null, { name: 'Synthetic wall', pages: [{ list: [{}, {}] }] },
                { name: 'Synthetic switch', pages: [{ list: [{}, {}] }] }] };
        $dataTilesets = [null, { flags: [0] }];
        $gameTileChanges = { 1: { 6: 0 } };
        $gamePlayer = { _x: 0, _y: 0, _realX: 0, _realY: 0, _vehicleType: 'walk' };
        $gameScreen = { _brightness: 255 };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessMapBannerReady(scene, 1);
        Graphics.app.renderer.emit('postrender');
    }
    if (fieldStep === 0 && require('fs').existsSync(receipt + '.map')) {
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
        fieldStep++;
        padTap(6);
    }
    if (fieldStep === 5) Graphics.app.renderer.emit('postrender');
    if (!caveShown && require('fs').existsSync(receipt + '.route-2')) {
        caveShown = true;
        tap('v', 'KeyV');
        if (!document.querySelector('dialog') || !SceneManager._scene._wqaSettingsActive) throw Error('Field settings did not open');
        tap('Escape');
        if (document.querySelector('dialog')) throw Error('Field settings did not return control');
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
            _priorityType: 1, getMapSprite: () => sprite };
        sprite._character = patrol;
        const events = [null, null, null, null, patrol];
        const scene = { _active: true, _wqaMapRestored: true, _wqaFieldReady: true, _fadeDuration: 0, _fadeOpacity: 0,
            _spriteset: { _tilemap: tilemap } };
        $gameMap = { _mapId: 196, _tilesetId: 1, inactiveTime: 0, _events: events };
        $dataMap = { width: 23, height: 52, scrollType: 0,
            events: [null, null, null, null, { name: 'Synthetic patrol', pages: [{ list: [{}, {}] }] }] };
        $gamePlayer = { _x: 6, _y: 26, _realX: 6, _realY: 26, _vehicleType: 'walk' };
        SceneManager._scene = Graphics.app.stage = scene;
        Graphics.app.renderer.screen = new PIXI.Rectangle(0, 0, 320, 200);
        const started = performance.now();
        tap('U', 'KeyU', { shiftKey: true });
        Graphics.app.renderer.emit('postrender');
        require('fs').writeFileSync(receipt + '.cave-review-ms', String(performance.now() - started));
    }
    if (!dialogueShown && require('fs').existsSync(receipt + '.cave')) {
        dialogueShown = true;
        WendyQuestAccessSceneLeaving(SceneManager._scene);
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
    if (require('fs').existsSync(receipt) && require('fs').existsSync(receipt + '.route-2')) {
        clearInterval(interval);
        nw.App.quit();
    }
}, 40);
setTimeout(() => {
    write({ error: 'No worker receipt', settingsStep, controllerStep, fieldStep, dialoguePadStep,
        status: menuStatus(), focus: document.activeElement?.tagName === 'BUTTON' ? document.activeElement.textContent : '' });
    nw.App.quit();
}, 5000);
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
    for name in ('route-worker.cjs', 'geometry.cjs', 'routes.cjs'):
        shutil.copyfile(ROOT / '.build' / 'payload' / 'wendyquest-access' / name, service / name)
    geometry = app / 'geometry'
    geometry.mkdir()
    synthetic = struct.pack('<4sHHHBBI', b'WQG1', 1, 3, 2, 0, 0, 0) + bytes([15] * 6)
    (geometry / '1.wqg').write_bytes(synthetic)
    (geometry / 'manifest.json').write_text(json.dumps({
        'build': '26578620', 'maps': {'1': {'geometry': hashlib.sha256(synthetic).hexdigest()}}
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
        result = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25)
        if not receipt.exists():
            raise RuntimeError(f'NW exited {result.returncode} without a receipt: {result.stderr[:1024]!r}')
        data = json.loads(receipt.read_text(encoding='utf8'))
        records = data.get('records', [])
        if result.returncode or data.get('error') or len(records) != 18 or not all(r.get('sameEpoch') for r in records):
            raise RuntimeError(f'NW fixture did not deliver the expected packet: {data}')
        title, returned_title, title_mode, controller_title, slot, banner, first, second, third, route, pad_route, cave, page, choice, repeat, dialogue_mode, pad_repeat, number = records
        if any(item['name'] != title['name'] for item in (returned_title, controller_title)) or \
                len({title['epoch'], returned_title['epoch'], controller_title['epoch']}) != 3:
            raise RuntimeError(f'NW fixture did not restore the title focus: {data}')
        if title['kind'] != 'title' or title.get('name') != 'Synthetic title command' or slot['kind'] != 'saveSlot' or \
                slot.get('slot') != 2 or not slot.get('empty') or banner['kind'] != 'mapBanner' or \
                banner.get('name') != 'Synthetic map banner' or len({record['epoch'] for record in records[:13]}) != 12:
            raise RuntimeError(f'NW fixture did not deliver distinct presentation epochs: {data}')
        if [item.get('name') for item in (first, second, third)] != ['Synthetic wall', 'Synthetic switch', 'Synthetic wall'] or \
                any(item['kind'] != 'fieldTarget' for item in (first, second, third)):
            raise RuntimeError(f'NW field selection or layout priority failed: {data}')
        if any(item['kind'] != 'routeDirections' or item['speech'] != 'Synthetic wall. east, 1 step. face east.'
               for item in (route, pad_route)):
            raise RuntimeError(f'NW field did not publish a route through the packaged worker: {data}')
        submit_ms = float(receipt.with_suffix('.json.route-submit-ms').read_text(encoding='utf8'))
        if cave['kind'] != 'fieldStatus' or '2 west, 2 north, moving east' not in cave.get('speech', ''):
            raise RuntimeError(f'NW fixture did not qualify the transformed patrol sprite: {data}')
        cave_ms = float(receipt.with_suffix('.json.cave-review-ms').read_text(encoding='utf8'))
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
        restarted = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25)
        reloaded = json.loads(receipt.read_text(encoding='utf8')) if receipt.exists() else {}
        if restarted.returncode or reloaded.get('bindings') != ['Open mod settings, V', 'Repeat dialogue, T',
                'Start or review puzzle guidance, Shift+U', 'Stop puzzle guidance, Ctrl+U'] or \
                reloaded.get('controller') != ['Controller support, on', 'Toggle mod mode, Right trigger', 'Next category, Unassigned'] or \
                reloaded.get('navigation') != ['Navigation keymap, Brackets and backslash', 'Previous destination, Left bracket',
                                               'Next destination, N']:
            raise RuntimeError('NW settings did not survive restart in the isolated profile')
        print(f"Verified hidden window resize, settings, dialogue repeat and route worker in NW {versions.get('nw', VERSION)}, "
              f"Node {versions['node']}, modules ABI {versions['modules']}.")
        print(f'Throttled synthetic renderer command and cold worker submission: {submit_ms:.1f} ms.')
        print(f'Throttled cave review from key press through postrender speech enqueue: {cave_ms:.1f} ms.')


if __name__ == '__main__':
    main()
