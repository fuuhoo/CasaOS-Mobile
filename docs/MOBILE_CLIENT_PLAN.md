# CasaOS 移动客户端方案（个人自用版）

> 调研与实施日期：2026-11-22
> 适用范围：**仅自用，不上架应用商店**
> 调研范围：本仓库（`IceWhaleTech/CasaOS`，Go 后端 v0.4.5）+ `IceWhaleTech/CasaOS-UI`（Web 前端）+ IceWhaleTech 官方组织全部 56 个仓库 + GitHub 全网检索

---

## 一、结论

**没有现成的移动客户端，但「打包 web」这条路几乎零成本 —— 而且 PWA 与 APK 两条路都已经走通了。**

### 已交付的东西

| 交付物 | 位置 | 状态 |
|---|---|---|
| **Android APK**（已签名，13.94 MB） | `dist/CasaOS-1.0.0-release.apk` | ✅ 构建并验签通过 |
| **PWA 改造**（离线可用 + iOS 全屏 + 完整 manifest） | `UI/public/sw.js` 等 4 个文件 | ✅ 生产构建验证通过 |
| **全面屏 / 手势适配** | 原生 edge-to-edge + 安全区 CSS + 返回手势 | ✅ 已打进 APK，详见 §6.4 |
| **一键构建脚本** | `docs/build-ui.ps1`、`mobile/build-apk.ps1` | ✅ 实测可用 |
| 移动端方案文档 | 本文档 | ✅ |

装上 APK 后：首次启动填一次 CasaOS 地址即可用；**NAS 换 IP 会自动重新弹窗，不用重新打包**。

### 为什么自用版成本这么低

因为「不上架」这个前提砍掉了一大半约束：

| 上架版必须做的 | 自用版 | 结果 |
|---|---|---|
| Apple Developer 账号（$99/年）+ Mac + Xcode | **不需要** | iOS 直接用 PWA |
| Google Play 上架 + 签名 | **不需要** | Android 侧载 APK 即可 |
| 为过审补原生价值（推送/生物识别/文件分享） | **不需要** | 纯 WebView 壳也够用 |
| 严格的隐私政策、权限说明 | **不需要** | |
| **仍需保留** | | |
| 移动端 UI 适配 | 需要 | ✅ 已有 |
| 离线可用 | 建议 | ✅ 本次已补 |
| 公网可达 | 强烈建议 | ⚠️ 见 §5 |

---

## 二、现状盘点（结论所依据的事实）

### 2.1 有没有移动客户端？

**没有。**

- 本仓库 `H:\project_self\CasaOS` 是 **CasaOS 的 Go 后端**（Echo v4, v0.4.5），只提供 API；UI 是 git submodule（`UI/` → `CasaOS-UI`）。
- **官方组织 56 个仓库逐个核对**，不存在任何 CasaOS 管理类移动应用：
  - `CasaOS-AppShell` / `CasaOS-Lite` / `CasaOS-App` / `CasaOS-Client` → GitHub API 确认 **404，不存在**
  - `IceWhaleTech/ZimaClient` → 官方**远程访问客户端**（Win/macOS/iOS 16+/Android 11+，端到端加密 P2P 隧道），但**仓库只有 README 和截图，源码未开源**，且它是「打洞隧道」不是「管理客户端」
  - `IceWhaleTech/FindZima-frontend` → Vue3+Vite，局域网设备发现应用的前端，仅做发现
- 全网 437 个 CasaOS 命名仓库，Top 全是 AppStore / Install / CLI，**无一为移动客户端**。

### 2.2 为什么「打包 web」对自用特别友好

| 事实 | 位置 | 对自用的意义 |
|---|---|---|
| **Web UI 已完全移动端适配** | `UI/src/App.vue:140` → `document.body.clientWidth < 480` 判定，**按视口宽度而非 UA** | 任何手机浏览器 / WebView / PWA 打开都是移动版布局，**零改动** |
| 移动分支渗透到全部主要组件 | `UI/src` 中 `isMobile` 有 **56 处**引用（FilePanel / AppPanel / TopBar / ListView / GirdView…） | 不是「勉强能用」，是**专门做过移动端设计** |
| **PWA 脚手架已有 80%** | 原 `public/site.webmanifest` 已有 `display: standalone` + 192/512 图标 + `apple-touch-icon` | 只需补字段，不用从零搭 |
| **UI 本来就由 NAS 自己托管** | 构建产物 → `/var/lib/casaos/www/`，nginx 提供 | 手机打开 `http://NAS_IP/` 即同源，**API 自动指向同一台机器**，无需配任何地址 |
| **API base URL 取自当前 origin** | `UI/src/main.js` → `baseURL = document.location.host` | 换服务器地址 = 换浏览器地址栏，零配置 |
| **CORS 已全开** | `route/v1.go:20-27` → `AllowOrigins: ["*"]` | 将来若做壳，跨域零障碍 |
| **Token 支持 query 参数** | `route/v1.go:58-64` | 下载直链 / `<img>` / WebSocket 握手都能带 token |
| **ZeroTier 代理接口还在**（但**不装守护进程**） | `route/v1.go:193-197`、`/v2/zt/info` | 需自己装 zerotier-one，详见 §5.1 |
| 本仓库自带 TS SDK 生成链路 | `package.json` → `openapi-typescript-codegen` | 需要时可直出类型安全客户端 |

