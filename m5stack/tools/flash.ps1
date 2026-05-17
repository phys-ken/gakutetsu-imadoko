# M5Stack Basic に UIFlow2 ファームウェアを書き込む
# 使い方: .\flash.ps1 COM3 uiflow2_basic_vX.X.X.bin

param(
    [Parameter(Mandatory)][string]$Port,
    [Parameter(Mandatory)][string]$FirmwarePath
)

Write-Host "Erasing flash..."
esptool --port $Port --baud 1500000 erase_flash

Write-Host "Writing firmware: $FirmwarePath"
esptool --port $Port --baud 1500000 write_flash 0x0 $FirmwarePath

Write-Host "Done. Reset the device."
