"""Real standalone installer on an isolated, source-bearing local mirror only."""
import argparse,ctypes,hashlib,json,os,shutil,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));import install
hash=lambda data:hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('stage',type=Path);p.add_argument('mirror',type=Path);args=p.parse_args()
 stage=args.stage.resolve();base=args.mirror.resolve()
 if base.exists() or base.is_relative_to(ROOT) or base.drive.lower()!='c:':raise ValueError('Use a fresh analysis mirror outside Git')
 base.mkdir(parents=True);game=base/'steamapps/common/Wendy Q\u00fcest rehearsal';game.mkdir(parents=True)
 release=json.loads((stage/'release.json').read_text());exe=stage/'WendyQuestAccessSetup.exe';work=base/'work';work.mkdir()
 old,originals,_=install.read_recovery(install.GAME)
 def put(file,data):file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
 for key in sorted(set(release['inputs'])|set(release['runtime'])|set(release['plan']['stock'])):
  target=game/key;target.parent.mkdir(parents=True,exist_ok=True)
  if key in release['plan']['stock']:target.write_bytes(originals[Path(key)])
  else:os.link(install.GAME/key,target)
 put(base/'steamapps/appmanifest_3339970.acf',f'"appid" "3339970"\n"buildid" "26578620"\n"StateFlags" "4"\n"installdir" "{game.name}"\n'.encode())
 saves=game/'package.nw/save';put(saves/'sentinel.rmmzsave',b'private save sentinel');put(saves/'config.rmmzsave',b'private preferences sentinel')
 def snapshot():return {p.relative_to(game).as_posix():hash(p.read_bytes()) for p in game.rglob('*') if p.is_file()}
 def run(action,ok=True,package=None,network=None):
  report=base/'result.json';report.unlink(missing_ok=True)
  command=[str(stage/'OnlineHarness.exe') if action=='install' else str(exe),'--'+action,'--game',str(game),'--work-root',str(work),'--report',str(report)]
  if action=='install':command+=['--fixture-package',str(package or stage/'payload.zip'),'--network-report',str(base/'network.json')]
  done=subprocess.run(command,timeout=120)
  if network is not None:assert json.loads((base/'network.json').read_text())==dict(zip(['checks','fetches'],network))
  result=json.loads(report.read_text());assert result['ok']==ok,(action,result)
  assert (done.returncode==0)==ok,(done.returncode,result)
  assert not list(work.iterdir()),'Installer temporary data must be removed'
  print('Installer check:',action,'accepted' if ok else 'safely refused',flush=True)
  return result
 subprocess.run([str(exe),'--self-test'],check=True,timeout=15)
 before=snapshot();run('verify',False);assert snapshot()==before
 manifest=base/'steamapps/appmanifest_3339970.acf';correct=manifest.read_bytes()
 manifest.write_bytes(correct.replace(b'26578620',b'00000000'));run('install',False);assert snapshot()==before;manifest.write_bytes(correct)
 runtime=game/'nw_elf.dll';runtime.unlink();runtime.write_bytes(b'unsupported runtime')
 changed=snapshot();run('install',False);assert snapshot()==changed;runtime.unlink();os.link(install.GAME/'nw_elf.dll',runtime)
 kernel=ctypes.WinDLL('kernel32',use_last_error=True)
 kernel.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p]
 kernel.CreateFileW.restype=ctypes.c_void_p;kernel.CloseHandle.argtypes=[ctypes.c_void_p]
 lease=kernel.CreateFileW(str(game/'WendyQuest.exe'),0x80000000,0,None,3,0,None);assert lease!=ctypes.c_void_p(-1).value
 try:run('install',False)
 finally:kernel.CloseHandle(lease)
 assert snapshot()==before
 # Corrupt an embedded authored script, preserving the PE/CLR shell. Integrity
 # must fail before any game mutation, even if decompression still succeeds.
 import zipfile
 data=bytearray(exe.read_bytes());payload=(stage/'control.zip').read_bytes();offset=data.find(payload);assert offset>=0
 with zipfile.ZipFile(stage/'control.zip')as zip:
  entry=zip.getinfo('engine.cjs');where=offset+entry.header_offset+30+len(entry.filename.encode())+entry.compress_size//2
 data[where]^=1;bad=base/'DamagedSetup.exe';bad.write_bytes(data)
 report=base/'damaged-result.json';done=subprocess.run([str(bad),'--verify','--game',str(game),'--work-root',str(work),'--report',str(report)],timeout=120)
 assert done.returncode!=0 and not json.loads(report.read_text())['ok'];assert snapshot()==before and not list(work.iterdir());bad.unlink()
 print('Unsupported build/runtime, launcher lease and embedded payload corruption are safely refused.',flush=True)
 run('install',network=(1,1));first=snapshot()
 result=run('install',network=(1,0));assert result['alreadyCurrent'] and snapshot()==first
 assert (game/'package.nw/wendyquest-access/ReadMe.txt').read_bytes()==(stage/'ReadMe.txt').read_bytes()
 expected={**release['plan']['patched'],**install.owned_files(release['plan'])}
 for key,sha in expected.items():assert first[str(key).replace('\\','/')]==sha,key
 run('verify');assert snapshot()==first
 # Repair only missing owned files; changed/unknown files are never replaced.
 file=game/'package.nw/wendyquest-access/speech-worker.cjs';file.unlink();run('install',network=(1,1));assert snapshot()==first
 file.write_bytes(b'externally modified');blocked=snapshot();run('install',False);assert snapshot()==blocked
 file.write_bytes((stage/'package/payload/wendyquest-access/speech-worker.cjs').read_bytes())
 unknown=game/'package.nw/wendyquest-access/keep-me.txt';unknown.write_bytes(b'unknown');blocked=snapshot();run('uninstall',False);assert snapshot()==blocked;unknown.unlink()
 # A later compatible payload uses the unchanged shell; no fixture bypass is
 # present in the shipped EXE. Only original authored mod bytes are changed.
 advanced=base/'WendyQuestAccess-0.5.1-payload.zip'
 with zipfile.ZipFile(stage/'payload.zip')as archive:parts={key:archive.read(key)for key in archive.namelist()}
 newer=json.loads(parts['release.json']);newer['version']='0.5.1'
 key='payload/js/plugins/WendyQuestAccess.js';parts[key]+=b'\n// Compatible update fixture.\n'
 newer['files'][key]=hash(parts[key]);newer['plan']['payload'][key[8:]]=hash(parts[key])
 parts['release.json']=(json.dumps(newer,sort_keys=True,indent=2)+'\n').encode()
 with zipfile.ZipFile(advanced,'w',zipfile.ZIP_DEFLATED)as archive:
  for key,data in parts.items():archive.writestr(key,data)
 # Real engine with one injected crash, outside the distributed package. This
 # does not add a fault switch to the production executable or engine.
 crash=base/'crash-runtime';crash.mkdir()
 with zipfile.ZipFile(advanced)as archive:archive.extractall(crash)
 shutil.copyfile(install.GAME/'v8_context_snapshot.bin',crash/'v8_context_snapshot.bin')
 engine=(crash/'engine.cjs').read_text();needle='else write(file,data);'
 assert engine.count(needle)==1
 (crash/'engine.cjs').write_text(engine.replace(needle,needle+"if(item.key===installedRelease)process.exit(72);"),encoding='utf8')
 crashwork=base/'crash-work';crashwork.mkdir()
 (crashwork/'download.json').write_text(json.dumps({'schema':1,'tag':'v0.5.1','sha256':hash(advanced.read_bytes())}))
 subprocess.run([str(crash/'WendyQuestInstallRuntime.exe'),str(game),str(crash/'engine.cjs'),'install',str(game),str(crashwork)],cwd=crash,timeout=120)
 assert (game/'.wendyquest-access-transaction/journal.json').is_file()
 assert snapshot()!=first
 assert json.loads((game/'WendyQuestAccess-release.json').read_text())['version']=='0.5.1'
 run('verify');assert snapshot()==first,'Interrupted update must fully restore its previous installation'
 run('install',package=advanced,network=(1,1));second=snapshot();assert second!=first
 result=run('install',package=advanced,network=(1,0));assert result['alreadyCurrent'] and snapshot()==second
 run('install',False,network=(1,0));assert snapshot()==second,'No downgrade/download'
 run('uninstall');assert snapshot()==before
 run('install',network=(1,1));assert snapshot()==first
 # Earliest staging interruptions contain no game mutations.
 transaction=game/'.wendyquest-access-transaction';(transaction/'backup').mkdir(parents=True);run('verify');assert snapshot()==first
 # Interrupted partial backup staging and malicious journal target are safe.
 transaction=game/'.wendyquest-access-transaction';(transaction/'backup').mkdir(parents=True)
 entry={'key':'package.nw/wendyquest-access/speech-worker.cjs','old':hash(file.read_bytes()),'next':hash(file.read_bytes()),'backup':'0.bin','intermediate':None}
 (transaction/'journal.json').write_text(json.dumps({'schema':1,'phase':'staging','entries':[entry]}));(transaction/'backup/0.bin.wqa-new').write_bytes(b'partial staging')
 run('verify');assert snapshot()==first
 (transaction/'backup').mkdir(parents=True);entry['key']='package.nw/save/sentinel.rmmzsave'
 (transaction/'journal.json').write_text(json.dumps({'schema':1,'phase':'applying','entries':[entry]}));blocked=snapshot();run('verify',False);assert snapshot()==blocked
 (transaction/'journal.json').unlink();(transaction/'backup').rmdir();transaction.rmdir()
 # Upgrade from the actual prior local release, then remove reversibly.
 run('uninstall');assert snapshot()==before
 for key in old['patched']:put(game/key,(install.GAME/key).read_bytes())
 for key in install.owned_files(old):put(game/key,(install.GAME/key).read_bytes())
 shutil.copytree(install.GAME/install.RECOVERY,game/install.RECOVERY)
 run('install');run('verify');assert snapshot()==first
 run('uninstall');assert snapshot()==before
 print('Standalone installer: accessible controls; fresh install; exact verify; missing-file repair; changed/unknown preservation; real mid-update crash rollback; empty staging recovery; old-release upgrade; uninstall; Unicode/spaces; save/preferences preservation; no temporary residue.')
 (base/'evidence.json').write_text(json.dumps({'passed':True,'source':release['source'],'version':release['version'],'files':len(first),'noDownload':True,'compatibleUpdate':True,'receiptRollback':True,'gameStarted':False},indent=2))
if __name__=='__main__':main()
