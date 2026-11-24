# CasaOS 移动端调试记录 —— 返回手势、退出确认、全面屏

> 实测设备：小米 22081283C（Redmi K70），Android 14 / SDK 34
> NAS：迅雷玩客云 onecloud（Amlogic S805），CasaOS 0.4.15，Armbian 24.11.1
> App：Capacitor 7.6.10 封装的原生壳，加载 NAS 上的 CasaOS-UI
> 记录时间：2026-11-23 / 11-24

---

## 一、最终状态

真机回归测试 **全部通过**（release 版，13.95 MB，签名安装到手机）：

```
[1] 文件管理器的「存储列表」按钮可见        PASS
[2] 点击按钮能展开存储列表                PASS
[3] 返回键：文件管理器在根目录时关闭弹窗    PASS
[4] 返回键：App Store 里关闭弹窗而非退出    PASS
[5] 返回键：首页弹出退出二次确认            PASS
[6] 点「取消」关掉确认框，App 保留          PASS
[7] 全面屏安全区变量已注入                 PASS
```

release 版没有 DevTools（`webContentsDebuggingEnabled=false` 是有意的安全设计），
所以 release 的验证改用**截图 + 原生日志**，脚本是 `tools/verify_release.py`：

```
[准备] 启动 App
  PASS  原生层已接管返回键
  PASS  WebView HTTP 缓存已禁用
[1] 打开 App Store
  PASS  返回键已派发到 JS
  PASS  App 未被退出
[2] 首页按返回 -> 退出确认框
  PASS  App 仍在后台（没被误退出）
[3] 取消退出
  PASS  点取消后 App 保留
 结果：6 通过，0 失败
```

单元测试 **26/26 通过**（`node UI/tools/test-back-handler.mjs`）。

### 修了 7 个真问题

| # | 问题 | 归属 |
|---|---|---|
| 1 | Buefy 弹窗实例找不到（`__vue__` 是 transition） | JS |
| 2 | 根 Vue 实例拿不到 → 确认框弹不出 → 误退出 | JS |
| 3 | Capacitor 7 的返回事件通道不可靠 | **原生** |
| 4 | 输入法抢走返回键（要按两次） | 原生 + JS |
| 5 | 两条通道重复处理 | JS |
| 6 | 全局 ID 冲突导致存储按钮不可见 | CSS/Vue |
| 7 | 弹窗顶栏被状态栏压住 | CSS |

---

## 二、这轮修掉的 6 个真问题

### 1. Buefy 弹窗实例找不到（App Store 按返回直接退出 App）

**现象**：在 App Store 里按返回键，整个 App 被关掉。

**根因**：Buefy 的 Modal 模板根节点是 `<transition>`，所以挂在 DOM 上的 `__vue__` 拿到的是 transition 这个**抽象组件**：

```js
// 实测（真机 CDP 探针）
{ "cls": "modal is-active app-panel",
  "vmName": "transition",        // ← 不是 Modal
  "closeType": "undefined" }     // ← 没有 close()
```

而真正的 Modal 实例在它的 `$parent` 上：

```
transition (无 close)
  └─ BModal (hasClose:true, isActive:true, programmatic:true)  ← 真正的实例
```

旧代码只判断 `el.__vue__`，读到的 `isActive` 是 undefined → 判定「没有打开的弹窗」→ 跳过 → 一路穿透到「退出应用」。

**修法**（`UI/src/plugins/native.js`）：

```js
function findModalInstance(el) {
	let vm = el && el.__vue__
	for (let depth = 0; vm && depth < 12; depth++) {
		// Modal 与 Dialog 都有 close() 和 isActive，transition 两个都没有
		if (typeof vm.close === 'function' && vm.isActive !== undefined) return vm
		vm = vm.$parent
	}
	return null
}
```

### 2. 根 Vue 实例拿不到 → 确认框弹不出来 → 误退出

**现象**：即使修好了上面的弹窗查找，退出确认框仍然弹不出来，最后还是退出 App。

**根因**：`getRootVm()` 用 `document.getElementById('app')` 找根实例，但 **Vue 2 挂载后 `#app` 元素被整个替换掉了**，DOM 里已经没有 `id="app"` 的元素。退一步按 `body.children[0]` 找也不可靠 —— 打开 Buefy 弹窗时，body 下第一个带 `__vue__` 的元素是弹窗的 `<transition>`，它的 `$buefy` 是 undefined，于是：

```js
if (!buefy || !buefy.dialog || typeof buefy.dialog.confirm !== 'function') {
    exitApp()      // ← 旧代码：无条件直接退出
    return true
}
```

**修法**：改用 `$root`（任何组件实例的 `$root` 都指向根实例），并且**拿不到确认框时什么都不做**，绝不误退出：

