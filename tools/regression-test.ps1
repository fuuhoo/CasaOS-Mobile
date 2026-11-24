<#
.SYNOPSIS
    CasaOS 移动端真机回归测试（PowerShell 版）。

.DESCRIPTION
    逐条验证本轮修掉的问题：
      1. 文件管理器里的「存储列表」按钮可见
      2. 点它能展开存储列表
      3. 返回键在文件管理器根目录时关闭弹窗
      4. 返回键在 App Store 里关闭弹窗而不是退出 App
      5. 返回键在首页弹出退出二次确认
      6. 「取消」关掉确认框，App 保留
      7. 全面屏安全区变量已注入

.EXAMPLE
    pwsh -File tools/regression-test.ps1
#>
[CmdletBinding()]
param(
    [string]$Device = '192.168.0.214:34369',
    [int]$DevToolsPort = 9333
)

$ErrorActionPreference = 'Continue'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$py = 'C:\Users\fubin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$cdp = 'H:\project_self\CasaOS\tools\cdp.py'
$env:PYTHONIOENCODING = 'utf-8'

$script:pass = 0
$script:fail = 0

function Write-Step($t) { Write-Host ''; Write-Host "[$t]" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  PASS  $t" -ForegroundColor Green; $script:pass++ }
function Bad($t, $detail) {
    Write-Host "  FAIL  $t" -ForegroundColor Red
    if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
    $script:fail++
}
function Assert-Eq($name, $actual, $expected) {
    if ($actual -eq $expected) { Ok $name }
    else { Bad $name "期望 '$expected'，实际 '$actual'" }
}
function Assert-Match($name, $actual, $pattern) {
    if ($actual -match $pattern) { Ok "$name  ($actual)" }
    else { Bad $name "不匹配 '$pattern'，实际 '$actual'" }
}

function Invoke-Cdp([string]$expr) {
    $out = & $py $cdp --port $DevToolsPort $expr 2>&1 | Out-String
    # cdp.py 第一行会打印 "target: ...",真正��结果在后面;
    # 结果为空字符串时只会多出一个空行,所以要过滤掉这两类。
    $lines = @($out -split "`r?`n" | Where-Object {
        $_.Trim() -ne '' -and $_ -notmatch '^target:'
    })
    if ($lines.Count -eq 0) { return '' }
    return $lines[-1].Trim()
}

function Get-VisibleModals {
    Invoke-Cdp "(function(){var ms=document.querySelectorAll('.modal');var r=[];for(var i=0;i<ms.length;i++){if(ms[i].style.display!=='none')r.push(ms[i].className.replace('modal ','').replace(' is-active',''))}return r.join(',')})()"
}

function Get-Foreground {
    $r = & $adb -s $Device shell dumpsys activity activities 2>&1 | Out-String
    if ($r -match 'topResumedActivity=ActivityRecord\{\S+\s+u0\s+([^\s]+)') { return $Matches[1] }
    return ''
}

function Tap($x, $y) { & $adb -s $Device shell input tap $x $y 2>&1 | Out-Null; Start-Sleep -Milliseconds 900 }
function BackKey { & $adb -s $Device shell input keyevent KEYCODE_BACK 2>&1 | Out-Null; Start-Sleep -Seconds 2 }

<#
    等待某个可见 modal 出现/消失。
    UI 是异步渲染的（Vue nextTick + Buefy 过渡动画），不等待就会在状态还没更新时
    就去点下一步，导致测试结果失真（比如 App Store 压根没打开就按返回）。
#>
function Wait-Modal($pattern, $shouldExist, $timeoutSec = 12) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        $v = Get-VisibleModals
        $exists = $v -match $pattern
        if ($exists -eq $shouldExist) { return $true }
        Start-Sleep -Milliseconds 600
    }
    return $false
}

Write-Host '=============================================='
Write-Host ' CasaOS 移动端真机回归测试' -ForegroundColor Yellow
Write-Host " 设备: $Device" -ForegroundColor DarkGray
Write-Host '=============================================='

# --- 准备：干净启动 ---
Write-Step '准备'
& $adb -s $Device shell am force-stop com.icewhale.casaos 2>&1 | Out-Null
& $adb -s $Device shell am start -n com.icewhale.casaos/.MainActivity 2>&1 | Out-Null
Start-Sleep -Seconds 15
$pid2 = (& $adb -s $Device shell pidof com.icewhale.casaos).Trim()
& $adb -s $Device forward --remove-all 2>&1 | Out-Null
& $adb -s $Device forward "tcp:$DevToolsPort" "localabstract:webview_devtools_remote_$pid2" 2>&1 | Out-Null
Start-Sleep -Seconds 3
$bundle = Invoke-Cdp "Array.prototype.map.call(document.querySelectorAll('script[src]'),function(s){return s.src.split('/').pop()}).join(' | ')"
Write-Host "  加载的 bundle: $bundle" -ForegroundColor DarkGray
if ($bundle -match 'app\.([a-f0-9]+)\.js') {
    $ver = $Matches[1]
    $remote = (Invoke-WebRequest -Uri 'http://192.168.0.114:8880/index.html' -TimeoutSec 10 -UseBasicParsing).Content
    if ($remote -match "/app\.([a-f0-9]+)\.js" -and $Matches[1] -eq $ver) { Ok "bundle 已是最新 ($ver)" }
    else { Bad 'bundle 已是最新' "本地 $ver / NAS $($Matches[1])" }
}

