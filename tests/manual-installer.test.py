"""Exact manual supplement on a stock local mirror; never execute the game."""
import argparse,ctypes,hashlib,json,os,shutil,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'));import install

def sha(file):
    with file.open('rb')as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('stage',type=Path);parser.add_argument('mirror',type=Path);args=parser.parse_args()
    stage=args.stage.resolve(strict=True);base=args.mirror.resolve()
    if base.exists()or base.is_relative_to(ROOT)or base.drive.casefold()!='c:':raise ValueError('Use a fresh outside-Git C: mirror')
    base.mkdir(parents=True);game=base/'steamapps/common/Wendy Qu\u00ebst & manual';game.mkdir(parents=True)
    package=stage/'manual';exe=package/'WendyQuestAccessManual.exe';release=json.loads((stage/'release.json').read_text())
    _,originals,_=install.read_recovery(install.GAME)
    for key in set(release['inputs'])|set(release['runtime'])|set(release['plan']['stock']):
        target=game/key;target.parent.mkdir(parents=True,exist_ok=True)
        if key in release['plan']['stock']:target.write_bytes(originals[Path(key)])
        elif key=='WendyQuest.exe':shutil.copyfile(install.GAME/key,target)
        else:os.link(install.GAME/key,target)
    manifest=base/'steamapps/appmanifest_3339970.acf'
    manifest.write_text(f'"appid" "3339970"\n"buildid" "26578620"\n"StateFlags" "4"\n"installdir" "{game.name}"\n',encoding='utf8')
    saves=game/'package.nw/save';saves.mkdir();(saves/'sentinel.rmmzsave').write_bytes(b'manual test save');(saves/'config.rmmzsave').write_bytes(b'manual test settings')
    temp=base/'temporary';temp.mkdir();work=base/'work';work.mkdir()
    env=dict(os.environ,TEMP=str(temp),TMP=str(temp),NODE_OPTIONS='--require=WQA_MUST_NOT_LOAD',NODE_PATH='WQA_MUST_NOT_LOAD')
    checks=[]
    def snapshot():return {p.relative_to(game).as_posix():sha(p)for p in game.rglob('*')if p.is_file()}
    def run(action,ok=True):
        report=base/'result.json';report.unlink(missing_ok=True)
        result=subprocess.run([str(exe),'--'+action,'--game',str(game),'--work-root',str(work),'--report',str(report)],env=env,text=True,encoding='utf8',capture_output=True,timeout=180)
        data=json.loads(report.read_text());assert data['ok']==ok and (result.returncode==0)==ok,(action,data,result.stdout,result.stderr)
        assert 'Checking GitHub'not in result.stdout and 'Downloading and verifying'not in result.stdout
        assert not list(work.iterdir());checks.append({'action':action,'ok':ok,'message':data['message']});print('Manual:',action,'passed'if ok else 'safely refused',flush=True);return data
    before=snapshot();payload=package/Path(json.loads((stage/'manual.json').read_text())['payloadFile']);held=payload.with_suffix('.held')
    payload.rename(held)
    try:assert 'Keep the payload ZIP' in run('install',False)['message'];assert snapshot()==before
    finally:held.rename(payload)
    original=payload.read_bytes();damaged=bytearray(original);damaged[10]^=1;payload.write_bytes(damaged)
    try:assert 'SHA-256' in run('install',False)['message'];assert snapshot()==before
    finally:payload.write_bytes(original)
    correct=manifest.read_bytes();manifest.write_bytes(correct.replace(b'26578620',b'00000000'))
    try:run('install',False);assert snapshot()==before
    finally:manifest.write_bytes(correct)
    kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_void_p];kernel.CreateFileW.restype=ctypes.c_void_p;kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    lease=kernel.CreateFileW(str(game/'WendyQuest.exe'),0x80000000,0,None,3,0,None);assert lease!=ctypes.c_void_p(-1).value
    try:run('install',False);assert snapshot()==before
    finally:kernel.CloseHandle(lease)
    # Test actual command-file quoting from another directory, including an
    # ampersand/Unicode game path. Only copied launcher bytes are locked above.
    done=subprocess.run(['cmd.exe','/d','/c',str(package/'Install.cmd'),str(game)],cwd=base,input='\n',text=True,encoding='utf8',env=env,capture_output=True,timeout=180)
    assert done.returncode==0,(done.stdout,done.stderr);first=snapshot()
    for key,value in {**release['plan']['patched'],**{str(k).replace('\\','/'):v for k,v in install.owned_files(release['plan']).items()}}.items():assert first[key]==value,key
    assert json.loads((game/'WendyQuestAccess-release.json').read_text())['archiveSha256']==sha(payload)
    payload.rename(held)
    try:assert run('install')['alreadyCurrent'];run('verify');assert snapshot()==first
    finally:held.rename(payload)
    # Adopt an existing recognized install without downloading/duplicating it.
    (game/'WendyQuestAccess-release.json').unlink();run('install');assert snapshot()==first
    file=game/'package.nw/wendyquest-access/speech-worker.cjs';known=file.read_bytes();file.unlink();run('install');assert snapshot()==first
    file.write_bytes(b'externally changed');changed=snapshot();run('install',False);assert snapshot()==changed;file.write_bytes(known)
    unknown=game/'package.nw/wendyquest-access/keep-me.txt';unknown.write_bytes(b'unknown');changed=snapshot();run('uninstall',False);assert snapshot()==changed;unknown.unlink()
    receipt=game/'WendyQuestAccess-release.json';known_receipt=receipt.read_bytes();newer=json.loads(known_receipt);newer['version']='99.0.0';receipt.write_text(json.dumps(newer))
    changed=snapshot();assert 'newer mod version' in run('install',False)['message'];assert snapshot()==changed;receipt.write_bytes(known_receipt)
    online=ROOT/'dist/WendyQuestAccessSetup.exe';report=base/'online-verify.json'
    done=subprocess.run([str(online),'--verify','--game',str(game),'--work-root',str(work),'--report',str(report)],env=env,timeout=180)
    assert done.returncode==0 and json.loads(report.read_text())['ok'] and snapshot()==first
    # Prompted removal exercises the no-argument .cmd route and its pause.
    done=subprocess.run(['cmd.exe','/d','/c',str(package/'Remove.cmd')],cwd=base,input=str(game)+'\n\n',text=True,encoding='utf8',env=env,capture_output=True,timeout=180)
    assert done.returncode==0,(done.stdout,done.stderr);assert snapshot()==before
    print('Manual package: command-file install/prompted removal, exact files, offline current/verify with missing ZIP, existing install/repair, corruption/build/lock/foreign/downgrade protection, original recovery, online interoperability and unchanged save/settings sentinels pass.')
    (base/'evidence.json').write_text(json.dumps({'passed':True,'manualSource':json.loads((stage/'manual.json').read_text())['source'],'payloadSource':release['source'],'checks':checks,'commandFiles':True,'onlineInteroperability':True,'gameStarted':False,'payloadFiles':len(release['plan']['payload']),'nativeFiles':len(release['plan']['patched']),'geometryFiles':len(release['plan']['geometry'])},indent=2))

if __name__=='__main__':main()
