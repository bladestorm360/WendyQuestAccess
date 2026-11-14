"""Load the installed battle focus and text methods into the test process."""

import json
from pathlib import Path
import re
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import (
    ACTION_REL, BATTLE_REL, MANAGERS_REL, MAP_REL, MENU_REL, SCENES_REL, STATS_REL, WINDOW_REL, WINDOWS_REL,
    action_notification, battle_notification, managers_notification, map_notification, menu_notifications, scenes_notification,
    windows_notification,
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


def animated_text_methods():
    methods = native_text_methods()
    methods.extend(sprite_method(text, 'Sprite_Text', name) for name in ('GetText', 'StartTextAnimation'))
    animation = sprite_method(text, 'Sprite_Text', 'updateAnimation')
    methods.append(animation.split(',VFXBody', 1)[0] + ';')
    return methods


if sys.argv[2:] == ['damage']:
    methods = [sprite_method(battle, 'Scene_Battle', 'update'), manager_method(battle, 'isBusy'),
               manager_method(battle, 'invokeNormalAction')]
    methods.append(sprite_method(battle, 'Sprite_BattleScreenParticipant', 'startMove'))
    methods.append(sprite_method(battle, 'Window_BattleLog', 'displayActionResults'))
    start = battle.index("Game_ActionResult['prototype']['clear']=function(")
    methods.append(battle[start:battle.index('},Game_Actor', start) + 1] + ';')
    methods.extend(animated_text_methods())
    damage_names = ('initialize', 'setup', 'setupCriticalEffect', 'createMiss', 'createDigits',
                    'createChildSprite', 'update', 'updateChild', 'updateFlash', 'updateOpacity', 'isPlaying')
    methods.extend(sprite_method(battle, 'Sprite_Damage', name) for name in damage_names)
    sprites = (installed / 'package.nw/js/rmmz_sprites.js').read_text(encoding='utf-8-sig')
    for name in ('setupDamagePopup', 'createDamageSprite', 'updateDamagePopup'):
        start = sprites.index(f'Sprite_Battler.prototype.{name} = function(')
        end = sprites.index('\n};', start) + 3
        methods.append(sprites[start:end])
    baseline_update = sprite_method(untouched, 'Sprite_Damage', 'update')
    methods.append(baseline_update.replace("['update']", "['fixtureNativeUpdate']", 1))
    print(json.dumps(methods))
    sys.exit(0)


if sys.argv[2:] == ['radial-result']:
    original_action = (installed / ACTION_REL).read_bytes()
    action, _ = decode(action_notification(original_action).decode('utf8'))
    baseline, _ = decode(original_action.decode('utf8'))
    methods = [sprite_method(battle, 'Scene_Battle', 'update'), manager_method(battle, 'isBusy')]
    methods.extend(animated_text_methods())
    for source, prefix in ((action, 'observed'), (baseline, 'native')):
        feedback_names = ('CreateFeedbackText', 'ShowFeedbackText', 'ShowNormalFeedbackText',
                          'ShowFrozenFeedbackText', 'CleanUp')
        for name in feedback_names:
            method = sprite_method(source, 'ActionCommand', name)
            method = method.replace(f"['{name}']", f"['{prefix}{name}']", 1)
            for feedback in feedback_names:
                method = method.replace(f"this['{feedback}']", f"this['{prefix}{feedback}']")
            methods.append(method)
        start = source.index('_0x28cf50=Lerp(_0x58262b,_0x448ce3,_0x279acd),_0x4dc78a=',
                             source.index('for(;!_0x21be67'))
        power_end = source.index('let _0x5499a6=', start)
        accuracy_start = source.index("AudioManager['stopSound'](_0x4a1ae6)", power_end)
        end = source.index("}['bind'](this));};", accuracy_start)
        outcome = (source[start:power_end] + source[accuracy_start:end]).replace(
            "this['ShowFeedbackText']", f"this['{prefix}ShowFeedbackText']")
        methods.append(f'ActionCommand.prototype.{prefix}Score = function* (fixture) {{' + '''
const _0x26a0b4 = fixture.settings, _0x58262b = Math.PI, _0x448ce3 = Math.PI * 2;
const _0x48e2e7 = a0_0x453a8f;
const _0x3f7d26 = fixture.power, _0x168297 = fixture.accuracy;
const _0x2b5f46 = fixture.powerBadge, _0x11601c = fixture.accuracyBadge;
const _0x2e26b2 = this._backing, _0xbb5d19 = {}, _0x42d8de = {}, _0x45b2fb = { scale: {} };
const _0x65b79b = { scale: {}, show() {} }, _0x3f7522 = {}, _0x4b4d3f = {}, _0x176edd = {},
    _0x2d2f24 = {}, _0x19f1f8 = {}, _0x4d4624 = {}, _0xc16277 = null;
const _0x2b5dae = 0, _0x4a1ae6 = 0, _0x16a40a = {}, _0x299a80 = {},
    _0x445be5 = 0, _0x319c3b = 0, _0x2357e9 = '', _0x47b1e6 = '', _0x52643a = 1,
    _0x29b4d0 = 0.35, _0x17f391 = fixture.powerFrozen, _0x2191e9 = fixture.accuracyFrozen;
let _0x279acd = fixture.powerAmount, _0x1327af = fixture.accuracyAmount,
    _0x28cf50 = 0, _0x4dc78a = 0, _0x4656fa = 0, _0x264dda = 0, _0x2dcbbd = 0,
    _0x50b1f9 = 0, _0x5678be = null;
''' + outcome + '};')
    print(json.dumps(methods))
    sys.exit(0)


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
    for name in ('showAnimation', 'displayAddedStates', 'displayRemovedStates'):
        start = stock.index(f'Window_BattleLog.prototype.{name} = function(')
        end = stock.index('\n};', start) + 3
        methods.append(stock[start:end])
    sprites = (installed / 'package.nw/js/rmmz_sprites.js').read_text(encoding='utf-8')
    start = sprites.index('Sprite_Enemy.prototype.setupEffect = function(')
    methods.append(sprites[start:sprites.index('\n};', start) + 3])
    methods.append(sprite_method(battle, 'Sprite_Enemy', 'updateEffect'))
    methods.append(sprite_method(battle, 'Window_BattleLog', 'addText'))
    baseline_draw = sprite_method(untouched, 'Window_BattleActionLog', 'drawItem')
    methods.append(baseline_draw.replace("['drawItem']", "['fixtureNativeDraw']", 1))
    methods.append(sprite_method(battle, 'Scene_Battle', 'logAction'))
    start = battle.index("BattleAnimations['StatusTextAtPosition']=function(")
    methods.append(battle[start:battle.index('},Sprite_Actor', start) + 1] + ';')
    start = battle.index("BattleHelper['logAction']=function(")
    end = battle.index('},BattleHelper', start)
    methods.append(battle[start:end + 1] + ';')
    start = stock.index('Window_BattleLog.prototype.displayItemMessage = function(')
    methods.append(stock[start:stock.index('\n};', start) + 3])
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
               ('SetBattler', 'SetFPText', 'AddState', 'SetStateFrame', 'RemoveState', 'UpdateStateIconPositions',
                'InitMembers', 'InitScene', 'SetHomePosition', 'HasState', 'UpdateStates',
                'UpdateLowHealth', 'LowHealthWarningSound')]
    methods.append(sprite_method(hud, 'RadialStatus', 'UpdateMask').replace(
        "['UpdateMask']", "['fixtureUpdateMask']", 1))
    menu, _ = decode(menu_notifications((installed / MENU_REL).read_bytes()).decode('utf8'))
    methods.extend(sprite_method(menu, owner, 'createStatusWindow') for owner in ('Scene_Menu', 'Scene_Item'))
    map_scene, _ = decode(map_notification((installed / MAP_REL).read_bytes()).decode('utf8'))
    start = map_scene.index("Scene_Map['prototype']['createStatusWindow']=function(")
    end = map_scene.index("},Scene_Map['prototype']['terminate'])", start)
    methods.append(map_scene[start:end] + '};')
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
