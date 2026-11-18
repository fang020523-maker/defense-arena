# TTS narration generator (Microsoft Huihui zh-CN)
# Reads narration.txt (id|text, UTF-8) and writes audio\<id>.wav
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $root 'audio'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Huihui Desktop')
$synth.Rate = -1
$synth.Volume = 100

$lines = Get-Content -Path (Join-Path $root 'narration.txt') -Encoding UTF8
foreach ($line in $lines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $parts = $line.Split('|', 2)
  $id = $parts[0]
  $text = $parts[1]
  $wav = Join-Path $outDir ("n$($id).wav")
  $synth.SetOutputToWaveFile($wav)
  $synth.Speak($text)
  $synth.SetOutputToNull()
  Write-Output "OK $id -> $wav"
}
Write-Output 'ALL_DONE'
