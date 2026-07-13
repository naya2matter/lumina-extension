# =====================================================================
#  PNE LC AI (Gemini Connector) — Windows uninstaller
#  Removes the force-install policy entry. Run in PowerShell:
#      powershell -ExecutionPolicy Bypass -File .\uninstall-windows.ps1
# =====================================================================
$ErrorActionPreference = 'Stop'

$ExtId = 'epcnjdecfbmgbbcpebihlfiklanlijeb'
$Key   = 'HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist'

if (-not (Test-Path $Key)) {
    Write-Host "Nothing to remove." -ForegroundColor Green
    return
}

$item = Get-Item $Key
foreach ($name in $item.Property) {
    $val = (Get-ItemProperty $Key).$name
    if ($val -like "$ExtId;*") {
        Remove-ItemProperty -Path $Key -Name $name
        Write-Host "Removed policy entry ($name)." -ForegroundColor Green
    }
}

# Clean up the key if it is now empty
if (((Get-Item $Key).Property).Count -eq 0) { Remove-Item $Key -Force }

Write-Host "Restart Chrome (chrome://restart) to complete removal." -ForegroundColor Yellow
