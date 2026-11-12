"""Extract installed dialogue methods into the test process without storing game code."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import MAP_REL, WINDOWS_REL, map_notification, windows_notification

decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
between = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))['between']
installed = Path(sys.argv[1])
custom, _ = decode(map_notification((installed / MAP_REL).read_bytes()).decode('utf8'))
stock = windows_notification((installed / WINDOWS_REL).read_bytes()).decode('utf8')
methods = []
for name, tail in [
    ('processCharacter', 'isIgnoredCharacter'), ('updateMessage', 'getDefaultTextSounds'),
    ('startMessage', 'InjectSpecialText'), ('InjectSpecialText', 'InjectPlayTime'),
    ('InjectPlayTime', 'updateClose'), ('newPage', 'calcTextHeight'), ('updateSpeakerName', 'getNameColorIndex'),
]:
    methods.append(between(custom, f"Window_Message['prototype']['{name}']=function(",
                           f"}},Window_Message['prototype']['{tail}']") + '};')
methods.append(between(stock, 'Window_Base.prototype._wqaRecordPaint = function (', '\n};') + '\n};')
for kind, names in {
    'Window_Base': ['drawTextEx', 'textSizeEx', 'createTextState', 'processAllText',
                    'flushTextState', 'createTextBuffer', 'convertEscapeCharacters', 'processCharacter',
                    'processControlCharacter', 'processNewLine', 'obtainEscapeCode', 'obtainEscapeParam',
                    'processEscapeCharacter', 'processColorChange', 'processDrawIcon', 'drawIcon'],
    'Window_Message': ['update', 'canStart', 'newLineX', 'terminateMessage', 'updateWait', 'updateLoading',
                       'updateInput', 'isAnySubWindowActive', 'shouldBreakHere', 'canBreakHere', 'onEndOfText',
                       'startInput', 'updateShowFast', 'processControlCharacter', 'processNewLine', 'processNewPage',
                       'isEndOfText', 'needsNewPage', 'processEscapeCharacter', 'startWait', 'startPause', 'isWaiting'],
    'Window_ChoiceList': ['start', 'selectDefault', 'makeCommandList', 'drawItem', 'callOkHandler', 'callCancelHandler'],
    'Window_Selectable': ['select'],
}.items():
    for name in names:
        methods.append(between(stock, f'{kind}.prototype.{name} = function(', '\n};') + '\n};')
print(json.dumps(methods))
