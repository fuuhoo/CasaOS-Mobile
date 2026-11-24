# 迅雷玩客云（OneCloud）插盘启动卡在「选择启动方式」的解决方案

> 适用设备：迅雷玩客云 OneCloud（Amlogic S805 / meson8b，8GB eMMC + SD 卡）
> 系统：Armbian 24.11.1 jammy（Ubuntu 22.04 用户空间），内核 6.10.14-edge-meson
> 记录时间：2026-11-22
> 状态：**已实施并验证启动正常**（插 U 盘场景待实机复验）

---

## 一、现象

插着外接硬盘（或 U 盘）启动时，机器停在 U-Boot 的「请选择启动方式」菜单上，不进入 Linux：

```
==============================================================
Please set "bootdev" before calling this script.

Boot from usb:
  setenv bootdev "usb 0"
  usb start
  fatload ${bootdev} 0x20800000 boot.scr && autoscr 0x20800000

Boot from eMMC:
  setenv bootdev "mmc 1"
  fatload ${bootdev} 0x20800000 boot.scr && autoscr 0x20800000
==============================================================
```

这个菜单不是 U-Boot 自带的，而是 **Armbian 的 `boot.cmd` 脚本自己打印的**，随后 `exit 22` 停在 U-Boot 提示符。

---

## 二、根因分析

### 2.1 触发条件

`/boot/boot.cmd` 的开头（原始版本）：

```sh
# We can't use `test -z` due to the bug:
# https://lists.denx.de/pipermail/u-boot/2005-August/011447.html
if test -n "${bootdev}"; test $? != 0; then
	echo '=============================================================='
	echo 'Please set "bootdev" before calling this script.'
	...
	exit 22
fi

echo "Try to boot from ${bootdev}"

fatload ${bootdev} 0x20800000 /armbianEnv.txt && env import -t 0x20800000 ${filesize}
```

逻辑是：**`${bootdev}` 为空 → 打印菜单 → `exit 22` 停在 U-Boot**。

`bootdev` 由 U-Boot 环境提供，而 U-Boot 环境的 `bootcmd` 是这样串联的：

```
bootcmd = print 'Autobooting...'; run boot_usb_armbian; run boot_sdcard_armbian; run boot_emmc_armbian; print 'Failed to boot';

boot_usb_armbian   = ... setenv bootdev 'usb 0'; usb start && fatload ${bootdev} ${loadaddr} boot.scr && autoscr ${loadaddr}; print 'Fail';
boot_sdcard_armbian = ... mmc rescan 0; setenv bootdev 'mmc 0'; fatload ${bootdev} ${loadaddr} boot.scr && autoscr ${loadaddr}; print 'Fail';
boot_emmc_armbian  = ... mmc rescan 1; setenv bootdev 'mmc 1'; fatload ${bootdev} ${loadaddr} boot.scr && autoscr ${loadaddr}; print 'Fail';
```

三条分支里，**只有真正读到 `boot.scr` 的那一条会设置 `bootdev`**。也就是说：

> 只要前面所有分支都没能成功加载 `boot.scr`（例如插着的 U 盘让 `usb start` 或 `fatload usb 0` 行为异常），
> `bootdev` 就一直是空的 —— 而 `boot.scr` 里恰好又依赖 `bootdev`，于是死循环在这个菜单。

### 2.2 三个叠加的诱因

| # | 诱因 | 说明 |
|---|---|---|
| 1 | **`bootcmd` 把 USB 排在 eMMC 前面** | `run boot_usb_armbian` 是第一顺位。插着 U 盘时，U-Boot 会先探测 USB，行为受插的盘影响，最容易走到「没设上 bootdev」的分支 |
| 2 | **`preboot` 里跑 Amlogic 的 USB 烧录探测** | `preboot = run prepare_video; run check_usbburn; ...`，而 `check_usbburn = print -n 'Checking USBBurn...'; update 1000; print 'Fail';`。`update 1000` 是 Amlogic 的 USB Burning Tool 检测，插着 USB 盘时可能进入烧录/启动选择界面 |
| 3 | **eMMC 被 USB 驱动识别** | `dmesg` 显示 `mmcblk0: mmc0:0001 SD16G 58.2 GiB`（SD 卡）挂载成了 `/media/devmon/sda1-usb-Mass_Storage_Dev`，名字里带 `usb`，容易和真实 USB 盘混淆，也让 U-Boot 阶段的 USB 探测更混乱 |

### 2.3 硬件与分区实况（已核实）

