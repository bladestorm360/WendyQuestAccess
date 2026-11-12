"""Load the installed input and scene-owner methods into an offline fixture."""

import json
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parents[1]
producer_tools = runpy.run_path(str(ROOT / 'tests' / 'file-producers.py'))
between = producer_tools['between']
decode = producer_tools['load_decoder']()


def input_methods(installed):
    plugins = installed / 'package.nw/js/plugins'
    custom, _ = decode((plugins / 'InputAdjustments.js').read_text(encoding='utf-8-sig'))
    return [between(custom, start, end) + '};' for start, end in (
        ("Input['keyMapper']={", "},Input['gamepadMapper']"),
        ("Input['gamepadMapper']={", "},Input['initialize']"),
        ("Input['_onKeyDown']=function(", "},Input['_updateGamepadState']"),
        ("Input['_updateGamepadState']=function(", "},TouchInput['update']"),
    )]


def main():
    installed = Path(sys.argv[1])
    js = installed / 'package.nw/js'
    core = (js / 'rmmz_core.js').read_text(encoding='utf8')
    manager = (js / 'rmmz_managers.js').read_text(encoding='utf8')
    custom, _ = decode((js / 'plugins/MonkeyWrenchMZ.js').read_text(encoding='utf-8-sig'))
    methods = input_methods(installed)
    for source, names in ((core, ['Input.clear', 'Input.update', 'Input._pollGamepads', 'Utils.isOptionValid']),
                          (manager, ['SceneManager.showDevTools'])):
        methods.extend(between(source, f'\n{name} = function(', '\n};') + '\n};' for name in names)
    for target, name, tail in (
        ('SceneManager', 'updateScene', "},SceneManager['isGameActive']"),
        ('SceneManager', 'onKeyDown', "},Graphics['_createGraphicsDebug']"),
        ('Graphics', '_onKeyDown', "},SceneManager['onKeyDown']"),
    ):
        methods.append(between(custom, f"{target}['{name}']=function(", tail) + '};')
    print(json.dumps(methods))


if __name__ == '__main__':
    main()
