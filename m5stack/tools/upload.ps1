# M5Stack に src/ の全ファイルをアップロードし、RTCをPCのローカル時刻に同期する
# 使い方: .\upload.ps1 COM5

param([Parameter(Mandatory)][string]$Port)

$src = "$PSScriptRoot\..\src"
$files = @("map_coords.py", "data.py", "schedule.py", "main.py", "local_config.py")

foreach ($f in $files) {
    $local = Join-Path $src $f
    Write-Host "Uploading $f ..."
    mpremote connect $Port cp $local :$f
}

# Set M5Stack RTC from PC local time (JST)
Write-Host "Syncing RTC from PC time..."
$now = Get-Date
$psWd = [int]$now.DayOfWeek   # 0=Sunday, 1=Monday, ..., 6=Saturday
if ($psWd -eq 0) { $mpWd = 6 } else { $mpWd = $psWd - 1 }   # MicroPython: Mon=0..Sun=6
$yr = $now.Year; $mo = $now.Month;  $dy = $now.Day
$hh = $now.Hour; $mm = $now.Minute; $ss = $now.Second
$cmd = "import machine; machine.RTC().datetime(($yr,$mo,$dy,$mpWd,$hh,$mm,$ss,0))"
mpremote connect $Port exec $cmd
Write-Host "RTC set to $($now.ToString('yyyy-MM-dd HH:mm:ss')) (JST)"

Write-Host "Done. Press reset on M5Stack."
