// Test-only transport injection. The shipped EXE has no fixture URL/package
// option; every other lease, extraction, native helper and transaction is real.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
namespace WendyQuestAccessInstaller {
 sealed class FixtureSource:IReleaseSource {
  readonly byte[] bytes;readonly GitHubRelease latest;readonly string report;int checks,fetches;
  internal FixtureSource(string file,string report){bytes=File.ReadAllBytes(file);this.report=report;
   using(var zip=new System.IO.Compression.ZipArchive(new MemoryStream(bytes,false)))using(var text=new StreamReader(zip.GetEntry("release.json").Open())) {
    var release=(Dictionary<string,object>)Setup.Json.DeserializeObject(text.ReadToEnd());string version=(string)release["version"];
    latest=new GitHubRelease{Tag="v"+version,Version=GitHubUpdates.Number(version),Size=bytes.Length,Digest=Setup.HashBytes(bytes)};
   }Save();}
  void Save(){File.WriteAllText(report,Setup.Json.Serialize(new{checks=checks,fetches=fetches}));}
  public GitHubRelease Check(){checks++;Save();return latest;}
  public byte[] Fetch(GitHubRelease release){fetches++;Save();return bytes;}
 }
 static class OnlineHarness {
  static string Option(string[] args,string key){int at=Array.IndexOf(args,key);return at>=0&&at+1<args.Length?args[at+1]:null;}
  internal static int Main(string[] args) {
   string report=Option(args,"--report");
   try {
    string action=args.Contains("--install")?"install":args.Contains("--verify")?"verify":"uninstall";
    var source=new FixtureSource(Option(args,"--fixture-package"),Option(args,"--network-report"));
    string result=Setup.Run(action,Option(args,"--game"),Option(args,"--work-root"),delegate(string message){},source);
    File.WriteAllText(report,result);return(bool)((Dictionary<string,object>)Setup.Json.DeserializeObject(result))["ok"]?0:1;
   }catch(Exception error){File.WriteAllText(report,Setup.Json.Serialize(new{ok=false,message=error.Message}));return 1;}
  }
 }
}
