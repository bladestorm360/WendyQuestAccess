// This receipt belongs to the update transaction, never to settings or saves.
// A version alone is insufficient: current files and the actual recovery plan
// must match the archive identity returned by the metadata-only GitHub check.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace WendyQuestAccessInstaller {
 static class InstalledRelease {
  internal const string FileName="WendyQuestAccess-release.json";
  internal static Dictionary<string,object> ReadJson(string file,int limit) {
   Setup.Direct(file);var info=new FileInfo(file);
   if(!info.Exists||info.Length<2||info.Length>limit)throw new InvalidDataException("Missing or oversized installation metadata.");
   var data=Setup.Json.DeserializeObject(File.ReadAllText(file))as Dictionary<string,object>;
   if(data==null)throw new InvalidDataException("Invalid installation metadata.");return data;
  }
  internal static string Digest(object value) {
   string text=value as string;if(text==null||!Regex.IsMatch(text,@"\A[a-f0-9]{64}\z"))throw new InvalidDataException("Invalid installation fingerprint.");return text;
  }
  internal static bool Current(string game,GitHubRelease release,Dictionary<string,object> baseline) {
   string receipt=Path.Combine(game,FileName),recovery=Path.Combine(game,".wendyquest-access-recovery"),record=Path.Combine(recovery,"plan.json");
   Setup.Direct(receipt);Setup.Direct(record);
   if(!File.Exists(receipt)||Directory.Exists(Path.Combine(game,".wendyquest-access-transaction")))return false;
   var saved=ReadJson(receipt,4096);
   if(!saved.ContainsKey("schema")||!(saved["schema"]is int)||(int)saved["schema"]!=1)return false;
   Version installed=GitHubUpdates.Number(GitHubUpdates.Text(saved,"version"));
   if(installed>release.Version)throw new InvalidOperationException("A newer mod version is already installed. No download or downgrade was performed.");
   if(installed!=release.Version||!saved.ContainsKey("archiveSha256")||Digest(saved["archiveSha256"])!=release.Digest)return false;
   if(!File.Exists(record)||!saved.ContainsKey("planSha256")||Setup.FileSha(record)!=Digest(saved["planSha256"]))return false;
   var plan=ReadJson(record,256*1024);if(GitHubUpdates.Text(plan,"build")!=GitHubUpdates.Text(baseline,"build"))return false;
   var expected=(Dictionary<string,object>)((Dictionary<string,object>)baseline["plan"])["stock"];
   foreach(string category in new[]{"stock","patched","payload","geometry"}) {
    object raw;var files=plan.TryGetValue(category,out raw)?raw as Dictionary<string,object>:null;
    if(files==null||files.Count<1||files.Count>512)return false;
    if((category=="stock"||category=="patched")&&!files.Keys.OrderBy(x=>x).SequenceEqual(expected.Keys.OrderBy(x=>x)))return false;
    foreach(var entry in files) {
     ReleasePackage.PathKey(entry.Key);string relative;
     if(category=="stock") {if(Digest(entry.Value)!=(string)expected[entry.Key])return false;relative=Path.Combine(".wendyquest-access-recovery",entry.Key);}
     else if(category=="patched")relative=entry.Key;
     else if(category=="payload") {
      if(entry.Key!="js/plugins/WendyQuestAccess.js"&&!entry.Key.StartsWith("wendyquest-access/",StringComparison.Ordinal))return false;
      relative="package.nw/"+entry.Key;
     }else {
      if(!Regex.IsMatch(entry.Key,@"\A(?:[1-9][0-9]{0,2}\.wqg|manifest\.json|breakfast\.json)\z"))return false;
      relative="package.nw/wendyquest-access-geometry/"+entry.Key;
     }
     string file=Path.Combine(game,relative.Replace('/',Path.DirectorySeparatorChar));Setup.Direct(file);
     if(!File.Exists(file)||new FileInfo(file).Length>32*1024*1024||Setup.FileSha(file)!=Digest(entry.Value))return false;
    }
   }
   return true;
  }
 }
}
