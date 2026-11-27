"""Check final package extraction and runtime isolation on a stock local mirror."""
import argparse,hashlib,json,os,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('stage',type=Path);parser.add_argument('game',type=Path);args=parser.parse_args()
 stage=args.stage.resolve();game=args.game.resolve()
 if not game.is_relative_to(Path(r'C:/Games/Dev/WendyQuestAccess-analysis')) or (game/'.wendyquest-access-recovery').exists():raise ValueError('Use a stock outside-Git analysis mirror')
 work=stage/'smoke-work';work.mkdir();exe=stage/'WendyQuestAccessSetup.exe'
 sha=lambda data:hashlib.sha256(data).hexdigest()
 def snapshot():return {p.relative_to(game).as_posix():sha(p.read_bytes()) for p in game.rglob('*') if p.is_file()}
 def run(action):
  report=stage/'smoke-result.json';report.unlink(missing_ok=True)
  env=dict(os.environ,NODE_OPTIONS='--require=WQA_MISSING_MODULE_MUST_NOT_EXECUTE',NODE_PATH='WQA_MISSING_PATH')
  command=[str(stage/'OnlineHarness.exe') if action=='install' else str(exe),'--'+action,'--game',str(game),'--work-root',str(work),'--report',str(report)]
  if action=='install':command+=['--fixture-package',str(stage/'payload.zip'),'--network-report',str(stage/'smoke-network.json')]
  subprocess.run(command,env=env,check=True,timeout=120)
  result=json.loads(report.read_text());assert result['ok'],result;assert not list(work.iterdir());return result
 before=snapshot();run('install');installed=snapshot();release=json.loads((stage/'release.json').read_text())
 expected={**release['plan']['patched'],**{'package.nw/'+k:v for k,v in release['plan']['payload'].items()},
           **{'package.nw/wendyquest-access-geometry/'+k:v for k,v in release['plan']['geometry'].items()}}
 for key,value in expected.items():assert installed[key]==value,key
 run('verify');assert snapshot()==installed
 payload=(stage/'control.zip').read_bytes();data=bytearray(exe.read_bytes());offset=data.find(payload);assert offset>=0
 with zipfile.ZipFile(stage/'control.zip')as archive:
  entry=archive.getinfo('engine.cjs');index=offset+entry.header_offset+30+len(entry.filename.encode())+entry.compress_size//2
 data[index]^=1;bad=stage/'DamagedSetup.exe';bad.write_bytes(data);report=stage/'damaged-result.json'
 result=subprocess.run([str(bad),'--verify','--game',str(game),'--work-root',str(work),'--report',str(report)],timeout=120)
 assert result.returncode!=0 and not json.loads(report.read_text())['ok'];assert snapshot()==installed and not list(work.iterdir());bad.unlink()
 run('uninstall');assert snapshot()==before
 subprocess.run([str(exe),'--self-test'],check=True,timeout=15)
 print('Final package: bounded extraction, exact fresh install/verify/removal, inherited Node options isolated, corrupted embedded script safely refused, named keyboard controls, no temporary residue.')
 (stage/'package-smoke.json').write_text(json.dumps({'passed':True,'source':release['source'],'gameStarted':False,'engineSha256':sha((stage/'package/engine.cjs').read_bytes())},indent=2))
if __name__=='__main__':main()
