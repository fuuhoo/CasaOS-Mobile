(function () {
  var r = {};
  var btn = document.getElementById('file-sidebar-btn');

  // 找 SidebarMenuButton 组件实例
  var sbVm = null;
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var v = all[i].__vue__;
    if (v && v.$options && v.$options.name === 'sidebar-button') { sbVm = v; break; }
  }
  r.sbVm = sbVm ? {
    found: true,
    isMobile: sbVm.isMobile,
    sizeType: sbVm.sizeType,
    windowWidth: sbVm.windowWidth,
    hasEventBus: !!sbVm.$EventBus,
    hasHandler: typeof sbVm.handleShowSideBar === 'function'
  } : { found: false };

  // 直接调用它的方法
  if (sbVm && typeof sbVm.handleShowSideBar === 'function') {
    try {
      sbVm.handleShowSideBar();
      r.calledDirectly = 'ok';
    } catch (e) {
      r.calledDirectly = 'ERR: ' + String(e);
    }
  }

  // 事件总线上是否真的有 showFilesSidebar 监听
  var root = document.querySelector('#app');
  var bus = root.__vue__.$EventBus;
  r.listeners = bus._events ? Object.keys(bus._events) : null;

  return new Promise(function (resolve) {
    setTimeout(function () {
      var fpVm = null;
      var all2 = document.querySelectorAll('*');
      for (var i = 0; i < all2.length; i++) {
        var v = all2[i].__vue__;
        if (v && 'isSideBarOpen' in v) { fpVm = v; break; }
      }
      r.isSideBarOpen = fpVm ? fpVm.isSideBarOpen : null;
      var c = document.querySelector('.modal.file-panel .sidebar-content');
      r.sidebarW = c ? Math.round(c.getBoundingClientRect().width) : null;
      resolve(JSON.stringify(r, null, 1));
    }, 500);
  });
})()
