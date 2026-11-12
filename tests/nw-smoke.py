"""Check the production plugin bundle on the official standalone NW.js host.

Run inside the resource runner. The fixture has no Steam or game files. It
uses a hidden window and replaces the speech worker with a silent receipt.
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


def fixture(runtime):
    app = runtime / 'package.nw'
    app.mkdir()
    (app / 'package.json').write_text(json.dumps({
        'name': 'wendyquest-access-offline-fixture', 'main': 'index.html',
        'window': {'show': False, 'width': 320, 'height': 200},
        'chromium-args': '--in-process-gpu --disable-devtools'
    }), encoding='utf8')
    (app / 'index.html').write_text('''<!doctype html><title>WendyQuest Access Offline Fixture</title>
<script src="fixture.js"></script><script src="plugin.js"></script><script src="resize-markers.js"></script>
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
let dialogueShown = false;
let repeated = false;
let numberShown = false;
let settingsStep = 0;
let controllerStep = 0;
let dialoguePadStep = 0;
let nativeZ = 0;
const restart = require('fs').existsSync(receipt + '.restart');
if (!restart) {
    const path = require('path');
    const root = path.dirname(receipt);
    const admission = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(admission, 0, 1);
    const { Worker } = require('worker_threads');
    const route = new Worker(path.join(root, 'wendyquest-access', 'route-worker.cjs'),
        { workerData: { geometryDirectory: path.join(root, 'geometry'), admission: admission.buffer } });
    route.once('error', error => { write({ error: error.message }); nw.App.quit(); });
    route.once('message', ({ sequence, result }) => {
        if (sequence !== 17 || result.status !== 'ready' || result.distance !== 2 ||
            result.arrival.x !== 2 || result.arrival.y !== 0 || result.legs.length !== 1 || result.legs[0].direction !== 6) {
            write({ error: 'Synthetic route worker returned an incorrect route' });
            nw.App.quit();
        } else require('fs').writeFileSync(receipt + '.route', '');
        route.terminate();
    });
    route.postMessage({ epoch: 1, sequence: 17, map: 1,
        live: { terrain: [], events: [], vehicles: [], mode: 'walk' },
        request: { x: 0, y: 0, targetX: 2, targetY: 0 } });
}
document.addEventListener('keydown', event => { if (event.code === 'KeyZ') nativeZ++; });
function key(type, key, code, repeat = false) {
    document.dispatchEvent(new KeyboardEvent(type, { key, code, repeat, bubbles: true, cancelable: true }));
}
function tap(keyValue, code = keyValue) {
    key('keydown', keyValue, code);
    key('keyup', keyValue, code);
}
function pad(...buttons) {
    return WendyQuestAccessPadSample(0, 'standard', 'Xbox fixture', buttons.reduce((mask, button) => mask | 1 << button, 0));
}
function padTap(button) { const mask = pad(button); pad(); return mask; }
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
        settingsStep++;
    } else if (settingsStep === 3 && menuStatus() === 'Keyboard bindings saved') {
        tap('Escape');
        if (document.activeElement.textContent !== 'Keyboard bindings') throw Error('Parent focus not restored');
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
        padTap(6);
    }
    else if (controllerStep === 7 && menuStatus() === 'Controller settings saved') {
        const mode = Array.from(document.querySelectorAll('dialog button')).some(item => item.textContent === 'Toggle mod mode, LT');
        if (!mode || focus !== 'Back') throw Error('Controller remap, family label, or save focus failed');
        choose('Controller support');
    } else if (controllerStep === 8 && menuStatus() === 'Controller settings saved' && focus === 'Controller support, off') {
        pad();
        padTap(13); // No controller navigation while passthrough is selected.
        pad(10, 11);
        pad();
    } else if (controllerStep === 9 && menuStatus() === 'Controller settings saved' && focus === 'Controller support, on') {
        pad(); // Applying a setting retires the previous device baseline.
        padTap(1);
    } else if (controllerStep === 10 && focus === 'Controller bindings') padTap(1);
    else if (controllerStep === 11 && !document.querySelector('dialog')) Graphics.app.renderer.emit('postrender');
    else return;
    controllerStep++;
}
Input.keyMapper[87] = 'up';
const interval = setInterval(() => {
    if (restart) {
        if (!document.querySelector('dialog')) {
            tap('j', 'KeyJ');
            if (document.querySelector('dialog')) choose('Keyboard bindings');
        }
        if (document.querySelector('dialog') && menuStatus() !== 'Loading settings') {
            const bindings = Array.from(document.querySelectorAll('dialog button')).slice(0, 2).map(item => item.textContent);
            tap('Escape');
            choose('Controller bindings');
            const controller = Array.from(document.querySelectorAll('dialog button')).slice(0, 2).map(item => item.textContent);
            write({ bindings, controller });
            clearInterval(interval);
            nw.App.quit();
        }
        return;
    }
    if (!fileShown && require('fs').existsSync(receipt + '.title')) {
        if (settingsStep < 4) return verifySettings();
        if (!require('fs').existsSync(receipt + '.returned-title')) return;
        if (controllerStep < 12) return verifyController();
        if (!require('fs').existsSync(receipt + '.controller-returned-title')) return;
        fileShown = true;
        tap('j', 'KeyJ');
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
        const scene = { _active: true, _windowLayer: layer, _mapNameWindow: {
            parent: layer, worldVisible: true, worldAlpha: 1, contentsOpacity: 255,
            _wqaBannerDrawnRevision: 1, _wqaBannerText: 'Synthetic map banner' } };
        SceneManager._scene = Graphics.app.stage = scene;
        WendyQuestAccessMapBannerReady(scene, 1);
        Graphics.app.renderer.emit('postrender');
    }
    if (!dialogueShown && require('fs').existsSync(receipt + '.map')) {
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
        if (padTap(8) !== 0 || padTap(6) !== 1 << 6) throw Error('Old and new mode bindings did not hand back correctly');
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
    if (require('fs').existsSync(receipt) && require('fs').existsSync(receipt + '.route')) {
        clearInterval(interval);
        nw.App.quit();
    }
}, 40);
setTimeout(() => {
    write({ error: 'No worker receipt', versions: process.versions, shared: typeof SharedArrayBuffer });
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
        receipt = fixture(runtime)
        launch = [str(runtime / 'nw.exe'), f'--user-data-dir={runtime / "profile"}']
        result = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25)
        if not receipt.exists():
            raise RuntimeError(f'NW exited {result.returncode} without a receipt: {result.stderr[:1024]!r}')
        data = json.loads(receipt.read_text(encoding='utf8'))
        records = data.get('records', [])
        if result.returncode or data.get('error') or len(records) != 12 or not all(r.get('sameEpoch') for r in records):
            raise RuntimeError(f'NW fixture did not deliver the expected packet: {data}')
        title, returned_title, title_mode, controller_title, slot, banner, page, choice, repeat, dialogue_mode, pad_repeat, number = records
        if any(item['name'] != title['name'] for item in (returned_title, controller_title)) or \
                len({title['epoch'], returned_title['epoch'], controller_title['epoch']}) != 3:
            raise RuntimeError(f'NW fixture did not restore the title focus: {data}')
        if title['kind'] != 'title' or title.get('name') != 'Synthetic title command' or slot['kind'] != 'saveSlot' or \
                slot.get('slot') != 2 or not slot.get('empty') or banner['kind'] != 'mapBanner' or \
                banner.get('name') != 'Synthetic map banner' or len({record['epoch'] for record in records[:7]}) != 6:
            raise RuntimeError(f'NW fixture did not deliver distinct presentation epochs: {data}')
        if page['kind'] != 'dialoguePage' or page.get('text') != 'Synthetic prompt' or choice['kind'] != 'dialogueChoice' or \
                choice.get('speech') != 'Choices. Synthetic choice' or not choice.get('append') or choice['epoch'] != page['epoch']:
            raise RuntimeError(f'NW fixture did not deliver the page and appended choice in one epoch: {data}')
        if repeat != page or pad_repeat != page or title_mode['speech'] != 'Mod mode. Menu opens settings. View cancels.' or \
                dialogue_mode['speech'] != 'Mod mode. A repeats dialogue. LT cancels.':
            raise RuntimeError(f'NW fixture did not deliver the controller mode prompt and current page repeat: {data}')
        if number['kind'] != 'numberEntry' or number.get('speech') != 'Number entry. 0, 7. Digit 2 of 2, 7' or \
                number['epoch'] in {record['epoch'] for record in records[:-1]}:
            raise RuntimeError(f'NW fixture did not deliver the padded number in a fresh epoch: {data}')
        versions = data['versions']
        receipt.unlink()
        receipt.with_suffix('.json.restart').touch()
        restarted = subprocess.run(launch, cwd=runtime, capture_output=True, timeout=25)
        reloaded = json.loads(receipt.read_text(encoding='utf8')) if receipt.exists() else {}
        if restarted.returncode or reloaded.get('bindings') != ['Open mod settings, J', 'Repeat dialogue, T'] or \
                reloaded.get('controller') != ['Controller support, on', 'Toggle mod mode, Left trigger']:
            raise RuntimeError('NW settings did not survive restart in the isolated profile')
        print(f"Verified hidden window resize, settings, dialogue repeat and route worker in NW {versions.get('nw', VERSION)}, "
              f"Node {versions['node']}, modules ABI {versions['modules']}.")


if __name__ == '__main__':
    main()
