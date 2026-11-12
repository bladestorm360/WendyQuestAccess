"""Load fingerprinted quest tracker and MZ text producers into an offline VM."""

import hashlib
import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
between = helpers['between']
from registration import QUEST_REL, WINDOWS_REL, WINDOWS_SHA, quest_notification


def methods(installed):
    text, _ = helpers['load_decoder']()(quest_notification((installed / QUEST_REL).read_bytes()).decode('utf-8-sig'))
    tracker = "Window_QuestMapNavigation['prototype']"
    result = [between(text, head, tail) + '};' for head, tail in (
        (f"{tracker}['drawNavContents']=function(", f"}},{tracker}['drawNavBackground']"),
        (f"{tracker}['drawQuestTitle']=function(", f"}},{tracker}['drawQuestObjectives']"),
        (f"{tracker}['drawQuestObjectives']=function(", f"}},{tracker}['drawTextLines']"),
        (f"{tracker}['drawTextLines']=function(", "},'MV'===Utils['RPGMAKER_NAME']"),
        (f"{tracker}['drawTextEx']=function(_0x670ca5", "}),Window_QuestBoard"),
        ("Scene_Map['prototype']['QuestNavNeedRefresh']=function(", "},'MV'===Utils['RPGMAKER_NAME']"),
        ("Scene_Map['prototype']['update']=function(", "},Scene_Map['prototype']"),
    )]
    stock = (installed / WINDOWS_REL).read_bytes()
    if hashlib.sha256(stock).hexdigest() != WINDOWS_SHA:
        raise ValueError('MZ text producers changed')
    windows = stock.decode('utf-8-sig')
    for name in ('drawText', 'textWidth', 'createTextState', 'processAllText', 'flushTextState',
                 'createTextBuffer', 'convertEscapeCharacters', 'processCharacter',
                 'processControlCharacter', 'processNewLine'):
        result.append(between(windows, f'Window_Base.prototype.{name} = function(', '\n};') + '\n};')
    return result


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
