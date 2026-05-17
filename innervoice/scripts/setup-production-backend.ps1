# One-time production setup: Supabase Edge Function secrets + ai-gateway deploy.
# Requires: SUPABASE_ACCESS_TOKEN (sbp_... from dashboard/account/tokens) OR npx supabase login
# NOT the project secret key (sb_secret_...) - cannot set Edge Function secrets.
# Secrets file: .env.supabase.secrets (gitignored)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ProjectRef = 'sfkjycsvkhkcxoabcyjo'
$SecretsFile = Join-Path $Root '.env.supabase.secrets'
$TokenFile = Join-Path $Root '.supabase-access-token'
$DashboardSecretsUrl = "https://supabase.com/dashboard/project/$ProjectRef/functions/secrets"

if (-not (Test-Path $SecretsFile)) {
  Write-Error "Missing $SecretsFile"
}

if (-not $env:SUPABASE_ACCESS_TOKEN -and (Test-Path $TokenFile)) {
  $env:SUPABASE_ACCESS_TOKEN = (Get-Content $TokenFile -Raw).Trim()
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  $cliToken = Join-Path $env:USERPROFILE '.supabase\access-token'
  if (Test-Path $cliToken) {
    $env:SUPABASE_ACCESS_TOKEN = (Get-Content $cliToken -Raw).Trim()
  }
}

function Set-SecretsViaApi {
  param([string]$Token, [string]$Ref, [string]$EnvPath)
  $pairs = @{}
  Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($name.StartsWith('SUPABASE_')) { return }
    $pairs[$name] = $value
  }
  $body = @($pairs.GetEnumerator() | ForEach-Object { @{ name = $_.Key; value = $_.Value } }) | ConvertTo-Json -Compress
  $uri = "https://api.supabase.com/v1/projects/$Ref/secrets"
  Invoke-RestMethod -Method POST -Uri $uri -Headers @{
    Authorization = "Bearer $Token"
    'Content-Type'  = 'application/json'
  } -Body $body
}

function Open-DashboardPasteFlow {
  Write-Host ""
  Write-Host "No valid CLI token (need sbp_... from https://supabase.com/dashboard/account/tokens)." -ForegroundColor Yellow
  Write-Host "Opening Supabase secrets page - paste from clipboard and click Save:" -ForegroundColor Cyan
  Write-Host "  $DashboardSecretsUrl"
  Write-Host ""
  Get-Content $SecretsFile | Set-Clipboard
  Write-Host "Copied .env.supabase.secrets to clipboard (KEY=value lines)." -ForegroundColor Green
  Start-Process $DashboardSecretsUrl
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Open-DashboardPasteFlow
  exit 0
}

if ($env:SUPABASE_ACCESS_TOKEN.StartsWith('sb_secret_')) {
  Write-Host "sb_secret_* is a project API key, not a CLI token. Use sbp_* or the dashboard flow." -ForegroundColor Yellow
  Open-DashboardPasteFlow
  exit 0
}

Write-Host "Setting Edge Function secrets on project $ProjectRef ..."
try {
  Set-SecretsViaApi -Token $env:SUPABASE_ACCESS_TOKEN -Ref $ProjectRef -EnvPath $SecretsFile
  Write-Host "Secrets set via Management API." -ForegroundColor Green
} catch {
  Write-Host "Management API failed: $($_.Exception.Message)"
  npx supabase secrets set --env-file $SecretsFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    Open-DashboardPasteFlow
    exit 1
  }
}

Write-Host "Deploying ai-gateway ..."
npx supabase functions deploy ai-gateway --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed (secrets may still be active). Check dashboard Edge Functions." -ForegroundColor Yellow
  exit $LASTEXITCODE
}

Write-Host "Done. ElevenLabs/OpenAI are on Supabase Edge Function secrets." -ForegroundColor Green