> **一句话**：你要的「手机 App」，在自用前提下，其实就是**把 NAS 的网页加到手机桌面**——而这套 UI 本来就是按手机做的。

---

## 三、三条可选路径

| 路径 | 成本 | 平台 | 离线 | 推送 | 适合 |
|---|---|---|---|---|---|
| **A. PWA（添加到主屏幕）** ⭐ | 0～1 天 | iOS + Android | ✅（本次已补） | 弱 | **自用首选**，零维护 |
| **B. Capacitor → 侧载 APK** | 2～3 天 | Android | ✅（资源打进包） | 可选 | 想要真桌面图标 + 稳定离线 |
| **C. Capacitor → 签名 IPA** | 3～5 天 + Mac + Apple ID | iOS | ✅ | 可选 | iOS 想要原生推送/生物识别 |

### 推荐组合

> **iOS 用 A（PWA），Android 用 B（侧载 APK）。**

理由：
- **iOS 上 PWA 更省事**：不需要 Mac、不需要证书、不需要 7 天续签的免费账号。Safari「添加到主屏幕」后就是全屏无地址栏的 App，体验与原生差别很小。
- **Android 上 APK 更值**：资源打进 APK，NAS 关机也能打开界面并显示「无法连接」提示页；侧载不需要任何商店账号，只要 `adb install` 或直接传 APK 点击安装。
- **都不需要推送的话，B 也不必做**——A 已经覆盖绝大多数自用场景。

---

## 四、已完成的改造（PWA 化）

本次已在 `UI/`（`IceWhaleTech/CasaOS-UI` 的本地克隆）中直接实施：

### 4.1 改动清单

| 文件 | 改动 |
|---|---|
| `UI/public/site.webmanifest` | 补全 `id` / `start_url` / `scope` / `display_override` / `orientation` / `categories`；补 `mstile-150x150`、`apple-touch-icon` 图标声明 |
| `UI/public/index.html` | 补 `apple-mobile-web-app-capable`、`mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style`、`apple-mobile-web-app-title`；viewport 补 `viewport-fit=cover`（刘海屏适配） |
| `UI/public/sw.js` | **新增**：Service Worker |
| `UI/src/main.js` | 注册 Service Worker（仅生产构建） |

### 4.2 Service Worker 策略

| 请求类型 | 策略 | 理由 |
|---|---|---|
| 页面导航 | **network-first**，失败回退缓存的 `index.html`，再失败返回内置离线提示页 | 优先拿到最新版本；NAS 关机时也能看到界面而不是白屏 |
| `/v1/` `/v2/` `/v3/` `/api/` `message_bus` `socket.io/` | **完全不接管**（network-only） | **绝不缓存业务数据**，避免脏数据；实时通道不能被缓存 |
| 静态资源（js/css/img） | **stale-while-revalidate** | 日常几乎无感，同时保证离线可用 |
| 非 GET / 跨域 | 不接管 | 写操作必须到服务器 |

离线兜底页内置了「重试」按钮和排查提示（确认服务器开机 / 是否同一 Wi-Fi）。

### 4.3 构建验证（已实测通过）

改动已在本地 `UI/` 克隆中**完成一次完整生产构建验证**：

```
Build at: 2026-11-22T09:43:23.819Z - Hash: 185674a70fa54aa1 - Time: 44672ms
 DONE  Build complete.
      sw.js             OK
      site.webmanifest  OK
      index.html        OK
      display=standalone  start_url=/  icons=4
      产物 353 个文件，34.71 MB
```

- 构建产物目录：`UI/build/sysroot/var/lib/casaos/www/`
- `sw.js` 与源文件**哈希一致**（原样拷贝，未被 webpack 改写）
- 构建产物中的 `index.html` 已包含全部 PWA meta
- 构建日志里剩 2 条 `vue-demi` 的 `Fragment`/`TransitionGroup` 警告 —— 已确认 `require('vue')`（Vue 2.7.16）本身就不导出这两个成员，属**上游既有现象**，与本次改动无关

### 4.4 构建时的三个坑（已踩并规避）

`docs/build-ui.ps1` 已经封装了这些，**直接用它就行**：

