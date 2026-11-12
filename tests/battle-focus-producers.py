"""Load the installed battle focus and text methods into the test process."""

import json
from pathlib import Path
import re
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import BATTLE_REL, MANAGERS_REL, WINDOW_REL, battle_notification, managers_notification

decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
installed = Path(sys.argv[1])
original = (installed / BATTLE_REL).read_bytes()
battle, _ = decode(battle_notification(original).decode('utf8'))
untouched, _ = decode(original.decode('utf8'))
text, _ = decode((installed / WINDOW_REL).read_text(encoding='utf-8-sig'))
manager = managers_notification((installed / MANAGERS_REL).read_bytes()).decode('utf8')


def sprite_method(source, owner, name):
    token = f"{owner}['prototype']['{name}']=function("
    start = source.index(token)
    end = re.compile(r"},\w+\['prototype'\]\['\w+'\]=function\(").search(source, start + len(token))
    if end is None:
        raise ValueError(f'Could not bound {owner}.{name}')
    return source[start:end.start()] + '};'


methods = [sprite_method(battle, 'Sprite_BattleOption', name) for name in
           ('hasFocus', 'focusGained', 'focusLost', 'getIsActive', 'canActivate', 'onClick', 'update')]
methods.extend(sprite_method(text, 'Sprite_Text', name) for name in ('setText', 'update'))
start = manager.index('BattleManager.update = function(')
end = manager.index('\n};', start) + 3
methods.append(manager[start:end])
print(json.dumps({'methods': methods, 'baseline_update': sprite_method(untouched, 'Sprite_BattleOption', 'update')}))
