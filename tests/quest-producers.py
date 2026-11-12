"""Load fingerprinted quest tracker and MZ text producers into an offline VM."""

import hashlib
import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
between = helpers['between']
from registration import (BITMAP_FONT_REL, BITMAP_FONT_SHA, QUEST_REL, WINDOW_REL, WINDOW_SHA,
                          WINDOWS_REL, WINDOWS_SHA, quest_notification)


def checked(installed, relative, expected):
    data = (installed / relative).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f'Producer changed: {relative}')
    return data.decode('utf-8-sig')


def methods(installed):
    decode = helpers['load_decoder']()
    text, _ = decode(quest_notification((installed / QUEST_REL).read_bytes()).decode('utf-8-sig'))
    tracker = "Window_QuestMapNavigation['prototype']"
    result = [between(text, head, tail) + '};' for head, tail in (
        (f"{tracker}['drawNavContents']=function(", f"}},{tracker}['drawNavBackground']"),
        (f"{tracker}['drawQuestTitle']=function(", f"}},{tracker}['drawQuestObjectives']"),
        (f"{tracker}['drawQuestObjectives']=function(", f"}},{tracker}['drawTextLines']"),
        (f"{tracker}['drawTextLines']=function(", "},'MV'===Utils['RPGMAKER_NAME']"),
        (f"{tracker}['drawQuestIcon']=function(", "},'MV'===Utils['RPGMAKER_NAME']"),
        (f"{tracker}['drawIconWithSpacing']=function(", f"}},{tracker}['drawBitmap']"),
        (f"{tracker}['drawTextEx']=function(_0x670ca5", "}),Window_QuestBoard"),
        (f"{tracker}['needRefresh']=function(", f"}},{tracker}['checkNavCondition']"),
        (f"{tracker}['checkNavCondition']=function(", f"}},{tracker}['setupNavData']"),
        (f"{tracker}['setupNavData']=function(", f"}},{tracker}['peekTransition']"),
        (f"{tracker}['update']=function(", f"}},{tracker}['SetOnScreen']"),
        (f"{tracker}['destroy']=function(", f"}},{tracker}['update']"),
        ("Scene_Map['prototype']['QuestNavNeedRefresh']=function(", "},'MV'===Utils['RPGMAKER_NAME']"),
        ("Scene_Map['prototype']['update']=function(", "},Scene_Map['prototype']"),
    )]
    windows = checked(installed, WINDOWS_REL, WINDOWS_SHA)
    for name in ('textWidth', 'createTextState', 'processAllText', 'flushTextState',
                 'createTextBuffer', 'convertEscapeCharacters', 'processCharacter',
                 'processControlCharacter', 'processNewLine', 'calcTextHeight', 'maxFontSizeInLine',
                 'changePaintOpacity', 'translucentOpacity'):
        result.append(between(windows, f'Window_Base.prototype.{name} = function(', '\n};') + '\n};')
    window_owner, _ = decode(checked(installed, WINDOW_REL, WINDOW_SHA))
    result.append(between(window_owner, "Window_Base['prototype']['drawText']=function(", '},0x3c)') + '};')
    font, _ = decode(checked(installed, BITMAP_FONT_REL, BITMAP_FONT_SHA))
    result.append('e.Window_Base_calcTextHeight = Window_Base.prototype.calcTextHeight;')
    for owner, name, tail in (
        ('Bitmap', 'fontBitmap', 'measureTextWidthForEachChar'),
        ('Bitmap', 'getTextX', 'drawBitmapFontCharacter'),
        ('Bitmap', 'measureTextWidth', 'drawText'),
        ('Window_Base', 'calcTextHeight', 'makeFontBigger'),
    ):
        prefix = f"{owner}['prototype']"
        result.append(between(font, f"{prefix}['{name}']=function(", f"}},{prefix}['{tail}']") + '};')
    return result


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
