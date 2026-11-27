using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
namespace WendyQuestAccessInstaller {
 static class OnlineTests {
  static int checks;
  static void Expect(bool value,string name){if(!value)throw new Exception(name);checks++;}
  static void Reject(Action action,string name){try{action();}catch(Exception){checks++;return;}throw new Exception("Accepted "+name);}
  static byte[] Bytes(string value){return Encoding.UTF8.GetBytes(value);}
  static Dictionary<string,object> Copy(Dictionary<string,object> value){return(Dictionary<string,object>)Setup.Json.DeserializeObject(Setup.Json.Serialize(value));}
  internal static GitHubRelease Latest(byte[] bytes,string version) {
   string tag="v"+version,name="WendyQuestAccess-"+version+"-payload.zip";
   var value=new{draft=false,prerelease=false,tag_name=tag,assets=new[]{new{name=name,state="uploaded",size=bytes.Length,
    browser_download_url="https://github.com/"+GitHubUpdates.Repository+"/releases/download/"+tag+"/"+name,digest="sha256:"+Setup.HashBytes(bytes)}}};
   return GitHubUpdates.ParseLatest(Setup.Json.Serialize(value));
  }
  static byte[] Zip(Dictionary<string,byte[]> files,Dictionary<string,object> release,string extra) {
   using(var buffer=new MemoryStream()) {
    using(var archive=new ZipArchive(buffer,ZipArchiveMode.Create,true)) {
     foreach(var file in files.Concat(new[]{new KeyValuePair<string,byte[]>("release.json",Bytes(Setup.Json.Serialize(release)))}))
      using(var stream=archive.CreateEntry(file.Key).Open())stream.Write(file.Value,0,file.Value.Length);
     if(extra!=null)using(var stream=archive.CreateEntry(extra).Open())stream.WriteByte(1);
    }return buffer.ToArray();
   }
  }
  internal static int Main(string[] args) {
   var files=new Dictionary<string,byte[]>{{"engine.cjs",Bytes("original engine fixture")},{"bake.cjs",Bytes("original baker fixture")},
    {"recipes.json",Bytes("{}")},{"WendyQuestInstallRuntime.exe",Bytes("synthetic fixture; never execute")},
    {"payload/wendyquest-access/ReadMe.txt",Bytes("a guide")},{"payload/wendyquest-access/ThirdPartyNotices.txt",Bytes("notices")}};
   var stock=new Dictionary<string,object>{{"package.nw/js/original.js",new string('a',64)}};
   var payload=files.Where(x=>x.Key.StartsWith("payload/",StringComparison.Ordinal)).ToDictionary(x=>x.Key.Substring(8),x=>(object)Setup.HashBytes(x.Value));
   var runtime=new Dictionary<string,object>{{"node.dll",new string('b',64)}};
   var plan=new Dictionary<string,object>{{"build","26578620"},{"stock",stock},{"patched",stock},{"payload",payload},
    {"geometry",new Dictionary<string,object>{{"1.wqg",new string('c',64)}}}};
   var release=new Dictionary<string,object>{{"schema",2},{"minimumSetup","1.0.0"},{"version","0.5.0"},{"development",false},
    {"source",new string('d',40)},{"build","26578620"},{"runtime",runtime},{"plan",plan},
    {"files",files.ToDictionary(x=>x.Key,x=>(object)Setup.HashBytes(x.Value))}};
   byte[] zip=Zip(files,release,null);var latest=Latest(zip,"0.5.0");
   Expect(ReleasePackage.Open(zip,latest,release).Files.Count==6,"valid bounded package");
   foreach(string key in new[]{"../outside","/absolute","C:/drive","payload/NUL.txt","payload/bad.","payload/bad ","payload\\windows","release.json","RELEASE.JSON"})
    Reject(()=>{byte[] value=Zip(files,release,key);ReleasePackage.Open(value,Latest(value,"0.5.0"),release);},"archive path/duplicate "+key);
   foreach(string url in new[]{"http://release-assets.githubusercontent.com/a","https://example.com/a","https://objects.githubusercontent.com:444/a",
    "https://user@objects.githubusercontent.com/a","https://objects.githubusercontent.com/a#fragment"})Reject(()=>GitHubUpdates.Redirect(url),"redirect");
   Expect(GitHubUpdates.Redirect("https://release-assets.githubusercontent.com/a?signature=valid").Scheme=="https","signed asset redirect");
   string metadata=Setup.Json.Serialize(new{draft=false,prerelease=false,tag_name="v0.5.0",assets=new[]{new{name="WendyQuestAccess-0.5.0-payload.zip",state="uploaded",size=zip.Length,
    browser_download_url=latest.Download.AbsoluteUri,digest="sha256:"+latest.Digest}}});
   foreach(string value in new[]{metadata.Replace("\"draft\":false","\"draft\":true"),metadata.Replace("\"prerelease\":false","\"prerelease\":true"),
    metadata.Replace("sha256:","sha1:"),metadata.Replace("https://github.com/","http://github.com/"),metadata.Replace("\"uploaded\"","\"pending\""),metadata.Replace("v0.5.0","v0.5.0-test")})Reject(()=>GitHubUpdates.ParseLatest(value),"release metadata");
   var badBytes=(byte[])zip.Clone();badBytes[0]^=1;Reject(()=>ReleasePackage.Open(badBytes,latest,release),"digest mismatch");
   foreach(string key in new[]{"schema","minimumSetup","version","development","build","source"}) {
    var value=Copy(release);value[key]=key=="schema"?(object)99:key=="development"?(object)true:key=="minimumSetup"?"99.0.0":key=="version"?"0.5.1":"wrong";
    byte[] data=Zip(files,value,null);Reject(()=>ReleasePackage.Open(data,Latest(data,"0.5.0"),release),"package "+key);
   }
   var changed=files.ToDictionary(x=>x.Key,x=>x.Value);changed["engine.cjs"]=Bytes("changed bytes");
   byte[] mismatched=Zip(changed,release,null);Reject(()=>ReleasePackage.Open(mismatched,Latest(mismatched,"0.5.0"),release),"inner digest mismatch");
   changed=files.ToDictionary(x=>x.Key,x=>x.Value);changed.Remove("payload/wendyquest-access/ReadMe.txt");var missing=Copy(release);
   ((Dictionary<string,object>)missing["files"]).Remove("payload/wendyquest-access/ReadMe.txt");byte[] noGuide=Zip(changed,missing,null);
   Reject(()=>ReleasePackage.Open(noGuide,Latest(noGuide,"0.5.0"),release),"missing guide");
   Reject(()=>GitHubUpdates.ReadBounded(new MemoryStream(new byte[33]),32),"stream cap");
   State(args[0],latest);
   Console.WriteLine("Online installer: "+checks+" metadata/archive/path/hash/version/current-state rejection and no-write checks pass.");return 0;
  }
  static void State(string root,GitHubRelease latest) {
   string game=Path.Combine(root,"online-state-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(game);
   try {
    var categories=new Dictionary<string,Dictionary<string,object>>();
    foreach(string kind in new[]{"stock","patched","payload","geometry"})categories[kind]=new Dictionary<string,object>();
    foreach(var row in new[]{new[]{"stock","package.nw/js/original.js",".wendyquest-access-recovery/package.nw/js/original.js"},
     new[]{"patched","package.nw/js/original.js","package.nw/js/original.js"},new[]{"payload","wendyquest-access/ReadMe.txt","package.nw/wendyquest-access/ReadMe.txt"},
     new[]{"geometry","1.wqg","package.nw/wendyquest-access-geometry/1.wqg"}}) {
     byte[] bytes=Bytes("synthetic "+row[0]);string file=Path.Combine(game,row[2].Replace('/',Path.DirectorySeparatorChar));
     Directory.CreateDirectory(Path.GetDirectoryName(file));File.WriteAllBytes(file,bytes);categories[row[0]][row[1]]=Setup.HashBytes(bytes);
    }
    var plan=new Dictionary<string,object>{{"build","26578620"}};foreach(var row in categories)plan[row.Key]=row.Value;
    string record=Path.Combine(game,@".wendyquest-access-recovery\plan.json");File.WriteAllText(record,Setup.Json.Serialize(plan));
    string receipt=Path.Combine(game,InstalledRelease.FileName);
    var saved=new Dictionary<string,object>{{"schema",1},{"version","0.5.0"},{"source",new string('d',40)},{"archiveSha256",latest.Digest},{"planSha256",Setup.FileSha(record)}};
    File.WriteAllText(receipt,Setup.Json.Serialize(saved));var baseline=new Dictionary<string,object>{{"build","26578620"},{"plan",plan}};
    Expect(InstalledRelease.Current(game,latest,baseline),"healthy current release");
    string before=File.ReadAllText(receipt);Expect(InstalledRelease.Current(game,latest,baseline)&&File.ReadAllText(receipt)==before,"current check writes nothing");
    string guide=Path.Combine(game,@"package.nw\wendyquest-access\ReadMe.txt");byte[] original=File.ReadAllBytes(guide);File.Delete(guide);
    Expect(!InstalledRelease.Current(game,latest,baseline),"missing payload requires repair");File.WriteAllBytes(guide,original);
    File.AppendAllText(record," ");Expect(!InstalledRelease.Current(game,latest,baseline),"changed plan is not current");
    File.WriteAllText(record,Setup.Json.Serialize(plan));saved["version"]="99.0.0";File.WriteAllText(receipt,Setup.Json.Serialize(saved));
    Reject(()=>InstalledRelease.Current(game,latest,baseline),"downgrade");
   }finally{Directory.Delete(game,true);}
  }
 }
}
