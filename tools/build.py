"""Build the development payload without reading or modifying the Steam install."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.build' / 'payload'
PRISM_SHA256 = '13d3c9d1d524b0737cde261c6468845753e36b6c5c2637e7d26bfb8bf4d8783f'


def bundle():
    sources = {
        './plugin': 'plugin.js',
        './runtime/renderer': 'runtime/renderer.js',
        './gate': 'runtime/gate.js',
        './frontend/title': 'frontend/title.js',
        './frontend/files': 'frontend/files.js',
        './options': 'frontend/options.js',
        './world/map-banner': 'world/map-banner.js',
        './dialogue/observer': 'dialogue/observer.js',
        './number-entry': 'dialogue/number-entry.js',
        './settings/menu': 'settings/menu.js',
        './keyboard': 'settings/keyboard.js',
        './storage': 'settings/storage.js',
        './settings/controller': 'settings/controller.js',
        './controller-bindings': 'settings/controller-bindings.js',
    }
    target = OUT / 'js' / 'plugins' / 'WendyQuestAccess.js'
    target.parent.mkdir(parents=True, exist_ok=True)
    wrappers = []
    for name, relative in sources.items():
        body = (ROOT / 'src' / relative).read_text(encoding='utf8')
        wrappers.append(f'{json.dumps(name)}: function(module, exports, require) {{\n{body}\n}}')
    definitions = ',\n'.join(wrappers)
    target.write_text(f'''/*:
 * @target MZ
 * @plugindesc WendyQuest accessibility support
 */
(function(root, nodeRequire, nodeProcess) {{
    'use strict';
    if (typeof nodeRequire !== 'function' || !nodeProcess) return;
    const definitions = {{
{definitions}
    }};
    const modules = Object.create(null);
    function load(name) {{
        if (!modules[name]) {{
            const module = {{ exports: {{}} }};
            modules[name] = module;
            definitions[name](module, module.exports, load);
        }}
        return modules[name].exports;
    }}
    load('./plugin').boot(root, nodeRequire, nodeProcess);
}}(globalThis, typeof require === 'function' ? require : null,
    typeof process === 'object' ? process : null));
''', encoding='utf8')
    return target


def stage_prism(archive, payload):
    with archive.open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != PRISM_SHA256:
            raise ValueError('The upstream PRISM archive checksum did not match')
    headers = OUT.parent / 'prism-include'
    headers.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        for name in ('prism.h', 'prism_version.h'):
            (headers / name).write_bytes(package.read('include/' + name))
        (payload / 'prism.dll').write_bytes(package.read('dynamic/release/bin/prism.dll'))
        for entry in package.infolist():
            if entry.filename.startswith('LICENSES/') and not entry.is_dir():
                relative = Path(entry.filename)
                if relative.is_absolute() or '..' in relative.parts or entry.file_size > 1024 * 1024:
                    raise ValueError('Unexpected PRISM license entry')
                target = payload / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(package.read(entry))
    return headers


def compile_speech(archive, vcvars, verify_pipe):
    services = OUT / 'wendyquest-access'
    services.mkdir(parents=True, exist_ok=True)
    headers = stage_prism(archive, services)
    fixture = OUT.parent / 'speech-pipe-fixture.exe'
    sources = [(ROOT / 'src/services/windows/speech.cpp', services / 'WendyQuestSpeech.exe', OUT.parent / 'speech.obj')]
    if verify_pipe:
        sources.append((ROOT / 'tests/speech-pipe-fixture.cpp', fixture, OUT.parent / 'speech-pipe-fixture.obj'))
    # vcvars owns the compiler environment for this one process tree. Neither
    # the compiler nor the linker uses a shared server or parallel compilation.
    for path in (vcvars, headers, *(item for source in sources for item in source)):
        if any(char in str(path) for char in ('"', '%', '!', '\r', '\n')):
            raise ValueError('Unsupported toolchain path characters')
    compiler_commands = '\n'.join(
        f'cl /nologo /std:c++17 /MT /O2 /GS /guard:cf /EHsc /W4 /wd4191 /I"{headers}" '
        f'/Fo"{obj}" /Fe"{target}" "{source}" /link /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT /CETCOMPAT\n'
        'if errorlevel 1 exit /b %errorlevel%'
        for source, target, obj in sources
    )
    script = OUT.parent / 'compile-speech.cmd'
    script.write_text(f'''@echo off
setlocal DisableDelayedExpansion
set "CL="
set "_CL_="
set "LINK="
set "_LINK_="
call "{vcvars}"
if errorlevel 1 exit /b %errorlevel%
{compiler_commands}
exit /b 0
''', encoding='ascii')
    subprocess.run(['cmd.exe', '/d', '/c', str(script)], cwd=OUT.parent, check=True, timeout=90)
    if verify_pipe:
        subprocess.run([sys.executable, str(ROOT / 'tests/speech-pipe.test.py'), str(fixture)], check=True, timeout=40)
    shutil.copyfile(ROOT / 'src' / 'services' / 'speech-worker.cjs', services / 'speech-worker.cjs')
    for name in ('speech-text.cjs', 'dialogue-icons.cjs'):
        shutil.copyfile(ROOT / 'src' / 'services' / name, services / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prism-archive', type=Path, required=True)
    parser.add_argument('--vcvars', type=Path, required=True)
    parser.add_argument('--verify-speech-pipe', action='store_true')
    args = parser.parse_args()
    target = bundle()
    subprocess.run(['node', '--check', str(target)], check=True, timeout=20)
    compile_speech(args.prism_archive.resolve(strict=True), args.vcvars.resolve(strict=True), args.verify_speech_pipe)
    print('Development payload staged at', OUT)


if __name__ == '__main__':
    main()
