# M5Stack に src/ の全ファイルをアップロードする
# 使い方: .\upload.ps1 COM3

param([Parameter(Mandatory)][string]$Port)

$src = "$PSScriptRoot\..\src"
$files = @("map_coords.py", "data.py", "schedule.py", "main.py")

foreach ($f in $files) {
    $local = Join-Path $src $f
    Write-Host "Uploading $f ..."
    mpremote connect $Port cp $local :$f
}
Write-Host "All files uploaded. Press reset on M5Stack."
