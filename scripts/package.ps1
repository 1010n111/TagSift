<#
.SYNOPSIS
  AI 智能标签分类 — Chrome / Edge 商店打包脚本
.DESCRIPTION
  生成一个干净的 .zip 包，可直接上传至 Chrome Web Store 或 Edge Add-ons。
  用法: powershell -ExecutionPolicy Bypass -File scripts\package.ps1
#>

$ErrorActionPreference = "Stop"

# ---- 配置 ----
$ProjectRoot  = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$PackageDir   = Join-Path $ProjectRoot "dist"
$Version      = "1.2.0"
$PackageName  = "ai-tag-extension-v$Version.zip"
$PackagePath  = Join-Path $PackageDir $PackageName

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AI 标签分类扩展 打包脚本" -ForegroundColor Cyan
Write-Host "  版本: $Version" -ForegroundColor Cyan
Write-Host "  输出: $PackagePath" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ---- 清理旧的构建目录 ----
if (Test-Path $PackageDir) {
    Remove-Item -Recurse -Force $PackageDir
}
New-Item -ItemType Directory -Path $PackageDir | Out-Null

# ---- 创建临时构建目录 ----
$BuildDir = Join-Path $PackageDir "_build"
New-Item -ItemType Directory -Path $BuildDir | Out-Null

# ---- 定义需要打包的文件和目录 ----
$IncludeItems = @(
    "manifest.json",
    "background",
    "bookmarks",
    "content",
    "icons",
    "imgs",
    "lib",
    "options",
    "popup"
)

# ---- 复制文件 ----
Write-Host "▶ 复制文件..." -ForegroundColor Yellow

foreach ($item in $IncludeItems) {
    $source = Join-Path $ProjectRoot $item
    $dest   = Join-Path $BuildDir $item

    if (Test-Path $source) {
        if ((Get-Item $source).PSIsContainer) {
            # 目录: 递归复制
            Copy-Item -Recurse -Path $source -Destination $dest
            Write-Host "  ✔ $item\" -ForegroundColor Green
        } else {
            # 文件
            Copy-Item -Path $source -Destination $dest
            Write-Host "  ✔ $item" -ForegroundColor Green
        }
    } else {
        Write-Host "  ⚠ $item not found" -ForegroundColor Yellow
    }
}

# ---- 验证关键文件 ----
Write-Host ""
Write-Host "▶ 验证文件完整性..." -ForegroundColor Yellow

$requiredFiles = @(
    "manifest.json",
    "background/service-worker.js",
    "content/content.js",
    "popup/popup.html",
    "popup/popup.js",
    "options/options.html",
    "options/options.js",
    "lib/storage.js",
    "lib/constants.js",
    "lib/encrypt.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png"
)

$allOk = $true
foreach ($file in $requiredFiles) {
    $path = Join-Path $BuildDir $file
    if (Test-Path $path) {
        Write-Host "  ✔ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✘ $file  MISSING!" -ForegroundColor Red
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host ""
    Write-Host "!! 关键文件缺失，打包中止 !!" -ForegroundColor Red
    Remove-Item -Recurse -Force $PackageDir
    exit 1
}

# ---- 验证 manifest.json ----
$manifestPath = Join-Path $BuildDir "manifest.json"
try {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.manifest_version -ne 3) {
        Write-Host "  ⚠ manifest_version 不是 V3" -ForegroundColor Yellow
    }
    Write-Host "  ✔ manifest.json 有效 (v$($manifest.version))" -ForegroundColor Green
} catch {
    Write-Host "  ✘ manifest.json 格式错误: $_" -ForegroundColor Red
    Remove-Item -Recurse -Force $PackageDir
    exit 1
}

# ---- 创建 ZIP 包 ----
Write-Host ""
Write-Host "▶ 创建 ZIP 包..." -ForegroundColor Yellow

# Compress-Archive 会把目录本身也打包进去，所以我们先进去再打包
Push-Location $BuildDir
try {
    Compress-Archive -Path * -DestinationPath $PackagePath -Force
    Write-Host "  ✔ $PackageName" -ForegroundColor Green
} finally {
    Pop-Location
}

# ---- 计算大小 ----
$size = (Get-Item $PackagePath).Length
$sizeKB = [math]::Round($size / 1KB, 1)
$sizeMB = [math]::Round($size / 1MB, 2)

# ---- 清理构建目录 ----
Remove-Item -Recurse -Force $BuildDir

# ---- 完成 ----
Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ 打包完成!" -ForegroundColor Green
Write-Host "  文件: $PackageName" -ForegroundColor White
Write-Host "  大小: $sizeKB KB ($sizeMB MB)" -ForegroundColor White
Write-Host "  位置: dist\$PackageName" -ForegroundColor White
Write-Host ""
Write-Host "  接下来：" -ForegroundColor Cyan
Write-Host "  Chrome Web Store:  https://chrome.google.com/webstore/devconsole" -ForegroundColor White
Write-Host "  Edge Add-ons:      https://partner.microsoft.com/dashboard/microsoftedge" -ForegroundColor White
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
