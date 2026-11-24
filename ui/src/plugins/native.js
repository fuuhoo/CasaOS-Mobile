/**
 * 原生（Capacitor）与浏览器的「返回」处理。
 *
 * ## 为什么需要这一层
 *
 * CasaOS 的主界面是一个 SPA，文件管理器是挂在首页上的一个弹窗，
 * 它的目录层级（currentPath）是组件内部状态，**没有进路由栈**，
 * 所以系统返回手势 / 浏览器后退键天然不知道「上一级目录」是什么。
 *
 * 这里把返回动作按「离用户意图最近」排序，逐级往下问，
 * 谁处理了就停：
 *
 *   1. 文件管理器  → 返回上一级目录（已经在根目录则不处理）
 *   2. 弹窗        → 关闭最上层弹窗（文件管理器在根目录时，这等同于点叉号）
 *   3. 侧边抽屉    → 关闭抽屉
 *   4. 路由        → router.back()
 *   5. 都没有      → 退出应用
 *
 * ## 两条入口
 *
 * - **原生**（Android 手势返回 / 返回键）：Capacitor 的原生桥会把返回键转换成
 *   document 上的 `backbutton` 事件（见 native-bridge.js）。注册监听后原生侧
 *   就不再自动执行 webView.goBack()，行为完全由我们决定。
 *   普通浏览器里 `backbutton` 永远不会触发，所以这段逻辑对 Web 版无害。
 *
 * - **浏览器**（后退键 / iOS 侧滑返回）：监听 `popstate`。应用消费掉这次后退后，
 *   把地址用 pushState 还原回去，这样浏览器不会真的离开当前页面。
 *   注意：popstate 必须在 vue-router 初始化之前注册，否则 vue-router 会先一步
 *   按旧地址跳转。
 */

// 用相对路径而不是 @/ 别名，这样这个文件可以被 node 直接 import 做单元测试
import events from '../events/events.js'

// 当前是否有一条「哨兵」历史记录（用来接管浏览器的后退键）
let sentinelActive = false

/**
 * 当前是否运行在 Capacitor 原生容器里。
 */
