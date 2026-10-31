# 安装 Personal Image MCP：构建、生成 native host、注册到 Chrome/Edge（仅当前用户），可选注册到 Claude Code。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Mock] [-AllowedDirs "D:/a;D:/b"] [-RegisterClaude]
param(
  [switch]$Mock,
  [string]$AllowedDirs = '',
  [switch]$RegisterClaude,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "安装失败：$text" -ForegroundColor Red; exit 1 }

Step '检查 Node.js'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail '未找到 node。请安装 Node.js 22 或更新版本（winget install OpenJS.NodeJS.LTS），然后重新打开终端。' }
$node = $nodeCmd.Source
$major = [int]((& $node --version).TrimStart('v').Split('.')[0])
if ($major -lt 22) { Fail "Node.js 版本过低（$(& $node --version)），需要 22 或更新。" }

if (-not $SkipBuild) {
  Step '安装依赖并构建'
  # Call npm.cmd directly: the npm.ps1 shim mis-parses arguments under Windows PowerShell 5.1.
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npm) { Fail '未找到 npm.cmd，请确认 Node.js 安装完整。' }
  Push-Location $root
  try {
    & $npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail 'npm ci 失败' }
    & $npm run build
    if ($LASTEXITCODE -ne 0) { Fail 'npm run build 失败' }
  } finally { Pop-Location }
}
$nativeJs = Join-Path $root 'dist\bridge\native.js'
if (-not (Test-Path $nativeJs)) { Fail "缺少 $nativeJs，请先构建。" }

Step '准备 .env'
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) {
  $lines = Get-Content (Join-Path $root '.env.example') -Encoding UTF8
  $real = -not $Mock
  $lines = $lines | ForEach-Object {
    if ($_ -match '^IMAGE_TEST_MODE=') { "IMAGE_TEST_MODE=$((-not $real).ToString().ToLower())" }
    elseif ($_ -match '^IMAGE_ALLOW_BROWSER_GENERATION=') { "IMAGE_ALLOW_BROWSER_GENERATION=$($real.ToString().ToLower())" }
    elseif ($_ -match '^IMAGE_ALLOWED_DIRS=') { "IMAGE_ALLOWED_DIRS=$AllowedDirs" }
    else { $_ }
  }
  [System.IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "已创建 .env（$(if ($real) { '真实模式' } else { '模拟模式' })）"
} else {
  Write-Host '.env 已存在，保持不变。'
}

Step '生成 native host'
$extId = (& $node -e "import('file:///$($root.Replace('\','/'))/dist/bridge/extension-id.js').then(m=>console.log(m.EXTENSION_ID))").Trim()
$hostName = (& $node -e "import('file:///$($root.Replace('\','/'))/dist/bridge/extension-id.js').then(m=>console.log(m.NATIVE_HOST_NAME))").Trim()
if ($extId -notmatch '^[a-p]{32}$') { Fail "无法读取扩展 ID：$extId" }
$hostDir = Join-Path $root 'native-host'
New-Item -ItemType Directory -Force $hostDir | Out-Null
$bat = Join-Path $hostDir 'image-mcp-host.bat'
[System.IO.File]::WriteAllText($bat, "@echo off`r`n`"$node`" `"$nativeJs`" %*`r`n", (New-Object System.Text.UTF8Encoding $false))
$manifestPath = Join-Path $hostDir "$hostName.json"
$manifest = [ordered]@{
  name = $hostName
  description = 'Personal Image MCP bridge (started and stopped by the Chrome extension)'
  path = $bat
  type = 'stdio'
  allowed_origins = @("chrome-extension://$extId/")
}
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))

Step '注册到 Chrome 和 Edge（当前用户）'
foreach ($browserKey in 'HKCU:\Software\Google\Chrome\NativeMessagingHosts', 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts') {
  $key = Join-Path $browserKey $hostName
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
}

if ($RegisterClaude) {
  Step '注册到 Claude Code'
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  $indexJs = Join-Path $root 'dist\index.js'
  if ($claude) {
    # Also drop the pre-rename registration.
    foreach ($old in 'personal-image-browser', 'gptpic') { & $claude.Source mcp remove --scope user $old 2>$null | Out-Null }
    & $claude.Source mcp add --transport stdio --scope user gptpic -- $node $indexJs
  } else {
    Write-Host '未在 PATH 中找到 claude。请手动运行：' -ForegroundColor Yellow
    Write-Host "  claude mcp add --transport stdio --scope user gptpic -- `"$node`" `"$indexJs`""
  }
}

Write-Host ''
Write-Host '安装完成。接下来：' -ForegroundColor Green
Write-Host "  1. 打开 chrome://extensions，开启开发者模式，点“加载已解压的扩展程序”，选择：$(Join-Path $root 'extension')"
Write-Host "     （扩展 ID 应为 $extId）"
Write-Host '  2. 完全退出 Chrome（任务管理器里没有 chrome.exe）后重新打开，让它读取新注册的本地服务。'
Write-Host '  3. 打开并登录 https://chatgpt.com/，点扩展图标 → 启动。'
if (-not $RegisterClaude) { Write-Host '  4. 如需注册到 Claude Code，重新运行并加 -RegisterClaude。' }
