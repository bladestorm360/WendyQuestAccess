"""Read the installed pause and inventory producers into an offline VM."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
decode = helpers['load_decoder']()
between = helpers['between']
from registration import MENU_REL, WINDOW_REL, menu_notifications, window_notification


def methods(installed):
    text, _ = decode(menu_notifications((installed / MENU_REL).read_bytes()).decode('utf-8-sig'))
    return [between(text, head, tail) + '};' for head, tail in (
        ("Scene_Menu['prototype']['update']=function(", "},Scene_Menu['prototype']['commandWindowRect']"),
        ("Scene_Menu['prototype']['commandSave']=function(", "},Scene_Menu['prototype']['update']"),
        ("Scene_Item['prototype']['update']=function(", "},Scene_Item['prototype']['handleSwapFocus']"),
        ("Window_ItemCategory['prototype']['needsCommand']=function(", "},Window_ItemCategory['prototype']['maxCols']"),
        ("Window_ItemCategory['prototype']['makeCommandList']=function(", "},Window_ItemCategory['prototype']['processTouch']"),
        ("Window_ItemCategory['prototype']['processOk']=function(", "},Window_ItemCategory['prototype']['drawItemBackground']"),
        ("Window_ItemCategory['prototype']['cursorPagedown']=function(", "},Window_ItemCategory['prototype']['cursorPageup']"),
        ("Window_Item_Help['prototype']['refresh']=function(", "},Window_Item_Help['prototype']['itemIsEquipped']"),
        ("Window_ItemList['prototype']['updateHelp']=function(", "},Scene_Shop['prototype']['create']"),
        ("Window_EquipStatus['prototype']['drawAllParams']=function(", "},Window_EquipStatus['prototype']['rightArrowWidth']"),
    )]


def save_methods(installed):
    selected = methods(installed)[:2]
    menu, _ = decode((installed / MENU_REL).read_text(encoding='utf-8-sig'))
    selected.append(between(menu, "Scene_Menu['prototype']['playAutoSaveAnimation']=function(",
                            "},Scene_Menu['prototype']['initBreadcrumb']") + '};')
    original = (installed / WINDOW_REL).read_bytes()
    text, _ = decode(window_notification(original).decode('utf-8-sig'))
    pairs = (
        ('Scene_Base', 'executeAutosave', 'onAutosaveSuccess'),
        ('Scene_Base', 'onAutosaveSuccess', 'playAutoSaveAnimation'),
        ('Sprite_Text', 'initialize', 'destroy'),
        ('Sprite_Text', 'setText', 'RedrawText'),
        ('Sprite_Text', 'RedrawText', 'GetText'),
        ('Sprite_Text', 'GetText', 'GetTextWidth'),
        ('Sprite_Text', 'createChildSprite', 'createBitmap'),
        ('Sprite_Text', 'createBitmap', 'update'),
        ('Sprite_Text', 'update', 'StartTextAnimation'),
        ('Sprite_Text', 'StartTextAnimation', 'updateAnimation'),
    )
    for owner, name, tail in pairs:
        selected.append(between(text, f"{owner}['prototype']['{name}']=function(",
                                f"}},{owner}['prototype']['{tail}']") + '};')
    for owner, name, tail in (('Scene_Base', 'playAutoSaveAnimation', "},DataManager['isAnyKeyItem']"),
                              ('Sprite_Text', 'updateAnimation', ',VFXBody')):
        selected.append(between(text, f"{owner}['prototype']['{name}']=function(", tail) +
                        ('};' if owner == 'Scene_Base' else ';'))
    return selected


if __name__ == '__main__':
    extract = save_methods if sys.argv[2:] == ['save'] else methods
    print(json.dumps(extract(Path(sys.argv[1]))))
