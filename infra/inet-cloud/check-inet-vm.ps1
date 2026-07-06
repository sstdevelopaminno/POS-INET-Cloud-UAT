param(
  [string]$HostName = "203.154.39.123",
  [int[]]$Ports = @(80, 443, 5432, 6543, 8000, 8787, 3389, 5985, 5986),
  [int]$TimeoutMs = 3000
)

$ErrorActionPreference = "Stop"

foreach ($port in $Ports) {
  $client = [Net.Sockets.TcpClient]::new()
  try {
    $async = $client.BeginConnect($HostName, $port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    $status = if ($ok -and $client.Connected) { "open" } else { "closed_or_timeout" }
    [pscustomobject]@{
      Host = $HostName
      Port = $port
      Status = $status
    }
  } finally {
    $client.Close()
  }
}
