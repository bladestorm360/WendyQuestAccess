// Accessible .NET Framework installer shell. Native game execution is never
// requested. The child runs only original installer/baker code with pinned DLLs.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace WendyQuestAccessInstaller {
 static class Setup {
  public static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 2097152, RecursionLimit = 24 };
  [STAThread] static int Main(string[] args) {
   try {
    Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
    if(args.Contains("--self-test")) { using(var form=new InstallerForm()) form.CheckAccessibility();return 0; }
    string action=args.Contains("--install")?"install":args.Contains("--verify")?"verify":args.Contains("--uninstall")?"uninstall":null;
    if(action!=null) {
     string result=Run(action,Option(args,"--game"),Option(args,"--work-root"),delegate(string message){});
     string report=Option(args,"--report");if(report!=null)File.WriteAllText(report,result,new UTF8Encoding(false));
     return (bool)((Dictionary<string,object>)Json.DeserializeObject(result))["ok"]?0:1;
    }
    using(var form=new InstallerForm())Application.Run(form);return 0;
   }catch(Exception error) {
    string result=Json.Serialize(new {ok=false,message=error.Message});string report=Option(args,"--report");
    if(report!=null)File.WriteAllText(report,result,new UTF8Encoding(false));
    else MessageBox.Show(error.Message,"Wendy Quest Screen Reader installer",MessageBoxButtons.OK,MessageBoxIcon.Error);
    return 1;
   }
  }
  static string Option(string[] args,string key) {int at=Array.IndexOf(args,key);return at>=0&&at+1<args.Length?args[at+1]:null;}
  public static string Resource(string name) {
   using(Stream input=Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {
    if(input==null)throw new InvalidDataException("Missing installer resource.");
    using(var reader=new StreamReader(input,Encoding.UTF8))return reader.ReadToEnd();
   }
  }
  public static string Sha(Stream stream) {using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
  internal static string FileSha(string file) {Direct(file);using(var input=File.OpenRead(file))return Sha(input);}
  internal static void Direct(string file) {
   string at=Path.GetFullPath(file);
   if(!Regex.IsMatch(at,@"^[A-Za-z]:\\"))throw new IOException("Choose a folder on a local drive.");
   for(;;){if((File.Exists(at)||Directory.Exists(at))&&(File.GetAttributes(at)&FileAttributes.ReparsePoint)!=0)
      throw new IOException("Linked folders are unsupported: "+at);
    string parent=Path.GetDirectoryName(at);if(String.IsNullOrEmpty(parent)||parent==at)break;at=parent;}
  }
  // Arguments used here have no quotes. Windows paths may contain spaces,
  // Unicode or a final separator, which is doubled before the closing quote.
  static string Arg(string value) {
   if(value.IndexOf('"')>=0||value.IndexOf('\0')>=0||value.IndexOf('\n')>=0)throw new IOException("Unsupported path character.");
   return "\""+value.TrimEnd('\\')+"\"";
  }
  internal static string HashBytes(byte[] data) {using(var input=new MemoryStream(data,false))return Sha(input);}
  public static string ReadMe(string game) {
   if(!String.IsNullOrWhiteSpace(game)) {
    string file=Path.Combine(Path.GetFullPath(game),@"package.nw\wendyquest-access\ReadMe.txt");Direct(file);
    if(File.Exists(file)&&new FileInfo(file).Length<256*1024)return File.ReadAllText(file,Encoding.UTF8);
   }return Resource("ReadMe.txt");
  }
  public static string Run(string action,string gameFolder,string workRoot,Action<string> progress) {
   return Run(action,gameFolder,workRoot,progress,new GitHubUpdates());
  }
  internal static string Run(string action,string gameFolder,string workRoot,Action<string> progress,IReleaseSource source) {
   if(!new[]{"install","verify","uninstall"}.Contains(action))throw new IOException("Unsupported installer action.");
   if(String.IsNullOrWhiteSpace(gameFolder))throw new IOException("Select the folder containing WendyQuest.exe.");
   string game=Path.GetFullPath(gameFolder);Direct(game);
   if(Process.GetProcessesByName("WendyQuest").Length>0)throw new IOException("Save and close Wendy Quest first.");
   string localManifest=Resource("release.json");var baseline=(Dictionary<string,object>)Json.DeserializeObject(localManifest);
   var runtimes=(Dictionary<string,object>)baseline["runtime"];var inputs=(Dictionary<string,object>)baseline["inputs"];
   string manifest=Path.GetFullPath(Path.Combine(game,@"..\..\appmanifest_3339970.acf"));Direct(manifest);
   Direct(Path.Combine(game,"WendyQuest.exe"));progress("Checking the supported Steam installation.");
   using(var manifestLease=new FileStream(manifest,FileMode.Open,FileAccess.Read,FileShare.Read))
   using(var runtimeLease=new RuntimeLease(game,runtimes))
   using(var launcher=new FileStream(Path.Combine(game,"WendyQuest.exe"),FileMode.Open,FileAccess.Read,FileShare.None)) {
    if(Sha(launcher)!=(string)inputs["WendyQuest.exe"])throw new IOException("Unsupported Wendy Quest launcher.");
    if(manifestLease.Length>65536)throw new IOException("Unexpected Steam manifest size.");
    string text;using(var reader=new StreamReader(manifestLease,Encoding.UTF8,true,4096,true))text=reader.ReadToEnd();
    var fields=new Dictionary<string,string>{{"appid","3339970"},{"buildid",(string)baseline["build"]},{"StateFlags","4"},{"installdir",new DirectoryInfo(game).Name}};
    foreach(var field in fields)if(!Regex.IsMatch(text,"(?im)^\\s*\""+field.Key+"\"\\s+\""+Regex.Escape(field.Value)+"\"\\s*$"))
     throw new IOException("Let Steam finish updating. This installer requires build "+baseline["build"]+".");
    GitHubRelease latest=null;
    if(action=="install") {
     progress("Checking GitHub for the latest release.");latest=source.Check();
     if(InstalledRelease.Current(game,latest,baseline))return Json.Serialize(new{ok=true,alreadyCurrent=true,
      message="Version "+latest.Tag.Substring(1)+" is already up to date. No package was downloaded."});
    }
    string parent=workRoot??Path.Combine(Path.GetTempPath(),"WendyQuestAccessInstall");Direct(parent);Directory.CreateDirectory(parent);
    string work=Path.Combine(parent,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(work);
    try {
     if(latest!=null) {
      progress("Downloading and verifying "+latest.Tag+".");
      var package=ReleasePackage.Open(source.Fetch(latest),latest,baseline);package.Extract(work);
      File.WriteAllBytes(Path.Combine(work,"release.json"),package.Manifest);
      File.WriteAllText(Path.Combine(work,"download.json"),Json.Serialize(new{schema=1,tag=latest.Tag,sha256=latest.Digest}),new UTF8Encoding(false));
     }else {
      Extract(work,(Dictionary<string,object>)baseline["controlFiles"],"control.zip");
      File.WriteAllText(Path.Combine(work,"release.json"),localManifest,new UTF8Encoding(false));
     }
     File.Copy(Path.Combine(game,"v8_context_snapshot.bin"),Path.Combine(work,"v8_context_snapshot.bin"));
     var start=new ProcessStartInfo(Path.Combine(work,"WendyQuestInstallRuntime.exe")) {
      Arguments=Arg(game)+" "+Arg(Path.Combine(work,"engine.cjs"))+" "+action+" "+Arg(game)+" "+Arg(work),
      WorkingDirectory=work,UseShellExecute=false,CreateNoWindow=true
     };
     start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("NODE_PATH");
     using(var process=Process.Start(start)) {
      var clock=Stopwatch.StartNew();string prior="";
      while(!process.WaitForExit(200)) {
       string file=Path.Combine(work,"progress.txt");
       // A concurrent status write is optional feedback. A sharing collision
       // must never abandon a live transaction or clean its working files.
       try {if(File.Exists(file)){string now=File.ReadAllText(file);if(now!=prior){progress(now);prior=now;}}}
       catch(IOException) { }
       // Never terminate a mutation on a clock: the durable journal owns
       // crash recovery and restores the installed-release receipt as well.
       if(clock.Elapsed.TotalSeconds>180){progress("Still working; keep this installer open.");clock.Restart();}
      }
      string report=Path.Combine(work,"result.json");
      if(!File.Exists(report))throw new IOException("Installer utility stopped before completion (exit "+process.ExitCode+"). Run the installer again to recover any interrupted update.");
      string result=File.ReadAllText(report);var outcome=(Dictionary<string,object>)Json.DeserializeObject(result);
      if(process.ExitCode!=0&&(bool)outcome["ok"])throw new IOException("Installer utility exited unexpectedly.");return result;
     }
    }finally {RemoveWork(work);}
   }
  }
  sealed class RuntimeLease:IDisposable {
   readonly List<FileStream> streams=new List<FileStream>();
   public RuntimeLease(string game,Dictionary<string,object> files) {
    try {foreach(var file in files){string full=Path.Combine(game,file.Key);Direct(full);
      var stream=new FileStream(full,FileMode.Open,FileAccess.Read,FileShare.Read);streams.Add(stream);
      if(Sha(stream)!=(string)file.Value)throw new IOException("Unsupported game runtime: "+file.Key);}}
    catch {Dispose();throw;}
   }
   public void Dispose(){foreach(var stream in streams)stream.Dispose();streams.Clear();}
  }
  static void Extract(string folder,Dictionary<string,object> files,string resource) {
   using(Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
   using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
    if(zip.Entries.Count!=files.Count||files.Count>128)throw new InvalidDataException("Invalid installer file count.");
    long total=0;var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach(var item in zip.Entries) {
     string key=item.FullName;
     if(!files.ContainsKey(key)||!seen.Add(key)||key.Contains("\\")||key.Split('/').Any(p=>!Regex.IsMatch(p,@"^[A-Za-z0-9._ -]+$")||p==".."||p=="."))
       throw new InvalidDataException("Unsafe installer file.");
     total+=item.Length;if(item.Length>33554432||total>67108864)throw new InvalidDataException("Installer exceeds its size limit.");
     string dest=Path.Combine(folder,key.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(dest));
     using(var input=item.Open())using(var output=new FileStream(dest,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
      var buffer=new byte[65536];long copied=0;int count;
      while((count=input.Read(buffer,0,buffer.Length))!=0){copied+=count;
       if(copied>item.Length)throw new InvalidDataException("Installer entry exceeded its declared size.");
       output.Write(buffer,0,count);}
      if(copied!=item.Length)throw new InvalidDataException("Installer entry was truncated.");
     }
     if(FileSha(dest)!=(string)files[key])throw new InvalidDataException("Installer file verification failed: "+key);
    }
   }
  }
  static void RemoveWork(string work) {
   // Only this freshly generated GUID directory is owned by the installer.
   Direct(work);if(!Regex.IsMatch(new DirectoryInfo(work).Name,@"^[a-f0-9]{32}$"))throw new IOException("Unsafe temporary folder.");
   foreach(string file in Directory.GetFiles(work,"*",SearchOption.AllDirectories))Direct(file);
   foreach(string folder in Directory.GetDirectories(work,"*",SearchOption.AllDirectories))Direct(folder);
   Directory.Delete(work,true);
  }
  public static string DetectGame() {
   var roots=new List<string>();
   foreach(var hive in new[]{Registry.CurrentUser,Registry.LocalMachine})foreach(string key in new[]{@"Software\Valve\Steam",@"Software\WOW6432Node\Valve\Steam"})
    using(var steam=hive.OpenSubKey(key))if(steam!=null){var value=steam.GetValue("SteamPath")??steam.GetValue("InstallPath");if(value is string)roots.Add((string)value);}
   roots.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),"Steam"));
   foreach(string steam in roots.Distinct(StringComparer.OrdinalIgnoreCase).ToArray()) {
    string library=Path.Combine(steam,@"steamapps\libraryfolders.vdf");if(File.Exists(library)&&new FileInfo(library).Length<1048576)
      foreach(Match match in Regex.Matches(File.ReadAllText(library),"\"path\"\\s+\"([^\"]+)\""))roots.Add(match.Groups[1].Value.Replace("\\\\","\\"));
   }
   foreach(string steam in roots.Distinct(StringComparer.OrdinalIgnoreCase)) {
    string candidate=Path.Combine(steam,@"steamapps\common\Wendy Quest");if(File.Exists(Path.Combine(candidate,"WendyQuest.exe")))return candidate;
   }return "";
  }
 }
 sealed class InstallerForm:Form {
  readonly TextBox heading=new TextBox(),folder=new TextBox(),status=new TextBox();
  readonly ComboBox action=new ComboBox();readonly Button start=new Button(),browse=new Button(),readme=new Button(),close=new Button();
  bool busy;
  public InstallerForm() {
   Text="Wendy Quest Screen Reader installer";Size=new Size(650,490);MinimumSize=Size;StartPosition=FormStartPosition.CenterScreen;
   Font=new Font("Segoe UI",11);AutoScaleMode=AutoScaleMode.Font;
   heading.ReadOnly=true;heading.Multiline=true;heading.BorderStyle=BorderStyle.None;heading.Text=((Dictionary<string,object>)Setup.Json.DeserializeObject(Setup.Resource("release.json")))["displayName"]+"\r\nInstall, verify or remove the accessibility mod. Save and close the game first. Install checks GitHub; verify and remove work offline.";
   heading.AccessibleName="Installer instructions";heading.SetBounds(20,16,590,66);heading.TabIndex=0;
   var label=new Label{Text="&Game folder",AutoSize=true,Location=new Point(20,96)};
   folder.SetBounds(20,122,480,28);folder.AccessibleName="Game folder";folder.TabIndex=1;folder.Text=Setup.DetectGame();
   browse.Text="&Browse...";browse.SetBounds(510,120,100,34);browse.TabIndex=2;browse.Click+=delegate{using(var dialog=new FolderBrowserDialog{Description="Select the folder containing WendyQuest.exe",SelectedPath=folder.Text})if(dialog.ShowDialog(this)==DialogResult.OK)folder.Text=dialog.SelectedPath;};
   action.DropDownStyle=ComboBoxStyle.DropDownList;action.Items.AddRange(new object[]{"Install or update","Verify installed files","Remove mod"});action.SelectedIndex=0;
   action.AccessibleName="Action";action.SetBounds(20,174,590,30);action.TabIndex=3;
   status.Multiline=true;status.ReadOnly=true;status.ScrollBars=ScrollBars.Vertical;status.AccessibleName="Installation status";
   status.SetBounds(20,224,590,150);status.TabIndex=4;status.Text="Ready. Saves and mod preferences are retained.";
   start.Text="&Continue";start.SetBounds(20,394,140,36);start.TabIndex=5;start.Click+=Begin;
   readme.Text="&ReadMe";readme.SetBounds(180,394,140,36);readme.TabIndex=6;readme.Click+=delegate{
    using(var text=new Form{Text="Wendy Quest Screen Reader ReadMe",Size=new Size(760,620),StartPosition=FormStartPosition.CenterParent}){
     var box=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill,Text=Setup.ReadMe(folder.Text),AccessibleName="ReadMe",WordWrap=true};
     text.Controls.Add(box);text.Shown+=delegate{box.Focus();box.SelectionStart=0;box.SelectionLength=0;};text.ShowDialog(this);}};
   close.Text="&Close";close.SetBounds(470,394,140,36);close.TabIndex=7;close.Click+=delegate{Close();};
   Controls.AddRange(new Control[]{heading,label,folder,browse,action,status,start,readme,close});AcceptButton=start;CancelButton=close;
   Shown+=delegate{heading.Focus();heading.SelectionStart=0;heading.SelectionLength=0;};
   FormClosing+=delegate(object sender,FormClosingEventArgs e){if(busy)e.Cancel=true;};
  }
  void Begin(object sender,EventArgs args) {
   busy=true;start.Enabled=browse.Enabled=folder.Enabled=action.Enabled=close.Enabled=false;status.Text="Checking installation...";status.Focus();
   string selected=new[]{"install","verify","uninstall"}[action.SelectedIndex],game=folder.Text;
   var worker=new BackgroundWorker();
   worker.DoWork+=delegate(object s,DoWorkEventArgs e){e.Result=Setup.Run(selected,game,null,delegate(string message){BeginInvoke((Action)delegate{status.Text=message;});});};
   worker.RunWorkerCompleted+=delegate(object s,RunWorkerCompletedEventArgs e){
    busy=false;start.Enabled=browse.Enabled=folder.Enabled=action.Enabled=close.Enabled=true;
    if(e.Error!=null)status.Text=e.Error.Message;else{var result=(Dictionary<string,object>)Setup.Json.DeserializeObject((string)e.Result);status.Text=(string)result["message"];}
    status.Focus();status.SelectionStart=0;status.SelectionLength=0;worker.Dispose();};worker.RunWorkerAsync();
  }
  public void CheckAccessibility() {
   if(!heading.ReadOnly||!heading.TabStop||!status.ReadOnly||!status.TabStop||String.IsNullOrEmpty(folder.AccessibleName)||action.Items.Count!=3)
    throw new InvalidOperationException("Installer accessibility contract failed.");
   if(Controls.Cast<Control>().Where(c=>c.TabStop).GroupBy(c=>c.TabIndex).Any(g=>g.Count()>1))throw new InvalidOperationException("Duplicate tab order.");
  }
 }
}
