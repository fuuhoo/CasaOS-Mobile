<#
.SYNOPSIS
    把本地构建好的 CasaOS-UI 部署到 NAS 的前端目录。

.DESCRIPTION
    CasaOS 的前端产物在 NAS 上的 /var/lib/casaos/www/（由 nginx 提供）。
    移动端 App 加载的是 NAS 上的页面，所以本地的改动（返回手势、安全区等）
    必须部署过去才会生效。

    部署前会先备份 NAS 上的现有目录，出问题可以回滚。

.PARAMETER Host
    NAS 的地址。

.PARAMETER User
    SSH 用户名，默认 root。

.PARAMETER Password
    SSH 密码。如果不传，会交互式提示输入。

.PARAMETER RemoteDir
    NAS 上的目标目录，默认 /var/lib/casaos/www。

.PARAMETER Port
    SSH 端口，默认 22。

.EXAMPLE
    pwsh -File docs/deploy-ui.ps1 -Host 192.168.0.114
    pwsh -File docs/deploy-ui.ps1 -Host 192.168.0.114 -Password 'xxx'
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Host,
    [string]$User = 'root',
    [string]$Password,
    [int]$Port = 22,
    [string]$RemoteDir = '/var/lib/casaos/www'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$www = Join-Path $repoRoot 'UI\build\sysroot\var\lib\casaos\www'
if (-not (Test-Path (Join-Path $www 'index.html'))) {
    throw "找不到 UI 构建产物：$www`n请先执行 pwsh -File docs/build-ui.ps1"
}

if (-not $Password) {
    $secure = Read-Host -AsSecureString "请输入 $User@$Host 的密码"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

# sshpass 不一定有，这里用 plink/ssh 的替代方案：
# 优先用 python 的 pexpect-free 方案 —— 直接用 ssh 的 SSH_ASKPASS
$askpass = Join-Path $env:TEMP 'casaos-askpass.ps1'
@"
`$env:CASAOS_SSH_PASSWORD = '$($Password.Replace("'", "''"))'
Write-Output `$env:CASAOS_SSH_PASSWORD
"@ | Out-File -FilePath $askpass -Encoding utf8

$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = 'dummy'
$env:CASAOS_SSH_PASSWORD = $Password

$sshOpts = @(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15',
    '-o', 'PreferredAuthentications=password,keyboard-interactive',
    '-o', 'PubkeyAuthentication=no'
)
$target = "$User@$Host"

function Invoke-Ssh {
    param([string[]]$RemoteCommand)
    $ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
    & $ssh @script:sshOpts -p $Port $target @RemoteCommand
    if ($LASTEXITCODE -ne 0) { throw "SSH 命令失败（exit $LASTEXITCODE）" }
}

Write-Host "==> 检查 NAS 上的目标目录" -ForegroundColor Cyan
Invoke-Ssh @("test -d '$RemoteDir' && echo 'DIR_OK' || echo 'DIR_MISSING'")

Write-Host "==> 备份现有文件" -ForegroundColor Cyan
$backup = "$RemoteDir.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
Invoke-Ssh @("cp -a '$RemoteDir' '$backup' && echo 'BACKUP_OK'")
Write-Host "    备份到 $backup" -ForegroundColor DarkGray

Write-Host "==> 上传新产物" -ForegroundColor Cyan
$tarPath = Join-Path $env:TEMP 'casaos-ui-deploy.tar.gz'
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
tar -czf $tarPath -C $www .
Write-Host "    打包大小 $([math]::Round((Get-Item $tarPath).Length/1MB,2)) MB" -ForegroundColor DarkGray

$scp = 'C:\Windows\System32\OpenSSH\scp.exe'
& $scp @script:sshOpts -P $Port $tarPath "${target}:/tmp/casaos-ui-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "上传失败（exit $LASTEXITCODE）" }

Write-Host "==> 解压到目标目录" -ForegroundColor Cyan
Invoke-Ssh @("tar -xzf /tmp/casaos-ui-deploy.tar.gz -C '$RemoteDir' && rm -f /tmp/casaos-ui-deploy.tar.gz && echo 'EXTRACT_OK'")

Write-Host "==> 校验" -ForegroundColor Cyan
$check = Invoke-Ssh @("ls '$RemoteDir'/sw.js '$RemoteDir'/css/safe-area.css '$RemoteDir'/site.webmanifest 2>&1")
$check | ForEach-Object { "    $_" }

Remove-Item $askpass -Force -ErrorAction SilentlyContinue
Remove-Item $tarPath -Force -ErrorAction SilentlyContinue
$env:CASAOS_SSH_PASSWORD = $null

Write-Host ''
Write-Host "部署完成。请在手机上强制刷新页面（App 里下拉刷新，或重新启动 App）。" -ForegroundColor Green
Write-Host "回滚命令：ssh $User@$Host `"mv '$backup' '$RemoteDir' && systemctl reload nginx`"" -ForegroundColor DarkGray