```js
function getRootVm() {
	const els = document.querySelectorAll('.modal, [id]')
	for (let i = 0; i < els.length; i++) {
		const vm = els[i].__vue__
		if (vm && vm.$root) return vm.$root
	}
	...
}
```

```js
if (!buefy || !buefy.dialog || typeof buefy.dialog.confirm !== 'function') {
	traceBack('exit', 'no confirm dialog available, ignored')
	return false      // ← 忽略这次返回，而不是退出 App
}
```

### 3. Capacitor 7 的返回事件通道不可靠

**现象**：JS 侧注册了 `document.addEventListener('backbutton')`，但物理按键时事件**根本不派发**。

**根因**：Capacitor 7 的原生侧（`AppPlugin.java`）：

```java
if (!hasListeners(EVENT_BACK_BUTTON)) {
    // 没有监听器 -> WebView.goBack()，JS 收不到事件
} else {
    notifyListeners(EVENT_BACK_BUTTON, data, true);
    bridge.triggerJSEvent("backbutton", "document");
}
```

也就是说**只有 App 插件注册了 'backButton' 监听器才会派发**。而从 JS 侧注册这个监听器并不可靠：Capacitor 的 JS 代理是懒加载的，插件没就绪时 `addListener` 返回一个 rejected Promise（"plugin not installed"），被忽略就静默失败。实测出现过「注册调用没报错，但原生侧 `hasListeners` 一直是 false」。

**修法**：**在原生层直接接管**（`MainActivity.setupBackKeyHandling`），无条件派发事件：

```java
getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
        BACK_CALLBACK_PRIORITY,
        new android.window.OnBackInvokedCallback() {
            @Override
            public void onBackInvoked() {
                dispatchBackToJs();   // bridge.triggerJSEvent("backbutton", "document")
            }
        });
```

JS 侧只监听 document 事件即可。

### 4. 输入法抢走返回键（要按两次才能关 App Store）

**现象**：App Store 打开时按返回，第一次只收起键盘，第二次才关掉弹窗。

**根因**：Buefy 的 modal 默认 `autoFocus`，会聚焦第一个输入框（App Store 的搜索框）。输入框持有焦点时，**系统输入法会注册自己的返回回调**，优先级是 `PRIORITY_DEFAULT(0)`，返回键被输入法消费。

实测焦点状态：

```json
{ "tag": "INPUT", "cls": "input", "type": "text" }   // 焦点在搜索框
```

系统日志印证：

```
MIUIInput: OnBackInvokedCallback is enabled, drop Back Key Event
WindowOnBackDispatcher: sendCancelIfRunning: ... ImeCallback=ImeOnBackInvokedCallback@...
```

**修法**（两处一起）：

- **原生层**：给回调一个明显更高的优先级，让 App 始终优先于输入法

```java
private static final int BACK_CALLBACK_PRIORITY = 100;
```

- **JS 层**：关弹窗前先把弹窗内输入框的焦点移开（顺带收键盘）

```js
function blurModalInput() {
	const active = document.activeElement
	if (!active || active.tagName.toUpperCase() !== 'INPUT') return
	const modal = active.closest('.modal')
	if (!modal || (modal.style && modal.style.display === 'none')) return
	active.blur()
}
```

### 5. 两条通道重复处理（关掉文件管理器后又多弹一次退出确认）

**现象**：关掉文件管理器后，紧接着又弹出「退出应用」确认框。

**根因**：Capacitor 原生侧在有 App 监听器时会**同时**做两件事：触发 App 插件监听器 + 往 document 派发事件。两条通道都会走到 `handleBack`。

**修法**：用时间窗口去重（`setTimeout(0)` 不够 —— 两次 `evaluateJavascript` 之间隔着原生→JS 往返，宏任务间隙足够让标志位被过早释放）：

```js
const DEDUP_WINDOW_MS = 300
let lastHandledAt = 0
const onBack = (event) => {
	const now = Date.now()
	if (now - lastHandledAt < DEDUP_WINDOW_MS) return
	lastHandledAt = now
	...
}
```

### 6. 全局 ID 冲突：文件管理器的「存储列表」按钮被隐藏

**现象**：文件管理器里打不开存储列表的按钮（汉堡菜单）。

**根因**：`TopBar.vue` 的 style 块**没有 scoped**，而它有一条全局规则：

```css
#sidebar-btn { display: none !important; }
@media screen and (max-width: 480px) { #sidebar-btn { display: flex !important; } }
```

文件管理器的 `SidebarMenuButton.vue` 恰好也用了 `id="sidebar-btn"`，于是被这条规则一起隐藏。设备宽度 686px > 480px，所以按钮一直是 `display:none`。

**修法**（两处）：

- `TopBar.vue`：把选择器限定到自己的范围内

