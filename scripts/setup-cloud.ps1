#Requires -Version 5.1
<#
.SYNOPSIS
  Sets up durable cloud DB for screensmart (GitHub-backed).

  1) Ensures private repo stech-il/shul-screen-data exists
  2) Copies a GitHub token to the clipboard for Render Environment
#>

$ErrorActionPreference = 'Stop'
$repo = 'stech-il/shul-screen-data'

Write-Host '=== screensmart cloud setup ===' -ForegroundColor Cyan

gh repo view $repo --json name 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating private repo $repo ..."
  gh repo create $repo --private --description 'screensmart cloud data store'
}

$token = (gh auth token).Trim()
if (-not $token) {
  throw 'No GitHub token — run: gh auth login'
}

Set-Clipboard -Value $token
Write-Host ''
Write-Host 'Token copied to clipboard.' -ForegroundColor Green
Write-Host ''
Write-Host 'Add these Environment Variables in Render → shul-screen → Environment:' -ForegroundColor Yellow
Write-Host '  CLOUD_GITHUB_TOKEN   = <paste clipboard>'
Write-Host '  CLOUD_GITHUB_REPO    = stech-il/shul-screen-data'
Write-Host ''
Write-Host 'Then click Manual Deploy → Clear build cache & deploy.'
Write-Host 'After deploy, open each synagogue Admin and click Save once to upload existing data.'
Write-Host ''
Start-Process 'https://dashboard.render.com/'