| 坑 | 现象 | 解法 |
|---|---|---|
| **pnpm 版本必须是 9.0.6** | 用 pnpm 12 装出来的依赖树是坏的：根目录被提升的 `schema-utils@2.7.1` 会让 `terser-webpack-plugin` 抛 `TypeError: validate is not a function`，**webpack 连配置都解析不了** | 用 `package.json` 里 `packageManager` 锁定的 9.0.6（脚本会自动下载到 `UI/.pnpm9/`） |
| **不能加 `--ignore-scripts`** | `@vue-office/*` 的 `postinstall` 才会把 `lib/v2/index.js`、`lib/index.css` 拷到 `lib/` 下；跳过脚本会让 `DocViewer.vue`/`ExcelViewer.vue` 编译报 `Can't resolve '@vue-office/docx'` | 安装时保留 install 脚本；脚本里还会兜底手动执行一次 postinstall |
| **Windows 需要 hoisted 模式** | pnpm 9 默认的 isolated 模式要建符号链接，本机路径较长时触发 `ERR_PNPM_SYMLINK_FAILED: Maximum call stack size exceeded` | `--config.node-linker=hoisted` |

```powershell
# 一条命令：装依赖 + 构建 + 校验 PWA 产物
pwsh -File docs/build-ui.ps1

# 依赖已就绪时只重建
pwsh -File docs/build-ui.ps1 -SkipInstall
```

### 4.5 还没做（可按需再补）

- **maskable icon**：当前 512 图标声明为 `purpose: any`，Android 自适应图标可能显示白边。需要的话可以用 Pillow 生成一个带 10% 安全边距的 maskable 版本。
- **「添加到主屏幕」引导**：可在登录页加一次性提示（`beforeinstallprompt` 事件，iOS 需手动文案引导）。
- **HTTPS**：局域网明文 HTTP 在 Safari/PWA 下没问题；但若要走公网，建议套一层 TLS（见 §5.2）。

---

## 五、公网访问（自用版最关键的一环）

不在家的时候连不上家里的机器，是移动端唯一真正的难题。按「省事程度」排序：

### 5.1 方案对比

| 方案 | 需要什么 | 成本 | 备注 |
|---|---|---|---|
| **① ZeroTier** ⭐ | 手机装 ZeroTier App；**NAS 侧要自己装 zerotier-one**（CasaOS 安装脚本已不再安装它） | 0 | 走私有 IP，不用端口映射；见下方说明 |
| ② Tailscale | 手机装 App；NAS 装 daemon | 0 | 体验略优于 ZeroTier，同样要在 NAS 装 daemon |
| ③ Cloudflare Tunnel | NAS 装 cloudflared；Cloudflare 账号 | 0 | 白送 https 域名，不用公网 IP；但流量经 Cloudflare |
| ④ FRP / rathole 自建中继 | 一台公网服务器 | 服务器费用 | 完全可控，但要自己维护 |

> **CasaOS 与 ZeroTier 的真实关系**（2026-11 核实）：
> - 代码还在（`route/v1/zerotier.go`、`route/v2/zerotier.go`、`pkg/utils/httper/zerotier.go`），但最后一次改动是 2023 年的 `feat: migrate gin to echo (#1854)`，属于遗留代码；
> - **自动流程已被禁用**：`route/init.go:36` 的 `//go InitZerotier()` 和 `route/v1.go:43` 的 `/v1/test` 路由都被注释掉了；
> - **安装脚本不再安装 zerotier-one**：`IceWhaleTech/get` 的 5 个 shell 脚本里 0 处 zerotier 引用；
> - **UI 里没有 ZeroTier 设置页**（`CasaOS-UI` 仓库无相关文件）。
>
> 所以：**别指望装完 CasaOS 就有 ZeroTier，得自己装。** 装完之后，CasaOS 留下的 `/v1/zt/*` 代理仍然可用，可以不 SSH 直接操作 zerotier-one。

### 自己装 ZeroTier 的步骤

```bash
# 1. NAS 上安装
curl -s https://install.zerotier.com | sudo bash

# 2. 在 https://my.zerotier.com 新建一个网络，记下 network ID

# 3. 加入
sudo zerotier-cli join <network-id>

# 4. 查看状态与分到的 ZT 地址
sudo zerotier-cli listnetworks
```

手机装 ZeroTier App，加入同一个 network ID，之后用 `http://<ZT-IP>` 访问 CasaOS。

### 不想 SSH 的话，用 CasaOS 的代理接口操作 zerotier-one

`ANY /v1/zt/*` 会剥掉 `/v1/zt` 前缀、转发到 `http://localhost:<zerotier-one.port>/...`，并自动带上 `X-ZT1-AUTH`：

