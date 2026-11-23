param(
    [Parameter(Mandatory=$true)][string]$Scratch,
    [string]$Voice = 'Microsoft Zira Desktop',
    [string]$Clip
)

$ErrorActionPreference = 'Stop'
if (!$env:CODEX_BUILD_JOB_NAME) { throw 'Run through tools/run-build.py.' }
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src/dialogue/narration-cues.json'
$output = Join-Path $root 'src/dialogue/clips'
[IO.Directory]::CreateDirectory($output) | Out-Null
[IO.Directory]::CreateDirectory($Scratch) | Out-Null
$catalog = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice($Voice)
    $speaker.Rate = 0
    foreach ($entry in $catalog.PSObject.Properties) {
        if ($Clip -and $entry.Name -cne $Clip) { continue }
        if ($entry.Name -cnotmatch '^[a-z][a-z-]+$') { throw 'Invalid clip name.' }
        # The charge precedes its native word overlay by only1.2seconds.
        # Author its two words briskly and remove trailing synthesizer silence.
        $speaker.Rate = $(if ($entry.Name -eq 'skill-beef-charge') { 4 } else { 0 })
        $voiceFilter = $(if ($entry.Name -eq 'skill-beef-charge') { 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-46dB:stop_periods=-1:stop_duration=0.06:stop_threshold=-46dB,apad=pad_dur=0.03' } else { 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-46dB,apad=pad_dur=0.08' })
        $wav = Join-Path $Scratch ($entry.Name + '.wav')
        $webm = Join-Path $output ($entry.Name + '.webm')
        try {
            if (Test-Path -LiteralPath $wav) { throw 'Use a clean recording scratch directory.' }
            $speaker.SetOutputToWaveFile($wav)
            $speaker.Speak([string]$entry.Value.text)
            $speaker.SetOutputToNull()
            & ffmpeg -nostdin -y -hide_banner -loglevel error -threads 1 -i $wav `
                -af $voiceFilter `
                -c:a libopus -application voip -b:a 32k -ac 1 -ar 48000 -threads 1 $webm
            if ($LASTEXITCODE -ne 0) { throw "Encoding failed for $($entry.Name)." }
        } finally {
            $speaker.SetOutputToNull()
            if (Test-Path -LiteralPath $wav) { Remove-Item -LiteralPath $wav }
        }
    }
} finally {
    $speaker.Dispose()
}
