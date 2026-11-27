[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Output, [string]$Stage)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
[IO.Directory]::CreateDirectory($Output) | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
$common = @($compiler, '/nologo', '/target:exe', '/platform:x64', '/warnaserror+')
$common += @('System','System.Core','System.Drawing','System.Windows.Forms','System.IO.Compression','System.IO.Compression.FileSystem','System.Web.Extensions') | ForEach-Object { '/reference:' + $_ + '.dll' }
$sources = (Get-ChildItem (Join-Path $root 'installer') -Filter '*.cs').FullName
$runner = Join-Path $root 'tools/run-build.py'
$unit = Join-Path $Output 'OnlineTests.exe'
# The legacy Framework compiler assigns sources to the preceding /out group.
# Keep all output options before every source (including fixture entry points).
$arguments = $common + @('/main:WendyQuestAccessInstaller.OnlineTests', ('/out:' + $unit)) + $sources + @((Join-Path $PSScriptRoot 'online-installer.cs'))
& python $runner --memory-mb 512 --wait-seconds 600 --receipt (Join-Path $Output 'unit-compile-budget.json') -- @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $unit $Output
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($Stage) {
    $arguments = $common + @('/main:WendyQuestAccessInstaller.OnlineHarness', ('/out:' + (Join-Path $Stage 'OnlineHarness.exe')))
    foreach ($name in @('release.json','control.zip','ReadMe.txt')) { $arguments += '/resource:' + (Join-Path $Stage $name) + ',' + $name }
    $arguments += $sources + @((Join-Path $PSScriptRoot 'online-installer-harness.cs'))
    & python $runner --memory-mb 512 --wait-seconds 600 --receipt (Join-Path $Output 'harness-compile-budget.json') -- @arguments
    exit $LASTEXITCODE
}
exit 0
