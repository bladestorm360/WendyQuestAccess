"""Return only the pinned native filter methods needed by the detached fixture."""
import ast,json,re,runpy,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
s,_=runpy.run_path(str(root/'tools/inspect-plugin.py'))['decode']((Path(sys.argv[1])/'package.nw/js/plugins/FilterControllerMZ.js').read_text(encoding='utf-8'))
def body(marker):
 start=s.index(marker);pos=s.index('{',start);depth=0;quote=None;escape=False
 for end in range(pos,len(s)):
  c=s[end]
  if quote:
   if escape:escape=False
   elif c=='\\':escape=True
   elif c==quote:quote=None
  elif c in "'\"`":quote=c
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if not depth:return s[s.index('function',start):end+1]
 raise ValueError('Unclosed pinned function')
methods={name:body("Filter_Controller['prototype']['"+name+"']=function")for name in ['initialize','initBasic','initFilterParam','resetTarget','createFilter','updateFilter','isErased','erase']}
for owner,names in {'Game_Map':['createFilter','getFilterController','eraseFilter'],'Scene_Map':['updateTKMfilters']}.items():
 for name in names:methods[owner+'.'+name]=body(owner+"['prototype']['"+name+"']=function")
methods['glitchHandler']=body("_0x27f6fa['glitch']=function")
methods['apply']=body("['applyTKMFilterToTarget']=function")
methods['remove']=body("['removeTKMFilterFromTarget']=function")
value=re.search(r"\['glitch'\]=(\[[0-9a-fx,.-]+\])",s).group(1)
params=[int(x,16)if x.startswith('0x')else float(x)for x in value[1:-1].split(',')]
print(json.dumps({'methods':methods,'params':params}))
