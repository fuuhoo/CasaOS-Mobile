/**
 * native.js（返回手势处理）的单元测试。
 *
 * 覆盖的关键点：
 *  - 文件管理器优先于弹窗
 *  - 弹窗关闭：包括 Buefy 编程式弹窗（__vue__ 挂在 <transition> 上，
 *    真正的 Modal 实例在 $parent 链上）——这是真机上发现的坑
 *  - 侧边抽屉、路由后退的优先级
 *  - 退出应用前的二次确认
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const uiRoot = path.resolve(here, '..')

// 复制被测模块，并把 import 说明符改成同目录的相对路径
let nativeSrc = fs.readFileSync(path.join(uiRoot, 'src/plugins/native.js'), 'utf8')
nativeSrc = nativeSrc.replace(/from\s+['"][^'"]*events\/events\.js['"]/, "from './events.js'")
if (!nativeSrc.includes("from './events.js'")) {
	throw new Error('没能改写 native.js /events 引入，测试无法运行')
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casaos-back-test-'))
fs.writeFileSync(path.join(tmp, 'native.js'), nativeSrc)
fs.copyFileSync(path.join(uiRoot, 'src/events/events.js'), path.join(tmp, 'events.js'))
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }))

// ---------------------------------------------------------------- 桩件

function makeEnv({
	modals = [],
	sidebarOpen = false,
	routePath = '/',
	canExit = false,
	native = true,
	hasDialog = true,
} = {}) {
	const calls = []
	const listeners = {}

	const docListeners = []
	const winListeners = []


	// 根实例：Vue 2 里任何实例的 $root 都指向它
	const rootVm = {
		$buefy: hasDialog
			? {
				dialog: {
					confirm: (opts) => {
						calls.push('confirm-dialog:' + opts.confirmText)
						if (opts.onConfirm) opts.onConfirm()
					},
				},
			}
			: null,
		$i18n: { t: (k) => k, te: (k) => false },
	}
	rootVm.$root = rootVm

	// 挂载后 #app 已被 Vue 替换掉，只剩下这个根元素
	const appEl = {
		__vue__: rootVm,
	}

	global.document = {
		addEventListener: (name, fn) => {
			docListeners.push({ name, fn })
		},
		getElementById: (id) => (id === 'app' ? appEl : null),
		body: { children: [{ __vue__: rootVm }] },
		querySelectorAll: (sel) => {
			// 非 .modal 的选择器（例如 getRootVm 用的 '[id]'）返回普通元素，
			// 它们身上挂着根实例的 $root
			if (sel !== '.modal') return [{ __vue__: rootVm }]
			return modals.map((m) => {
				const real = {
					get isActive() {
						return m.active
					},
					close: () => {
						calls.push('close-modal:' + m.name)
						m.active = false
					},
				}
				// 编程式弹窗（$buefy.modal.open）的 __vue__ 是 <transition>，
				// 真正的 Modal 实例在 $parent 上。
				const el = { style: {}, className: 'modal is-active ' + m.name }
				if (m.viaTransition) {
					el.__vue__ = { $parent: real }
				} else {
					el.__vue__ = real
				}
				return el
			})
		},
	}

	global.window = {
		location: { href: 'http://nas/#/' },
		addEventListener: (name, fn) => {
			winListeners.push({ name, fn })
		},
		history: {
			state: { key: 'abc' },
			pushState: (state) => {
				calls.push('push-sentinel')
				global.window.history.state = state
			},
		},
	}

	const eventBus = {
		$emit: (name, reply) => {
			calls.push('emit:' + name)
			if (name === 'fileBack' && typeof reply === 'function') reply(fileBrowserHandlesBack)
		},
	}

	const store = {
		state: { sidebarOpen, fileBrowserOpen: false },
		commit: (name) => {
			calls.push('commit:' + name)
			if (name === 'SET_SIDEBAR_CLOSE') store.state.sidebarOpen = false
		},
	}

	const router = {
		currentRoute: { path: routePath },
		back: () => calls.push('router-back'),
	}

	const appListeners = {}
	const capacitor = {
		isNativePlatform: () => true,
		Plugins: {
			App: {
				exitApp: () => {
					calls.push('exit-app')
					return canExit
				},
				addListener: (name, cb) => {
					calls.push('app-addListener:' + name)
					appListeners[name] = cb
					return { remove: () => delete appListeners[name] }
				},
			},
		},
	}

	if (native) {
		global.window.Capacitor = capacitor
		global.Capacitor = capacitor
	} else {
		delete global.window.Capacitor
		delete global.Capacitor
	}

	return { calls, eventBus, store, router, docListeners, winListeners, listeners, appListeners }
}

// fileBack 事件是否被文件管理器处理
let fileBrowserHandlesBack = false

const { handleBack, setupBackButton } = await import(pathToFileURL(path.join(tmp, 'native.js')).href)

let passed = 0
let failed = 0

function check(name, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	if (ok) {
		passed++
		console.log(`  PASS  ${name}`)
	} else {
		failed++
		console.log(
			`  FAIL  ${name}\n        expected: ${JSON.stringify(expected)}\n        actual  : ${JSON.stringify(actual)}`
		)
	}
}

// ---------------------------------------------------------------- 用例

console.log('\n[1] 文件管理器在子目录：返回应该只回到上一级，不关弹窗')
{
	fileBrowserHandlesBack = true
	const env = makeEnv({ modals: [{ name: 'files', active: true }] })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack'])
}

console.log('\n[2] 文件管理器在根目录：返回应该关闭弹窗（等同点叉号）')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ modals: [{ name: 'files', active: true }] })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'close-modal:files'])
}

console.log('\n[3] 没有文件管理器，但有别的弹窗：应该关闭最上层的弹窗')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ modals: [{ name: 'preview', active: true }] })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'close-modal:preview'])
}

console.log(
	'\n[4] 编程式弹窗（__vue__ 是 transition，Modal 在 $parent 上）：必须能关掉，' +
		'否则会一路穿透到「退出应用」'
)
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ modals: [{ name: 'appstore', active: true, viaTransition: true }] })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'close-modal:appstore'])
}

console.log('\n[5] 编程式弹窗 + 声明式弹窗同时存在：先关最上层（后出现的那个）')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({
		modals: [
			{ name: 'files', active: true },
			{ name: 'appstore', active: true, viaTransition: true },
		],
	})
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'close-modal:appstore'])
}

console.log('\n[6] 侧边抽屉打开：应该关抽屉')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ sidebarOpen: true })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'commit:SET_SIDEBAR_CLOSE'])
}

console.log('\n[7] 在非首页路由上：应该路由后退')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ routePath: '/somewhere' })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序', env.calls, ['emit:fileBack', 'router-back'])
}

console.log('\n[8] 浏览器 popstate 场景：跳过 router.back()，避免二次后退')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ routePath: '/somewhere', native: false })
	const handled = handleBack(env.eventBus, env.router, env.store, { skipRouterBack: true })
	check('已被消费', handled, false)
	check('调用顺序（没有 router-back，浏览器里也没有 exitApp）', env.calls, ['emit:fileBack'])
}

console.log('\n[9] 首页且没有任何可关的东西：原生环境应该先弹二次确认，确认后才退出')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ canExit: true })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('已被消费', handled, true)
	check('调用顺序（ 说不存在 -> 用中文兜底）', env.calls, ['emit:fileBack', 'confirm-dialog:退出', 'exit-app'])
}

console.log('\n[10] 首页：确认框不可用时（拿不到 $buefy）不应该直接退出')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ canExit: true, hasDialog: false })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('未被消费（忽略这次返回）', handled, false)
	check('调用顺序（没有 exit-app）', env.calls, ['emit:fileBack'])
}

console.log('\n[11] 浏览器里没有「退出应用」：不应该弹确认框')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ native: false })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('未被消费（交给浏览器自己处理）', handled, false)
	check('调用顺序（没有 confirm-dialog）', env.calls, ['emit:fileBack'])
}

console.log('\n[12] 原生返回键：监听 document 的 backbutton 事件（原生层直接派发）')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ canExit: true })
	setupBackButton(env.router, env.store, env.eventBus)

	const docBack = env.docListeners.find((x) => x.name === 'backbutton')
	check('已注册 document backbutton 监听器', !!docBack, true)

	if (docBack) {
		// 模拟原生层派发返回事件
		docBack.fn({ preventDefault: () => {} })
		const handledCount = env.calls.filter((x) => x === 'emit:fileBack').length
		check('返回事件被处理了一次', handledCount, 1)
	}
}

console.log('\n[13] 拿不到确认框能力时：不能直接退出 App（避免误退出）')
{
	fileBrowserHandlesBack = false
	const env = makeEnv({ canExit: true, hasDialog: false })
	const handled = handleBack(env.eventBus, env.router, env.store)
	check('未被消费（忽略这次返回，不退出）', handled, false)
	check('调用顺序（没有 exit-app）', env.calls, ['emit:fileBack'])
}

console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
