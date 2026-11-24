<#
.SYNOPSIS
    构建 CasaOS Android APK（Capacitor + CasaOS-UI）。

.DESCRIPTION
    完整链路：UI 生产构建 -> cap sync（把网页资源与配置同步进 Android 工程）
    -> Gradle 打 release 包 -> 拷贝到 dist/。

    沿用了两个已验证的规避点：
      1. Gradle 依赖默认走 dl.google.com / repo.maven.apache.org，
         在部分网络下 TLS 握手会随机失败；$GRADLE_USER_HOME/init.d/mirrors.gradle
         已把所有仓库指向阿里云镜像。
      2. Capacitor 需要 JDK 17+（本机用 JDK 21），以及 Android SDK 35。

.PARAMETER DebugBuild
    产出 debug 包（默认出 release 包，签名用项目内的自用 keystore）。
    注意：不能叫 -Debug，那是 PowerShell 的公共参数名。

.PARAMETER SkipUiBuild
    跳过 UI 构建，直接用已有的 UI 产物。

.EXAMPLE
    pwsh -File mobile/build-apk.ps1
    pwsh -File mobile/build-apk.ps1 -SkipUiBuild -DebugBuild
#>
[CmdletBinding()]
param(
    [switch]$DebugBuild,
    [switch]$SkipUiBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mobileRoot = Join-Path $repoRoot 'mobile'
$androidRoot = Join-Path $mobileRoot 'android'

# --- 环境准备 --------------------------------------------------------------
$jdk = 'C:\Users\fubin\.version-fox\cache\java\v-21.0.2+13\java-21.0.2+13'
if (Test-Path (Join-Path $jdk 'bin\java.exe')) {
    $env:JAVA_HOME = $jdk
} elseif (-not $env:JAVA_HOME) {
    throw '找不到 JDK 21（Capacitor 需要 JDK 17+）'
}

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not (Test-Path $sdk)) { throw "找不到 Android SDK：$sdk" }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

# Gradle 缓存放在项目里，避免污染用户全局目录
$gradleHome = Join-Path $mobileRoot '.gradle-home'
$env:GRADLE_USER_HOME = $gradleHome
$env:npm_config_cache = Join-Path $mobileRoot '.npm-cache'

Write-Host "JDK      : $env:JAVA_HOME" -ForegroundColor DarkGray
Write-Host "SDK      : $env:ANDROID_HOME" -ForegroundColor DarkGray
Write-Host "Gradle   : $env:GRADLE_USER_HOME" -ForegroundColor DarkGray

# --- 1. UI 生产构建 --------------------------------------------------------
if (-not $SkipUiBuild) {
    Write-Host '[1/4] 构建 CasaOS-UI ...' -ForegroundColor Cyan
    & (Join-Path $repoRoot 'docs\build-ui.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'UI 构建失败' }
} else {
    Write-Host '[1/4] 跳过 UI 构建' -ForegroundColor Cyan
}

# --- 2. 同步到 Android 工程 ------------------------------------------------
Write-Host '[2/4] cap sync ...' -ForegroundColor Cyan
Push-Location $mobileRoot
try {
    npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'cap sync 失败' }
} finally {
    Pop-Location
}

# --- 3. Gradle 打包 --------------------------------------------------------
$task = if ($DebugBuild) { 'assembleDebug' } else { 'assembleRelease' }
Write-Host "[3/4] gradlew $task ..." -ForegroundColor Cyan
Push-Location $androidRoot
try {
    & (Join-Path $androidRoot 'gradlew.bat') $task --no-daemon --max-workers=2
    if ($LASTEXITCODE -ne 0) { throw "Gradle 构建失败（exit $LASTEXITCODE）" }
} finally {
    Pop-Location
}

# --- 4. 收集产物 -----------------------------------------------------------
Write-Host '[4/4] 收集产物 ...' -ForegroundColor Cyan
$variant = if ($DebugBuild) { 'debug' } else { 'release' }
$built = Join-Path $androidRoot "app\build\outputs\apk\$variant\app-$variant.apk"
if (-not (Test-Path $built)) { throw "找不到 APK：$built" }

$dist = Join-Path $repoRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$name = if ($DebugBuild) { 'CasaOS-debug.apk' } else { 'CasaOS-1.0.0-release.apk' }
$target = Join-Path $dist $name
Copy-Item $built $target -Force

$size = [math]::Round((Get-Item $target).Length / 1MB, 2)
Write-Host ''
Write-Host "APK 就绪：$target  ($size MB)" -ForegroundColor Green
Write-Host '安装：adb install -r "<apk 路径>"  或把 APK 传到手机点击安装' -ForegroundColor DarkGray
