# Starts the Firstlight API and storefront in two windows.
$root = $PSScriptRoot

Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\backend'; .\.venv\Scripts\python.exe manage.py runserver"
)

Start-Process pwsh -ArgumentList @(
  "-NoExit", "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

$lan = (Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } |
  Select-Object -First 1).IPv4Address.IPAddress

Write-Host ""
Write-Host "  Storefront     http://localhost:5173"
Write-Host "  Wagtail admin  http://localhost:8000/admin/   (9999999999 / firstlight)"
if ($lan) {
  Write-Host ""
  Write-Host "  On your phone  http://${lan}:5173      (same wifi)"
}
Write-Host ""
