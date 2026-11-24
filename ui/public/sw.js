/*
 * CasaOS PWA Service Worker —— 个人自用版
 *
 * 目标：
 *   1) NAS 离线时仍能打开界面（App Shell 预缓存），不至于白屏；
 *   2) API 与实时通道一律 network-only，任何情况下都不缓存写操作/业务数据；
 *   3) **界面更新后必须立刻生效** —— 这一条最容易踩坑，下面单独说明。
 *
 * ## 为什么之前会出现「更新了 UI 但页面还是旧的」
 *
 * 构建产物（app.<hash>.js）带 content hash，内容变了文件名就变，
 * 所以资源本身用 cache-first 是安全且最快的。
 *
 * 真正的问题在 index.html：它引用了具体哪个 hash 文件。
 * 如果 index.html 命中了缓存，页面就会去加载一个**已经被删掉的旧 hash 文件**，
 * 结果是「Service Worker 缓存了旧版 UI，怎么刷新都不变」。
 *
 * fetch() 默认会走 HTTP 缓存，所以单纯写成 network-first 是不够的，
 * 必须显式加 { cache: 'reload' } 绕过 HTTP 缓存。
 *
 * ## 缓存策略
 *
 *   页面导航 (navigate)  → network-first + cache:'reload'，离线才回退到缓存的 index.html
 *   .js / .css 构建产物   → cache-first（文件名带 hash，内容变了文件名就变）
 *   图片 / 字体 / 其它     → stale-while-revalidate
 *   API / 实时通道         → network-only
 *
 * CACHE_NAME 里的版本号在每次发布 UI 时递增，activate 时旧缓存会被整体清掉，
 * 不会越攒越多。
 */

const CACHE_VERSION = 'v2'
const CACHE_NAME = 'casaos-shell-' + CACHE_VERSION

// App Shell：装的时候预缓存，保证离线可打开
const SHELL_ASSETS = [
	'/',
	'/index.html',
	'/site.webmanifest',
	'/favicon.ico',
	'/img/icon/android-chrome-192x192.png',
	'/img/icon/android-chrome-512x512.png',
	'/img/icon/apple-touch-icon.png',
]

// 这些路径永远走网络，绝不缓存
const NEVER_CACHE = ['/v1/', '/v2/', '/v3/', '/api/', 'message_bus', '/socket.io/']

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			// addAll 遇到单个 404 会整体失败，所以逐个 put，缺失的图标不影响安装
			.then((cache) =>
				Promise.all(
					SHELL_ASSETS.map((url) =>
						fetch(url, { cache: 'reload' })
							.then((res) => (res && res.ok ? cache.put(url, res) : null))
							.catch(() => null)
					)
				)
			)
			.then(() => self.skipWaiting())
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	)
})

function isApiPath(pathname) {
	return NEVER_CACHE.some((prefix) => pathname.includes(prefix))
}

// 构建产物：文件名里带 content hash，内容变了文件名就会变，可以放心长期缓存
function isHashedBuildAsset(pathname) {
	return /\.(js|css)$/.test(pathname) && /\.[0-9a-f]{8}\./.test(pathname)
}

// 离线时的兜底页（内联，避免额外请求）
const OFFLINE_HTML = `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>CasaOS - 无法连接</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0f1115;color:#e8eaed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .box{text-align:center;padding:24px}
  h1{font-size:18px;font-weight:600;margin:0 0 8px}
  p{font-size:14px;color:#9aa0a6;margin:0 0 24px;line-height:1.6}
  button{appearance:none;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;
         background:#3b82f6;color:#fff;cursor:pointer}
</style></head><body><div class="box">
<h1>无法连接到 CasaOS 服务器</h1>
<p>请确认服务器已开机，且手机与服务器网络可达。<br>如果在家中使用，请确认连接的是同一个 Wi-Fi。</p>
<button onclick="location.reload()">重试</button>
</div></body></html>`

self.addEventListener('fetch', (event) => {
	const request = event.request

	// 只处理 GET；写操作直接走网络
	if (request.method !== 'GET') return

	const url = new URL(request.url)

	// 跨域资源不接管
	if (url.origin !== self.location.origin) return

	// API / 实时通道：绝不缓存
	if (isApiPath(url.pathname)) return

	// 页面导航：network-first，并强制绕过 HTTP 缓存，
	// 保证 index.html 永远是最新的（否则会加载已经删除的旧 hash 文件）。
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request, { cache: 'reload' })
				.then((response) => {
					if (response && response.ok) {
						const copy = response.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
					}
					return response
				})
				.catch(() =>
					caches.match('/index.html').then((cached) => cached || caches.match('/')).then(
						(cached) =>
							cached ||
							new Response(OFFLINE_HTML, {
								headers: { 'Content-Type': 'text/html; charset=utf-8' },
								status: 503,
							})
					)
				)
		)
		return
	}

	// 带 hash 的构建产物：cache-first（文件名变了就是新文件）
	if (isHashedBuildAsset(url.pathname)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached
				return fetch(request).then((response) => {
					if (response && response.status === 200 && response.type === 'basic') {
						const copy = response.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
					}
					return response
				})
			})
		)
		return
	}

	// 其余静态资源：stale-while-revalidate
	event.respondWith(
		caches.match(request).then((cached) => {
			const network = fetch(request)
				.then((response) => {
					if (response && response.status === 200 && response.type === 'basic') {
						const copy = response.clone()
						caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
					}
					return response
				})
				.catch(() => cached)

			return cached || network
		})
	)
})
