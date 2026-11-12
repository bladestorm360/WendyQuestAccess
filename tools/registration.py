"""Prepare the original plugin registration and native title notification.

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
TITLE_SHA = 'a3c35f004b66a6d4e7a918e36b8bc7e48f2383875165ce1c00ae1a5a031e5634'
REGISTRY_SHA = '083317d6b2ee7ba9655762dee7671564a64b0bba82bb33d8cbacd52a7e7b3ab7'
TITLE_INSERTION = 17749
TITLE_EVENT = (b';if(typeof globalThis.WendyQuestAccessTitleReady==="function")'
               b'{globalThis.WendyQuestAccessTitleReady(this);}')
PLUGIN = {'name': 'WendyQuestAccess', 'status': True, 'description': 'WendyQuest accessibility support',
          'parameters': {}}


def title_notification(original):
    if hashlib.sha256(original).hexdigest() != TITLE_SHA:
        raise ValueError('Title plugin does not match the supported Steam build')
    if original[TITLE_INSERTION:TITLE_INSERTION + 1] != b';':
        raise ValueError('The title activation callback boundary does not match')
    return original[:TITLE_INSERTION] + TITLE_EVENT + original[TITLE_INSERTION:]


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
    for relative, transform in ((TITLE_REL, title_notification), (REGISTRY_REL, register)):
        file = args.game_root / relative
        if file.stat().st_size > 1024 * 1024:
            raise ValueError('Unsupported game script size')
        candidate = transform(file.read_bytes())
        subprocess.run(['node', '--check'], input=candidate, check=True, timeout=10)
        print(f'Candidate checked: {relative}')


if __name__ == '__main__':
    main()
