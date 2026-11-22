"""Create a local game-source-free Windows installer. Never tag or publish."""
import argparse,hashlib,json,os,re,runpy,shutil,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install,registration
assets=runpy.run_path(str(ROOT/'tools/release-assets.py'))
sha=lambda data:hashlib.sha256(data).hexdigest()
def file_sha(file):
    with file.open('rb') as source:return hashlib.file_digest(source,'sha256').hexdigest()
def inventory(root):return {p.relative_to(root).as_posix():sha(p.read_bytes()) for p in sorted(root.rglob('*')) if p.is_file()}
def text_readme():
    text=(ROOT/'README.md').read_text(encoding='utf8')
    text=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'\1 (\2)',text)
    text=re.sub(r'^#{1,6} ', '', text,flags=re.M).replace('**','').replace('`','')
    # One canonical guide. Tables become labeled rows for plain-text readers.
    lines=[];labels=None
    for line in text.splitlines():
        if line.startswith('|'):
            fields=[v.strip() for v in line.strip('|').split('|')]
            if fields[0].startswith('---'):continue
            if labels is None:labels=fields;continue
            lines.append('; '.join(label+': '+value for label,value in zip(labels,fields)))
        else:labels=None;lines.append(line)
    text='\r\n'.join(lines)+'\r\n';text.encode('ascii');return text.encode('ascii')
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',required=True);parser.add_argument('--stage',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path);parser.add_argument('--development',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-(?:dev|test-build)(?:\.\d+)?)?',args.version):raise ValueError('Use a numeric version with optional -dev/-test-build channel')
    dirty=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True)
    if dirty and not(args.development and '-dev' in args.version):raise ValueError('Commit all release work first')
    stage=args.stage.resolve();output=args.output.resolve()
    if stage.exists() or output.exists():raise ValueError('Release output already exists; preserve or explicitly clean its disposable staging first')
    if stage.drive.casefold()!='c:' or stage.is_relative_to(ROOT):raise ValueError('Keep generated game data outside Git under the C: analysis workspace')
    install.check_path(stage);install.check_path(output);stage.mkdir(parents=True)
    payload=ROOT/'.build/payload';files=inventory(payload)
    if not install.REQUIRED_PAYLOAD<=files.keys() or any(not(k=='js/plugins/WendyQuestAccess.js' or k.startswith('wendyquest-access/')) for k in files):raise ValueError('Incomplete or unexpected payload')
    old,originals,_=install.read_recovery(install.GAME)
    registration.verify_dependencies(lambda relative,limit:install.read(install.GAME/relative,limit))
    recipes={p.as_posix():assets['native_recipe'](originals[p],fn,p==registration.REGISTRY_REL) for p,fn in registration.TRANSFORMS.items()}
    geometry=install.verify_geometry(install.GAME,install.GAME/install.PACKAGE/install.GEOMETRY)
    plan={'build':install.BUILD,'stock':{p.as_posix():sha(data) for p,data in originals.items()},
          'patched':{key:value['result'] for key,value in recipes.items()},'payload':files,'geometry':geometry}
    install.validate_plan(json.dumps(plan).encode())
    package=stage/'package';package.mkdir();shutil.copytree(payload,package/'payload')
    (package/'recipes.json').write_text(json.dumps(recipes,separators=(',',':')),encoding='utf8')
    baker,modules=assets['baker_bundle'](ROOT);(package/'bake.cjs').write_bytes(baker)
    shutil.copyfile(ROOT/'installer/engine.cjs',package/'engine.cjs')
    shutil.copyfile(ROOT/'.build/installer/WendyQuestInstallRuntime.exe',package/'WendyQuestInstallRuntime.exe')
    inputs={p.as_posix():v for p,v in {**registration.DEPENDENCIES,**install.PINNED}.items()}
    manifest=json.loads((install.GAME/install.PACKAGE/install.GEOMETRY/'manifest.json').read_text())
    for key,item in manifest['maps'].items():inputs[f'package.nw/data/Map{int(key):03}.json']=item['input']
    for key,file in [('tilesets','Tilesets.json'),('commonEvents','CommonEvents.json'),('mapInfos','MapInfos.json')]:inputs['package.nw/data/'+file]=manifest[key]
    runtime={name:file_sha(install.GAME/name) for name in ['node.dll','nw.dll','nw_elf.dll','ffmpeg.dll','v8_context_snapshot.bin']}
    release={'schema':1,'version':args.version,'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
             'development':bool(dirty),'build':install.BUILD,'plan':plan,'inputs':inputs,'runtime':runtime,
             'files':inventory(package),'bakerModules':modules}
    config=stage/'release.json';config.write_text(json.dumps(release,sort_keys=True,indent=2)+'\n',encoding='utf8')
    zipped=stage/'payload.zip'
    with zipfile.ZipFile(zipped,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as zip:
        for p in sorted(package.rglob('*')):
            if p.is_file():zip.write(p,p.relative_to(package).as_posix())
    readme=stage/'ReadMe.txt';readme.write_bytes(text_readme())
    notices=stage/'ThirdPartyNotices.txt';notices.write_text(
      'Wendy Quest Access - third-party notices\n\nOriginal mod implementation: bladestorm360.\n'
      'Game files, artwork, runtime and generated map geometry are not distributed.\n'
      'Navigation WAVs: author-owned FFPR Core default cue bank; pinned input hashes are retained in source.\n'
      'Voiced descriptions: original captions, Microsoft Zira Desktop synthesis, Opus encoding.\n\n'
      +'\n\n'.join(p.relative_to(payload).as_posix()+'\n'+p.read_text(encoding='utf8',errors='strict')
        for p in sorted(payload.rglob('*')) if p.is_file() and ('LICENSES' in p.parts or p.parent.name=='audio-deps' and p.suffix=='.txt'))+'\n',encoding='utf8')
    version=args.version.split('-')[0]+'.0'
    meta=stage/'AssemblyInfo.cs';meta.write_text('using System.Reflection;\n'
       '[assembly: AssemblyTitle("Wendy Quest Access installer")]\n'
       '[assembly: AssemblyProduct("Wendy Quest Access")]\n'
       f'[assembly: AssemblyVersion("{version}")]\n[assembly: AssemblyFileVersion("{version}")]\n'
       f'[assembly: AssemblyInformationalVersion("{args.version}+{release["source"]}")]\n',encoding='utf8')
    exe=stage/'WendyQuestAccessSetup.exe'
    compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework/v4.0.30319/csc.exe'
    command=[str(compiler),'/nologo','/target:winexe','/platform:x64','/optimize+','/warnaserror+',
      '/out:'+str(exe),'/win32manifest:'+str(ROOT/'installer/app.manifest'),
      '/resource:'+str(config)+',release.json','/resource:'+str(zipped)+',payload.zip','/resource:'+str(readme)+',ReadMe.txt',
      *['/reference:'+name+'.dll' for name in ['System','System.Core','System.Drawing','System.Windows.Forms','System.IO.Compression','System.IO.Compression.FileSystem','System.Web.Extensions']],
      str(ROOT/'installer/Setup.cs'),str(meta)]
    subprocess.run([sys.executable,str(ROOT/'tools/run-build.py'),'--memory-mb','512','--wait-seconds','180','--receipt',str(stage/'compiler-budget.json'),'--',*command],cwd=ROOT,check=True,timeout=240)
    output.parent.mkdir(parents=True,exist_ok=True)
    outer={'WendyQuestAccessSetup.exe':exe,'ReadMe.txt':readme,'ThirdPartyNotices.txt':notices}
    sums=stage/'SHA256SUMS.txt';sums.write_text(''.join(sha(p.read_bytes())+'  '+k+'\n' for k,p in outer.items()),encoding='ascii');outer['SHA256SUMS.txt']=sums
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as zip:
        for name,p in outer.items():zip.write(p,name)
    receipt={'source':release['source'],'development':release['development'],'version':args.version,'plan':sha(json.dumps(plan,sort_keys=True).encode()),
             'archive':str(output),'sha256':sha(output.read_bytes()),'size':output.stat().st_size,'payloadFiles':len(files),'geometryFiles':len(geometry),
             'nativeRecipes':len(recipes),'authoredLiterals':sum(op['length'] for r in recipes.values() for op in r['operations'] if op['kind']=='literal')}
    (stage/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8')
    print(json.dumps(receipt))
if __name__=='__main__':main()
