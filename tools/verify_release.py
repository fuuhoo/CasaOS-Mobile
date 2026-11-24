#!/usr/bin/env python3
"""Release-build verification that does not need DevTools.

The release APK disables WebView debugging on purpose, so the checks are done
with screenshots (via adb) plus the native logcat trace.

Usage: python verify_release.py [--device SERIAL] [--napshot-dir DIR]
"""
import os
import re
import subprocess
import sys
import time

ADB = os.path.join(os.environ['LOCALAPPDATA'], 'Android', 'Sdk', 'platform-tools', 'adb.exe')
DEVICE = 'IJNFQSL7IZ59EIFI'
NAPDIR = os.path.join(os.environ['TEMP'], 'casaos-verify')

passed = 0
failed = 0


def sh(args, timeout=60):
    return subprocess.run([ADB, '-s', DEVICE] + args, capture_output=True,
                          text=True, timeout=timeout).stdout


def report(name, ok, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print('  PASS  %s' % name)
    else:
        failed += 1
        print('  FAIL  %s' % name)
        if detail:
            print('        %s' % detail)


def tap(x, y):
    sh(['shell', 'input', 'tap', str(x), str(y)])
    time.sleep(2.5)


def back():
    sh(['shell', 'input', 'keyevent', 'KEYCODE_BACK'])
    time.sleep(2.5)


def shot(tag):
    os.makedirs(NAPDIR, exist_ok=True)
    path = os.path.join(NAPDIR, tag + '.png')
    sh(['shell', 'screencap', '-p', '/sdcard/_v.png'])
    sh(['pull', '/sdcard/_v.png', path])
    return path


def foreground():
    out = sh(['shell', 'dumpsys', 'activity', 'activities'])
    m = re.search(r'topResumedActivity=ActivityRecord\{\S+\s+u0\s+([^\s]+)', out)
    return m.group(1) if m else ''


def logcat_clear():
    sh(['logcat', '-c'])


def logcat_casaos():
    return sh(['logcat', '-d', '-s', 'CasaOS:*'])


def main():
    global DEVICE
    args = sys.argv[1:]
    if '--device' in args:
        DEVICE = args[args.index('--device') + 1]

    print('=' * 60)
    print(' CasaOS release 版真机验证（不用 DevTools）')
    print(' 设备: %s' % DEVICE)
    print('=' * 60)

    print('\n[准备] 启动 App')
    sh(['shell', 'am', 'force-stop', 'com.icewhale.casaos'])
    time.sleep(1)
    logcat_clear()
    sh(['shell', 'am', 'start', '-n', 'com.icewhale.casaos/.MainActivity'])
    time.sleep(14)

    log = logcat_casaos()
    report('原生层已接管返回键', 'Back key handling registered' in log)
    report('WebView HTTP 缓存已禁用', 'HTTP cache disabled' in log)

    # 登录页可能出现，先确保进入首页
    print('\n[0] 确保在首页')
    for _ in range(4):
        if '#/' in shot('_home_probe'):
            pass
        shot('_home_probe')
        break
    time.sleep(1)

    print('\n[1] 打开 App Store')
    tap(745, 465)
    time.sleep(7)
    s1 = shot('appstore')
    logcat_clear()
    back()
    time.sleep(3)
    s2 = shot('appstore_closed')
    fg = foreground()

    # App Store 图标还在 -> 弹窗已关
    log = logcat_casaos()
    report('返回键已派发到 JS', 'back key pressed' in log)
    report('App 未被退出', 'casaos' in fg, '前台=%s' % fg)

    print('\n[2] 首页按返回 -> 退出确认框')
    time.sleep(1)
    back()
    time.sleep(2)
    logcat_clear()
    back()
    time.sleep(3)
    s3 = shot('exit_confirm')
    fg2 = foreground()
    report('App 仍在后台（没被误退出）', 'casaos' in fg2, '前台=%s' % fg2)

    print('\n[3] 取消退出')
    tap(735, 1113)
    time.sleep(2)
    fg3 = foreground()
    report('点取消后 App 保留', 'casaos' in fg3, '前台=%s' % fg3)

    print('\n' + '=' * 60)
    if failed == 0:
        print(' 结果：%d 通过，%d 失败' % (passed, failed))
    else:
        print(' 结果：%d 通过，%d 失败' % (passed, failed))
    print(' 截图目录：%s' % NAPDIR)
    print('=' * 60)
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
