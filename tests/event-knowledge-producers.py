"""Extract the supported native save/termination methods in memory only."""
import json
from pathlib import Path
import runpy
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from registration import OBJECTS_REL, CORE_REL, objects_notification
between = runpy.run_path(str(ROOT / 'tests/file-producers.py'))['between']
stock = Path(sys.argv[1])
objects = objects_notification((stock / OBJECTS_REL).read_bytes()).decode('utf8')
core = (stock / CORE_REL).read_text(encoding='utf8')
result = {'terminate': between(objects, 'Game_Interpreter.prototype.terminate = function(', '\n};') + '\n};',
          'initialize': between(objects, 'Game_System.prototype.initialize = function(', '\n};') + '\n};',
          'json': core[core.index('function JsonEx()'):].strip()}
print(json.dumps(result))
