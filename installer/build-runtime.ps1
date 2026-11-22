[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$folder = Join-Path $root '.build/installer'
[IO.Directory]::CreateDirectory($folder) | Out-Null
$vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
$instance = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or !$instance) { throw 'Visual Studio x64 tools were not found.' }
$vcvars = Join-Path $instance 'VC/Auxiliary/Build/vcvars64.bat'
$script = Join-Path $folder 'build-runtime.cmd'
$body = @"
@echo off
setlocal DisableDelayedExpansion
set "CL="
set "_CL_="
set "LINK="
set "_LINK_="
call "$vcvars" >nul
if errorlevel 1 exit /b %errorlevel%
cl /nologo /std:c++17 /O2 /MT /GS /sdl /guard:cf /W4 /EHsc /Fo"$folder/runtime-host.obj" /Fe"$folder/WendyQuestInstallRuntime.exe" "$PSScriptRoot/native-runtime-host.cpp" /link /INCREMENTAL:NO /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /guard:cf
exit /b %errorlevel%
"@
[IO.File]::WriteAllText($script, ($body -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
& python (Join-Path $root 'tools/run-build.py') --memory-mb 512 --wait-seconds 180 -- cmd.exe /d /c $script
exit $LASTEXITCODE
