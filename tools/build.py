"""Build the development payload without reading or modifying the Steam install."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import wave
import zipfile


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.build' / 'payload'
PRISM_SHA256 = '13d3c9d1d524b0737cde261c6468845753e36b6c5c2637e7d26bfb8bf4d8783f'
AUDIO_HASHES = {
    'runtime/SDL3.dll': '132e7f953951944f7628861227ecaea8c37a5a484f004c2072b7f3a1c343fa73',
    'openal-soft/soft_oal.dll': '3963b06e319180700be0bcc0d027336664bb3a4975876b4a5442f10746fab5b4',
    'sdl3/include/SDL3/SDL_audio.h': 'c6b868ff10bb6b24d8cfc2b145d74b802285f7dda2eaa7adadd0fef5355d5859',
    'openal-soft/include/AL/al.h': 'c239b51b32ec10214c3e0a3678876795133150909001ee6cc338d89993ea3c14',
    'openal-soft/include/AL/alc.h': '41c0ab1cbab67aa95e791d875ff3c744210ce441b6d7658dbcd1090c69c8bf10',
    'openal-soft/include/AL/alext.h': 'aaefb57565e53e550d3f827b54bbe0960649daf79805cbb9de86a65081dfa4b5',
}


def stage_narration():
    source = ROOT / 'src/dialogue/narration-cues.json'
    cues = json.loads(source.read_text(encoding='utf8'))
    folder = source.parent / 'clips'
    clips = [(folder / f'{name}.webm').read_bytes() for name in cues]
    if not clips or len(clips) > 160 or any(not clip.startswith(bytes.fromhex('1a45dfa3')) for clip in clips):
        raise ValueError('Malformed narration clips')
    pack = struct.pack('<' + 'I' * len(clips), *(len(clip) for clip in clips)) + b''.join(clips)
    #160 original recordings; measured pack 1,971,103 bytes.
    if len(pack) > 1928 * 1024:
        raise ValueError('Narration clips exceed their playback budget')
    target = OUT / 'wendyquest-access/narration.webmpack'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(pack)


def bundle():
    stage_narration()
    sources = {
        './plugin': 'plugin.js',
        './runtime/renderer': 'runtime/renderer.js',
        './runtime/audio': 'runtime/audio.js',
        './dialogue/narration': 'dialogue/narration.js',
        './idle-narration': 'dialogue/idle-narration.js',
        './reaction-common': 'dialogue/reaction-common.js',
        './environment-visuals': 'dialogue/environment-visuals.js',
        './question-visuals': 'dialogue/question-visuals.js',
        './finale-visuals': 'dialogue/finale-visuals.js',
        './tyler-visuals': 'dialogue/tyler-visuals.js',
        './screen-glitch': 'dialogue/screen-glitch.js',
        './skill-visuals': 'dialogue/skill-visuals.js',
        './finale-battle': 'dialogue/finale-battle.js',
        './narration-cues.json': 'dialogue/narration-cues.json',
        './character-art': 'dialogue/character-art.js',
        '../dialogue/character-art': 'dialogue/character-art.js',
        './gate': 'runtime/gate.js',
        './frontend/title': 'frontend/title.js',
        './frontend/splash': 'frontend/splash.js',
        '../runtime/rendered-sprite': 'runtime/rendered-sprite.js',
        './frontend/files': 'frontend/files.js',
        './menus/observer': 'menus/observer.js',
        './shop': 'menus/shop.js',
        './coupons': 'menus/coupons.js',
        './menus/quest-tracker': 'menus/quest-tracker.js',
        './quest-paint': 'menus/quest-paint.js',
        './quest-restore': 'menus/quest-restore.js',
        './review': 'menus/review.js',
        '../menus/review': 'menus/review.js',
        './battle/focus': 'battle/focus.js',
        './battle/targets': 'battle/targets.js',
        './battle/timing': 'battle/timing.js',
        './battle/timing-cues': 'battle/timing-cues.js',
        './battle/automatic-timing': 'battle/automatic-timing.js',
        '../battle/timing-cues': 'battle/timing-cues.js',
        './battle/action-log': 'battle/action-log.js',
        './battle/speech': 'battle/speech.js',
        './battle/skill-effects': 'battle/skill-effects.js',
        './damage-popup': 'battle/damage-popup.js',
        './battle/damage-popup': 'battle/damage-popup.js',
        './outcomes': 'battle/outcomes.js',
        '../battle/outcomes': 'battle/outcomes.js',
        './battle/outcomes': 'battle/outcomes.js',
        './world/field-diagnostics': 'world/field-diagnostics.js',
        './battle/radial-result': 'battle/radial-result.js',
        './enemy-state': 'battle/enemy-state.js',
        './presentation': 'battle/presentation.js',
        './battle/presentation': 'battle/presentation.js',
        '../battle/presentation': 'battle/presentation.js',
        './party-vitals': 'battle/party-vitals.js',
        './battle/party-vitals': 'battle/party-vitals.js',
        '../battle/party-vitals': 'battle/party-vitals.js',
        './options': 'frontend/options.js',
        './world/map-banner': 'world/map-banner.js',
        './map-banner': 'world/map-banner.js',
        './map-descriptions': 'world/map-descriptions.js',
        './world/interaction-prompt': 'world/interaction-prompt.js',
        './world/treasure-reward': 'world/treasure-reward.js',
        '../services/dialogue-icons.cjs': 'services/dialogue-icons.cjs',
        './world/autosave-notice': 'world/autosave-notice.js',
        './terrain-control-labels.cjs': 'world/terrain-control-labels.cjs',
        './terrain-journey': 'world/terrain-journey.js',
        './world/field': 'world/field.js',
        './world/wall-audio': 'world/wall-audio.js',
        './world/footsteps': 'world/footsteps.js',
        './world/beacon': 'world/beacon.js',
        './interaction-approach': 'world/interaction-approach.js',
        './world/soundscape': 'world/soundscape.js',
        './soundscape-presentation': 'world/soundscape-presentation.js',
        './soundscape-preferences': 'settings/soundscape-preferences.js',
        './autowalk': 'world/autowalk.js',
        './world/cave-timing': 'world/cave-timing.js',
        './spatial-direction': 'world/spatial-direction.js',
        './snapshot': 'world/snapshot.js',
        './world/event-knowledge': 'world/event-knowledge.js',
        './event-knowledge': 'world/event-knowledge.js',
        './event-contexts.json': 'world/event-contexts.json',
        './transfer-bookmarks': 'world/transfer-bookmarks.js',
        './local-detour': 'world/local-detour.js',
        './airship-journey': 'world/airship-journey.js',
        './transfer-events.cjs': 'world/transfer-events.cjs',
        './transfer-gates.cjs': 'world/transfer-gates.cjs',
        './bookmark-records': 'world/bookmark-records.js',
        './destinations': 'world/destinations.js',
        '../destinations': 'world/destinations.js',
        './quest-destinations': 'world/quest-destinations.js',
        './local-destinations': 'world/local-destinations.js',
        './world-destinations': 'world/world-destinations.js',
        './vehicle-navigation': 'world/vehicle-navigation.js',
        './world/vehicle-navigation': 'world/vehicle-navigation.js',
        './puzzles/salt-caverns': 'world/puzzles/salt-caverns.js',
        './puzzles/salt-state.cjs': 'world/puzzles/salt-state.cjs',
        './salt-state.cjs': 'world/puzzles/salt-state.cjs',
        './puzzles/cave': 'world/puzzles/cave.js',
        './puzzles/patrol-line-playback': 'world/puzzles/patrol-line-playback.js',
        './patrol-line-state.cjs': 'world/puzzles/patrol-line-state.cjs',
        './cave-progression': 'world/puzzles/cave-progression.js',
        './puzzles/cave-progression': 'world/puzzles/cave-progression.js',
        './puzzles/cave-chase': 'world/puzzles/cave-chase.js',
        './puzzles/cave-solver': 'world/puzzles/cave-solver.js',
        './puzzles/cave-loot': 'world/puzzles/cave-loot.js',
        './patrol-motion.cjs': 'world/puzzles/patrol-motion.cjs',
        './geometry.cjs': 'world/geometry.cjs',
        './dialogue/observer': 'dialogue/observer.js',
        './dialogue/map-diagram': 'dialogue/map-diagram.js',
        './dialogue/credits': 'dialogue/credits.js',
        './number-entry': 'dialogue/number-entry.js',
        './settings/menu': 'settings/menu.js',
        './secret-island': 'settings/secret-island.js',
        '../world/puzzles/cave-progression': 'world/puzzles/cave-progression.js',
        './bookmark-menu': 'settings/bookmark-menu.js',
        '../world/bookmark-records': 'world/bookmark-records.js',
        './keyboard': 'settings/keyboard.js',
        './navigation-keys': 'settings/navigation-keys.js',
        './storage': 'settings/storage.js',
        './settings/controller': 'settings/controller.js',
        './controller-bindings': 'settings/controller-bindings.js',
    }
    target = OUT / 'js' / 'plugins' / 'WendyQuestAccess.js'
    target.parent.mkdir(parents=True, exist_ok=True)
    wrappers = []
    for name, relative in sources.items():
        body = (ROOT / 'src' / relative).read_text(encoding='utf8')
        if name.endswith('.json'):
            body = 'module.exports = ' + json.dumps(json.loads(body)) + ';'
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


def stage_audio(sdk, services):
    for name, expected in AUDIO_HASHES.items():
        with (sdk / name).open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError(f'Unexpected audio SDK input {name}')
    dependencies = services / 'audio-deps'
    dependencies.mkdir(exist_ok=True)
    shutil.copyfile(sdk / 'runtime' / 'SDL3.dll', dependencies / 'SDL3.dll')
    shutil.copyfile(sdk / 'sdl3' / 'LICENSE.txt', dependencies / 'SDL3-LICENSE.txt')
    for name in ('soft_oal.dll', 'BSD-3Clause', 'COPYING', 'HRTF.txt', 'LICENSE-fmt', 'LICENSE-gsl',
                 'LICENSE-pffft', 'readme.txt'):
        shutil.copyfile(sdk / 'openal-soft' / name, dependencies / name)
    source_receipt = (sdk / 'openal-soft' / 'SOURCE.txt').read_text(encoding='utf8')
    (dependencies / 'SOURCE.txt').write_text(source_receipt.split('\nMod cue WAVs', 1)[0].rstrip() + '\n',
                                            encoding='utf8')
    return dependencies


def stage_navigation_pcm():
    source = ROOT / 'src/services/windows/navigation-sounds'
    manifest = json.loads((source / 'ffpr-sha256.json').read_text(encoding='utf-8'))
    header = ['#pragma once', 'namespace wqa::audio::ffpr {', 'inline constexpr int rate = 22050;']
    for filename, expected in manifest.items():
        path = source / filename
        if not filename.isascii() or not path.stem.replace('_', '').isalpha() or path.suffix != '.wav':
            raise ValueError('Invalid navigation sound name')
        if path.stat().st_size > 24 * 1024 or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'FFPR navigation sample changed: {filename}')
        with wave.open(str(path), 'rb') as audio:
            frames = audio.getnframes()
            if audio.getparams()[:3] != (1, 2, 22050) or not 0 < frames <= 9000 or audio.getcomptype() != 'NONE':
                raise ValueError(f'Unexpected navigation PCM format: {filename}')
            samples = struct.unpack(f'<{frames}h', audio.readframes(frames))
        header.append(f'inline constexpr std::int16_t {path.stem}[] = {{')
        for index in range(0, frames, 16):
            header.append('    ' + ', '.join(map(str, samples[index:index + 16])) + ',')
        header.append('};')
    header.append('}')
    (OUT.parent / 'navigation-pcm.hpp').write_text('\n'.join(header) + '\n', encoding='ascii')


def compile_native(archive, audio_sdk, vcvars, verify_pipe, verify_audio):
    services = OUT / 'wendyquest-access'
    services.mkdir(parents=True, exist_ok=True)
    headers = stage_prism(archive, services)
    dependencies = stage_audio(audio_sdk, services)
    stage_navigation_pcm()
    fixture = OUT.parent / 'speech-pipe-fixture.exe'
    audio_fixture = OUT.parent / 'spatial-audio-fixture.exe'
    audio_headers = [audio_sdk / 'sdl3' / 'include', audio_sdk / 'openal-soft' / 'include', OUT.parent]
    sources = [
        (ROOT / 'src/services/windows/speech.cpp', services / 'WendyQuestSpeech.exe', OUT.parent / 'speech.obj', [headers], ''),
        (ROOT / 'src/services/windows/audio-addon.cpp', services / 'WendyQuestAudio.node', OUT.parent / 'audio.obj', audio_headers, '/LD'),
    ]
    if verify_pipe:
        sources.append((ROOT / 'tests/speech-pipe-fixture.cpp', fixture, OUT.parent / 'speech-pipe-fixture.obj', [headers], ''))
    if verify_audio:
        sources.append((ROOT / 'tests/spatial-audio-fixture.cpp', audio_fixture, OUT.parent / 'spatial-audio-fixture.obj', audio_headers, ''))
    # vcvars owns the compiler environment for this one process tree. Neither
    # the compiler nor the linker uses a shared server or parallel compilation.
    for path in (vcvars, headers, *audio_headers, *(item for source in sources for item in source[:3])):
        if any(char in str(path) for char in ('"', '%', '!', '\r', '\n')):
            raise ValueError('Unsupported toolchain path characters')
    compiler_commands = '\n'.join(
        f'cl /nologo /std:{"c++20" if includes == audio_headers else "c++17"} /MT /O2 /GS /guard:cf /EHsc /W4 /wd4191 {mode} '
        + ' '.join(f'/I"{include}"' for include in includes) + ' '
        f'/Fo"{obj}" /Fe"{target}" "{source}" /link /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT /CETCOMPAT'
        + (f' /IMPLIB:"{OUT.parent / "audio-import.lib"}"' if mode else '') + '\n'
        + 'if errorlevel 1 exit /b %errorlevel%'
        for source, target, obj, includes, mode in sources
    )
    script = OUT.parent / 'compile-native.cmd'
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
    if verify_audio:
        subprocess.run([str(audio_fixture), str(dependencies)], check=True, timeout=15,
                       env={**os.environ, 'SDL_AUDIO_DRIVER': 'dummy'})
    shutil.copyfile(ROOT / 'src' / 'services' / 'speech-worker.cjs', services / 'speech-worker.cjs')
    for name in ('speech-text.cjs', 'dialogue-icons.cjs'):
        shutil.copyfile(ROOT / 'src' / 'services' / name, services / name)
    shutil.copyfile(ROOT / 'src' / 'services' / 'audio-worker.cjs', services / 'audio-worker.cjs')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prism-archive', type=Path, required=True)
    parser.add_argument('--vcvars', type=Path, required=True)
    parser.add_argument('--audio-sdk', type=Path, required=True)
    parser.add_argument('--verify-speech-pipe', action='store_true')
    parser.add_argument('--verify-audio', action='store_true')
    args = parser.parse_args()
    target = bundle()
    subprocess.run(['node', '--check', str(target)], check=True, timeout=20)
    compile_native(args.prism_archive.resolve(strict=True), args.audio_sdk.resolve(strict=True),
                   args.vcvars.resolve(strict=True), args.verify_speech_pipe, args.verify_audio)
    for name in ('route-worker.cjs', 'airship-route.cjs', 'geometry.cjs', 'routes.cjs', 'walking-catalog.cjs', 'transfer-gates.cjs', 'terrain-controls.cjs'):
        shutil.copyfile(ROOT / 'src' / 'world' / name, OUT / 'wendyquest-access' / name)
    puzzles = OUT / 'wendyquest-access' / 'puzzles'
    puzzles.mkdir(exist_ok=True)
    for name in ('crossing.cjs', 'motion-world.cjs', 'patrol-motion.cjs', 'patrol-line.cjs', 'patrol-line-state.cjs',
                 'patrol-line-manual.cjs', 'salt-route.cjs', 'salt-state.cjs'):
        shutil.copyfile(ROOT / 'src' / 'world' / 'puzzles' / name, puzzles / name)
    print('Development payload staged at', OUT)


if __name__ == '__main__':
    main()
