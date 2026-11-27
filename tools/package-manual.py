"""Build an offline manual ZIP around an immutable published payload."""
import argparse,hashlib,json,os,re,runpy,shutil,subprocess,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sha=lambda data:hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--payload',required=True,type=Path)
    parser.add_argument('--sha256',required=True)
    parser.add_argument('--stage',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    if not os.environ.get('CODEX_BUILD_JOB_NAME'):raise ValueError('Use the bounded build runner')
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True):raise ValueError('Commit the manual release source first')
    payload=args.payload.resolve(strict=True);stage=args.stage.resolve();output=args.output.resolve()
    if stage.exists()or output.exists():raise ValueError('Use fresh staging/output')
    if stage.drive.casefold()!='c:'or stage.is_relative_to(ROOT):raise ValueError('Keep staging outside Git on C:')
    if payload.stat().st_size>64*1024*1024:raise ValueError('Payload exceeds its bound')
    data=payload.read_bytes()
    if not re.fullmatch('[a-f0-9]{64}',args.sha256)or sha(data)!=args.sha256:raise ValueError('Published payload fingerprint differs')
    with zipfile.ZipFile(payload)as archive:
        names=archive.namelist()
        if len(names)>128 or len(names)!=len(set(n.casefold()for n in names))or sum(i.file_size for i in archive.infolist())>64*1024*1024:raise ValueError('Ambiguous or oversized archive entries')
        release_bytes=archive.read('release.json');release=json.loads(release_bytes)
        if release['schema']!=2 or release['development']or not re.fullmatch(r'\d+\.\d+\.\d+',release['version']):raise ValueError('Expected stable release')
        if set(names)!=set(release['files'])|{'release.json'}:raise ValueError('Unexpected payload inventory')
        for name,expected in release['files'].items():
            info=archive.getinfo(name)
            if not 0<info.file_size<=32*1024*1024 or sha(archive.read(name))!=expected:raise ValueError('Changed payload file: '+name)
        for name in ('engine.cjs','WendyQuestInstallRuntime.exe'):
            if release['controlFiles'][name]!=release['files'][name]:raise ValueError('Offline control identity differs')
        # Same canonical guide conversion as the online builder. Frozen online
        # payload bytes stay intact; the manual supplement has its own source.
        builder=runpy.run_path(str(ROOT/'tools/package-release.py'))
        for target in (stage,output,payload):builder['install'].check_path(target)
        guide=builder['text_readme']()
        stage.mkdir(parents=True);package=stage/'manual';package.mkdir()
        source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        descriptor={'schema':1,'version':release['version'],'source':source,'payloadFile':payload.name,'payloadSize':len(data),'payloadSha256':args.sha256}
        config=stage/'release.json';config.write_bytes(release_bytes)
        meta=stage/'manual.json';meta.write_text(json.dumps(descriptor,indent=2)+'\n',encoding='utf8')
        controls=stage/'control.zip'
        with zipfile.ZipFile(controls,'w',zipfile.ZIP_DEFLATED)as control:
            for name in release['controlFiles']:control.writestr(name,archive.read(name))
        (package/'ReadMe.txt').write_bytes(guide)
        (package/'ThirdPartyNotices.txt').write_bytes(archive.read('payload/wendyquest-access/ThirdPartyNotices.txt'))
    shutil.copyfile(payload,package/payload.name)
    for label,action in [('Install','install'),('Verify','verify'),('Remove','uninstall')]:
        lines=['@echo off','setlocal DisableDelayedExpansion','if "%~1"=="" (',
               '  "%~dp0WendyQuestAccessManual.exe" --'+action,') else (',
               '  "%~dp0WendyQuestAccessManual.exe" --'+action+' --game "%~1"',')',
               'set "wqa_result=%errorlevel%"','echo.','pause','exit /b %wqa_result%','']
        (package/(label+'.cmd')).write_bytes('\r\n'.join(lines).encode('ascii'))
    assembly=stage/'AssemblyInfo.cs';assembly.write_text('using System.Reflection;\n'
        '[assembly: AssemblyTitle("Wendy Quest Screen Reader manual installation")]\n'
        '[assembly: AssemblyVersion("1.0.0.0")]\n[assembly: AssemblyFileVersion("1.0.0.0")]\n'
        f'[assembly: AssemblyInformationalVersion("1.0.0+{source}")]\n',encoding='utf8')
    exe=package/'WendyQuestAccessManual.exe';compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework/v4.0.30319/csc.exe'
    command=[str(compiler),'/nologo','/target:exe','/platform:x64','/optimize+','/warnaserror+',
             '/main:WendyQuestAccessInstaller.ManualProgram','/out:'+str(exe),'/win32manifest:'+str(ROOT/'installer/app.manifest'),
             '/resource:'+str(config)+',release.json','/resource:'+str(meta)+',manual.json',
             '/resource:'+str(controls)+',control.zip','/resource:'+str(package/'ReadMe.txt')+',ReadMe.txt',
             *['/reference:'+name+'.dll'for name in ['System','System.Core','System.Drawing','System.Windows.Forms','System.IO.Compression','System.IO.Compression.FileSystem','System.Web.Extensions']],
             *map(str,sorted((ROOT/'installer').glob('*.cs'))),str(assembly)]
    subprocess.run(command,cwd=ROOT,check=True,timeout=120)
    files={p.name:sha(p.read_bytes())for p in sorted(package.iterdir())}
    (package/'SHA256SUMS.txt').write_text(''.join(value+'  '+name+'\n'for name,value in files.items()),encoding='ascii')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as archive:
        for file in sorted(package.iterdir()):archive.write(file,file.name)
    result={'source':source,'payloadSource':release['source'],'version':release['version'],'archive':str(output),'sha256':sha(output.read_bytes()),
            'size':output.stat().st_size,'files':files,'publishedPayloadUnchanged':args.sha256,'manualExecutableSha256':files[exe.name]}
    (stage/'receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8');print(json.dumps(result))

if __name__=='__main__':main()
