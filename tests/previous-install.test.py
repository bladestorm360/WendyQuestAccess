"""Verify a native-hook update can return to the exact prior local payload."""
import json,os,runpy,sys,tempfile
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install

def verify(stock,scratch,candidate,expected,backup):
 oldraw=(backup/install.PLAN).read_bytes();old=install.validate_plan(oldraw)
 assert install.inventory(backup/'native')==old['patched']
 assert install.inventory(backup/'payload')==old['payload']
 assert install.inventory(backup/'geometry')==old['geometry']
 helpers=runpy.run_path(str(ROOT/'tests/install.test.py'))
 with tempfile.TemporaryDirectory(prefix='wendy-previous-fixture-',dir=scratch)as folder:
  game=Path(folder)/'steamapps/common/Wendy Quest';helpers['mirror'](stock,game)
  originals,_=install.game_scripts(game)
  assert {p.as_posix():install.digest(v)for p,v in originals.items()}==old['stock']
  save=game/install.PACKAGE/'save/witness';save.parent.mkdir();save.write_bytes(b'unchanged save witness')
  trusted={}
  for relative in install.TRANSFORMS:
   oldbytes=install.read(backup/'native'/relative,install.MIB)
   def previous(source,original=originals[relative],target=oldbytes):
    if source!=original:raise ValueError('Previous-version original mismatch')
    return target
   trusted[relative]=previous
  with install.closed_game(game)as launcher:
   for version in ['old','new','old']:
    if version=='old':
     with patch.dict(install.TRANSFORMS,trusted):
      install.install(game,backup,install.digest(oldraw),payload=backup/'payload',launcher_hash=launcher)
    else:install.install(game,candidate,expected,launcher_hash=launcher)
    actual,recovery,raw=install.read_recovery(game)
    assert all(all(v.values())for v in install.inspect(game,actual))
    assert raw==(oldraw if version=='old'else(candidate/install.PLAN).read_bytes())
    assert recovery==originals and save.read_bytes()==b'unchanged save witness'
    install.restore(game,actual,recovery)
  assert all((game/path).read_bytes()==value for path,value in originals.items())
  assert not(game/install.RECOVERY).exists()
 print('Verified exact previous-version install, native-hook update, trusted rollback bytes, original recovery and unchanged save witness.')

if __name__=='__main__':
 if not os.environ.get('CODEX_BUILD_JOB_NAME'):raise SystemExit('Use the bounded build runner.')
 stock,scratch,candidate,expected,backup=sys.argv[1:]
 verify(install.check_path(Path(stock)),install.check_path(Path(scratch)),
        install.local_candidate(Path(candidate)),expected,install.check_path(Path(backup)))
