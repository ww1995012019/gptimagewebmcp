# 卸载：删除 native host 注册和生成的文件，可选移除 Claude Code 注册。不删除 .env、output 和扩展本身。
param([switch]$UnregisterClaude)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$hostName = 'com.personal.image_mcp'
foreach ($browserKey in 'HKCU:\Software\Google\Chrome\NativeMessagingHosts', 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts') {
  $key = Join-Path $browserKey $hostName
  if (Test-Path $key) { Remove-Item -Path $key -Recurse -Force; Write-Host "已删除注册：$key" }
}
foreach ($file in 'image-mcp-host.bat', "$hostName.json") {
  $p = Join-Path (Join-Path $root 'native-host') $file
  if (Test-Path $p) { Remove-Item $p -Force; Write-Host "已删除：$p" }
}
if ($UnregisterClaude) {
  $claude = Get-Command claude -ErrorAction SilentlyContinue
  if ($claude) { & $claude.Source mcp remove --scope user gptpic }
  else { Write-Host '未找到 claude，请手动运行：claude mcp remove --scope user gptpic' -ForegroundColor Yellow }
}
Write-Host '卸载完成。如需移除扩展，请在 chrome://extensions 中删除。'
