"""Extract only the pinned native reward producer and its command dispatch into memory."""
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'tests/file-producers.py'))
from registration import OBJECTS_REL, STATS_REL, STATS_SHA, objects_notification
import hashlib

game = Path(sys.argv[1])
objects = objects_notification((game / OBJECTS_REL).read_bytes()).decode('utf8')
stock = (game / STATS_REL).read_bytes()
assert hashlib.sha256(stock).hexdigest() == STATS_SHA
decoded, _ = helpers['load_decoder']()(stock.decode('utf-8-sig'))
between = helpers['between']
# The decoder name is resolved from this source, never copied into a fixture.
register = between(decoded, "PluginManager['registerCommand']('WendyQuest','ShowRewardTokens'", ",PluginManager['registerCommand']")
start = "WendyQuest['ShowRewardTokenAnimation']=function"
producer = between(decoded, start, ",WendyQuest['_tokenCount']")
import re
symbols = set(re.findall(r'\bvar \w+=(\w+);', register + producer))
bootstrap = ''.join('var ' + symbol + ' = null;\n' for symbol in symbols)
print(json.dumps({'command': between(objects, 'Game_Interpreter.prototype.command357 = function', '\n};') + '\n};',
                  'reward': bootstrap + register + ';\n' + producer + ';'}))
