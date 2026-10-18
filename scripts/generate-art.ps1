param(
  [string[]]$Only = @(),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.local'
$manifestFile = Join-Path $PSScriptRoot 'art-manifest.json'
$outDir = Join-Path $root 'public\art'
$tmpDir = Join-Path $root 'art-raw'
$logFile = Join-Path $tmpDir 'generation.log'

if (-not (Test-Path $envFile)) {
  throw "Missing .env.local. Copy .env.example and add IMAGE_API_KEY."
}
if (-not (Test-Path $manifestFile)) {
  throw "Missing scripts/art-manifest.json."
}

New-Item -ItemType Directory -Force -Path $outDir, $tmpDir | Out-Null

$envMap = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
    $envMap[$Matches[1]] = $Matches[2].Trim()
  }
}

$apiKey = $envMap['IMAGE_API_KEY']
$apiBase = if ($envMap['IMAGE_API_BASE']) { $envMap['IMAGE_API_BASE'] } else { 'https://api.zoowyoo.dpdns.org/v1/images/generations' }
$model = if ($envMap['IMAGE_MODEL']) { $envMap['IMAGE_MODEL'] } else { 'gpt-image-2.5' }

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "IMAGE_API_KEY is empty in .env.local."
}

function Write-Log([string]$message) {
  $stamp = (Get-Date).ToString('HH:mm:ss')
  $line = "[$stamp] $message"
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding utf8
}

$prompts = Get-Content $manifestFile -Raw | ConvertFrom-Json
if ($Only.Count -gt 0) {
  $prompts = $prompts | Where-Object { $Only -contains $_.id }
}
if (-not $prompts) {
  throw "No matching art prompts."
}

Write-Log "Art generation started: $($prompts.Count) image(s), model=$model"

foreach ($item in $prompts) {
  $outFile = Join-Path $outDir "$($item.id).png"
  $webpFile = Join-Path $outDir "$($item.id).webp"
  if (((Test-Path $outFile) -or (Test-Path $webpFile)) -and -not $Force) {
    Write-Log "SKIP $($item.id) (already exists; use -Force to regenerate)"
    continue
  }

  $request = @{
    model = $model
    prompt = $item.prompt
    size = $item.size
    n = 1
  } | ConvertTo-Json -Depth 4

  $requestFile = Join-Path $tmpDir "$($item.id).request.json"
  $responseFile = Join-Path $tmpDir "$($item.id).response.json"
  [System.IO.File]::WriteAllText($requestFile, $request, (New-Object System.Text.UTF8Encoding($false)))

  Write-Log "GEN  $($item.id) ($($item.size)) ..."
  $sw = [System.Diagnostics.Stopwatch]::StartNew()

  $status = & curl.exe -sS --retry 2 --retry-all-errors --max-time 300 `
    -X POST $apiBase `
    -H "Authorization: Bearer $apiKey" `
    -H "Content-Type: application/json" `
    --data-binary "@$requestFile" `
    -o $responseFile `
    -w "%{http_code}"

  $sw.Stop()
  if ($LASTEXITCODE -ne 0) {
    Write-Log "FAIL $($item.id): curl exit $LASTEXITCODE"
    throw "Art generation failed for $($item.id)"
  }

  $text = if (Test-Path $responseFile) { Get-Content $responseFile -Raw } else { '' }
  if ($status -ne '200') {
    $snippet = if ($text.Length -gt 600) { $text.Substring(0, 600) } else { $text }
    Write-Log "FAIL $($item.id): HTTP $status - $snippet"
    throw "Art generation failed for $($item.id): HTTP $status"
  }

  try {
    $json = $text | ConvertFrom-Json
    $b64 = $json.data[0].b64_json
    if ($b64) {
      [System.IO.File]::WriteAllBytes($outFile, [Convert]::FromBase64String($b64))
    } elseif ($json.data[0].url) {
      & curl.exe -sS -L --retry 2 --retry-all-errors --max-time 120 $json.data[0].url -o $outFile
      if ($LASTEXITCODE -ne 0) { throw "image URL download failed" }
    } else {
      throw "response did not contain b64_json or url"
    }
    $kb = [Math]::Round((Get-Item $outFile).Length / 1KB)
    Write-Log "OK   $($item.id) (${kb} KB, $([Math]::Round($sw.Elapsed.TotalSeconds,1))s)"
  } catch {
    Write-Log "FAIL $($item.id): $($_.Exception.Message)"
    throw
  }

  Start-Sleep -Seconds 2
}

Write-Log "Art generation finished."