| 请求 | 作用 |
|---|---|
| `GET /v1/zt/status` | 节点状态（`address` 等） |
| `GET /v1/zt/network` | 已加入的网络列表 |
| `POST /v1/zt/network/<id>` | 加入网络 |
| `GET /v1/zt/controller/network` | Central 账号下的网络（需先 `zerotier-cli login`） |

> 这些接口需要 JWT，只有从 `127.0.0.1` / `::1` 访问才豁免（`route/v1.go:45-47`）。

### 注意事项

- **放行 UDP 9993**：路由器上不开放的话，ZeroTier 会走官方中继（延迟高、免费账号有流量限制）；开放后 P2P 直连体验最好。
- **和 CasaOS 端口不冲突**：ZeroTier 用自己的 UDP 端口，API 走 127.0.0.1 的随机端口。
- **`PUT /v2/casaos/zt/{network_id}/status` 是空实现**（`route/v2/zerotier.go:15-18`，直接返回 200），别指望它能上下线网络。
- **`GET /v2/casaos/zt/info` 只认名为 `IceWhale-RemoteAccess` 的网络**（`common/constants.go:7` 的 `RANW_NAME`），且走的是 Central API，不是本地 API。

### 5.2 建议

- **只在局域网用** → 什么都不用做，`http://NAS_IP` 即可。
- **要在家外面用** → 先试 **① ZeroTier**（需自己在 NAS 上装 zerotier-one，见 §5.1），不够再考虑 ③ Cloudflare Tunnel（顺手解决 HTTPS）。
- 参考 `IceWhaleTech/ZimaClient` 的架构，它走的是 **P2P 打洞 + 端到端加密、无第三方中转**，体验最好但需要自研；自用场景先不值得。

---

## 六、操作步骤

### 6.1 现在就能用（0 成本，5 分钟）

1. 手机浏览器打开 `http://<NAS_IP>/`（如 `http://192.168.1.10/`）
2. 登录 CasaOS
3. **iOS**：Safari → 分享按钮 → 「添加到主屏幕」
   **Android**：Chrome → 右上角菜单 → 「安装应用 / 添加到主屏幕」
4. 桌面出现 CasaOS 图标，点开是**全屏无地址栏**的应用

> 这一步在**改造之前就已经可用**（manifest 与 apple-touch-icon 原本就有），改造只是让它更完整。

### 6.2 用上本次的 PWA 改造（已验证可用）

```powershell
# 在 CasaOS 仓库根目录执行
pwsh -File docs/build-ui.ps1
```

产物在 `UI/build/sysroot/var/lib/casaos/www/`，把它部署到 NAS 的 `/var/lib/casaos/www/`（即 CasaOS 的前端目录）即可生效。手机刷新后获得：

- 离线时仍能打开界面（NAS 关机时显示内置提示页而非白屏）
- iOS 刘海屏适配（`viewport-fit=cover`）
- 完整的 manifest（安装时正确显示图标与名称，4 个图标全齐）
- iOS 16.4 以下也能全屏运行（补了 `apple-mobile-web-app-capable`）

> 详见 §4.3（构建验证结果）与 §4.4（三个构建坑）。

### 6.3 Android APK（已构建完成 ✅）

**产物**：`dist/CasaOS-1.0.0-release.apk`（13.93 MB，已签名）

| 项 | 值 |
|---|---|
| 包名 | `com.icewhale.casaos` |
| 版本 | versionCode 1 / versionName 1.0.0 |
| SDK | minSdk 23（Android 6.0+）/ targetSdk 35 / compileSdk 35 |
| 权限 | 仅 `INTERNET` |
| 签名 | v1 + v2，证书 `CN=CasaOS, OU=Self-hosted, O=Personal`（自用 keystore，密码 `casaos`） |
| 内置资源 | 355 个网页文件（含 `sw.js` / `site.webmanifest`）+ 5 个 Capacitor 插件 |
| 图标 | 用 CasaOS 官方 logo 生成的自适应图标（5 档密度），背景色 `#0C6EC5` |

安装：

```bash
adb install -r dist/CasaOS-1.0.0-release.apk
# 或者把 APK 传到手机点击安装（需允许「安装未知来源应用」）
```

#### 关键设计：运行时可改服务器地址

CasaOS 的 Web UI 用**同源相对路径**调 API（`axios` 的 `baseURL` 为空串），所以 App 必须**直接从 NAS 加载页面**，而不是用打包进 APK 的本地资源——否则 API 请求会打到手机自己身上。

`mobile/android/app/src/main/java/com/icewhale/casaos/MainActivity.java` 做了三件事：

1. **首次启动弹窗**让用户填写 CasaOS 地址（如 `http://192.168.1.10`），存进 `SharedPreferences`；
2. **每次启动探测** `/v1/sys/version/current`，地址失效（例如 NAS 换了 IP）时**自动重新弹窗**；
3. 用保存的地址覆盖 assets 里的 `server.url`（`CapConfig` 支持），在加载前生效。

