<#
.SYNOPSIS
    构建 CasaOS-UI 并产出可直接部署到 NAS 的 PWA 静态资源。

.DESCRIPTION
    封装了本仓库构建 UI 时的几个非显而易见的坑：

    1. 必须用 pnpm 9.0.6（package.json 里 packageManager 锁定）。
       用 pnpm 12 装出来的依赖树是坏的 —— 根目录被提升的
       schema-utils@2.7.1 会让 terser-webpack-plugin 报
       "TypeError: validate is not a function"，webpack 连配置都解析不了。
    2. 不能加 --ignore-scripts。
       @vue-office/* 的 postinstall 才会把 lib/v2/index.js、lib/index.css
       拷到 lib/ 下；跳过脚本会导致 DocViewer/ExcelViewer 编译报
       "Can't resolve '@vue-office/docx'"。
    3. Windows 上用 --config.node-linker=hoisted。
       pnpm 9 默认的 isolated 模式会创建符号链接，在本机路径较长时
       触发 "Maximum call stack size exceeded"（ERR_PNPM_SYMLINK_FAILED）。
    4. --config.node-version 显式指定 Node 版本，
       避免 pnpm 去 spawn `node --version` 探测。

.PARAMETER SkipInstall
    跳过依赖安装，只重新构建（依赖已就绪时更快）。

.EXAMPLE
    pwsh -File docs/build-ui.ps1
    pwsh -File docs/build-ui.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [string]$NodeVersion = '22.20.0'
)

$ErrorActionPreference = 'Stop'

$uiRoot = Join-Path $PSScriptRoot '..\UI'
$uiRoot = (Resolve-Path $uiRoot).Path

$pnpmDir = Join-Path $uiRoot '.pnpm9'
$pnpmCjs = Join-Path $pnpmDir 'package\bin\pnpm.cjs'
$storeDir = Join-Path $uiRoot '.pnpm-store9'
$globalDir = Join-Path $uiRoot '.pnpm-home9'

Set-Location $uiRoot

# --- 1. 准备 pnpm 9.0.6 -----------------------------------------------------
if (-not (Test-Path $pnpmCjs)) {
    Write-Host '[1/4] 下载 pnpm 9.0.6 ...' -ForegroundColor Cyan
    $tarball = Join-Path $uiRoot '.pnpm9.tgz'
    curl.exe -sL -o $tarball 'https://registry.npmjs.org/pnpm/-/pnpm-9.0.6.tgz'
    if (-not (Test-Path $tarball)) { throw 'pnpm 下载失败' }
    New-Item -ItemType Directory -Force -Path $pnpmDir | Out-Null
    tar -xzf $tarball -C $pnpmDir
    Remove-Item -Force $tarball
}
Write-Host '[1/4] pnpm 9.0.6 就绪' -ForegroundColor Cyan

# --- 2. 安装依赖 ------------------------------------------------------------
if (-not $SkipInstall) {
    Write-Host '[2/4] 安装依赖（带 install 脚本，hoisted 模式）...' -ForegroundColor Cyan
    node $pnpmCjs install `
        --frozen-lockfile `
        --config.node-version=$NodeVersion `
        --config.node-linker=hoisted `
        --store-dir $storeDir `
        --global-dir $globalDir
    if ($LASTEXITCODE -ne 0) { throw "依赖安装失败（exit $LASTEXITCODE）" }

    # @vue-office/* 的 postinstall 负责生成 lib/index.js 与 lib/index.css。
    # pnpm 复用已安装状态时可能不再执行，这里兜底跑一次。
    foreach ($pkg in @('docx', 'excel', 'pdf')) {
        $script = Join-Path $uiRoot "node_modules\@vue-office\$pkg\lib\script\postinstall.js"
        if (Test-Path $script) { node $script | Out-Null }
    }
} else {
    Write-Host '[2/4] 跳过依赖安装' -ForegroundColor Cyan
}

# --- 3. 构建 ---------------------------------------------------------------
Write-Host '[3/4] 构建 ...' -ForegroundColor Cyan
node (Join-Path $uiRoot 'message_bus.build.js') | Out-Null
node (Join-Path $uiRoot 'node_modules\@vue\cli-service\bin\vue-cli-service.js') build `
    --dest ./build/sysroot/var/lib/casaos/www/ `
    --mode production
if ($LASTEXITCODE -ne 0) { throw "构建失败（exit $LASTEXITCODE）" }

# --- 4. 校验 PWA 产物 -------------------------------------------------------
$out = Join-Path $uiRoot 'build\sysroot\var\lib\casaos\www'
Write-Host '[4/4] 校验 PWA 产物 ...' -ForegroundColor Cyan
$checks = @{
    'sw.js'             = Test-Path (Join-Path $out 'sw.js')
    'site.webmanifest'  = Test-Path (Join-Path $out 'site.webmanifest')
    'index.html'        = Test-Path (Join-Path $out 'index.html')
}
$failed = $false
foreach ($k in $checks.Keys) {
    $ok = $checks[$k]
    if (-not $ok) { $failed = $true }
    Write-Host ("      {0,-18} {1}" -f $k, $(if ($ok) { 'OK' } else { 'MISSING' }))
}

$manifest = Get-Content (Join-Path $out 'site.webmanifest') -Raw | ConvertFrom-Json
Write-Host ("      display={0}  start_url={1}  icons={2}" -f $manifest.display, $manifest.start_url, $manifest.icons.Count)

$size = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum)
Write-Host ("      产物 {0} 个文件，{1} MB" -f $size.Count, [math]::Round($size.Sum / 1MB, 2)) -ForegroundColor DarkGray

Write-Host ''
Write-Host "构建完成。部署到 NAS 的 /var/lib/casaos/www/ 即可生效。" -ForegroundColor Green
if ($failed) { throw 'PWA 产物校验未通过' }
