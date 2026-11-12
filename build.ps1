[CmdletBinding()]
param([Parameter(Mandatory)][string]$PrismArchive)

$ErrorActionPreference = 'Stop'
$runner = 'D:/Games/Dev/codex/templates/accessibility-mod/scripts/run-build.py'
$vswhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio/Installer/vswhere.exe'
$instance = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or !$instance) { throw 'Visual Studio x64 C++ build tools were not found.' }
$vcvars = Join-Path $instance 'VC/Auxiliary/Build/vcvars64.bat'
$payloadBuilder = Join-Path $PSScriptRoot 'tools/build.py'

& python $runner --memory-mb 512 -- python $payloadBuilder --prism-archive $PrismArchive --vcvars $vcvars
exit $LASTEXITCODE
