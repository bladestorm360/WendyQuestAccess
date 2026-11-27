// A GitHub digest authenticates the archive; its bounded manifest then owns
// every extraction path. No game inputs or geometry are downloaded.
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace WendyQuestAccessInstaller {
 sealed class ReleasePackage {
  internal Dictionary<string,byte[]> Files;internal Dictionary<string,object> Release;internal byte[] Manifest;
  internal static void PathKey(string value) {
   if(String.IsNullOrEmpty(value)||value.Length>240||value.Contains("\\")||value.Split('/').Any(part=>
    !Regex.IsMatch(part,@"\A[A-Za-z0-9._ -]+\z")||part=="."||part==".."||part.EndsWith(".",StringComparison.Ordinal)||part.EndsWith(" ",StringComparison.Ordinal)||
    Regex.IsMatch(part,@"\A(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)",RegexOptions.IgnoreCase)))throw new InvalidDataException("Unsafe package path.");
  }
  internal static ReleasePackage Open(byte[] bytes,GitHubRelease latest,Dictionary<string,object> baseline) {
   if(bytes.Length!=latest.Size||bytes.Length>GitHubUpdates.MaxPackage||Setup.HashBytes(bytes)!=latest.Digest)
    throw new InvalidDataException("The downloaded package failed size or SHA-256 verification.");
   using(var zip=new ZipArchive(new MemoryStream(bytes,false),ZipArchiveMode.Read)) {
    if(zip.Entries.Count>128)throw new InvalidDataException("Too many package files.");
    var entries=new Dictionary<string,ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);long total=0;
    foreach(var entry in zip.Entries) {
     PathKey(entry.FullName);if(entries.ContainsKey(entry.FullName)||entry.Length<1||entry.Length>32*1024*1024||(total+=entry.Length)>64*1024*1024)
      throw new InvalidDataException("Invalid package entry, size or duplicate.");entries.Add(entry.FullName,entry);
    }
    ZipArchiveEntry manifest;if(!entries.TryGetValue("release.json",out manifest)||manifest.Length>256*1024)throw new InvalidDataException("Missing release manifest.");
    byte[] raw;using(var stream=manifest.Open())raw=GitHubUpdates.ReadBounded(stream,(int)manifest.Length);
    if(raw.Length!=manifest.Length)throw new InvalidDataException("Truncated release manifest.");
    var release=Setup.Json.DeserializeObject(new UTF8Encoding(false,true).GetString(raw))as Dictionary<string,object>;object value;
    if(release==null||!release.TryGetValue("schema",out value)||!(value is int)||(int)value!=2||
     GitHubUpdates.Text(release,"version")!=latest.Tag.Substring(1)||GitHubUpdates.Text(release,"build")!=GitHubUpdates.Text(baseline,"build")||
     !release.TryGetValue("development",out value)||!(value is bool)||(bool)value||
     GitHubUpdates.Number(GitHubUpdates.Text(release,"minimumSetup"))>GitHubUpdates.Number("1.0.0"))
     throw new InvalidDataException("This package needs a newer or compatible installer.");
    var runtime=release["runtime"]as Dictionary<string,object>;var pins=baseline["runtime"]as Dictionary<string,object>;
    if(runtime==null||pins==null||runtime.Count!=pins.Count||runtime.Any(p=>!pins.ContainsKey(p.Key)||(string)p.Value!=(string)pins[p.Key]))
     throw new InvalidDataException("Unsupported game runtime in release.");
    var files=release["files"]as Dictionary<string,object>;
    if(files==null||files.Count+1!=entries.Count)throw new InvalidDataException("Package file inventory differs.");
    var output=new Dictionary<string,byte[]>(StringComparer.Ordinal);
    foreach(var item in files) {
     PathKey(item.Key);if(!item.Key.StartsWith("payload/",StringComparison.Ordinal)&&!new[]{"engine.cjs","bake.cjs","recipes.json","WendyQuestInstallRuntime.exe"}.Contains(item.Key))
      throw new InvalidDataException("Unexpected installer package file.");
     if(item.Key.StartsWith("payload/",StringComparison.Ordinal)&&item.Key!="payload/js/plugins/WendyQuestAccess.js"&&!item.Key.StartsWith("payload/wendyquest-access/",StringComparison.Ordinal))
      throw new InvalidDataException("Unexpected mod destination.");
     ZipArchiveEntry entry;if(!entries.TryGetValue(item.Key,out entry)||entry.FullName!=item.Key)throw new InvalidDataException("Package file missing.");
     byte[] data;using(var stream=entry.Open())data=GitHubUpdates.ReadBounded(stream,(int)entry.Length);
     if(data.Length!=entry.Length||Setup.HashBytes(data)!=InstalledRelease.Digest(item.Value))throw new InvalidDataException("Package file verification failed.");output.Add(item.Key,data);
    }
    foreach(string required in new[]{"engine.cjs","bake.cjs","recipes.json","WendyQuestInstallRuntime.exe","payload/wendyquest-access/ReadMe.txt","payload/wendyquest-access/ThirdPartyNotices.txt"})
     if(!output.ContainsKey(required))throw new InvalidDataException("Required installer file missing.");
    var plan=(Dictionary<string,object>)release["plan"];var source=(Dictionary<string,object>)plan["stock"];
    var known=(Dictionary<string,object>)((Dictionary<string,object>)baseline["plan"])["stock"];
    if(source.Count!=known.Count||source.Any(p=>!known.ContainsKey(p.Key)||(string)p.Value!=(string)known[p.Key]))throw new InvalidDataException("Unsupported original game files.");
    var payload=(Dictionary<string,object>)plan["payload"];
    if(output.Keys.Count(p=>p.StartsWith("payload/",StringComparison.Ordinal))!=payload.Count||payload.Any(p=>!output.ContainsKey("payload/"+p.Key)||Setup.HashBytes(output["payload/"+p.Key])!=(string)p.Value))
     throw new InvalidDataException("Payload does not match its installation plan.");
    return new ReleasePackage{Files=output,Release=release,Manifest=raw};
   }
  }
  internal void Extract(string folder) {
   foreach(var item in Files) {
    string file=Path.Combine(folder,item.Key.Replace('/',Path.DirectorySeparatorChar));Setup.Direct(file);Directory.CreateDirectory(Path.GetDirectoryName(file));
    using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None))output.Write(item.Value,0,item.Value.Length);
   }
  }
 }
}
