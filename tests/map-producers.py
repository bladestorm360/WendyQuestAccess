"""Read only the custom map-entry methods used by the offline lifecycle fixture."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
PLUGINS = Path(sys.argv[1]) / 'js' / 'plugins'
decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
between = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))['between']
from registration import (CANVAS_REL, CORE_REL, MANAGERS_REL, MAP_REL, OBJECTS_REL, SCENES_REL, TILE_REL, WINDOW_REL,
                          canvas_notification, core_notification, managers_notification, map_notification,
                          objects_notification, scenes_notification, tile_notification, window_notification)


def read_methods(file, transform, pairs):
    text, _ = decode(transform((PLUGINS / file).read_bytes()).decode('utf8'))
    return [between(text, f"{target}['prototype']['{name}']=function(", tail) + '};'
            for target, name, tail in pairs]


methods = read_methods(MAP_REL.name, map_notification, [
    ('Scene_Map', 'start', "},Scene_Map['prototype']['forceLeaveVehicle']"),
    ('Scene_Map', 'doSceneStart', "},Scene_Map['prototype']['createStatusWindow']"),
    ('Scene_Map', 'updateMoveDetector', "},Scene_Map['prototype']['updateInactive']"),
    ('Scene_Map', 'update', "},Scene_Map['prototype']['mapNameWindowRect']"),
    ('Scene_Map', 'updateInactive', "},Scene_Map['prototype']['isFastForward']"),
    ('Game_Event', 'onSceneStart', "},Game_Event['prototype']['reinstateAnimationData']"),
    ('Game_Event', 'SetBlocker', "},Game_Event['prototype']['GetCenter']"),
    ('Window_MapName', 'refresh', "},Window_MapName['prototype']['drawBackground']"),
])
methods += read_methods(WINDOW_REL.name, window_notification, [
    ('Scene_Base', 'executeAutosave', "},Scene_Base['prototype']['onAutosaveSuccess']"),
    ('Scene_Base', 'onAutosaveSuccess', "},Scene_Base['prototype']['playAutoSaveAnimation']"),
])
for relative, transform, names in [
    (MANAGERS_REL, managers_notification, ['SceneManager.goto', 'BattleManager.setup']),
    (CORE_REL, core_notification, ['Graphics._onWindowResize']),
    (SCENES_REL, scenes_notification, ['Scene_Base.prototype.startFadeOut']),
    (OBJECTS_REL, objects_notification, ['Game_Player.prototype.reserveTransfer', 'Game_Screen.prototype.startFadeOut',
                                        'Game_Interpreter.prototype.setup', 'Game_Interpreter.prototype.loadImages',
                                        'Game_CharacterBase.prototype.setPosition', 'Game_CharacterBase.prototype.moveStraight']),
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
