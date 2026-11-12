"""Read the installed pause and inventory producers into an offline VM."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
decode = helpers['load_decoder']()
between = helpers['between']
from registration import MENU_REL, menu_notifications


def methods(installed):
    text, _ = decode(menu_notifications((installed / MENU_REL).read_bytes()).decode('utf-8-sig'))
    return [between(text, head, tail) + '};' for head, tail in (
        ("Scene_Menu['prototype']['update']=function(", "},Scene_Menu['prototype']['commandWindowRect']"),
        ("Scene_Menu['prototype']['commandSave']=function(", "},Scene_Menu['prototype']['update']"),
        ("Scene_Item['prototype']['update']=function(", "},Scene_Item['prototype']['handleSwapFocus']"),
        ("Window_Item_Help['prototype']['refresh']=function(", "},Window_Item_Help['prototype']['itemIsEquipped']"),
        ("Window_ItemList['prototype']['updateHelp']=function(", "},Scene_Shop['prototype']['create']"),
        ("Window_EquipStatus['prototype']['drawAllParams']=function(", "},Window_EquipStatus['prototype']['rightArrowWidth']"),
    )]


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
