param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,
  [string]$MigrationsPath = "supabase/migrations"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path -LiteralPath $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

if (!(Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql was not found in PATH. Install PostgreSQL client tools on this machine first."
}

if (!(Test-Path -LiteralPath $MigrationsPath)) {
  throw "Migrations path not found: $MigrationsPath"
}

$databaseUrl = $null
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  $trimmed = $line.Trim()
  if (!$trimmed -or $trimmed.StartsWith("#")) { continue }
  if ($trimmed.StartsWith("DATABASE_URL=")) {
    $databaseUrl = $trimmed.Substring("DATABASE_URL=".Length).Trim()
    break
  }
}

if (!$databaseUrl) {
  throw "DATABASE_URL is missing from $EnvFile"
}

$migrationFiles = Get-ChildItem -LiteralPath $MigrationsPath -Filter "*.sql" | Sort-Object Name
if (!$migrationFiles) {
  throw "No migration files found in $MigrationsPath"
}

foreach ($file in $migrationFiles) {
  Write-Host "Applying migration: $($file.Name)"
  & psql $databaseUrl -v ON_ERROR_STOP=1 -f $file.FullName
}

Write-Host "Applied $($migrationFiles.Count) migration files."