```css
#app .top-bar #sidebar-btn { display: none !important; }
@media screen and (max-width: 480px) { #app .top-bar #sidebar-btn { display: flex !important; } }
```

- `SidebarMenuButton.vue`：换个不重复的 id（`file-sidebar-btn`），并加注释说明原因

### 7. 弹窗顶栏被状态栏压住

**现象**：App Store 弹窗打开后，右上角的状态栏电量图标叠在「自定义安装」按钮和关闭按钮（X）上。

**根因**：`safe-area.css` 里给 `.modal .modal-card` 补了左右和底部 padding，**唯独漏了顶部**。

页面顶栏没这个问题，是因为 `.top-bar` 自己有 `padding-top: var(--sa-top)`；而弹窗是覆盖在页面之上的独立层，`.modal-card` 从视口顶部开始，不会被顶栏的 padding 推开。

**修法**：

```css
html body .modal .modal-card {
	padding-top: var(--sa-top);
}
```

修完的对比（左：修之前，右：修之后）——状态栏独占一行，弹窗标题栏在下一行，不再重叠。

---

## 三、全面屏适配

### 问题

Android WebView 里 CSS 的 `env(safe-area-inset-*)` **恒为 0**（只有 iOS Safari 才真正提供）。而 Capacitor 自带的 `android.adjustMarginsForEdgeToEdge` **只在 Android 15（API 35）以上生效**，本机是 Android 14。

结果：状态栏时间那行和页面内容**重叠**（实测截图里 CasaOS 顶栏的 👤 和 ⚙ 图标被压在 "9:22" 和日期中间）。

### 解法：原生层注入 CSS 变量

新增 `SystemInsetsPlugin.java`：

```java
@CapacitorPlugin(name = "SystemInsets")
public class SystemInsetsPlugin extends Plugin {
	@PluginMethod
	public void get(PluginCall call) {
		Insets insets = windowInsets.getInsets(
				WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
		result.put("top", insets.top / density);
		result.put("bottom", insets.bottom / density);
		...
	}
}
```

JS 侧（`native.js` 的 `setupSafeArea`）把它写进 CSS 变量：

```js
style.setProperty('--sa-top', info.top + 'px')
style.setProperty('--sa-bottom', info.bottom + 'px')
```

`safe-area.css` 统一用这组变量，**iOS 用 `env()`、Android 用原生注入**，两边落到同一套规则上。

实测值：`--sa-top: 34.29px`、`--sa-bottom: 16px`（density 1.75）。

### 布局关系的坑

`#app` 是 `height:100dvh` 的纵向 flex 容器：`.top-bar`（固定高）+ `.contents`（flex:1）+ `.base-bar`（fixed）。

**顶栏撑高后 `.contents` 会自动下移**，所以 `.contents` **不能再补一次 `--sa-top`**，只需把自身高度按顶栏撑高的量减掉，否则底部多出一块空白。

---

## 四、Service Worker 缓存导致「UI 更新不生效」

**现象**：部署了新 UI 到 NAS，手机上怎么刷新都是旧版本（还加载了一个已经被删除的旧 hash 文件，页面直接报错）。

**根因**：CasaOS 的静态文件服务（`casaos-gateway`）**不给 index.html 发 `Cache-Control`**，浏览器就用启发式缓存（Last-Modified 的 10%）把它留在本地。index.html 引用的是 `app.<hash>.js`，一旦 index.html 命中旧缓存，就会去请求一个**已被删除的旧 hash 文件**。

单纯写 network-first 不够 —— `fetch()` 默认也走 HTTP 缓存，必须显式 `cache: 'reload'`。

**三层修法**：

1. **sw.js**：navigate 请求用 `fetch(request, { cache: 'reload' })`；带 hash 的 `.js`/`.css` 用 cache-first（文件名变了就是新文件）；`CACHE_VERSION` 递增以便旧缓存整体清理
2. **原生层**：禁用 WebView 的 HTTP 缓存

```java
settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
```

3. **验证手段**：写一个脚本在 CDP 里比对「手机加载的 bundle」与「NAS 上的 bundle」

```js
Array.prototype.map.call(document.querySelectorAll('script[src]'),
    function (s) { return s.src.split('/').pop() }).join(' | ')
```

> 注意：禁用 HTTP 缓存**不影响 PWA 离线能力** —— Service Worker 用的是独立的 Cache API。

---

## 五、调试工具（本轮新增）

