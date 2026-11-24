(function () {
  var r = {};
  var btn = document.getElementById('file-sidebar-btn');
  if (!btn) return 'no #file-sidebar-btn';

  var fp = document.querySelector('.modal.file-panel');
  r.hasFpModal = !!fp;

  // 找到 FilePanel 实例
  var fpVm = null;
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var v = all[i].__vue__;
    if (v && 'isSideBarOpen' in v) { fpVm = v; break; }
  }
  r.fpVm = fpVm ? {
    name: fpVm.$options ? fpVm.$options.name : null,
    isSideBarOpen: fpVm.isSideBarOpen,
    isMobile: fpVm.isMobile,
    sideBarPosition: fpVm.sideBarPosition,
    sizeType: fpVm.sizeType
  } : 'not found';

  // 侧边栏 DOM 现状
  var sb = fp ? fp.querySelector('.b-sidebar') : null;
  r.sidebar = sb ? {
    cls: sb.className,
    rect: sb.getBoundingClientRect().toJSON(),
    display: getComputedStyle(sb).display,
    transform: getComputedStyle(sb).transform,
    transformStyle: getComputedStyle(sb).transformStyle
  } : null;

  // 事件总线里有没有 SHOW_FILES_SIDEBAR 的监听
  r.eventBusListeners = null;
  var root = document.querySelector('#app');
  if (root && root.__vue__) {
    var vm = root.__vue__;
    var bus = vm.$EventBus;
    if (bus && bus._events) {
      var keys = Object.keys(bus._events);
      r.eventBusListeners = keys.map(function (k) {
        return k + ':' + (Array.isArray(bus._events[k]) ? bus._events[k].length : 1);
      });
    }
  }

  // 直接触发事件试试
  r.beforeOpen = fpVm ? fpVm.isSideBarOpen : null;
  if (root && root.__vue__ && root.__vue__.$EventBus) {
    root.__vue__.$EventBus.$emit('showFilesSideBar');
    r.emitted = 'showFilesSideBar';
  }

  return JSON.stringify(r, null, 1);
})()
