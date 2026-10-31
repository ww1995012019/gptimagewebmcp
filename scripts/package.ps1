# 生成可分发的 zip。只打包白名单里的文件，并检查不含登录资料、令牌、.env 等本机私密文件。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\package.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'extension\manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$include = @('src', 'scripts', 'extension', 'tests', 'package.json', 'package-lock.json', 'tsconfig.json', '.env.example', '.gitignore', 'README.md', 'EXTENSION.md', 'install.cmd')
# 任何路径片段命中这些名字都不允许进入安装包。
$forbidden = @('.env', '.bridge-token', 'connection.json', '.browser-profile', 'node_modules', 'output', 'dist', 'native-host', 'release', 'logs')

$stage = Join-Path $env:TEMP "image-mcp-package-$([guid]::NewGuid())"
$name = "personal-image-mcp-$version"
$target = Join-Path $stage $name
New-Item -ItemType Directory -Force $target | Out-Null
try {
  foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) { throw "缺少 $item" }
    Copy-Item $src -Destination (Join-Path $target $item) -Recurse -Force
  }
  $bad = Get-ChildItem $target -Recurse -Force | Where-Object {
    $rel = $_.FullName.Substring($target.Length + 1)
    ($rel -split '[\\/]') | Where-Object { $forbidden -contains $_ }
  }
  foreach ($b in $bad) { Remove-Item $b.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  $left = Get-ChildItem $target -Recurse -Force | Where-Object { ($_.FullName.Substring($target.Length + 1) -split '[\\/]') | Where-Object { $forbidden -contains $_ } }
  if ($left) { throw "仍包含私密文件：$($left.FullName -join ', ')" }

  $release = Join-Path $root 'release'
  New-Item -ItemType Directory -Force $release | Out-Null
  $zip = Join-Path $release "$name.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path $target -DestinationPath $zip
  Write-Host "已生成：$zip" -ForegroundColor Green
  if ($bad) { Write-Host "已排除：$(($bad | ForEach-Object { $_.FullName.Substring($target.Length + 1) }) -join ', ')" }
} finally {
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}