```
型号        : Xunlei OneCloud（迅雷玩客云）
SoC         : Amlogic meson8b（S805），ARMv7
rootdev     : UUID=cce523f4-53c6-40a2-96b0-ce8aea662ad0  = /dev/mmcblk1p2 (armbi_root, ext4)

/dev/mmcblk0  = SD 卡   SD16G 58.2G   -> mmc 0
/dev/mmcblk1  = eMMC    8GTF4R 7.28G  -> mmc 1
  mmcblk1p1   = FAT16 256M  (armbi_boot, 挂载在 /boot)
  mmcblk1p2   = ext4  7G     (armbi_root, 根分区)
  mmcblk1boot0/boot1 = Amlogic bootloader 各 4M
```

注意：`mmc 0` = SD 卡，`mmc 1` = eMMC（系统盘）。

---

## 三、U-Boot 环境的存放位置与格式（逆向确认）

玩客云的 U-Boot 环境**没有独立分区**，藏在 eMMC 的保留区里。实测定位：

| 项 | 值 |
|---|---|
| 设备 | `/dev/mmcblk1`（eMMC） |
| 绝对偏移 | `0x800000`（8 MiB 处，在分区表之前） |
| 长度 | 64 KiB（`0x800000` – `0x80FFFF`），其后全为 0 |
| 副本数量 | **只有 1 份**（已扫描前 16 MiB 确认，无冗余备份） |

**格式**（非标准 U-Boot env，是 Amlogic 私有布局，没有 flags/size 字段）：

```
+0x0000  uint32 LE   zlib CRC32 (init=0xFFFFFFFF, xor=0xFFFFFFFF) 覆盖后面 65532 字节
+0x0004  65532 字节  "name=value\0" 依次排列，尾部用 0x00 填充
```

CRC 算法已用 `tools/uboot_env_crc_wide.py` 穷举验证：

```
stored CRC: 0xAE255099
MATCH start=4 variant=zlib length=65532 (data abs 0x800004)
```

---

## 四、实施方案（两层防护）

思路：**在脚本层消除菜单 + 在环境层消除触发条件**。两层互相独立，任何一层单独失效都还能兜住。

### 4.1 第一层：`/boot/boot.cmd`（低风险，只动 FAT 分区上的脚本）

改动两处：

**① `bootdev` 为空时不再进菜单，直接用 eMMC**

```sh
# `bootdev` is normally set by the U-Boot environment before this script
# runs (see bootcmd / boot_emmc_armbian in the U-Boot env). If it is not
# set we used to print a "choose a boot device" menu and stop at the
# U-Boot prompt, which left the NAS hanging on every boot where the
# environment had lost the variable (for example when a USB disk was
# attached). The system disk of the OneCloud is the eMMC, so just use it.
#
# To boot from a USB stick instead, set it in the U-Boot prompt first:
#   setenv bootdev "usb 0"
#   usb start
#   fatload ${bootdev} 0x20800000 boot.scr && autoscr 0x20800000
if test -n "${bootdev}"; test $? != 0; then
	echo 'bootdev is not set, booting from eMMC (mmc 1) by default'
	setenv bootdev "mmc 1"
fi
```

**② 目标设备读不到时自动回退 eMMC**（插了盘但盘上没有系统的情况）

```sh
# If the device named by bootdev cannot be read (a USB disk is attached
# but carries no bootable system), fall back to the eMMC instead of
# failing later on and leaving the NAS at the U-Boot prompt.
fatload ${bootdev} 0x20800000 /armbianEnv.txt
if test $? != 0; then
	echo "Failed to read from ${bootdev}, falling back to eMMC"
	setenv bootdev "mmc 1"
	fatload ${bootdev} 0x20800000 /armbianEnv.txt
fi
env import -t 0x20800000 ${filesize}
```

重新编译并安装：

```sh
cd /boot
mkimage -C none -A arm -T script -d /boot/boot.cmd /tmp/boot.scr.new
cp /tmp/boot.scr.new /boot/boot.scr
```

> 工具：`tools/patch_boot_cmd.py`（幂等补丁，带版本校验，匹配不到会报错退出）

### 4.2 第二层：U-Boot 环境变量（改动 eMMC 保留区，已备份）

三个变量：

