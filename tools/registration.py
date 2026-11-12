"""Prepare the original plugin registration and native front-end notifications.

The CLI verifies the installed inputs and candidate JavaScript. It makes no
writes to the game. The deployment step will use the same checked transforms.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess


TITLE_REL = Path('package.nw/js/plugins/TitleSceneArranger.js')
REGISTRY_REL = Path('package.nw/js/plugins.js')
MENU_REL = Path('package.nw/js/plugins/MenuScene.js')
MANAGERS_REL = Path('package.nw/js/rmmz_managers.js')
SCENES_REL = Path('package.nw/js/rmmz_scenes.js')
STATS_REL = Path('package.nw/js/plugins/WendyQuest.js')
TITLE_SHA = 'a3c35f004b66a6d4e7a918e36b8bc7e48f2383875165ce1c00ae1a5a031e5634'
REGISTRY_SHA = '083317d6b2ee7ba9655762dee7671564a64b0bba82bb33d8cbacd52a7e7b3ab7'
TITLE_INSERTION = 17749
TITLE_EVENT = (b';if(typeof globalThis.WendyQuestAccessTitleReady==="function")'
               b'{globalThis.WendyQuestAccessTitleReady(this);}')
MENU_SHA = 'b4426d78f76e1d799f178e31b981292d404cc60a819b767f80573c133b1cd82a'
MANAGERS_SHA = 'e87efc29229a80c903c1651a78bbeafa8b9ffb925227b31cfa7f4741875140bd'
SCENES_SHA = '0f69c04d51b9ce17410e952ceafa31527a1b6c94663a12e11ca7d0e30cf2913a'
STATS_SHA = 'da3c0950cf9a0559f21fce2df1bbc608a5fee28398dd233c032279178b6a18f9'
FILES_LEAVING = b'globalThis.WendyQuestAccessFilesLeaving?.(SceneManager._scene),'
PLUGIN = {'name': 'WendyQuestAccess', 'status': True, 'description': 'WendyQuest accessibility support',
          'parameters': {}}


def title_notification(original):
    if hashlib.sha256(original).hexdigest() != TITLE_SHA:
        raise ValueError('Title plugin does not match the supported Steam build')
    if original[TITLE_INSERTION:TITLE_INSERTION + 1] != b';':
        raise ValueError('The title activation callback boundary does not match')
    return original[:TITLE_INSERTION] + TITLE_EVENT + original[TITLE_INSERTION:]


def insert(original, sha, sites):
    if hashlib.sha256(original).hexdigest() != sha:
        raise ValueError('Native notification source does not match the supported Steam build')
    candidate = original
    for offset, event in sorted(sites.items(), reverse=True):
        candidate = candidate[:offset] + event + candidate[offset:]
    return candidate


def files_ready(scene):
    # Native completion sites publish only flags. The precondition bypasses
    # the mod callback when a scene is loading, changing, fading or retired.
    ready = f'''{scene}&&{scene}._wqaFileKind&&{scene}===SceneManager._scene&&
!SceneManager._nextScene&&!SceneManager._exiting&&{scene}._started&&{scene}._active&&
{scene}._fadeDuration===0&&{scene}._fadeOpacity===0&&Graphics.app?.stage==={scene}&&
(({scene}._wqaFileKind===1&&{scene}._listWindow?._wqaCards===true)||
({scene}._wqaFileKind===2&&{scene}._wqaDetailText===true&&{scene}._wqaDetailArt===true&&!{scene}._destroySave)||
({scene}._wqaFileKind===3&&({scene}._deleteCount===0||{scene}._wqaDeleteStatus)))'''.replace('\n', '')
    return f'if({ready})globalThis.WendyQuestAccessFilesReady?.({scene});'.encode('ascii')


def menu_notifications(original):
    # Build 26578620. Offsets refer to completed native draw or accepted
    # native actions. Existing event arguments and call order are preserved.
    return insert(original, MENU_SHA, {
        163333: b'this._wqaFileKind=3;',
        165098: b'this._wqaDeleteStatus=_0x4a1a5b;' + files_ready('this'),
        165586: FILES_LEAVING,
        188382: FILES_LEAVING,
        188587: FILES_LEAVING,
        189925: b'this._wqaFileKind=1;',
        190907: FILES_LEAVING,
        207711: b'(' + FILES_LEAVING,
        207743: b')',
        208402: b'this._wqaDetailArt=true;' + files_ready('this'),
        215620: b'this._wqaDetailText=true;this._wqaFileKind=2;' + files_ready('this'),
        215817: FILES_LEAVING,
        215860: b'if(SceneManager._nextScene)SceneManager._nextScene._wqaReadFailed=true;',
        219539: b'this._wqaCards=true;if(SceneManager._scene?._listWindow===this){' +
                files_ready('SceneManager._scene') + b'}',
    })


def managers_notification(original):
    return insert(original, MANAGERS_SHA, {57606: b'\n' + files_ready('this._scene')})


def scenes_notification(original):
    return insert(original, SCENES_SHA, {3177: b'\n' + files_ready('this')})


def register(original):
    if hashlib.sha256(original).hexdigest() != REGISTRY_SHA:
        raise ValueError('Plugin list does not match the supported Steam build')
    text = original.decode('utf8')
    match = re.match(r'^\ufeff?(?:(?://[^\r\n]*\r?\n)|\s)*(?:var|let|const)\s+\$plugins\s*=\s*', text)
    if not match:
        raise ValueError('Plugin registry declaration not found')
    entries, end = json.JSONDecoder().raw_decode(text, match.end())
    if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries) or \
            not re.fullmatch(r'\s*;?\s*', text[end:]):
        raise ValueError('Unexpected plugin list structure')
    if any(entry.get('name') == PLUGIN['name'] for entry in entries):
        raise ValueError('Accessibility plugin is already present')
    end -= 1
    insertion = (',' if entries else '') + '\n' + json.dumps(PLUGIN, separators=(',', ':')) + '\n'
    return (text[:end] + insertion + text[end:]).encode('utf8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game_root', type=Path)
    args = parser.parse_args()
    stats = args.game_root / STATS_REL
    if stats.stat().st_size > 1024 * 1024 or hashlib.sha256(stats.read_bytes()).hexdigest() != STATS_SHA:
        raise ValueError('Visible save statistics and portrait layout do not match the supported Steam build')
    for relative, transform in ((TITLE_REL, title_notification), (MENU_REL, menu_notifications),
                                (MANAGERS_REL, managers_notification), (SCENES_REL, scenes_notification),
                                (REGISTRY_REL, register)):
        file = args.game_root / relative
        if file.stat().st_size > 1024 * 1024:
            raise ValueError('Unsupported game script size')
        candidate = transform(file.read_bytes())
        subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        print(f'Candidate checked: {relative}')


if __name__ == '__main__':
    main()
