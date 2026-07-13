# =====================================================================
#  PNE LC AI (Gemini Connector) — Windows installer
#  Force-installs the extension into Chrome via user policy.
#  No admin required (writes to HKCU). Run in PowerShell:
#      powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
# =====================================================================
$ErrorActionPreference = 'Stop'

$ExtId     = 'epcnjdecfbmgbbcpebihlfiklanlijeb'
$UpdateUrl = 'https://ai.lcportal.cloud/ext/update.xml'
$Entry     = "$ExtId;$UpdateUrl"
$Key       = 'HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist'

Write-Host "Installing PNE LC AI (Gemini Connector) into Chrome..." -ForegroundColor Cyan

# Ensure the policy key exists
if (-not (Test-Path $Key)) { New-Item -Path $Key -Force | Out-Null }

# If this extension is already listed, do nothing; otherwise use the next free numeric slot
$existing = (Get-Item $Key).Property | ForEach-Object { (Get-ItemProperty $Key).$_ }
if ($existing -contains $Entry) {
    Write-Host "Already configured." -ForegroundColor Green
} else {
    $used = (Get-Item $Key).Property | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ }
    $slot = 1; while ($used -contains $slot) { $slot++ }
    Set-ItemProperty -Path $Key -Name "$slot" -Value $Entry
    Write-Host "Policy written (slot $slot)." -ForegroundColor Green
}

Write-Host ""
Write-Host "DONE. Now fully quit Chrome and reopen it" -ForegroundColor Yellow
Write-Host "(paste chrome://restart into the address bar, or quit from the tray)." -ForegroundColor Yellow
Write-Host "The extension will auto-install within a minute of restart."