所以**换 NAS、改 IP 都不需要重新打包**，装一次就够。

#### 重新构建

```powershell
# 一条命令：UI 构建 → cap sync → Gradle release 包 → 拷到 dist/
pwsh -File mobile/build-apk.ps1

# 只重打 APK，跳过 UI 构建
pwsh -File mobile/build-apk.ps1 -SkipUiBuild

# 出 debug 包
pwsh -File mobile/build-apk.ps1 -DebugBuild -SkipUiBuild
```

> `-Debug` 是 PowerShell 的保留公共参数名，所以脚本里用的是 `-DebugBuild`。

> Gradle 依赖默认走 `dl.google.com` / `repo.maven.apache.org`，在本机网络下 TLS 握手会随机失败
> （`Remote host terminated the handshake`）。`mobile/.gradle-home/init.d/mirrors.gradle`
> 已把所有仓库指向阿里云镜像，官方源保留兜底 —— **这个文件要保留，否则构建会随机挂掉**。

#### Capacitor 工程的坑（已规避）

| 坑 | 说明 |
|---|---|
| JDK 版本 | Capacitor 7 需要 **JDK 17+**，本机默认是 JDK 8。本机用 version-fox 里的 **JDK 21**（`C:\Users\fubin\.version-fox\cache\java\v-21.0.2+13\java-21.0.2+13`） |
| Android SDK | 需要 `platforms/android-35` + `build-tools/35.0.0`，本机已装 |
| `server.url` 占位 | assets 里写的是 `http://casaos.local`，运行时被 `MainActivity` 覆盖，不用改 |
| 图标 XML | Android 资源文件的根元素必须是 `<resources>`，`<color>` 不能直接当根（踩过一次，症状是 `resource color/ic_launcher_background not found`） |
| Gradle 缓存 | 放在 `mobile/.gradle-home/`，不污染用户全局 `~/.gradle` |

### 6.4 全面屏与手势适配（已完成 ✅）

这是移动端最容易出问题的一块，分三层处理，各司其职：

#### ① 原生层：Android 15 强制 edge-to-edge

`targetSdk 35` 在 Android 15 上**强制全屏铺满**，内容会钻到状态栏、手势条、刘海下面去。
Capacitor 7 提供了 `android.adjustMarginsForEdgeToEdge`：

```json
"android": {
  "adjustMarginsForEdgeToEdge": "auto"
}
```

- `auto`：Android 15+ 由原生给 WebView 加内边距（系统栏 + 挖孔），**从根上保证不遮挡**，不依赖网页是否支持 `env()`
- `disable`（默认）：WebView 铺满全屏，需要网页自己用 `env(safe-area-inset-*)` 让位
- `force`：所有版本都加内边距

选 `auto` 是因为它不依赖 WebView 对 `env()` 的支持情况，**是能保证不出错的方案**。

另外补了状态栏主题（`values/styles.xml` + `values-night/styles.xml`）：
状态栏/导航栏透明、`windowLightStatusBar` 浅色主题用深色图标、深色主题反过来。

#### ② Web 层：安全区（`UI/public/css/safe-area.css`）

新增的全局样式表，把 `env(safe-area-inset-*)` 落到真正会被遮住的地方：

| 元素 | 处理 |
|---|---|
| `.top-bar` 顶栏 | `padding-top` 让出状态栏，高度同步 `calc(2.75rem + var(--sa-top))`，内部按钮保持 2.75rem 点击区 |
| `.contents` 主内容 | 跟着顶栏下移，并等量缩短高度，保证底部不被挤出屏幕 |
| `.base-bar` 底部固定条 | `padding-bottom` 让出 Home Indicator / 手势条 |
| `.modal-card` 弹窗 | 全屏弹窗（文件管理器）底边正好压在 Home Indicator 上，补 `padding-bottom` |
| `.notification` 通知 | 从右上角弹出，避开状态栏 |
| `.side-bar` 抽屉 | 横屏时避开侧边刘海 |

同时做了手势相关的基础修正：

```css
html, body {
  overscroll-behavior-y: none;        /* 去掉下拉回弹露白底 */
  touch-action: manipulation;          /* 去掉双击缩放的 300ms 延迟 */
  -webkit-tap-highlight-color: transparent;  /* 去掉点击灰闪 */
}
html body button, .icon, .picon { -webkit-touch-callout: none; }  /* 长按不再弹系统菜单 */
```

> 所有安全区变量在没有刘海/手势条的设备上恒为 0，因此这些规则在普通设备上**零影响**。

#### ③ Web 层：返回手势/返回键

这是最容易「按一下就退出 App」的地方。处理链路：

