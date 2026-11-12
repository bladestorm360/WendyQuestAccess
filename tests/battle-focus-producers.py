"""Load the installed battle focus and text methods into the test process."""

import json
from pathlib import Path
import re
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import (
    ACTION_REL, BATTLE_REL, MANAGERS_REL, SCENES_REL, STATS_REL, WINDOW_REL, WINDOWS_REL,
    action_notification, battle_notification, managers_notification, scenes_notification,
)

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


def manager_method(source, name):
    start = source.index(f"BattleManager['{name}']=function(")
    end = source.index('},BattleManager', start)
    return source[start:end + 1] + ';'


if sys.argv[2:] == ['bag']:
    scenes = scenes_notification((installed / SCENES_REL).read_bytes()).decode('utf8')
    windows = (installed / WINDOWS_REL).read_text(encoding='utf-8-sig')
    methods = [sprite_method(battle, 'Scene_Battle', 'update'), manager_method(battle, 'isBusy')]
    methods.extend(sprite_method(battle, 'Window_BattleItem', name) for name in
                   ('drawItem', 'drawItemName', 'drawItemNumber', 'drawText', 'select', 'processHandling',
                    'hide', 'forceHide', 'maxItems', 'maxVisibleItems', 'itemHeight', 'itemRect'))
    for source, token in ((scenes, 'Scene_Battle.prototype.onItemOk'),
                          (windows, 'Window_Selectable.prototype.processOk'),
                          (windows, 'Window_Selectable.prototype.processCancel')):
        start = source.index(token + ' = function(')
        end = source.index('\n};', start) + 3
        methods.append(source[start:end])
    print(json.dumps(methods))
    sys.exit(0)


if sys.argv[2:] == ['vitals']:
    hud, _ = decode((installed / STATS_REL).read_text(encoding='utf-8-sig'))
    methods = [sprite_method(hud, 'RadialStatus', name) for name in
               ('SetBattler', 'SetFPText', 'AddState', 'SetStateFrame', 'RemoveState', 'UpdateStateIconPositions')]
    methods.extend(sprite_method(text, 'Sprite_Text', name) for name in ('setText', 'update'))
    print(json.dumps(methods))
    sys.exit(0)


if sys.argv[2:] == ['targets']:
    action, _ = decode(action_notification((installed / ACTION_REL).read_bytes()).decode('utf8'))
    methods = [sprite_method(battle, 'Scene_Battle', 'update')]
    methods.extend(sprite_method(battle, 'Sprite_Enemy', name) for name in
                   ('updateUIVisibility', 'updateSelected', 'updateSelectionArrow'))
    methods.extend(manager_method(battle, name) for name in ('isBusy', 'startAction', 'targetEnemy'))
    methods.extend(manager_method(action, name) for name in
                   ('isActionCommand', 'isTargeted', 'ChangeActionTarget', 'ActionCommandOnTargetsUpdated', 'ClearActionTarget'))
    methods.append(sprite_method(action, 'ActionCommand', 'Cancel'))
    start = battle.index("Sprite_EnemyGauge['prototype']['drawGaugeRect']=function(")
    end = battle.index('},Sprite_StarEffect', start)
    methods.append(battle[start:end + 1] + ';')
    print(json.dumps(methods))
    sys.exit(0)


methods = [sprite_method(battle, 'Sprite_BattleOption', name) for name in
           ('hasFocus', 'focusGained', 'focusLost', 'getIsActive', 'canActivate', 'onClick', 'update')]
methods.extend(sprite_method(text, 'Sprite_Text', name) for name in ('setText', 'update'))
start = manager.index('BattleManager.update = function(')
end = manager.index('\n};', start) + 3
methods.append(manager[start:end])
print(json.dumps({'methods': methods, 'baseline_update': sprite_method(untouched, 'Sprite_BattleOption', 'update')}))
