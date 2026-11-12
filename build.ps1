[CmdletBinding()]
param(
    [string]$PrismArchive = (Join-Path $PSScriptRoot '.deps/prism-windows-x64.zip'),
    [string]$AudioSdkRoot = (Join-Path $PSScriptRoot '.deps/audio-sdk'),
    [switch]$VerifySpeechPipe,
    [switch]$VerifyAudio
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'tools/run-build.py'
$vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
$instance = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or !$instance) { throw 'Visual Studio x64 C++ build tools were not found.' }
$vcvars = Join-Path $instance 'VC/Auxiliary/Build/vcvars64.bat'
$payloadBuilder = Join-Path $PSScriptRoot 'tools/build.py'

$buildArguments = @('--prism-archive', $PrismArchive, '--vcvars', $vcvars, '--audio-sdk', $AudioSdkRoot)
if ($VerifySpeechPipe) { $buildArguments += '--verify-speech-pipe' }
if ($VerifyAudio) { $buildArguments += '--verify-audio' }
& python $runner --memory-mb 512 -- python $payloadBuilder @buildArguments
exit $LASTEXITCODE