1. **Manifest**：`<application android:enableOnBackInvokedCallback="true">`
   —— Android 13+ 开启**预测式返回**，返回手势才会交给应用而不是直接关掉 App。
   没加这个属性时，系统返回手势会绕过 App 直接退出。
2. **Capacitor 桥**：原生把返回键转成 document 上的 `backbutton` 事件
   （见 `native-bridge.js`）。注册监听后，原生侧就不再自动 `webView.goBack()`，行为完全由我们决定。
3. **应用逻辑**（`UI/src/plugins/native.js`）按「离用户意图最近」排序处理：

| 顺序 | 情况 | 行为 |
|---|---|---|
| 1 | **文件管理器在子目录** | **返回上一级目录**（不关弹窗） |
| 2 | 文件管理器在根目录 | 关闭弹窗（**等同点叉号**） |
| 3 | 其它弹窗打开 | 关闭最上层的 Buefy 弹窗（图片预览等） |
| 4 | 移动端抽屉展开 | 关闭侧边抽屉 |
| 5 | 路由还有历史 | `router.back()` |
| 6 | 已在首页 | 退出 App（符合 Android 预期） |

普通浏览器里 `backbutton` 永远不会触发，所以这段逻辑对 Web 版无害。

#### 文件管理器的「返回上一级」

CasaOS 的文件管理器是挂在首页上的**弹窗**，目录层级（`currentPath`）是组件内部状态，
**没有进路由栈** —— 所以系统返回手势天然不知道「上一级目录」是什么。

上游其实**已经有** `backLevel()`（`FilePanel.vue`），但只绑在 **Backspace 键**上
（`document.onkeyup`），手机上根本不会触发。这次把它接了出来：

- `FilePanel.parentPath()` / `backLevel()`：算出上一级路径，`backLevel()` 改成返回布尔值
- `FilePanel.handleBackRequest(reply)`：响应 EventBus 的 `fileBack` 事件，
  已经在根目录就返回 false，交给外层去关闭弹窗
- 可见性判断：`b-modal` 用了 `destroy-on-hide=false`，**弹窗隐藏后组件仍然存在**，
  所以必须先确认面板可见（`.modal` 的 `display` 不是 `none`）才响应
- 预览层 / 二级弹窗（分享、挂载等）打开时不响应，交给外层先关掉它们

#### 浏览器里的后退键

浏览器后退会直接离开页面（文件管理器是弹窗，URL 没变）。做法是往历史里压一条**哨兵**记录：

- 文件管理器打开时 `pushState` 一条哨兵（`store.fileBrowserOpen` 变化时触发）
- 浏览器后退 → `popstate` → 走上面同一套处理链 → 消费掉这次后退 → 再补一条哨兵
- `pushState` 会截断指针之后的历史，所以**历史深度不会越滚越长**，也不存在「退不出去」的坑
- 原生 App 里不压哨兵（走 `backbutton` 事件），也不需要

> 注意 vue-router 的 **hash 模式**不会把上一条路由写进 `history.state.back`
> （那是 HTML5 模式才有的字段），所以「路由还能不能后退」只能看当前路由是不是首页。

#### 单元测试

`UI/tools/test-back-handler.mjs` 用桩件模拟 window / document / store / router / eventBus，
逐条验证返回处理的优先级顺序：

```bash
cd UI && node tools/test-back-handler.mjs
# 14 通过，0 失败
```

#### 顺带修正的一处 iOS 细节

状态栏样式从 `black-translucent` 改成 **`default`**：

`black-translucent` 会让内容延伸到状态栏下方，而 iOS 的状态栏文字**固定是白色**——
CasaOS 浅色主题的顶栏是白底，直接变成「白字压白底」，状态栏图标完全看不见。
改成 `default` 后由系统保留状态栏区域，从根上避免遮挡。

#### 验证

```bash
aapt2 dump xmltree --file AndroidManifest.xml dist/CasaOS-1.0.0-release.apk
# → android:enableOnBackInvokedCallback=true
```

APK 内的 `assets/capacitor.config.json` 含 `adjustMarginsForEdgeToEdge: "auto"`，
`assets/public/css/safe-area.css` 已随包分发。

### 6.5 想要 iOS 也用原生壳

需要 Mac + Xcode + Apple ID。**免费 Personal Team 签名有效期 7 天**，到期要重签——自用场景通常不值得，**建议 iOS 直接用 PWA**。

---

## 七、可能遇到的问题

