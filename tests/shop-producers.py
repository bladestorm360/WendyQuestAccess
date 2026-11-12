"""Extract the installed shop draw, update and acceptance methods in memory."""

import json
from pathlib import Path
import runpy
import sys


helpers = runpy.run_path(str(Path(__file__).with_name('file-producers.py')))
decode = helpers['load_decoder']()
between = helpers['between']
from registration import CORE_REL, MENU_REL, SCENES_REL, WINDOWS_REL, menu_notifications, scenes_notification, windows_notification


def methods(installed):
    original_scenes = (installed / SCENES_REL).read_bytes()
    scenes = scenes_notification(original_scenes).decode('utf8')
    windows = windows_notification((installed / WINDOWS_REL).read_bytes()).decode('utf8')
    custom, _ = decode(menu_notifications((installed / MENU_REL).read_bytes()).decode('utf8'))
    name = 'Scene_MenuBase.prototype.update'
    selected = [between(scenes, name + ' = function(', '\n};') + '\n};']
    baseline = between(original_scenes.decode('utf8'), name + ' = function(', '\n};') + '\n};'
    selected.append(baseline.replace('.update', '.fixtureNativeUpdate', 1))
    for name in ('doBuy', 'maxBuy'):
        selected.append(between(scenes, f'Scene_Shop.prototype.{name} = function(', '\n};') + '\n};')
    core = (installed / CORE_REL).read_text(encoding='utf8')
    selected.append(between(core, 'Number.prototype.clamp = function(', '\n};') + '\n};')
    for owner, names in (
        ('Window_ShopBuy', ('price', 'isEnabled', 'drawItem')),
        ('Window_ShopStatus', ('drawActorEquipInfo', 'drawActorParamChange', 'paramId')),
        ('Window_ShopNumber', ('number', 'setCurrencyUnit', 'drawNumber', 'drawTotalPrice')),
    ):
        selected.extend(between(windows, f'{owner}.prototype.{name} = function(', '\n};') + '\n};' for name in names)
    for owner, name, tail in (
        ('Window_Gold', 'refresh', 'update'),
        ('Window_ShopStatus', 'drawPossession', 'isPageChangeEnabled'),
        ('Window_Shop_Help', 'refresh', 'drawText'),
        ('Scene_Shop', 'onBuyOk', 'onNumberOk'),
        ('Scene_Shop', 'onNumberOk', 'onNumberCancel'),
        ('Scene_Shop', 'onNumberCancel', 'endNumberInput'),
        ('Window_ShopNumber', 'setup', 'refreshCursor'),
        ('Window_ShopNumber', 'changeNumber', 'processNumberChange'),
        ('Window_ShopNumber', 'refresh', 'multiplicationSignX'),
    ):
        selected.append(between(custom, f"{owner}['prototype']['{name}']=function(",
                                f"}},{owner}['prototype']['{tail}']") + '};')
    selected.append(between(custom, "Scene_Shop['prototype']['endNumberInput']=function(",
                            "},Window_Shop_Help['prototype']") + '};')
    # The final custom create calls the earlier implementation, then starts Buy.
    start = custom.rindex("Scene_Shop['prototype']['create']=function(")
    selected.append(between(custom[start:], "Scene_Shop['prototype']['create']=function(",
                            "},Scene_Shop['prototype']['dummyWindowRect']") + '};')
    return selected


if __name__ == '__main__':
    print(json.dumps(methods(Path(sys.argv[1]))))
