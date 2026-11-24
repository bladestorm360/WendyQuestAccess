"""Run source-free settings UI checks in the pinned isolated NW runtime."""
import json,os,runpy,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if not os.environ.get('CODEX_BUILD_JOB_NAME'):raise SystemExit('Use the bounded runner')
archive=ROOT/'.deps/nwjs-v0.48.4-win-x64.zip'
work=Path(sys.argv[1]).resolve(strict=True)
if any((p/'.git').exists() for p in [work,*work.parents]):raise SystemExit('Scratch must stay outside Git')
nw=runpy.run_path(str(ROOT/'tests/nw-smoke.py'))
with tempfile.TemporaryDirectory(prefix='secret-island-menu-',dir=work) as folder:
 runtime=Path(folder);nw['unpack'](archive,runtime)
 app=runtime/'package.nw';app.mkdir()
 (app/'package.json').write_text(json.dumps({'name':'wqa-secret-island-ui-test','main':'index.html','window':{'show':False}}))
 receipt=app/'receipt.json'
 module=str(ROOT/'tests/secret-island-settings.cjs').replace('\\','/')
 script="const fs=require('fs');const target="+json.dumps(str(receipt))+";async function run(){try{const result=await require("+json.dumps(module)+").verify(window);fs.writeFileSync(target,JSON.stringify(result));}catch(e){fs.writeFileSync(target,JSON.stringify({error:e.stack}));}finally{nw.App.quit();}};run();"
 (app/'index.html').write_text('<html><body><script>'+script+'</script></body></html>',encoding='utf-8')
 result,errors=nw['run_fixture']([str(runtime/'nw.exe'),f'--user-data-dir={runtime/"profile"}'],runtime,dict(os.environ))
 if not receipt.exists():raise RuntimeError(f'No UI receipt; exit{result}: {errors!r}')
 data=json.loads(receipt.read_text())
 if result or data.get('error'):raise RuntimeError(data)
 print(json.dumps(data))
