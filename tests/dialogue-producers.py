"""Extract installed dialogue methods into the test process without storing game code."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import (BATTLE_REL, CORE_REL, MANAGERS_REL, MAP_REL, OBJECTS_REL, WINDOWS_REL, battle_notification,
                          managers_notification, map_notification, objects_notification, windows_notification)

decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
between = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))['between']
installed = Path(sys.argv[1])
custom, _ = decode(map_notification((installed / MAP_REL).read_bytes()).decode('utf8'))
stock = windows_notification((installed / WINDOWS_REL).read_bytes()).decode('utf8')
methods = []
for name, tail in [
    ('processCharacter', 'isIgnoredCharacter'), ('updateMessage', 'getDefaultTextSounds'),
    ('startMessage', 'InjectSpecialText'), ('InjectSpecialText', 'InjectPlayTime'),
    ('InjectPlayTime', 'updateClose'), ('updateClose', 'newPage'), ('newPage', 'calcTextHeight'),
    ('updateSpeakerName', 'getNameColorIndex'),
]:
    methods.append(between(custom, f"Window_Message['prototype']['{name}']=function(",
                           f"}},Window_Message['prototype']['{tail}']") + '};')
methods.append(between(stock, 'Window_Base.prototype._wqaRecordPaint = function (', '\n};') + '\n};')
for kind, names in {
    'Window_Base': ['drawTextEx', 'textSizeEx', 'createTextState', 'processAllText',
                    'flushTextState', 'createTextBuffer', 'convertEscapeCharacters', 'processCharacter',
                    'processControlCharacter', 'processNewLine', 'obtainEscapeCode', 'obtainEscapeParam',
                    'processEscapeCharacter', 'processColorChange', 'processDrawIcon', 'drawIcon',
                    'close', 'isClosing'],
    'Window_Message': ['update', 'canStart', 'newLineX', 'terminateMessage', 'updateWait', 'updateLoading',
                       'updateInput', 'isAnySubWindowActive', 'shouldBreakHere', 'canBreakHere', 'onEndOfText',
                       'startInput', 'updateShowFast', 'processControlCharacter', 'processNewLine', 'processNewPage',
                       'isEndOfText', 'needsNewPage', 'processEscapeCharacter', 'startWait', 'startPause', 'isWaiting'],
    'Window_ChoiceList': ['start', 'selectDefault', 'makeCommandList', 'drawItem', 'callOkHandler', 'callCancelHandler'],
    'Window_NumberInput': ['start', 'update', 'processDigitChange', 'changeDigit', 'drawItem', 'processOk',
                           'isCancelEnabled', 'onButtonUp', 'onButtonDown', 'onButtonOk'],
    'Window_Selectable': ['select', 'isOpenAndActive'],
}.items():
    for name in names:
        methods.append(between(stock, f'{kind}.prototype.{name} = function(', '\n};') + '\n};')
core = (installed / CORE_REL).read_text(encoding='utf8')
for name in ('Number.prototype.clamp', 'Number.prototype.padZero', 'String.prototype.padZero',
             'Window.prototype.isOpen', 'Window.prototype.isClosed'):
    methods.append(between(core, f'{name} = function(', '\n};') + '\n};')
inputs, _ = decode((installed / 'package.nw/js/plugins/InputAdjustments.js').read_text(encoding='utf-8-sig'))
methods.append(between(inputs, "Input['keyMapper']={", "},Input['gamepadMapper']") + '};')
methods.append(between(inputs, "Input['_onKeyDown']=function(", "},Input['_updateGamepadState']") + '};')
battle, _ = decode(battle_notification((installed / BATTLE_REL).read_bytes()).decode('utf8'))
for name, tail in [
    ("Scene_Battle['prototype']['start']", "},Scene_Battle['prototype']['update']"),
    ("Scene_Battle['prototype']['update']", "},Scene_Battle['prototype']['isTimeActive']"),
    ("Scene_Battle['prototype']['isTimeActive']", "},Scene_Battle['prototype']['itemWindowRect']"),
    ("BattleManager['isBusy']", "},BattleManager['showEnemySelectionArrows']"),
]:
    methods.append(between(battle, f'{name}=function(', tail) + '};')
for relative, transform, names in [
    (MANAGERS_REL, managers_notification, ['BattleManager.update']),
    (OBJECTS_REL, objects_notification, ['Game_Interpreter.prototype.setWaitMode', 'Game_Interpreter.prototype.updateWaitMode']),
]:
    source = transform((installed / relative).read_bytes()).decode('utf8')
    methods.extend(between(source, f'{name} = function(', '\n};') + '\n};' for name in names)
print(json.dumps(methods))
