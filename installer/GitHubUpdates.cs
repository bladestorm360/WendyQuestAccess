// Reusable setup acquisition. Based on the author's FFX installer contract:
// one stable-release metadata request; bounded HTTPS assets with exact size/SHA.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Cache;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace WendyQuestAccessInstaller {
 sealed class GitHubRelease {
  public string Tag, Digest;public Version Version;public Uri Download;public int Size;
 }
 interface IReleaseSource { GitHubRelease Check();byte[] Fetch(GitHubRelease release); }
 sealed class GitHubUpdates:IReleaseSource {
  internal const string Repository="bladestorm360/WendyQuestAccess";
  internal const int MaxPackage=64*1024*1024;
  public GitHubRelease Check() {
   return ParseLatest(new UTF8Encoding(false,true).GetString(Download(
    new Uri("https://api.github.com/repos/"+Repository+"/releases/latest"),1024*1024,false)));
  }
  internal static Version Number(string value) {
   Version number;
   if(value==null||!Regex.IsMatch(value,@"\A[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}\z")||!Version.TryParse(value,out number))
    throw new InvalidDataException("Unsupported release version.");
   return new Version(number.Major,number.Minor,number.Build,0);
  }
  internal static string Text(Dictionary<string,object> data,string name) {
   object value;return data.TryGetValue(name,out value)?value as string??"":"";
  }
  internal static GitHubRelease ParseLatest(string json) {
   var data=Setup.Json.DeserializeObject(json)as Dictionary<string,object>;object flag,raw;
   if(data==null||!data.TryGetValue("draft",out flag)||!(flag is bool)||(bool)flag||
    !data.TryGetValue("prerelease",out flag)||!(flag is bool)||(bool)flag)
    throw new InvalidDataException("GitHub did not return a published stable release.");
   string tag=Text(data,"tag_name");if(!tag.StartsWith("v",StringComparison.Ordinal))throw new InvalidDataException("Invalid release tag.");
   Version version=Number(tag.Substring(1));string name="WendyQuestAccess-"+tag.Substring(1)+"-payload.zip";
   var expected=new Uri("https://github.com/"+Repository+"/releases/download/"+tag+"/"+name);
   object[] assets=data.TryGetValue("assets",out raw)?raw as object[]:null;GitHubRelease found=null;
   foreach(object item in assets??new object[0]) {
    var asset=item as Dictionary<string,object>;if(asset==null||Text(asset,"name")!=name)continue;
    int size=asset.TryGetValue("size",out raw)&&raw is int?(int)raw:0;string digest=Text(asset,"digest");
    if(found!=null||Text(asset,"state")!="uploaded"||Text(asset,"browser_download_url")!=expected.AbsoluteUri||
     size<=0||size>MaxPackage||!Regex.IsMatch(digest,@"\Asha256:[a-fA-F0-9]{64}\z"))
     throw new InvalidDataException("GitHub has invalid or ambiguous package information.");
    found=new GitHubRelease{Tag=tag,Version=version,Download=expected,Size=size,Digest=digest.Substring(7).ToLowerInvariant()};
   }
   if(found==null)throw new InvalidDataException("The latest release has no supported installer package.");return found;
  }
  internal static Uri Redirect(string value) {
   Uri uri;
   if(!Uri.TryCreate(value,UriKind.Absolute,out uri)||uri.Scheme!="https"||!uri.IsDefaultPort||
    uri.UserInfo.Length!=0||uri.Fragment.Length!=0||
    (uri.Host!="release-assets.githubusercontent.com"&&uri.Host!="objects.githubusercontent.com"))
    throw new InvalidDataException("GitHub returned an unexpected download location.");return uri;
  }
  internal static byte[] ReadBounded(Stream stream,int limit) {
   using(var result=new MemoryStream()) {
    byte[] buffer=new byte[65536];int count;
    while((count=stream.Read(buffer,0,buffer.Length))!=0) {
     if(result.Length+count>limit)throw new InvalidDataException("Download exceeds its size limit.");result.Write(buffer,0,count);
    }return result.ToArray();
   }
  }
  static byte[] Download(Uri uri,int limit,bool asset) {
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   using(var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(35))) {
    for(int hop=0;hop<=2;hop++) {
     var request=(HttpWebRequest)WebRequest.Create(uri);request.AllowAutoRedirect=false;
     request.Timeout=10000;request.ReadWriteTimeout=10000;request.UserAgent="WendyQuestAccess-Setup";
     request.Accept=asset?"application/octet-stream":"application/vnd.github+json";
     request.CachePolicy=new RequestCachePolicy(RequestCacheLevel.NoCacheNoStore);
     if(!asset)request.Headers["X-GitHub-Api-Version"]="2022-11-28";
     using(deadline.Token.Register(request.Abort))using(var response=(HttpWebResponse)request.GetResponse()) {
      int code=(int)response.StatusCode;
      if(asset&&(code==301||code==302||code==303||code==307||code==308)){uri=Redirect(response.Headers["Location"]);continue;}
      if(response.StatusCode!=HttpStatusCode.OK||response.ContentLength>limit)throw new InvalidDataException("Unexpected GitHub response size or status.");
      using(Stream stream=response.GetResponseStream())return ReadBounded(stream,limit);
     }
    }
   }throw new InvalidDataException("Too many GitHub download redirects.");
  }
  public byte[] Fetch(GitHubRelease release) {
   byte[] bytes=Download(release.Download,release.Size,true);
   if(bytes.Length!=release.Size||Setup.HashBytes(bytes)!=release.Digest)throw new InvalidDataException("The package does not match GitHub's size and SHA-256.");
   return bytes;
  }
 }
}
