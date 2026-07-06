param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,
  [string]$Environment = "production"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$vercel = "C:\Users\Admins\AppData\Roaming\npm\vercel.cmd"
if (!(Test-Path -LiteralPath $vercel)) {
  throw "Vercel CLI not found at $vercel"
}

$env:Path = "C:\Program Files\nodejs;" + $env:Path

$allowedKeys = @(
  "POS_DATABASE_TARGET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INET_NOPS_ENV",
  "INET_NOPS_MERCHANT_KEY_UAT",
  "INET_NOPS_MERCHANT_ID_UAT",
  "INET_NOPS_ALLOW_MISSING_MERCHANT_ID_UAT",
  "INET_NOPS_OAUTH_URL_UAT",
  "INET_NOPS_ACCESS_TOKEN_URL_UAT",
  "INET_NOPS_AP_URL_UAT",
  "INET_NOPS_CALLBACK_PUBLIC_URL",
  "INET_NOPS_CALLBACK_PUBLIC_URL_UAT",
  "INET_PAYMENT_BRIDGE_URL",
  "INET_PAYMENT_BRIDGE_API_KEY"
)

$secretKeys = @(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INET_NOPS_MERCHANT_KEY_UAT",
  "INET_PAYMENT_BRIDGE_API_KEY"
)

$pairs = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  $trimmed = $line.Trim()
  if (!$trimmed -or $trimmed.StartsWith("#")) { continue }
  $idx = $trimmed.IndexOf("=")
  if ($idx -lt 1) { continue }
  $key = $trimmed.Substring(0, $idx).Trim()
  $value = $trimmed.Substring($idx + 1).Trim()
  if ($allowedKeys -contains $key -and $value) {
    $pairs[$key] = $value
  }
}

foreach ($key in $allowedKeys) {
  if (!$pairs.ContainsKey($key)) { continue }
  $args = @("env", "add", $key, $Environment)
  if ($secretKeys -contains $key) {
    $args += "--sensitive"
  }
  $pairs[$key] | & $vercel @args
}

Write-Host "Applied Vercel env values for $Environment. Redeploy production after this step."