| 变量 | 原值 | 新值 | 作用 |
|---|---|---|---|
| `bootdev` | *（不存在）* | `mmc 1` | 钉死启动设备，从根上不让 `boot.cmd` 走到菜单分支 |
| `bootcmd` | `... run boot_usb_armbian; run boot_sdcard_armbian; run boot_emmc_armbian; ...` | `... run boot_emmc_armbian; run boot_sdcard_armbian; run boot_usb_armbian; ...` | **eMMC 优先**，正常开机根本不碰 USB，插盘也无所谓；USB 保留为最后兜底 |
| `check_usbburn` | `print -n 'Checking USBBurn...'; update 1000; print 'Fail';` | `print 'Skipping USBBurn check';` | 关掉 Amlogic 的 USB 烧录探测（`update 1000`），它只在出厂刷机时有用，却是插盘时进入「启动选择」界面的元凶之一 |

其余 **31 个变量全部保持不变**（`ethaddr`、`hostname`、`display_*`、`preboot`、`boot_emmc_armbian` 等）。

写入步骤（`tools/uboot_env_tool.py` + `write_env.sh`）：

```sh
# 1. 备份
dd if=/dev/mmcblk1 of=/root/uboot-env-backup.bin bs=4096 skip=2048 count=16
cp -a /root/uboot-env-backup.bin /boot/uboot-env-backup.bin

# 2. 写入（生成的新块已用 zlib CRC32 自校验，且做过解析回读比对）
dd if=/tmp/ubootenv.new.bin of=/dev/mmcblk1 bs=4096 seek=2048 count=16 conv=notrunc
sync

# 3. 回读校验
dd if=/dev/mmcblk1 of=/tmp/env-readback.bin bs=4096 skip=2048 count=16
cmp /tmp/env-readback.bin /tmp/ubootenv.new.bin    # 必须一致
```

实测写入结果：

```
backup CRC: ae255099
new CRC:    d42d15ce
READBACK MATCHES: OK
  [OK]      bootdev=mmc 1
  [OK]      run boot_emmc_armbian; run boot_sdcard_armbian
  [OK]      Skipping USBBurn check
```

> 工具：`tools/uboot_env_tool.py`（解析 → 改 → 重新计算 CRC → 序列化 → 回读自比对，任何一步不通过就拒绝写盘）

---

## 五、文件清单

### NAS 上

| 路径 | 说明 |
|---|---|
| `/boot/boot.cmd` | 已打补丁的脚本（2982 字节） |
| `/boot/boot.scr` | 已用 `mkimage` 重新编译（3054 字节） |
| `/boot/boot.cmd.bak` | 原始 `boot.cmd` 备份（2434 字节） |
| `/boot/boot.scr.bak` | 原始 `boot.scr` 备份（2506 字节） |
| `/boot/uboot-env-backup.bin` | 原始 U-Boot 环境备份（64 KiB，CRC `ae255099`） |
| `/root/uboot-env-backup.bin` | 同上，另一份副本 |
| `/boot/restore-uboot-env.sh` | 一键回滚脚本 |

### 本地仓库

| 路径 | 说明 |
|---|---|
| `tools/parse_uboot_env.py` | 解析 U-Boot env 块，打印全部变量与 CRC 状态 |
| `tools/uboot_env_crc.py` | 在候选长度上匹配 CRC 变体 |
| `tools/uboot_env_crc_wide.py` | 扩大范围穷举 CRC 算法/长度/起始偏移（**最终定位用的是这个**） |
| `tools/uboot_env_tool.py` | 解析 → 修改 → 重算 CRC → 序列化 → 回读自校验，生成待写入的 env 块 |
| `tools/patch_boot_cmd.py` | 给 `boot.cmd` 打补丁（幂等，带版本校验） |

---

## 六、回滚方法

### 6.1 只回滚 U-Boot 环境

```sh
bash /boot/restore-uboot-env.sh
# 等价于：
#   dd if=/boot/uboot-env-backup.bin of=/dev/mmcblk1 bs=4096 seek=2048 count=16 conv=notrunc
#   sync
```

### 6.2 回滚 boot.cmd / boot.scr

```sh
cp -a /boot/boot.cmd.bak /boot/boot.cmd
cp -a /boot/boot.scr.bak /boot/boot.scr
```

### 6.3 最坏情况：完全进不去系统（卡在 U-Boot 提示符）

在 U-Boot 提示符下用串口/HDMI 手动敲：

```
setenv bootdev "mmc 1"
usb start
fatload mmc 1 0x20800000 boot.scr && autoscr 0x20800000
```

进系统后再跑 6.1 / 6.2 恢复。

---

## 七、重装系统后如何复现本方案

如果以后重刷 Armbian，`boot.cmd` 会被还原、U-Boot 环境也可能被重置。按下面顺序重做：

