"""Extract the installed quest marker producers into the world fixture VM."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
between = helpers['between']
from registration import QUEST_REL, quest_notification


def methods(installed):
    text, _ = helpers['load_decoder']()(quest_notification((installed / QUEST_REL).read_bytes()).decode('utf-8-sig'))
    result = []
    for owner, name, end in (
        ('Game_Event', 'setupFlagIcons', "},Game_Event['prototype']['clearSelfIconFlag']"),
        ('Game_Event', 'clearSelfIconFlag', "},Spriteset_Map['prototype']"),
        ('Spriteset_Map', 'sortExitIslands', "},Spriteset_Map['prototype']['createQuestFlagIcons']"),
        ('Spriteset_Map', 'createQuestFlagIcons', "},Spriteset_Map['prototype']['update']"),
        ('Spriteset_Map', 'refreshIcons', "},Sprite_AyatamQuestIcon['prototype']"),
        ('Sprite_AyatamQuestIcon', 'setMapIcon', "},Sprite_AyatamQuestIcon['prototype']['shouldShowLocationMarker']"),
        ('Sprite_AyatamQuestIcon', 'shouldShowLocationMarker', "},Sprite_AyatamQuestIcon['prototype']['SetOnScreen']"),
        ('Sprite_AyatamQuestIcon', 'SetOnScreen', "},Sprite_AyatamQuestIcon['prototype']['SetIcon']"),
        ('Sprite_AyatamQuestIcon', 'SetIcon', "},Sprite_AyatamQuestIcon['prototype']['refreshIcons']"),
        ('Sprite_AyatamQuestIcon', 'update', "},'MV'===Utils['RPGMAKER_NAME']"),
    ):
        result.append(between(text, f"{owner}['prototype']['{name}']=function(", end) + '};')
    result.append('Sprite_AyatamQuestIcon' + between(text, "['prototype']['initialize']=function(_0xc87c4a",
                  "},Sprite_AyatamQuestIcon['prototype']['setMapIcon']") + '};')
    return result


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
