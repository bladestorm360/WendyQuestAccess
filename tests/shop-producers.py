"""Extract the installed shop draw, update and acceptance methods in memory."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
decode = helpers['load_decoder']()
between = helpers['between']
from registration import MENU_REL, SCENES_REL, WINDOWS_REL, menu_notifications, scenes_notification, windows_notification


def methods(installed):
    original_scenes = (installed / SCENES_REL).read_bytes()
    scenes = scenes_notification(original_scenes).decode('utf8')
    windows = windows_notification((installed / WINDOWS_REL).read_bytes()).decode('utf8')
    custom, _ = decode(menu_notifications((installed / MENU_REL).read_bytes()).decode('utf8'))
    name = 'Scene_MenuBase.prototype.update'
    selected = [between(scenes, name + ' = function(', '\n};') + '\n};']
    baseline = between(original_scenes.decode('utf8'), name + ' = function(', '\n};') + '\n};'
    selected.append(baseline.replace('.update', '.fixtureNativeUpdate', 1))
    for owner, names in (
        ('Window_ShopBuy', ('price', 'isEnabled', 'drawItem')),
        ('Window_ShopStatus', ('drawActorEquipInfo', 'drawActorParamChange', 'paramId')),
    ):
        selected.extend(between(windows, f'{owner}.prototype.{name} = function(', '\n};') + '\n};' for name in names)
    for owner, name, tail in (
        ('Window_Gold', 'refresh', 'update'),
        ('Window_ShopStatus', 'drawPossession', 'isPageChangeEnabled'),
        ('Window_Shop_Help', 'refresh', 'drawText'),
        ('Scene_Shop', 'onBuyOk', 'onNumberOk'),
    ):
        selected.append(between(custom, f"{owner}['prototype']['{name}']=function(",
                                f"}},{owner}['prototype']['{tail}']") + '};')
    # The final custom create calls the earlier implementation, then starts Buy.
    start = custom.rindex("Scene_Shop['prototype']['create']=function(")
    selected.append(between(custom[start:], "Scene_Shop['prototype']['create']=function(",
                            "},Scene_Shop['prototype']['dummyWindowRect']") + '};')
    return selected


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
