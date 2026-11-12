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
    action_notification, battle_notification, managers_notification, scenes_notification, windows_notification,
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


def native_text_methods():
    names = ('initialize', 'setText', 'RedrawText', 'createChildSprite', 'createBitmap', 'update')
    return [sprite_method(text, 'Sprite_Text', name) for name in names]


if sys.argv[2:] == ['log']:
    stock = windows_notification((installed / WINDOWS_REL).read_bytes()).decode('utf8')
    methods = [sprite_method(battle, 'Scene_Battle', 'update'), manager_method(battle, 'isBusy')]
    methods.extend(sprite_method(battle, 'Window_BattleActionLog', name) for name in (
        'pushMessage', 'update', 'updateItemQueue', 'updateMessages', 'getItemRect', 'refresh', 'paint',
        'itemAlpha', 'drawItem', 'itemPushCooldown', 'itemIntroTime', 'itemFadeTime', 'itemHPadding',
        'getItemMaxX', 'getItemX', 'getItemTargetY', 'getItemY', 'getItemPos', 'itemWidth', 'maxItemHeight',
        'itemHeight', 'maxVisibleItems'))
    start = stock.index('Window_Base.prototype._wqaRecordPaint = function')
    end = stock.index('\n};', start) + 3
    methods.append(stock[start:end])
    for name in ('drawTextEx', 'createTextState', 'processAllText', 'flushTextState', 'createTextBuffer',
                 'convertEscapeCharacters', 'processCharacter', 'processControlCharacter', 'processNewLine',
                 'obtainEscapeCode', 'obtainEscapeParam', 'processEscapeCharacter', 'processColorChange', 'processDrawIcon',
                 'drawIcon'):
        start = stock.index(f'Window_Base.prototype.{name} = function(')
        end = stock.index('\n};', start) + 3
        methods.append(stock[start:end])
    start = stock.index('Window_BattleLog.prototype.showAnimation = function(')
    end = stock.index('\n};', start) + 3
    methods.append(stock[start:end])
    baseline_draw = sprite_method(untouched, 'Window_BattleActionLog', 'drawItem')
    methods.append(baseline_draw.replace("['drawItem']", "['fixtureNativeDraw']", 1))
    print(json.dumps(methods))
    sys.exit(0)


if sys.argv[2:] == ['sweeps']:
    original_action = (installed / ACTION_REL).read_bytes()
    action, _ = decode(action_notification(original_action).decode('utf8'))
    baseline, _ = decode(original_action.decode('utf8'))
    methods = [sprite_method(action, 'ActionCommandRadial', 'BarParams')]
    for source, prefix in ((action, 'observed'), (baseline, 'native')):
        start = source.index('for(;!_0x21be67')
        end = source.index('_0x28cf50=Lerp', start)
        power = source[start:end]
        start = source.index('for(;!_0x197d36')
        end = source.index("AudioManager['stopSound']", start)
        accuracy = source[start:end]
        setup = '''
const marker = fixture.marker, ice = fixture.ice;
const _0x26a0b4 = fixture.settings, _0x58262b = Math.PI, _0x448ce3 = Math.PI * 2;
const _0x574572 = {}, _0x2e26b2 = {};
'''
        methods.append(f'ActionCommandRadial.prototype.{prefix}Power = function* (fixture) {{' + setup + '''
let _0x21be67=false,_0x2ce9ba=0,_0x3f6392=fixture.duration,_0x279acd=0,
    _0x17f391=!!fixture.settings.Frozen,_0x7de663=fixture.iceEnd,_0x1fd196=fixture.iceStart,
    _0x2f41e3=0,_0x264dda=0,_0x2d3da7=ice,_0x301a04=ice,_0x4b783f=ice;
const _0x2b5dae=0,_0x3f7d26=marker,_0xbb5d19=marker,_0x20c7a7=marker;
''' + power + 'return [_0x279acd,_0x21be67,_0x17f391];};')
        methods.append(f'ActionCommandRadial.prototype.{prefix}Accuracy = function* (fixture) {{' + setup + '''
let _0x197d36=false,_0x5499a6=0,_0x3dbe15=fixture.duration,_0x1327af=0,_0x2dcbbd=0,
    _0x2191e9=!!fixture.settings.Frozen,_0x44198f=fixture.iceEnd,_0x8a92bb=fixture.iceStart,
    _0x592e0d=0,_0x1ff601=ice,_0x515bfd=ice,_0x20b9fd=ice;
const _0x3d8aee=fixture.lower,_0x357499=fixture.upper,
    _0x4a1ae6=0,_0x168297=marker,_0x42d8de=marker,_0x3e17b5=marker;
''' + accuracy + 'return [_0x1327af,_0x197d36,_0x2191e9];};')
    print(json.dumps(methods))
    sys.exit(0)


if sys.argv[2:] == ['timing']:
    action, _ = decode(action_notification((installed / ACTION_REL).read_bytes()).decode('utf8'))
    methods = [sprite_method(battle, 'Scene_Battle', 'update'), manager_method(battle, 'isBusy')]
    methods.extend(sprite_method(action, 'ActionCommand', name) for name in ('InputPressed', 'CancelInputPressed', 'Cancel'))
    start = action.index("for(;!this['InputPressed']();){")
    end = action.index(",BattleManager['hideAllSelectionArrows']()", start)
    methods.append('ActionCommand.prototype.nativeWait = function* () {'
                   'const _0x26a0b4 = {}, _0xd97bf1 = () => {};'
                   + action[start:end] + ';};')
    print(json.dumps(methods))
    sys.exit(0)


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
    methods.extend(native_text_methods())
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
    sprites = (installed / 'package.nw/js/rmmz_sprites.js').read_text(encoding='utf-8-sig')
    for name in ('updateIcon', 'updateFrame', 'shouldDisplay'):
        start = sprites.index(f'Sprite_StateIcon.prototype.{name} = function(')
        end = sprites.index('\n};', start) + 3
        methods.append(sprites[start:end])
    start = battle.index("Sprite_EnemyGauge['prototype']['drawGaugeRect']=function(")
    end = battle.index('},Sprite_StarEffect', start)
    methods.append(battle[start:end + 1] + ';')
    methods.extend(native_text_methods())
    print(json.dumps(methods))
    sys.exit(0)


methods = [sprite_method(battle, 'Sprite_BattleOption', name) for name in
           ('hasFocus', 'focusGained', 'focusLost', 'getIsActive', 'canActivate', 'onClick', 'update')]
methods.extend(native_text_methods())
start = manager.index('BattleManager.update = function(')
end = manager.index('\n};', start) + 3
methods.append(manager[start:end])
print(json.dumps({'methods': methods, 'baseline_update': sprite_method(untouched, 'Sprite_BattleOption', 'update')}))