| 现象 | 原因 | 解决 |
|---|---|---|
| iOS 添加到主屏幕后仍显示地址栏 | iOS 16.4 以下不认 manifest 的 `display` | 本次已补 `apple-mobile-web-app-capable` meta，重新构建部署即生效 |
| 手机打开是**电脑版布局** | 未触发 `clientWidth < 480` | 检查是否开启了「请求桌面网站」，或 viewport meta 被改 |
| 离线打开白屏 | Service Worker 未注册 | 确认是**生产构建**（`main.js` 里 dev 模式不注册 SW）；浏览器 DevTools → Application → Service Workers 查看 |
| 离线打开是旧的界面 | SW 缓存了旧 `index.html` | 提版本号会清缓存；导航请求是 network-first，正常不会旧 |
| 局域网 `http://` 被拦 | 仅原生壳（WKWebView）会触发 ATS | PWA 不受影响；壳需按 §6.3 配 ATS / network_security_config |
| 上传相册文件失败 | WebView 文件上传受限 | PWA 一般正常；壳需自研 SAF / UIDocumentPicker 插件 |
| 想收到告警通知 | PWA 推送弱 | iOS 16.4+ 支持 PWA Web Push（需 VAPID + 自己的 push 服务）；或直接看 NAS 的通知中心 |
| Token 存在 localStorage | 见 `UI/src/router/index.js:54` | 自用可接受；介意的话用 WebView 壳 + Keychain |

---

## 八、附录：移动端可用的 API 清单

### 本仓库 `route/v1.go`（CasaOS 主服务）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/v1/sys/version/current` | 版本（免鉴权） |
| GET | `/v1/sys/version/check` | 检查更新 |
| GET | `/v1/sys/utilization` | **CPU/内存/磁盘占用（首页仪表盘）** |
| GET | `/v1/sys/hardware` | 硬件信息 |
| GET | `/v1/sys/server-info` | 服务器信息 |
| GET | `/v1/sys/logs` | 错误日志 |
| GET | `/v1/sys/wsssh` | **WebSocket 终端** |
| POST | `/v1/sys/ssh-login` | SSH 登录 |
| PUT | `/v1/sys/state/:state` | 电源状态（重启/关机） |
| POST | `/v1/sys/update` | 系统更新 |
| GET/POST/PUT | `/v1/file`, `/v1/file/name`, `/v1/file/content` | 文件下载 / 新建 / 写内容 / 重命名 / 读内容 |
| POST/GET | `/v1/file/upload` | **分片上传 / 查分片（断点续传）** |
| GET | `/v1/file/ws` | **WebSocket 文件通道** |
| GET | `/v1/folder`, POST | 目录列表 / 创建目录 |
| PUT | `/v1/folder/name` | 重命名目录 |
| GET | `/v1/folder/size`, `/v1/folder/count` | 大小 / 数量 |
| DELETE | `/v1/batch` | 删除文件 |
| POST | `/v1/batch/task` | 批量操作 |
| GET | `/v1/cloud`, DELETE | 存储挂载列表 / 卸载 |
| GET | `/v1/driver` | 驱动信息 |
| GET | `/v1/samba/connections`, `/v1/samba/shares` | Samba 共享 |
| GET | `/v1/other/search` | 全局搜索 |
| ANY | `/v1/zt/*url` | **ZeroTier 代理（公网通道）** |

### 本仓库 `route/v2/`（OpenAPI 定义，见 `api/casaos/openapi.yaml`）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/v2/casaos/health/services` | 各 casaos-* 服务健康状态 |
| GET | `/v2/casaos/health/ports` | 端口占用 |
| GET | `/v2/casaos/health/logs` | 日志流 |
| GET/POST | `/v2/casaos/file/upload` | 分片上传 / 查询 |
| GET | `/v2/casaos/zt/info` | ZeroTier 信息 |
| PUT | `/v2/casaos/zt/{network_id}/status` | ZT 上下线 |

### `CasaOS-UserService`（独立服务）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/v1/users/login` | **登录** |
| POST | `/v1/users/refresh` | 刷新 Token |
| GET/PUT | `/v1/users/current` | 当前用户 / 改资料 |
| PUT | `/v1/users/current/password` | 改密码 |
| GET/PUT | `/v1/users/current/custom/:key` | 自定义配置（可做跨设备同步） |

### 移动端功能优先级

| 优先级 | 功能 | 难度 |
|---|---|---|
| P0 | 服务器连接 + 登录 | 低 |
| P0 | 首页仪表盘（CPU/内存/磁盘/服务状态） | 低 |
| P0 | 应用列表 + 启停 | 低 |
| P0 | 文件浏览 / 上传 / 下载 / 删除 | 中 |
| P1 | 存储与磁盘管理 | 中 |
| P1 | 远程终端（xterm，UI 已集成） | 中 |
| P2 | Samba 共享管理、系统设置 / 更新 / 重启 | 中 |
| P2 | 应用商店安装 | 高 |

> `CasaOS-UI` 的 `package.json` 已带 `docx-preview`、`@vue-office/excel`、`@vue-office/pdf`、`viewerjs`、`xterm`、`artplayer`、`hls.js` —— **移动端的文档预览和终端能力不用重写，直接复用**。

---

## 附录 B：关键代码位置索引

