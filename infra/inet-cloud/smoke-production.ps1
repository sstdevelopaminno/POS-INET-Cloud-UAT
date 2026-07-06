param(
  [string]$BaseUrl = "https://pos-inet-cloud-uat.vercel.app"
)

$ErrorActionPreference = "Stop"

function Read-WebErrorBody($ErrorRecord) {
  $response = $ErrorRecord.Exception.Response
  if (!$response) { throw $ErrorRecord }
  $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
  [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Content = $reader.ReadToEnd()
  }
}

$login = Invoke-WebRequest -Uri "$BaseUrl/login" -Method Head -MaximumRedirection 0 -ErrorAction SilentlyContinue
[pscustomobject]@{ Check = "login_head"; StatusCode = $login.StatusCode; Location = $login.Headers.Location }

$result = Invoke-WebRequest -Uri "$BaseUrl/payment/inet/result" -Method Head
[pscustomobject]@{ Check = "inet_result_head"; StatusCode = $result.StatusCode; Location = $result.Headers.Location }

try {
  $api = Invoke-WebRequest -Uri "$BaseUrl/api/auth/store-code/verify" -Method POST -ContentType "application/json" -Body '{"store_code":"TEST"}'
  [pscustomobject]@{ Check = "store_verify_post"; StatusCode = $api.StatusCode; Content = $api.Content }
} catch {
  $body = Read-WebErrorBody $_
  [pscustomobject]@{ Check = "store_verify_post"; StatusCode = $body.StatusCode; Content = $body.Content }
}
