"""Return selected installed methods in memory to the offline file fixture."""

import importlib.util
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import (CORE_REL, MANAGERS_REL, MENU_REL, SCENES_REL, WINDOW_REL, core_notification,
                          managers_notification, menu_notifications, scenes_notification, window_notification)


def load_decoder():
    spec = importlib.util.spec_from_file_location('decoder', ROOT / 'tools' / 'inspect-plugin.py')
    decoder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(decoder)
    return decoder.decode


def between(source, start, end):
    if source.count(start) != 1:
        raise ValueError(f'Method start is ambiguous: {start}')
    first = source.index(start)
    last = source.index(end, first + len(start))
    return source[first:last]


def main():
    root = Path(sys.argv[1])
    decode = load_decoder()
    menu, _ = decode(menu_notifications((root / MENU_REL).read_bytes()).decode('utf8'))
    manager = managers_notification((root / MANAGERS_REL).read_bytes()).decode('utf8')
    scenes = scenes_notification((root / SCENES_REL).read_bytes()).decode('utf8')
    core = core_notification((root / CORE_REL).read_bytes()).decode('utf8')
    native_window, _ = decode(window_notification((root / WINDOW_REL).read_bytes()).decode('utf8'))
    general, _ = decode((root / 'package.nw/js/plugins/UIGeneral.js').read_text(encoding='utf8'))
    result = {}
    for target, name, tail in [
        ('Scene_FileLoad', 'loadImages', "},Scene_FileLoad['prototype']['drawLoadedImages']"),
        ('Scene_FileLoad', 'drawDetailsText', "},Scene_FileLoad['prototype']['createListWindow']"),
        ('Scene_FileLoad', 'onLoadSuccess', "},Scene_FileLoad['prototype']['onLoadFailure']"),
        ('Scene_FileLoad', 'onLoadFailure', "},Scene_FileLoad['prototype']['reloadMapIfUpdated']"),
        ('Scene_FileLoad', 'onListSelection', "},Scene_FileLoad['prototype']['detailsWindowRect']"),
        ('Scene_FileLoad', 'update', "},Scene_FileLoad['prototype']['commandOptions']"),
        ('Window_SavefileList', 'loadImages', "},Window_SavefileList['prototype']['maxCols']"),
        ('Window_SavefileList', 'cursorUp', "},Window_SavefileList['prototype']['cursorLeft']"),
        ('Scene_File', 'commandOptions', "},Scene_File['prototype']['commandCoupons']"),
        ('Scene_Load', 'start', "},Scene_Load["),
        ('Scene_Load', 'update', "},Scene_Load['prototype']['commandNewGame']"),
        ('Scene_DeleteGame', 'onDelete', "},Scene_DeleteGame['prototype']['onCancel']"),
        ('Scene_Options', 'create', "},Scene_Options['prototype']['onGoToTitle']"),
        ('Scene_Options', 'doSystemButton', "},Scene_Options['prototype']['createOptionsSystemWindow']"),
        ('Scene_Options', 'update', "},Scene_Options['prototype']['setWindowIndex']"),
        ('Window_Options', 'initialize', "},Window_Options['prototype']['makeCommandList']"),
        ('Window_Options', 'cursorRight', "},Window_Options['prototype']['cursorLeft']"),
        ('Window_Options', 'cursorPagedown', "},Window_Options['prototype']['cursorPageup']"),
        ('Window_Options', 'changeVolumeDirectional', "},Window_Options['prototype']['setVolumeConfig']"),
        ('Window_Options', 'setVolumeConfig', "},Window_Options['prototype']['changeDropdownValue']"),
        ('Window_Options', 'tabIndex', "},Window_Options['prototype']['"),
        ('Window_Options', 'volumeStatusText', "},Window_Options['prototype']['tabIndex']"),
        ('Window_Options', 'drawItem', "},Window_Options['prototype']['drawVolumeStatus']"),
        ('Window_Options', 'drawVolumeStatus', "},Window_Options['prototype']['drawVolumeBackgroundRectPressed']"),
        ('Scene_Gameover', 'createCommandWindow', "},Scene_Gameover['prototype']['gameoverCommandItemRect']"),
        ('Scene_Gameover', 'drawAdditionalText', "},Scene_Gameover['prototype']['createBackground']"),
        ('Scene_Gameover', 'commandHandlerContinue', "},Scene_Gameover['prototype']['isTriggered']"),
        ('Scene_Gameover', 'commandHandlerDave', "},Scene_Gameover['prototype']['commandHandlerContinue']"),
        ('Scene_Gameover', 'commandHandlerTitle', "},Scene_Gameover['prototype']['daveButtonEnabled']"),
        ('Scene_Gameover', 'daveButtonEnabled', "},Scene_Gameover['prototype']['commandHandlerDave']"),
        ('Scene_Gameover', 'loadLastSave', "},Scene_Gameover['prototype']['onLoadSuccess']"),
        ('Scene_Gameover', 'onLoadFailure', "},Scene_Gameover['prototype']['terminate']"),
    ]:
        anchor = f"{target}['prototype']['{name}']=function("
        result[f'{target}.{name}'] = between(menu, anchor, tail) + '};'
    result['SceneManager.onSceneStart'] = between(manager, 'SceneManager.onSceneStart = function(', '\n};') + '\n};'
    result['Scene_Base.updateFade'] = between(scenes, 'Scene_Base.prototype.updateFade = function(', '\n};') + '\n};'
    for name in ('_onWindowResize', '_updateAllElements', '_switchFullScreen'):
        result[f'Graphics.{name}'] = between(core, f'Graphics.{name} = function(', '\n};') + '\n};'
    result['resizeMarkers'] = (ROOT / 'src/runtime/resize-markers.js').read_text(encoding='utf8')
    for name, tail in [
        ('_onKeyDown', "},SceneManager['onKeyDown']"),
        ('_cancelFullScreen', "},Graphics['_resizeNwjsToExactScaleWhenWindowed']"),
        ('_resizeNwjsToExactScaleWhenWindowed', '},0x280)'),
        ('_resizeNwjsToExactScale', "},Graphics['_requestFullScreen'])"),
        ('_requestFullScreen', "},Graphics['_isFullScreen']"),
        ('_isFullScreen', '},function('),
    ]:
        result[f'Graphics.{name}'] = between(native_window, f"Graphics['{name}']=function(", tail) + '};'
    result['Window_Selectable.initialize'] = between(general, "Window_Selectable['prototype']['initialize']=function(",
        "},Window_Selectable['prototype']['refreshCursor']") + '};'
    print(json.dumps(result))


if __name__ == '__main__':
    main()
