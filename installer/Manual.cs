// Offline console entry point. It uses the exact published payload archive and
// shared validation/leases/journal; no alternate patcher or network fallback.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;

namespace WendyQuestAccessInstaller {
 sealed class BundledRelease:IReleaseSource {
  readonly string file;readonly GitHubRelease release;
  internal BundledRelease() {
   var data=(Dictionary<string,object>)Setup.Json.DeserializeObject(Setup.Resource("manual.json"));
   string name=GitHubUpdates.Text(data,"payloadFile");ReleasePackage.PathKey(name);
   if(Path.GetFileName(name)!=name||!name.EndsWith(".zip",StringComparison.Ordinal))throw new InvalidDataException("Invalid bundled package name.");
   string version=GitHubUpdates.Text(data,"version");int size=(int)data["payloadSize"];
   if(size<1||size>GitHubUpdates.MaxPackage)throw new InvalidDataException("Invalid bundled package size.");
   release=new GitHubRelease{Tag="v"+version,Version=GitHubUpdates.Number(version),Size=size,Digest=InstalledRelease.Digest(data["payloadSha256"])};
   file=Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),name);
  }
  public GitHubRelease Check(){return release;}
  public byte[] Fetch(GitHubRelease expected) {
   Setup.Direct(file);
   if(!File.Exists(file))throw new IOException("Keep the payload ZIP beside WendyQuestAccessManual.exe. Extract all files from the manual package.");
   byte[] bytes;
   using(var input=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)) {
    if(input.Length!=expected.Size)throw new InvalidDataException("The bundled payload ZIP has changed or is incomplete.");
    bytes=GitHubUpdates.ReadBounded(input,expected.Size);
   }
   if(Setup.HashBytes(bytes)!=expected.Digest)throw new InvalidDataException("The bundled payload ZIP failed SHA-256 verification.");
   return bytes;
  }
 }
 static class ManualProgram {
  static string Option(string[] args,string key){int at=Array.IndexOf(args,key);return at>=0&&at+1<args.Length?args[at+1]:null;}
  static void Progress(string message) {
   // Only the acquisition presentation changes. The shared core deliberately
   // keeps its original online wording; this source never accesses GitHub.
   if(message=="Checking GitHub for the latest release.")message="Checking the bundled release.";
   else if(message.StartsWith("Downloading and verifying ",StringComparison.Ordinal))message="Verifying the bundled payload ZIP.";
   Console.WriteLine(message);
  }
  [STAThread] internal static int Main(string[] args) {
   string report=Option(args,"--report");
   try {
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Contains("--help")) {
     Console.WriteLine("Wendy Quest Screen Reader manual/offline installation\nRun Install.cmd, Verify.cmd or Remove.cmd and enter the game folder.\nCommand line: WendyQuestAccessManual.exe --install|--verify|--uninstall --game \"game folder\"\nRead ReadMe.txt. Save and close Wendy Quest first.");return 0;
    }
    string action="install";int actions=0;
    for(int i=0;i<args.Length;i++) {
     if(new[]{"--install","--verify","--uninstall"}.Contains(args[i])){action=args[i].Substring(2);actions++;}
     else if(new[]{"--game","--work-root","--report"}.Contains(args[i])&&i+1<args.Length)i++;
     else throw new IOException("Unknown or incomplete argument. Use --help.");
    }
    if(actions>1)throw new IOException("Choose one action at a time.");
    string game=Option(args,"--game");
    if(game==null){Console.Write("Game folder containing WendyQuest.exe: ");game=(Console.ReadLine()??"").Trim().Trim('"');}
    Console.CancelKeyPress+=delegate(object sender,ConsoleCancelEventArgs e){e.Cancel=true;Console.WriteLine("Please wait for this operation to finish. Keep this window open.");};
    string result=Setup.Run(action,game,Option(args,"--work-root"),Progress,new BundledRelease());
    var outcome=(Dictionary<string,object>)Setup.Json.DeserializeObject(result);
    if(outcome.ContainsKey("alreadyCurrent"))outcome["message"]="This bundled version is already installed. No files were changed.";
    Console.WriteLine((string)outcome["message"]);
    if(report!=null)File.WriteAllText(report,Setup.Json.Serialize(outcome),new UTF8Encoding(false));
    return(bool)outcome["ok"]?0:1;
   }catch(Exception error) {
    Console.Error.WriteLine(error.Message);
    if(report!=null)File.WriteAllText(report,Setup.Json.Serialize(new{ok=false,message=error.Message}),new UTF8Encoding(false));return 1;
   }
  }
 }
}
