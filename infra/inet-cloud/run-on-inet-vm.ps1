param(
  [string]$InstallRoot = "C:\inet-cloud",
  [switch]$OpenHttp,
  [switch]$OpenHttps,
  [switch]$OpenSupabaseGateway,
  [switch]$OpenBridgePort
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  [pscustomobject]@{
    Name = $Name
    Found = [bool]$cmd
    Source = if ($cmd) { $cmd.Source } else { "" }
  }
}

if (!(Test-IsAdmin)) {
  throw "Run this script in an elevated PowerShell session on the INET VM."
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

$checks = @(
  Test-Command git,
  Test-Command node,
  Test-Command npm,
  Test-Command docker,
  Test-Command psql
)

$checks | Format-Table -AutoSize

$dockerOk = $checks | Where-Object { $_.Name -eq "docker" -and $_.Found }
if ($dockerOk) {
  docker version
} else {
  Write-Warning "Docker was not found. Supabase-compatible self-hosting needs Docker/Linux containers. Install Docker Desktop with WSL2 or use an INET Linux VM/managed service."
}

if ($OpenHttp) {
  New-NetFirewallRule -DisplayName "INET Cloud HTTP 80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue | Out-Null
}

if ($OpenHttps) {
  New-NetFirewallRule -DisplayName "INET Cloud HTTPS 443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue | Out-Null
}

if ($OpenSupabaseGateway) {
  New-NetFirewallRule -DisplayName "INET Supabase Gateway 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -ErrorAction SilentlyContinue | Out-Null
}

if ($OpenBridgePort) {
  New-NetFirewallRule -DisplayName "INET Payment Bridge 8787" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -ErrorAction SilentlyContinue | Out-Null
}

Write-Host ""
Write-Host "Next on this VM:"
Write-Host "1. Provision Supabase-compatible API or request an INET Linux/managed database service."
Write-Host "2. Apply SQL migrations from the repo supabase/migrations."
Write-Host "3. Deploy the INET Payment Bridge as a Windows service or behind HTTPS reverse proxy."
Write-Host "4. Copy generated API URL/keys into infra/inet-cloud/inet-production.env.local on the workstation."
Write-Host ""
Write-Host "Recommended public exposure:"
Write-Host "- 443 only for public HTTPS API/bridge."
Write-Host "- Keep Postgres ports 5432/6543 restricted to admin/VPN/private network."
