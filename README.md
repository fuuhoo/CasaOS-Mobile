# CasaOS Mobile

CasaOS 的 Android 移动客户端 —— 用 [Capacitor](https://capacitorjs.com/) 封装官方 Web UI，
加上自己写的原生外壳（服务器地址管理、返回键接管、全面屏适配）。

> 上架与否随你，反正只给自己用。

## 特点

| 功能 | 说明 |
|---|---|
| **服务器地址可随时修改** | 不用重装 App。入口：顶栏齿轮 → 系统设置 → 服务器地址 |
| **返回手势分级处理** | 文件管理器返回上一级 → 关闭弹窗 → 关侧边栏 → 路由后退 → 退出前二次确认 |
| **退出二次确认** | 在首页按返回不会直接退出 App，会弹确认框 |
| **全面屏适配** | 原生层把系统栏/刘海高度注入 CSS 变量，状态栏不再压住内容 |
| **PWA** | Service Worker 缓存，NAS 离线时也能打开界面 |
| **修复 UI 更新不生效** | 禁用 WebView HTTP 缓存 + Service Worker 正确绕过 HTTP 缓存 |

## 目录结构

```
android-app/          Capacitor Android 工程
  android/            Gradle 工程（MainActivity 等原生代码）
  capacitor.config.json
  casaos-release.keystore   自用签名密钥
  build-apk.ps1       Windows 本地构建脚本
ui/                   CasaOS-UI 源码（从 IceWhaleTech/CasaOS-UI 同步，带移动端适配改动）
docs/                 构建与部署脚本、调试记录
tools/                调试工具（CDP 客户端、真机回归测试脚本等）
```

## 构建

### GitHub Actions（推荐）

推 tag 触发，自动产出 APK 并发布 Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

也可以在 Actions 页面手动触发（workflow_dispatch）。

### 本地构建（Windows）

```powershell
# 构建 UI + APK
pwsh -File docs/build-ui.ps1
pwsh -File mobile/build-apk.ps1

# 只打 debug 包
pwsh -File mobile/build-apk.ps1 -DebugBuild
```

产物在 `dist/`。

### 本地构建（Linux / macOS）

```bash
cd ui
corepack enable && corepack prepare pnpm@9.0.6 --activate
pnpm install --frozen-lockfile --config.node-linker=hoisted
node message_bus.build.js
node node_modules/@vue/cli-service/bin/vue-cli-service.js build \
  --dest ./build/sysroot/var/lib/casaos/www/ --mode production

cd ../android-app
npm install
npx cap sync android
cd android && ./gradlew assembleRelease
```

## 部署 UI 到 NAS

App 加载的是 **NAS 上的网页**，不是 APK 里的。所以改了 UI 之后必须部署到 NAS：

```powershell
pwsh -File docs/deploy-ui.ps1 -Host <NAS_IP>
```

> 注意：CasaOS 的静态文件服务不给 index.html 发 `Cache-Control`，
> 浏览器会用启发式缓存把它留在本地，导致加载到已删除的旧 hash 文件。
> App 侧已经通过 `LOAD_NO_CACHE` 规避，但用浏览器访问时仍需手动清缓存。

## 签名

用的是仓库内的自用 keystore（`android-app/casaos-release.keystore`）：

```
alias: casaos
storepass / keypass: casaos
```

**这是个人自用环境，口令公开在仓库里。** 如果你要发布给别人用，请换成自己的密钥：

```bash
keytool -genkeypair -v -keystore my-release.keystore -alias myapp \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后改 `android-app/android/app/build.gradle` 里的 `signingConfigs.release`。

## 常见问题

**App 里改不了服务器地址？**
顶栏齿轮 → 系统设置 → 「服务器地址」那一行（右侧会显示当前地址）。点它就能改。

**按返回键直接退出 App？**
说明旧版本。在应用内设置里检查版本号，或从 Release 重新下载。

**页面显示的是旧版 UI？**
App 侧已禁用 HTTP 缓存，重新启动 App 即可。若仍不对，检查 NAS 上
`/var/lib/casaos/www/` 里的 `index.html` 与 `app.<hash>.js` 是否匹配。

## 相关文档

- [docs/MOBILE_BACK_HANDLER_FIXES.md](docs/MOBILE_BACK_HANDLER_FIXES.md) —— 返回手势、退出确认、全面屏适配的调试记录
- [docs/MOBILE_CLIENT_PLAN.md](docs/MOBILE_CLIENT_PLAN.md) —— 移动端方案调研与选型
- [docs/ONECLOUD_BOOT_FIX.md](docs/ONECLOUD_BOOT_FIX.md) —— 玩客云插盘启动卡菜单的修复

## 致谢

- [IceWhaleTech/CasaOS](https://github.com/IceWhaleTech/CasaOS) —— 后端
- [IceWhaleTech/CasaOS-UI](https://github.com/IceWhaleTech/CasaOS-UI) —— 前端

## License

沿用 CasaOS 项目的 Apache-2.0。
