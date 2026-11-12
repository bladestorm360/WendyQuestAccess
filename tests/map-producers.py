"""Read only the custom map-entry methods used by the offline lifecycle fixture."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
PLUGINS = Path(sys.argv[1]) / 'js' / 'plugins'
decode = runpy.run_path(str(ROOT / 'tools' / 'inspect-plugin.py'))['decode']
between = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))['between']


def read_methods(file, pairs):
    text, _ = decode((PLUGINS / file).read_text(encoding='utf8'))
    return [between(text, f"{target}['prototype']['{name}']=function(", tail) + '};'
            for target, name, tail in pairs]


methods = read_methods('MapScene.js', [
    ('Scene_Map', 'start', "},Scene_Map['prototype']['forceLeaveVehicle']"),
    ('Scene_Map', 'doSceneStart', "},Scene_Map['prototype']['createStatusWindow']"),
    ('Scene_Map', 'updateMoveDetector', "},Scene_Map['prototype']['updateInactive']"),
    ('Game_Event', 'onSceneStart', "},Game_Event['prototype']['reinstateAnimationData']"),
    ('Window_MapName', 'refresh', "},Window_MapName['prototype']['drawBackground']"),
])
methods += read_methods('MonkeyWrenchMZ.js', [
    ('Scene_Base', 'executeAutosave', "},Scene_Base['prototype']['onAutosaveSuccess']"),
    ('Scene_Base', 'onAutosaveSuccess', "},Scene_Base['prototype']['playAutoSaveAnimation']"),
])
print(json.dumps(methods))