# --- 1. 存储列表按钮可见 ---
Write-Step '1. 文件管理器的「存储列表」按钮可见'
Tap 1036 460   # Files 图标
if (-not (Wait-Modal 'file-panel' $true)) { Bad '文件管理器已打开' '等待超时' }
else { Ok '文件管理器已打开' }
Start-Sleep -Seconds 2
$btn = Invoke-Cdp "(function(){var b=document.getElementById('file-sidebar-btn');if(!b)return 'NOT_FOUND';var r=b.getBoundingClientRect();return getComputedStyle(b).display+' '+Math.round(r.width)+'x'+Math.round(r.height)})()"
Write-Host "    按钮状态: $btn" -ForegroundColor DarkGray
if ($btn -match 'NOT_FOUND') { Bad '按钮存在' 'DOM 里找不到 #file-sidebar-btn' }
elseif ($btn -match '0x0') { Bad '按钮可见' "尺寸为 0 ($btn)" }
else { Ok "按钮可见 ($btn)" }

# --- 2. 点击展开存储列表 ---
Write-Step '2. 点击按钮能展开存储列表'
Invoke-Cdp "(function(){var b=document.getElementById('file-sidebar-btn');var r=b.getBoundingClientRect();['mousedown','mouseup','click'].forEach(function(t){b.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:r.x+8,clientY:r.y+8}))});return 'clicked'})()" | Out-Null
Start-Sleep -Seconds 2
$sbw = Invoke-Cdp "(function(){var c=document.querySelector('.modal.file-panel .sidebar-content');return c?Math.round(c.getBoundingClientRect().width):0})()"
Assert-Eq '存储列表已展开' $sbw '240'

# --- 3. 返回键关闭文件管理器 ---
Write-Step '3. 返回键：文件管理器在根目录时关闭弹窗'
BackKey
$closed = Wait-Modal 'file-panel' $false
$v = Get-VisibleModals
Write-Host "    可见 modal: $(if ($v) { $v } else { '无' })" -ForegroundColor DarkGray
if ($closed) { Ok '文件管理器已关闭' } else { Bad '文件管理器已关闭' "仍然是 $v" }
Start-Sleep -Seconds 2

# --- 4. 返回键关闭 App Store ---
Write-Step '4. 返回键：App Store 里应该关闭弹窗而不是退出 App'
Tap 792 460    # App Store 图标
if (-not (Wait-Modal 'app-panel' $true)) { Bad 'App Store 已打开' '等待超时（可能点到了残留界面）' }
else { Ok 'App Store 已打开' }
Start-Sleep -Seconds 2
BackKey
$closed = Wait-Modal 'app-panel' $false
$f = Get-Foreground
Write-Host "    返回后可见 modal: $(if ($v) { $v } else { '无' })" -ForegroundColor DarkGray
Write-Host "    前台: $f" -ForegroundColor DarkGray
if ($closed) { Ok 'App Store 已关闭' } else { Bad 'App Store 已关闭' "仍然是 $(Get-VisibleModals)" }
Assert-Match 'App 未退出' $f 'casaos'

# --- 5. 返回键弹退出确认 ---
Write-Step '5. 返回键：首页应该弹退出二次确认'
BackKey
$dlg = Wait-Modal 'dialog' $true
$f = Get-Foreground
Write-Host "    可见 modal: $(Get-VisibleModals)" -ForegroundColor DarkGray
Write-Host "    前台: $f" -ForegroundColor DarkGray
if ($dlg) { Ok '退出确认框已弹出' } else { Bad '退出确认框已弹出' "可见 modal: $(Get-VisibleModals)" }
Assert-Match 'App 未退出' $f 'casaos'

# --- 6. 取消 ---
Write-Step '6. 点「取消」关掉确认框，App 保留'
Tap 735 1113
$gone = Wait-Modal 'dialog' $false
$f = Get-Foreground
if ($gone) { Ok '确认框已关闭' } else { Bad '确认框已关闭' "仍然是 $(Get-VisibleModals)" }
Assert-Match 'App 仍在前台' $f 'casaos'

# --- 7. 安全区 ---
Write-Step '7. 全面屏：安全区变量已注入'
$sa = Invoke-Cdp "(function(){var s=getComputedStyle(document.documentElement);return s.getPropertyValue('--sa-top').trim()+' / '+s.getPropertyValue('--sa-bottom').trim()})()"
Write-Host "    --sa-top / --sa-bottom = $sa" -ForegroundColor DarkGray
if ($sa -match '^0px') { Bad '安全区已注入' "仍是 $sa" } else { Ok "安全区已注入 ($sa)" }

Write-Host ''
Write-Host '==============================================' -ForegroundColor Yellow
if ($script:fail -eq 0) {
    Write-Host " 结果：$($script:pass) 通过，$($script:fail) 失败" -ForegroundColor Green
} else {
    Write-Host " 结果：$($script:pass) 通过，$($script:fail) 失败" -ForegroundColor Red
}
Write-Host '==============================================' -ForegroundColor Yellow
exit ($(if ($script:fail -eq 0) { 0 } else { 1 }))