```sh
# 1. 备份当前 U-Boot 环境（务必先做）
dd if=/dev/mmcblk1 of=/root/uboot-env-backup.bin bs=4096 skip=2048 count=16
cp -a /root/uboot-env-backup.bin /boot/uboot-env-backup.bin

# 2. 确认环境块偏移（不同固件可能不同，用关键字定位）
dd if=/dev/mmcblk1 of=/tmp/mbrgap.bin bs=1M count=16
grep -a -b -o -E 'bootcmd|boot_emmc_armbian' /tmp/mbrgap.bin

# 3. 打补丁 + 重编 boot.scr
python3 tools/patch_boot_cmd.py /boot/boot.cmd /tmp/boot.cmd.new
cd /boot && mkimage -C none -A arm -T script -d /tmp/boot.cmd.new /tmp/boot.scr.new
cp /tmp/boot.cmd.new /boot/boot.cmd
cp /tmp/boot.scr.new /boot/boot.scr

# 4. 改 U-Boot 环境
python3 tools/uboot_env_tool.py <环境dump> /tmp/ubootenv.new.bin
dd if=/tmp/ubootenv.new.bin of=/dev/mmcblk1 bs=4096 seek=2048 count=16 conv=notrunc
sync

# 5. 校验
dd if=/dev/mmcblk1 of=/tmp/chk.bin bs=4096 skip=2048 count=16
cmp /tmp/chk.bin /tmp/ubootenv.new.bin && echo OK
```

**注意**：偏移 `0x800000` 和 CRC 布局是**这台机器当前固件**的实际情况。换了固件或重刷 bootloader 后，必须先用 `tools/uboot_env_crc_wide.py` 重新定位，不能照抄偏移量。

---

## 八、备选/补充手段（本次未采用，供参考）

| 手段 | 说明 |
|---|---|
| 换 bootloader | 社区有针对玩客云的 U-Boot（如 `run-partx`/`OneCloud` 专用分支），把启动菜单做得更完善。但刷写有变砖风险，收益有限，故未采用 |
| U-Boot 里 `bootdelay=0` | `bootdelay` 已是 3，改成 0 只是缩短等待时间，**不解决根因**（`bootdev` 为空的问题依旧存在） |
| 拆机断掉 eMMC 的 USB 短接 | 玩客云 eMMC 默认走 USB 通道接到 SoC，这正是 `mmcblk0` 被识别成 `usb-Mass_Storage_Dev` 的原因。硬件短接可以让设备树更干净，但属于不可逆硬件改动 |
| 禁用 `check_usbburn` | 本次已通过改环境变量实现（不再执行 `update 1000`），无需刷机 |

---

## 九、验证记录

| 检查项 | 结果 |
|---|---|
| U-Boot env CRC 定位 | ✅ `0x800000`，zlib CRC32，65532 字节数据 |
| 环境仅 1 份副本（无冗余） | ✅ 扫描前 16 MiB 确认 |
| `boot.scr` 可用 `mkimage` 复现 | ✅ 生成大小 2506 字节，与原件一致 |
| 新 `boot.cmd` 反编译校验 | ✅ 含新逻辑，菜单文案已移除 |
| env 写入后回读比对 | ✅ `cmp` 一致，CRC `d42d15ce` |
| env 写回后重新解析 | ✅ 34 个变量，3 个改动生效，31 个未变 |
| **不带 U 盘重启** | ✅ 约 60 秒后 SSH 恢复；`/proc/cmdline` 正常；CasaOS 返回 `0.4.15`；Docker 容器全部在运行 |
| **插 U 盘重启** | ⏳ **待复验**（按用户要求稍后进行） |

---

## 十、结论

**问题本质**：Armbian 的 `boot.cmd` 在 `${bootdev}` 为空时会打印「选择启动方式」菜单并 `exit 22` 停在 U-Boot；而 `bootdev` 只有在成功加载 `boot.scr` 的那条分支里才会被设置。插着外接盘时，U-Boot 的启动顺序（USB 优先）、Amlogic 的 USB 烧录探测（`update 1000`）、以及 eMMC 被 USB 驱动识别这三个因素叠加，极易走到「没设上 `bootdev`」的死路。

**解法**：两层防护 —— 脚本层让 `bootdev` 缺失时直接用 eMMC 并在设备读不到时回退；环境层把 `bootdev` 钉死为 `mmc 1`、把 eMMC 提到 `bootcmd` 第一顺位、并停掉 `check_usbburn` 的 USB 烧录探测。