### 本次新增/修改的文件

| 文件 | 说明 |
|---|---|
| `dist/CasaOS-1.0.0-release.apk` | **新增** — 已签名的 Android 安装包（13.93 MB） |
| `mobile/` | **新增** — Capacitor 7 移动端工程 |
| `mobile/capacitor.config.json` | App 配置（webDir 指向 UI 产物、允许明文 HTTP） |
| `mobile/android/app/src/main/java/com/icewhale/casaos/MainActivity.java` | **新增** — 运行时服务器地址（首次弹窗 + 失效自动重问） |
| `mobile/android/app/src/main/res/xml/network_security_config.xml` | **新增** — 允许局域网明文 HTTP |
| `mobile/android/app/src/main/res/mipmap-*/` | CasaOS 官方 logo 生成的自适应图标（5 档密度） |
| `mobile/android/app/build.gradle` | 加了 release 签名配置、`versionName 1.0.0` |
| `mobile/android/build.gradle` | 加了阿里云镜像仓库（优先，官方源兜底） |
| `mobile/.gradle-home/init.d/mirrors.gradle` | **新增** — 全局注入镜像，绕开官方源的 TLS 抖动 |
| `mobile/build-apk.ps1` | **新增** — 一键构建脚本 |
| `mobile/tools/make-icons.py` | **新增** — 图标生成脚本（Pillow） |
| `mobile/casaos-release.keystore` | 自用签名密钥（别名 `casaos`，密码 `casaos`） |
| `UI/public/css/safe-area.css` | **新增** — 全面屏安全区 + 手势适配样式 |
| `UI/src/plugins/native.js` | **新增** — 返回键/返回手势处理（文件管理器返回上一级 → 关弹窗 → 关抽屉 → 路由后退 → 退出） |
| `UI/tools/test-back-handler.mjs` | **新增** — 返回处理链路的单元测试（14 个用例） |
| `UI/src/components/filebrowser/FilePanel.vue` | 修改 — `backLevel()` 返回布尔值、新增 `parentPath()` / `handleBackRequest()`，响应 `fileBack` 事件 |
| `UI/src/views/Home.vue` | 修改 — 把文件管理器弹窗的开合状态同步到 store |
| `UI/src/store/state.js` / `mutations.js` | 修改 — 新增 `fileBrowserOpen` 状态 |
| `UI/src/events/events.js` | 修改 — 新增 `FILE_BACK` 事件 |
| `mobile/android/app/src/main/AndroidManifest.xml` | 加 `android:enableOnBackInvokedCallback="true"`（预测式返回） |
| `mobile/android/app/src/main/res/values-night/styles.xml` | **新增** — 深色模式状态栏图标配色 |
| `UI/public/sw.js` | **新增** — Service Worker（离线 App Shell，API 不缓存） |
| `UI/public/site.webmanifest` | 修改 — 补全 PWA 字段与 4 个图标声明 |
| `UI/public/index.html` | 修改 — 补 iOS standalone meta + `viewport-fit=cover` |
| `UI/src/main.js` | 修改 — 注册 Service Worker（仅生产构建） |
| `docs/build-ui.ps1` | **新增** — UI 一键构建 + 校验脚本 |
| `docs/MOBILE_CLIENT_PLAN.md` | **新增** — 本文档 |

### CasaOS 后端

| 内容 | 位置 |
|---|---|
| 路由总入口 | [route/v1.go](route/v1.go) |
| CORS 配置（已全开） | [route/v1.go:20-27](route/v1.go#L20-L27) |
| JWT 校验 + 本地回环豁免 | [route/v1.go:44-66](route/v1.go#L44-L66) |
| Token 双通道（Header + query） | [route/v1.go:58-64](route/v1.go#L58-L64) |
| ZeroTier 代理路由 | [route/v1.go:193-197](route/v1.go#L193-L197) |
| 设备指纹（MAC → Hash） | [route/init.go:51-55](route/init.go#L51-L55) |
| OpenAPI 规范 | [api/casaos/openapi.yaml](api/casaos/openapi.yaml) |
| TS SDK 生成脚本 | [package.json](package.json) |
| UI 构建目标路径 | [Makefile](Makefile) (`build-ui`) |

### CasaOS-UI（前端）

| 内容 | 位置 |
|---|---|
| 移动端布局判定（视口宽度，非 UA） | `UI/src/App.vue:140` |
| 移动端 UI 分支（56 处） | `UI/src/**`（`isMobile`） |
| API base URL 取自当前 origin | `UI/src/main.js` |
| Token 存取 | `UI/src/router/index.js:54`、`UI/src/service/service.js:35` |
| 原 PWA manifest | `UI/public/site.webmanifest` |
| 移动端布局效果参考 | `snapshot-mobile.png`（仓库根目录） |