| 工具 | 用途 |
|---|---|
| `tools/cdp.py` | 极简 Chrome DevTools Protocol 客户端，在手机 WebView 里执行 JS |
| `tools/cdp_clear.py` | 用 CDP 的 `Storage.clearDataForOrigin` 清站点数据 |
| `tools/cdp_reload.py` | 清 HTTP 缓存 + 重新导航 |
| `tools/probe-*.js` | 各种真机探针（弹窗结构、焦点、insets、事件派发、SW 状态…） |
| `tools/regression-test.ps1` | **真机回归测试**，7 个场景自动跑完并给出通过/失败 |
| `tools/adb_mini.py` | 直接说 adb host 协议的客户端，绕开 adb.exe 客户端卡死的问题 |
| `tools/adb_host.py` | 用原始 socket 问 adb server 要设备列表 |
| `tools/scan_ports.py` | 并发端口扫描（找手机的无线调试端口） |

### 真机回归测试

```powershell
pwsh -File tools/regression-test.ps1 -Device IJNFQSL7IZ59EIFI
```

它会依次验证：存储列表按钮可见 → 能展开 → 返回关文件管理器 → 返回关 App Store → 首页弹退出确认 → 取消保留 App → 安全区已注入。

---

## 六、这台机器上 ADB 的几个坑（重要）

开发机有 **57 个网卡接口**（VPN / 虚拟网卡），adb 启动时要逐个绑定 multicast 端口，**初始化极慢**。

### 现象

- `adb devices` / `adb shell` **一直卡住不返回**
- daemon 日志显示 `udp_socket.cpp:533 bind endpoint=0.0.0.0:5353` 刷了一百多行
- `adb devices` 超时，但用原始 socket 问同一个 daemon，`host:devices-l` 却能立刻响应
- `host:version` 永远超时 —— 而这正是 **adb 客户端启动时的第一个请求**，所以客户端就卡死了

### 解法

**1. 关掉 mDNS 自动连接**，避免 USB 和无线两个同名 transport 打架：

```powershell
$env:ADB_MDNS_AUTO_CONNECT = '0'
```

**2. 给 daemon 足够的初始化时间**（约 20 秒）：

```powershell
adb start-server
Start-Sleep -Seconds 20
```

**3. 用 `tools/adb_mini.py` 直接说协议**，完全不依赖 adb.exe 客户端。

### 无线调试端口的找法

手机的无线调试端口每次重连都会变，而且 **pairing 端口和 connect 端口是两个不同的端口**（`adb pair` 用前者，`adb connect` 用后者）。

**从 NAS 上扫描最可靠**（本机网络路径对手机有问题，NAS 上扫却一下就中）：

```sh
python3 /tmp/scan_ports.py 192.168.0.214 32768 61000
```

---

## 七、改动清单

### 原生层（`mobile/android/app/src/main/java/com/icewhale/casaos/`）

| 文件 | 说明 |
|---|---|
| `MainActivity.java` | 服务器地址设置/持久化、URL 规范化、禁用 HTTP 缓存、**接管返回键并派发 JS 事件** |
| `ServerAddressPlugin.java` | 网页侧打开「设置服务器地址」对话框 |
| `SystemInsetsPlugin.java` | **把系统栏/刘海 inset 提供给网页层** |

### 网页层（`UI/src/`）

| 文件 | 说明 |
|---|---|
| `plugins/native.js` | 返回处理主逻辑：优先级链、去重、**沿 `$parent` 链找 Modal 实例**、**`$root` 找根实例**、安全区注入 |
| `main.js` | 注册返回处理 + 安全区注入 |
| `components/filebrowser/FilePanel.vue` | 返回上一级目录 / 根目录时自己关自己；**`isPanelVisible` 三重判断** |
| `components/filebrowser/components/SidebarMenuButton.vue` | id 改成 `file-sidebar-btn`（避免全局 ID 冲突） |
| `components/TopBar.vue` | `#sidebar-btn` 选择器限定作用域；新增「服务器地址」菜单项 |
| `views/Home.vue` | 同步 `fileBrowserOpen` 到 store |
| `public/css/safe-area.css` | 全面屏适配规则（统一用 `--sa-*` 变量） |
| `public/sw.js` | Service Worker 缓存策略修正 |
| `assets/lang/*.json` | 新增退出确认框的 i18n 文案 |

### 测试

| 文件 | 说明 |
|---|---|
| `UI/tools/test-back-handler.mjs` | **26 项单元测试**全通过 |
| `tools/regression-test.ps1` | **13 项真机回归测试**全通过 |

---

## 八、还没做的

1. **浏览器 / PWA 路径**的返回行为没在真机浏览器里验证过（代码逻辑有，但没实测）
2. **横屏 + 虚拟键盘**场景没测（`safe-area.css` 里有对应规则）
3. **平板宽度**（≥768px）下的侧边栏布局没验证 —— 设备宽度 686px 一直在 mobile 断点内
4. 退出确认框的**英文文案**没在真机上看过（`$te()` 的存在性判断逻辑单元测试覆盖了，但实机没截英文图）
