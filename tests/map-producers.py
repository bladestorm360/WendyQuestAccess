"""Read only the custom map-entry methods used by the offline lifecycle fixture."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
PLUGINS = Path(sys.argv[1]) / 'js' / 'plugins'
decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
between = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))['between']
from registration import (CANVAS_REL, CORE_REL, MANAGERS_REL, MAP_REL, MENU_REL, OBJECTS_REL, SCENES_REL, TILE_REL, WINDOW_REL,
                          canvas_notification, core_notification, managers_notification, map_notification, menu_notifications,
                          objects_notification, scenes_notification, tile_notification, window_notification)


def variable_stack():
    filters, _ = decode((PLUGINS / 'FilterControllerMZ.js').read_text(encoding='utf8'))
    quests, _ = decode((PLUGINS / 'Ayatam_HighQualityQuestSystem.js').read_text(encoding='utf8'))
    setter = "Game_Variables['prototype']['setValue']"
    return [
        "const _0x32fc97 = Game_Variables.prototype.setValue; const _0x5b5f5a = () => {};",
        between(filters, setter + '=function(', ";}let _0x16da47=") + ';',
        "const _HighQualityQuestSystem_Game_Variables_prototype_setValue = Game_Variables.prototype.setValue;"
        "const a1_0x4e0759 = () => {};",
        between(quests, setter + '=function(', "},Game_Variables['prototype']['checkQuestObjects']") + '};',
        between(quests, "Game_Variables['prototype']['checkQuestObjects']=function(",
                "},Sprite_Battler['prototype']['initialize']") + '};',
    ]


if sys.argv[2:] == ['variable-stack']:
    print(json.dumps(variable_stack()))
    sys.exit()


def read_methods(file, transform, pairs):
    text, _ = decode(transform((PLUGINS / file).read_bytes()).decode('utf8'))
    return [between(text, f"{target}['prototype']['{name}']=function(", tail) + '};'
            for target, name, tail in pairs]


if sys.argv[2:] == ['splash']:
    names = ['totalWaitCount', 'getTimeWaited', 'getPhase', 'initWaitCount', 'getTotalPercent', 'checkSkip',
             'updateWaitCount', 'updateWendy', 'update81Monkeys', 'getPhasePercent', 'gotoTitle']
    pairs = [('Scene_Splash', name, f"}},Scene_Splash['prototype']['{after}']") for name, after in zip(names, names[1:])]
    pairs.append(('Scene_Splash', 'gotoTitle', "},Scene_MenuBase['prototype']['createBackground']"))
    print(json.dumps(read_methods(MENU_REL.name, menu_notifications, pairs)))
    sys.exit()

if sys.argv[2:] == ['idle-animation']:
    print(json.dumps(read_methods(MAP_REL.name, map_notification, [
        ('Scene_Map', 'updateInactive', "},Scene_Map['prototype']['isFastForward']"),
    ])))
    sys.exit()

if sys.argv[2:] == ['interaction']:
    print(json.dumps(read_methods(MAP_REL.name, map_notification, [
        ('Game_Player', 'canTriggerEvent', "},Game_Player['prototype']['findEventsAt']"),
        ('Game_Player', 'findEventsAt', "},Game_Player['prototype']['triggerTouchActionD3']"),
        ('Game_Player', 'update', "},Game_Player['prototype']['onSceneEnd']"),
    ])))
    sys.exit()


if sys.argv[2:] == ['terrain-paint']:
    text, _ = decode(map_notification((PLUGINS / MAP_REL.name).read_bytes()).decode('utf8'))
    print(json.dumps([between(text, "Tilemap['prototype']['SetMapData']=function(", "},Tilemap['prototype']['updateTransform']") + '};']))
    sys.exit()

if sys.argv[2:] == ['cauldron-drain']:
    text, _ = decode(map_notification((PLUGINS / MAP_REL.name).read_bytes()).decode('utf8'))
    print(json.dumps([
        between(text, "TileEditor['FloodFillRegion']=function(", "},Tilemap['prototype']['SetMapData']") + '};',
        between(text, "Tilemap['prototype']['SetMapData']=function(", "},Tilemap['prototype']['updateTransform']") + '};',
    ]))
    sys.exit()


if sys.argv[2:] == ['narration-commands']:
    source = objects_notification((Path(sys.argv[1]) / OBJECTS_REL.relative_to('package.nw')).read_bytes()).decode('utf8')
    methods = []
    for name in ('clear', 'setup', 'loadImages', 'command117', 'command121', 'command205', 'command322', 'command224', 'command225', 'command250', 'command357'):
        start = source.index(f'Game_Interpreter.prototype.{name} = function(')
        methods.append(source[start:source.index('\n};', start) + 3])
    print(json.dumps(methods))
    sys.exit()


if sys.argv[2:] == ['music-emotes']:
    source = objects_notification((Path(sys.argv[1]) / OBJECTS_REL.relative_to('package.nw')).read_bytes()).decode('utf8')
    start = source.index('Game_Interpreter.prototype.command213 = function(')
    print(json.dumps([source[start:source.index('\n};', start) + 3]]))
    sys.exit()


methods = read_methods(MAP_REL.name, map_notification, [
    ('Scene_Map', 'start', "},Scene_Map['prototype']['forceLeaveVehicle']"),
    ('Scene_Map', 'doSceneStart', "},Scene_Map['prototype']['createStatusWindow']"),
    ('Scene_Map', 'updateMoveDetector', "},Scene_Map['prototype']['updateInactive']"),
    ('Scene_Map', 'update', "},Scene_Map['prototype']['mapNameWindowRect']"),
    ('Scene_Map', 'updateInactive', "},Scene_Map['prototype']['isFastForward']"),
    ('Game_Event', 'onSceneStart', "},Game_Event['prototype']['reinstateAnimationData']"),
    ('Game_Event', 'SetBlocker', "},Game_Event['prototype']['GetCenter']"),
    ('Game_Event', 'GetCenter', "},Game_Event['prototype']['findProperPageIndex']"),
    ('Window_MapName', 'refresh', "},Window_MapName['prototype']['drawBackground']"),
])
methods += read_methods(WINDOW_REL.name, window_notification, [
    ('Scene_Base', 'executeAutosave', "},Scene_Base['prototype']['onAutosaveSuccess']"),
    ('Scene_Base', 'onAutosaveSuccess', "},Scene_Base['prototype']['playAutoSaveAnimation']"),
])
for relative, transform, names in [
    (MANAGERS_REL, managers_notification, ['SceneManager.goto', 'BattleManager.setup', 'ImageManager.loadFace',
                                            'ImageManager.loadPicture', 'ImageManager.loadBitmap',
                                            'ImageManager.loadBitmapFromUrl']),
    (CORE_REL, core_notification, ['Graphics._onWindowResize', 'Utils.encodeURI']),
    (SCENES_REL, scenes_notification, ['Scene_Base.prototype.startFadeOut']),
    (OBJECTS_REL, objects_notification, ['Game_Player.prototype.reserveTransfer', 'Game_Screen.prototype.startFadeOut',
                                        'Game_Event.prototype.start', 'Game_Interpreter.prototype.setup', 'Game_Interpreter.prototype.loadImages',
                                        'Game_CharacterBase.prototype.setPosition', 'Game_CharacterBase.prototype.moveStraight',
                                        'Game_Map.prototype.setupStartingMapEvent', 'Game_Map.prototype.requestRefresh',
                                        'Game_Map.prototype.update', 'Game_Map.prototype.refreshIfNeeded',
                                        'Game_Variables.prototype.value', 'Game_Variables.prototype.setValue',
                                        'Game_Variables.prototype.onChange', 'Game_Interpreter.prototype.command122',
                                        'Game_Interpreter.prototype.operateVariable']),
]:
    source = transform((PLUGINS.parent.parent / relative.relative_to('package.nw')).read_bytes()).decode('utf8')
    methods.extend(between(source, f'{name} = function(', '\n};') + '\n};' for name in names)
canvas, _ = decode(canvas_notification((PLUGINS / CANVAS_REL.name).read_bytes()).decode('utf8'))
methods.append(between(canvas, 'OnWindowSizeChanged=function(', "},window['addEventListener']") + '};')
map_text, _ = decode(map_notification((PLUGINS / MAP_REL.name).read_bytes()).decode('utf8'))
methods.append(between(map_text, "TileEditor['FloodFillRegion']=function(", "},Tilemap['prototype']['SetMapData']") + '};')
tile, _ = decode(tile_notification((PLUGINS / TILE_REL.name).read_bytes()).decode('utf-8-sig'))
methods.append(between(tile, "Tyruswoo['TileControl']['Scene_Map_onMapLoaded']=", "},DataManager['restoreTileChanges']") + '};')
methods.append(between(tile, "DataManager['restoreTileChanges']=function(",
                       "},Tyruswoo['TileControl']['DataManager_createGameObjects']") + '};')
methods.append(between(tile, "Game_Map['prototype']['setExactTileId']=function(",
                       "},Game_Map['prototype']['autotileNeighbor']") + '};')
print(json.dumps(methods))