export function isNativeApp() {
	const cap = typeof window !== 'undefined' ? window.Capacitor : undefined
	return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/**
 * 找到某个 .modal 元素对应的 Buefy 弹窗实例。
 *
 * **这里有个坑**：Buefy 的 Modal 模板根节点是 `<transition>`，所以挂在 DOM 上面的
 * `__vue__` 拿到的是 transition 这个抽象组件，它既没有 `close()` 也没有 `isActive`。
 * 真正的 Modal 实例在它的 `$parent` 上，必须沿着 `$parent` 链往上找。
 *
 * 只判断 `el.__vue__` 的话，编程式打开的弹窗（$buefy.modal.open，例如 App Store）
 * 会被误判成「没有打开的弹窗」，返回手势就会一路穿透到「退出应用」。
 *
 * @param {Element} el .modal 元素
 * @returns {object|null} Modal / Dialog 实例
 */
function findModalInstance(el) {
	let vm = el && el.__vue__
	// 防御性上限，防止 $parent 链异常时死循环
	for (let depth = 0; vm && depth < 12; depth++) {
		// Modal 与 Dialog 都有 close() 和 isActive，transition 两个都没有
		if (typeof vm.close === 'function' && vm.isActive !== undefined) {
			return vm
		}
		vm = vm.$parent
	}
	return null
}

/**
 * 移开当前聚焦在弹窗内输入框上的焦点。
 *
 * Buefy 的 modal 默认 autoFocus，打开弹窗时会聚焦第一个输入框（App Store 的
 * 搜索框就是）。输入框持有焦点时，系统输入法会注册自己的返回回调，
 * 返回键被用来收起软键盘而不是关掉弹窗 —— 表现为「要按两次返回才能关 App Store」。
 *
 * 只处理**可见弹窗内部**的输入框，不影响用户正常在页面里输入。
 */
function blurModalInput() {
	if (typeof document === 'undefined') return

	const active = document.activeElement
	if (!active || active === document.body) return
	if (!active.tagName || active.tagName.toUpperCase() !== 'INPUT') return
	if (typeof active.closest !== 'function') return

	// 只在可见的弹窗内部才处理
	const modal = active.closest('.modal')
	if (!modal) return
	if (modal.style && modal.style.display === 'none') return

	try {
		active.blur()
	} catch (e) {
		// 忽略
	}
}

/**
 * 关闭当前打开的最上层 Buefy 弹窗。
 *
 * @returns {boolean} 是否确实关闭了一个弹窗
 */
function closeTopmostModal() {
	if (typeof document === 'undefined') return false

	const modals = document.querySelectorAll('.modal')
	// 从最上层往下找：后出现的弹窗在 DOM 里也更靠后
	for (let i = modals.length - 1; i >= 0; i--) {
		const el = modals[i]

		// 隐藏的弹窗直接跳过（b-modal 用 v-show 控制显隐，隐藏时是 display:none）
		if (el.style && el.style.display === 'none') continue

		const vm = findModalInstance(el)
		if (!vm) continue

		// 声明式用法(<b-modal v-model>)和编程式用法($buefy.modal.open)的打开状态字段不同：
		// 编程式弹窗的 active prop 是 false，只有 isActive 为 true。
		const opened = vm.isActive !== undefined ? vm.isActive : vm.active
		if (!opened) continue

		vm.close()
		return true
	}
	return false
}

/**
 * 记录一次「返回」处理的决策过程，调试用。
 *
 * 存在 window.__casaosBackLog 上，可以通过 DevTools 协议读出来，
 * 排查「按返回没反应 / 行为不对」时能直接看到每个层级为什么被跳过。
 */
function traceBack(step, detail) {
	try {
		if (typeof window === 'undefined') return
		if (!window.__casaosBackLog) window.__casaosBackLog = []
		window.__casaosBackLog.push({ step: step, detail: detail, at: Date.now() })
	} catch (e) {
		// 忽略
	}
}

/**
 * 拿到根 Vue 实例，用来调用 $buefy（确认框）和 $i18n（文案）。
 *
 * ## 为什么不能用 document.getElementById('app')
 *
 * Vue 2 挂载时会把 #app 这个占位元素**整个替换掉**，挂载后 DOM 里已经没有
 * id="app" 的元素了。退一步按 body.children[0] 找也不可靠 ——
 * 打开 Buefy 弹窗时，body 下第一个带 __vue__ 的元素是弹窗的 <transition>
 * 抽象组件，它的 $buefy 是 undefined，于是确认框弹不出来，直接退出了应用。
 *
 * 稳妥的办法是走 Vue 实例的 $root：任何组件实例（包括抽象组件）的 $root
 * 都指向整棵组件树的根实例，也就是 new Vue({...}) 那个。
 *
 * @returns {object|null}
 */
function getRootVm() {
	if (typeof document === 'undefined') return null

	try {
		// 优先找任何一个带 Vue 实例的元素，用它的 $root 拿根实例
		const els = document.querySelectorAll('.modal, [id]')
		for (let i = 0; i < els.length; i++) {
			const vm = els[i].__vue__
			if (vm && vm.$root) return vm.$root
		}

		// 退一步：body 下的直接子元素
		const kids = document.body ? document.body.children : null
		if (kids) {
			for (let i = 0; i < kids.length; i++) {
				const vm = kids[i].__vue__
				if (vm && vm.$root) return vm.$root
				if (vm) return vm
			}
		}
	} catch (e) {
		// 忽略
	}
	return null
}

/**
 * 取一条本地化文案，取不到就用兜底文案。
 *
 * 判断「有没有这条翻译」要用 $te()，不能用 `t(key) !== key`：
 * 英文语言包里 "Exit": "Exit" 这种值本来就和 key 一样，
 * 用后者判断会把它们误判成「找不到」，然后回退成中文。
 *
 * @returns {string}
 */
function translate(vm, key, fallback) {
	try {
		if (vm && vm.$i18n && typeof vm.$i18n.t === 'function') {
			if (typeof vm.$i18n.te === 'function') {
				// $te() 明确告诉我们这条翻译存不存在
				if (vm.$i18n.te(key)) return vm.$i18n.t(key)
			} else {
				const text = vm.$i18n.t(key)
				if (text && text !== key) return text
			}
		}
	} catch (e) {
		// 忽略，走兜底
	}
	return fallback
}

/**
 * 关闭移动端侧边抽屉。
 *
 * @returns {boolean} 是否确实关闭了抽屉
 */
function closeSidebar(store) {
	if (!store || !store.state || !store.state.sidebarOpen) return false
	store.commit('SET_SIDEBAR_CLOSE')
	return true
}

/**
 * 路由是否还有可返回的历史。
 *
 * 注意：vue-router 的 **hash 模式**不会把上一条路由写进 history.state.back
 * （那是 HTML5 模式才有的字段，hash 模式下 state 里只有 { key }），
 * 所以这里只能看当前路由是不是首页。
 */
function canGoBackInRouter(router) {
	if (!router || !router.currentRoute) return false
	const path = router.currentRoute.path
	return !!path && path !== '/' && path !== '/login' && path !== '/welcome'
}

/**
 * 退出原生 App。浏览器里没有这个能力，返回 false。
 */
function exitApp() {
	const cap = typeof window !== 'undefined' ? window.Capacitor : undefined
	if (cap && cap.Plugins && cap.Plugins.App && typeof cap.Plugins.App.exitApp === 'function') {
		cap.Plugins.App.exitApp()
		return true
	}
	return false
}

/**
 * 退出应用前先弹一个确认框，避免误触手势返回直接退出。
 *
 * 只有原生 App 才有「退出应用」这个动作，浏览器里不需要确认。
 *
 * @returns {boolean} 是否处理了这次返回
 */
function confirmExitApp() {
	// 浏览器里没有退出应用这回事，直接交给浏览器自己处理
	if (!isNativeApp()) return false

	const vm = getRootVm()
	const buefy = vm && vm.$buefy
	if (!buefy || !buefy.dialog || typeof buefy.dialog.confirm !== 'function') {
		/*
		 * 拿不到确认框能力时**不要直接退出**。
		 *
		 * 之前这里是无条件 exitApp()，结果一个次要问题被放大成「按返回键就退出 App」：
		 * 根实例拿不到 -> $buefy 是 undefined -> 直接退出，
		 * 用户在 App Store 里按返回也会被误退出。
		 *
		 * 现在拿不到确认框就什么都不做（返回 false），让这次返回被系统忽略，
		 * 总比误退出好。真想退出可以从桌面长按图标走快捷方式，或用系统的多任务界面。
		 */
		traceBack('exit', 'no confirm dialog available, ignored')
		return false
	}

	buefy.dialog.confirm({
		title: translate(vm, 'Exit CasaOS', '退出 CasaOS'),
		message: translate(
			vm,
			'Are you sure you want to exit the app?',
			'确定要退出应用吗？'
		),
		confirmText: translate(vm, 'Exit', '退出'),
		cancelText: translate(vm, 'Cancel', '取消'),
		hasIcon: true,
		icon: 'exclamation-triangle',
		iconPack: 'fas',
		onConfirm: () => {
			exitApp()
		},
	})
	return true
}

/**
 * 询问文件管理器：这一下返回能不能由它处理（返回上一级目录）。
 *
 * @returns {boolean} 文件管理器是否已经处理了这次返回
 */
function requestFileBrowserBack(eventBus) {
	if (!eventBus) return false

	let handled = false
	eventBus.$emit(events.FILE_BACK, (ok) => {
		if (ok) handled = true
	})
	return handled
}

/**
 * 处理一次「返回」，按优先级依次询问。
 *
 * @param {object} eventBus
 * @param {object} router
 * @param {object} store
 * @param {object} options skipRouterBack：由浏览器 popstate 触发时为 true，
 *                        因为浏览器已经自己后退过了，不能再让 router.back() 退一次
 * @returns {boolean} 是否被应用消费掉了（false 表示没人处理，交给系统/浏览器）
 */
export function handleBack(eventBus, router, store, options) {
	const opts = options || {}

	traceBack('start', {
		modalCount: document.querySelectorAll('.modal').length,
		route: router && router.currentRoute ? router.currentRoute.path : null
	})

	// 1) 文件管理器内部返回上一级目录
	if (requestFileBrowserBack(eventBus)) {
		traceBack('file-browser', 'handled')
		return true
	}
	traceBack('file-browser', 'not handled')

	// 2) 关闭最上层弹窗（文件管理器在根目录时，这等同于点叉号）
	//
	//    弹窗里的输入框可能还留着焦点（例如 Buefy 的 modal 默认 autoFocus 会
	//    聚焦搜索框），这会让输入法注册自己的返回回调，把返回键吃掉。
	//    这里先把焦点从弹窗内的输入框上移开，关弹窗时顺带把键盘也收掉。
	blurModalInput()

	const modals = []
	document.querySelectorAll('.modal').forEach(function (el) {
		const vm = findModalInstance(el)
		modals.push({
			cls: el.className.replace('modal ', '').replace(' is-active', ''),
			display: el.style.display || 'shown',
			instance: vm ? (vm.$options && vm.$options.name) || 'modal' : null,
			opened: vm ? (vm.isActive !== undefined ? vm.isActive : vm.active) : null
		})
	})
	traceBack('modals', modals)

	if (closeTopmostModal()) {
		traceBack('modal', 'closed')
		return true
	}
	traceBack('modal', 'none closed')

	// 3) 关闭移动端侧边抽屉
	if (closeSidebar(store)) {
		traceBack('sidebar', 'closed')
		return true
	}
	traceBack('sidebar', 'not open')

	// 4) 路由后退
	if (!opts.skipRouterBack && canGoBackInRouter(router)) {
		router.back()
		traceBack('router', 'back')
		return true
	}
	traceBack('router', 'cannot go back')

	// 5) 已经在首页且没有别的可关 —— 退出应用（Android 的预期行为）。
	//    原生 App 会先弹一个二次确认，避免误触手势返回直接把 App 关掉。
	if (confirmExitApp()) {
		traceBack('exit', 'confirm shown')
		return true
	}
	traceBack('exit', 'not handled')

	return false
}

/**
 * 往浏览器历史里压一条「哨兵」记录。
 *
 * 文件管理器是一个弹窗，打开它并不会改变 URL，浏览器也就没有东西可以「后退」——
 * 按后退会直接离开整个页面。压一条哨兵之后，浏览器后退会先退到这条记录上，
 * 被应用接管（返回上一级目录 / 关闭弹窗），我们再补一条新的哨兵，
 * 浏览器就不会真的离开页面。
 *
 * pushState 会截断指针之后的历史记录，所以历史深度不会越滚越长。
 */
function pushSentinel() {
	if (typeof window === 'undefined' || !window.history || !window.history.pushState) return
	try {
		// 保留 vue-router 自己放在 state 里的字段
		const state = Object.assign({}, window.history.state)
		window.history.pushState(state, '')
		sentinelActive = true
	} catch (e) {
		// 某些浏览器对 pushState 的入参有限制，失败就算了，不影响功能
	}
}

/**
 * 处理浏览器的后退键 / 侧滑返回。
 *
 * popstate 触发时浏览器已经后退过了，所以这里不再用 pushState 还原地址，
 * 而是消费掉这次后退后再补一条哨兵，把页面「钉」在原地。
 */
function setupBrowserBack(eventBus, router, store) {
	if (typeof window === 'undefined' || !window.history || !window.history.pushState) return

	window.addEventListener(
		'popstate',
		() => {
			if (handleBack(eventBus, router, store, { skipRouterBack: true })) {
				// 应用把这次后退消费掉了，补一条哨兵，浏览器就不会真的离开页面
				pushSentinel()
			} else {
				// 没人处理：哨兵已经被弹掉了，
				// 下次再打开文件管理器时重新压一条，历史深度才不会越滚越长
				sentinelActive = false
			}
		},
		false
	)
}

/**
 * 把系统栏 / 刘海的内边距写进 CSS 变量，供 safe-area.css 使用。
 *
 * CSS 里的 env(safe-area-inset-*) 在 Android WebView 里恒为 0，
 * 所以原生层通过 SystemInsets 插件把真实值告诉我们。
 * iOS / 浏览器里没有这个插件，env() 的值会被直接沿用，互不影响。
 *
 * 页面旋转后 inset 会变（横屏刘海在左右），所以 resize 时要重新取一次。
 */
export async function setupSafeArea() {
	if (typeof document === 'undefined') return

	let applied = false

	const apply = async () => {
		const cap = typeof window !== 'undefined' ? window.Capacitor : undefined
		if (!cap || !cap.Plugins || !cap.Plugins.SystemInsets) return false
		try {
			const info = await cap.Plugins.SystemInsets.get()
			if (!info) return false
			const style = document.documentElement.style
			style.setProperty('--sa-top', (info.top || 0) + 'px')
			style.setProperty('--sa-bottom', (info.bottom || 0) + 'px')
			style.setProperty('--sa-left', (info.left || 0) + 'px')
			style.setProperty('--sa-right', (info.right || 0) + 'px')
			applied = true
			return true
		} catch (e) {
			return false
		}
	}

	// Capacitor 的原生插件是懒加载的，页面刚起来时可能还没就绪，
	// 所以先试一次，不成功就稍后重试（最多约 5 秒）。
	for (let i = 0; i < 25 && !applied; i++) {
		if (await apply()) break
		await new Promise((resolve) => setTimeout(resolve, 200))
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('resize', apply)
		window.addEventListener('orientationchange', apply)
	}
}

/**
 * 注册返回键 / 返回手势的处理。
 *
 * ## 返回事件从哪来
 *
 * Capacitor 7 的原生侧（AppPlugin.java）是这样处理的：
 *
 * ```java
 * if (!hasListeners(EVENT_BACK_BUTTON)) {
 *     // 没有监听器 -> 执行默认行为（WebView.goBack()）
 * } else {
 *     notifyListeners(EVENT_BACK_BUTTON, data, true);
 *     bridge.triggerJSEvent("backbutton", "document");
 * }
 * ```
 *
 * 也就是说：**原生侧只有在 App 插件注册了 'backButton' 监听器时，
 * 才会把返回键转成 JS 事件**。否则事件根本不会到 JS，
 * 用户按返回键会直接触发 WebView 的默认后退行为。
 *
 * Capacitor 的 native-bridge.js 里有一段 hack，想在 JS 侧注册
 * document 的 'backbutton' 监听器时，顺手给 App 插件补一个空的
 * 'backButton' 监听器。但这个 hack 依赖内部实现细节，
 * 实测在某些情况下不会生效（事件完全收不到）。
 *
 * 所以这里**直接用官方 API** 显式注册 App 的 'backButton' 监听器，
 * 不依赖那个 hack。
 *
 * @param {object} router   vue-router 实例
 * @param {object} store    vuex 实例
 * @param {object} eventBus 全局事件总线（用于询问文件管理器）
 */
export function setupBackButton(router, store, eventBus) {
	if (typeof document === 'undefined') return

	/*
	 * 去重：Capacitor 的原生侧在收到返回键时，如果 App 插件注册了 'backButton'
	 * 监听器，会**同时**做两件事：
	 *   1) 触发 App 插件的 backButton 监听器
	 *   2) 往 document 上派发 'backbutton' 事件
	 * 两条通道都会走到这里，但用户只按了一次返回，所以只能处理一次。
	 *
	 * 用时间窗口而不是 setTimeout(0)：两次 evaluateJavascript 之间隔着一次
	 * 原生 -> JS 的往返，宏任务间隙足够让 setTimeout(0) 先跑，标志会被过早释放，
	 * 结果一次返回被处理两次（关掉文件管理器之后又弹出「退出应用」确认框）。
	 */
	const DEDUP_WINDOW_MS = 300
	let lastHandledAt = 0
	const onBack = (event) => {
		const now = Date.now()
		if (now - lastHandledAt < DEDUP_WINDOW_MS) return
		lastHandledAt = now

		if (event && typeof event.preventDefault === 'function') {
			event.preventDefault()
		}
		handleBack(eventBus, router, store)
	}

	/*
	 * 注册原生返回键的处理。
	 *
	 * ## 事件从哪来
	 *
	 * 原生层（MainActivity.setupBackKeyHandling）自己注册了一个
	 * OnBackPressedCallback，无条件把返回键派发成 document 上的
	 * 'backbutton' 事件，所以这里只需要监听 document 就行。
	 *
	 * 不用 Capacitor 自带的 App.addListener('backButton') 通道：
	 * 那条路要求原生侧 hasListeners('backButton') 为真才会派发，
	 * 而从 JS 侧注册它并不可靠（插件没就绪时会静默失败），
	 * 实测出现过「注册没报错但事件始终收不到」的情况。
	 *
	 * 浏览器里没有 Capacitor，document 的 'backbutton' 不会触发，
	 * 但注册一下也无害（部分 WebView 会派发）。
	 */
	document.addEventListener('backbutton', onBack, false)

	// 浏览器后退键 / iOS 侧滑返回
	setupBrowserBack(eventBus, router, store)

	// 文件管理器打开时压一条哨兵，这样浏览器的后退键才会被应用接管，
	// 而不是直接离开页面。原生 App 不需要（走 backbutton 事件）。
	if (store && !isNativeApp() && typeof store.watch === 'function') {
		store.watch(
			(state) => state.fileBrowserOpen,
			(open) => {
				if (open && !sentinelActive) pushSentinel()
			},
			{ immediate: false }
		)
	}
}
