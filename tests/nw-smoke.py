"""Check the production plugin bundle on the official standalone NW.js host.

Run inside the resource runner. The fixture has no Steam or game files. It
uses a hidden window and replaces the speech worker with a silent receipt.
"""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
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
const interval = setInterval(() => {
    if (!fileShown && require('fs').existsSync(receipt + '.title')) {
        fileShown = true;
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
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    }
    if (!numberShown && require('fs').existsSync(receipt + '.repeat')) {
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
    if (require('fs').existsSync(receipt)) { clearInterval(interval); nw.App.quit(); }
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
    if (message.kind === 'title') fs.writeFileSync(receipt + '.title', '');
    if (message.kind === 'saveSlot') fs.writeFileSync(receipt + '.slot', '');
    if (message.kind === 'mapBanner') fs.writeFileSync(receipt + '.map', '');
    if (message.kind === 'dialogueChoice') fs.writeFileSync(receipt + '.choice', '');
    if (message.kind === 'dialoguePage' && fs.existsSync(receipt + '.choice')) fs.writeFileSync(receipt + '.repeat', '');
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
        result = subprocess.run([str(runtime / 'nw.exe'), f'--user-data-dir={runtime / "profile"}'],
                                cwd=runtime, capture_output=True, timeout=25)
        if not receipt.exists():
            raise RuntimeError(f'NW exited {result.returncode} without a receipt: {result.stderr[:1024]!r}')
        data = json.loads(receipt.read_text(encoding='utf8'))
        records = data.get('records', [])
        if result.returncode or data.get('error') or len(records) != 7 or not all(r.get('sameEpoch') for r in records):
            raise RuntimeError(f'NW fixture did not deliver the expected packet: {data}')
        title, slot, banner, page, choice, repeat, number = records
        if title['kind'] != 'title' or title.get('name') != 'Synthetic title command' or slot['kind'] != 'saveSlot' or \
                slot.get('slot') != 2 or not slot.get('empty') or banner['kind'] != 'mapBanner' or \
                banner.get('name') != 'Synthetic map banner' or len({record['epoch'] for record in records[:4]}) != 4:
            raise RuntimeError(f'NW fixture did not deliver distinct presentation epochs: {data}')
        if page['kind'] != 'dialoguePage' or page.get('text') != 'Synthetic prompt' or choice['kind'] != 'dialogueChoice' or \
                choice.get('speech') != 'Choices. Synthetic choice' or not choice.get('append') or choice['epoch'] != page['epoch']:
            raise RuntimeError(f'NW fixture did not deliver the page and appended choice in one epoch: {data}')
        if repeat != page:
            raise RuntimeError(f'NW keydown did not repeat the page after the choice: {data}')
        if number['kind'] != 'numberEntry' or number.get('speech') != 'Number entry. 0, 7. Digit 2 of 2, 7' or \
                number['epoch'] in {record['epoch'] for record in records[:-1]}:
            raise RuntimeError(f'NW fixture did not deliver the padded number in a fresh epoch: {data}')
        versions = data['versions']
        print(f"Verified hidden window resize, title, save slot, map banner, dialogue repeat and number entry in NW {versions.get('nw', VERSION)}, "
              f"Node {versions['node']}, modules ABI {versions['modules']}.")


if __name__ == '__main__':
    main()
