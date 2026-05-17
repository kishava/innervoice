# One-time production setup: Supabase Edge Function secrets + ai-gateway deploy.
# Requires: npx supabase login (or SUPABASE_ACCESS_TOKEN / .supabase-access-token)
# Secrets file: .env.supabase.secrets (gitignored)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ProjectRef = 'sfkjycsvkhkcxoabcyjo'
$SecretsFile = Join-Path $Root '.env.supabase.secrets'
$TokenFile = Join-Path $Root '.supabase-access-token'

if (-not (Test-Path $SecretsFile)) {
  Write-Error "Missing $SecretsFile — add OPENAI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID"
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

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host @"

Supabase access token required (one-time):
  1. Open https://supabase.com/dashboard/account/tokens
  2. Create a token with Edge Functions + Secrets write access
  3. Save it to: $TokenFile
     OR run: `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
  4. Re-run: .\scripts\setup-production-backend.ps1

Or run: npx supabase login
"@ -ForegroundColor Yellow
  exit 1
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

Write-Host "Setting Edge Function secrets on project $ProjectRef ..."
try {
  Set-SecretsViaApi -Token $env:SUPABASE_ACCESS_TOKEN -Ref $ProjectRef -EnvPath $SecretsFile
  Write-Host "Secrets set via Management API." -ForegroundColor Green
} catch {
  Write-Host "Management API failed ($($_.Exception.Message)); trying CLI ..."
  npx supabase secrets set --env-file $SecretsFile --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Deploying ai-gateway ..."
npx supabase functions deploy ai-gateway --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. ElevenLabs/OpenAI are configured on Supabase (not Vercel)." -ForegroundColor Green
