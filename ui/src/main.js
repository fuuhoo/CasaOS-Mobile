import 'intersection-observer'
import Vue from 'vue'
import App from '@/App.vue'
import router from '@/router'
import store from '@/store'
import i18n from '@/plugins/i18n'
import api from '@/service/api.js'
import openAPI from '@/service/index.js'
import Buefy from 'buefy'
import VueFullscreen from 'vue-fullscreen'
import Vue2TouchEvents from 'vue2-touch-events'
import VueSocialSharing from 'vue-social-sharing'
import VueSocketIOExt from 'vue-socket.io-extended';
import messageBus from '@/events/index.js'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import { setupBackButton, setupSafeArea } from '@/plugins/native.js'


// Import Styles
import '@/assets/scss/app.scss'
import VAnimateCss from 'v-animate-css';

const io = require("socket.io-client");

const isDev = process.env.NODE_ENV === 'dev';
const protocol = document.location.protocol
const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
const devIp = process.env.VUE_APP_DEV_IP
const devPort = process.env.VUE_APP_DEV_PORT
const localhost = document.location.host
const localhostName = document.location.hostname
const baseIp = isDev ? `${devIp}` : `${localhostName}`
const baseURL = isDev ? `${devIp}:${devPort}` : `${localhost}`
const wsURL = `${wsProtocol}//${baseURL}`

const socket = io( {
	transports: ['websocket', 'polling'],
	path: '/v2/message_bus/socket.io/',
});

Vue.use(Buefy)
Vue.use(VueFullscreen)
Vue.use(VAnimateCss, { animateCSSPath: '/css/animate.min.css' });
Vue.use(Vue2TouchEvents)
Vue.use(VueSocketIOExt, socket);
Vue.use(VueSocialSharing);
Vue.use(VueDOMPurifyHTML, {
	default: {
		ALLOWED_ATTR: ['target', 'href']
	}
});

Vue.config.productionTip = false
Vue.prototype.$api = api;
Vue.prototype.$openAPI = openAPI;
Vue.prototype.$baseIp = baseIp;
Vue.prototype.$baseURL = baseURL;
Vue.prototype.$protocol = protocol;
Vue.prototype.$wsProtocol = wsProtocol;


// Create an EventBus
Vue.prototype.$EventBus = new Vue();
Vue.prototype.$messageBus = messageBus;

// 接管原生返回键 / 返回手势，以及浏览器的后退键 / 侧滑返回。
// 顺序很重要：必须在 new Vue 之前注册，因为 vue-router 初始化时会注册自己的
// popstate 监听，我们要抢在它前面把「后退」消费掉。
setupBackButton(router, store, Vue.prototype.$EventBus)

new Vue({
	router,
	i18n,
	store,
	render: h => h(App)
}).$mount('#app')

// 全面屏适配：把系统栏 / 刘海的高度写进 CSS 变量。
// Android 的 env(safe-area-inset-*) 恒为 0，必须由原生层提供真实值。
setupSafeArea()


// 注册 Service Worker（仅生产构建），让 PWA 离线时仍可打开界面。
// API 与实时通道由 sw.js 显式排除，始终走网络。
if (!isDev && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => {})
	})
}





