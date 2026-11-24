(function () {
  var r = {};
  r.innerWidth = window.innerWidth;
  r.innerHeight = window.innerHeight;
  r.outerWidth = window.outerWidth;
  r.screenW = screen.width;
  r.dpr = window.devicePixelRatio;
  r.docClientW = document.body.clientWidth;

  // 找 FilePanel 的 Vue 实例
  var found = null;
  var stack = [document.querySelector('#app')];
  function walk(el, depth) {
    if (!el || depth > 40) return;
    if (el.__vue__) {
      var vm = el.__vue__;
      if (vm.$options && vm.$options.name === 'FilePanel') { found = vm; return; }
      var c = vm.$children || [];
      for (var i = 0; i < c.length; i++) {
        walk(c[i].$el, depth + 1);
        if (found) return;
      }
    }
    var kids = el.children || [];
    for (var k = 0; k < kids.length; k++) {
      walk(kids[k], depth + 1);
      if (found) return;
    }
  }
  walk(document.querySelector('#app'), 0);

  if (!found) {
    // 退而求其次：找所有 __vue__ 里带 isSideBarOpen 的
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var v = all[i].__vue__;
      if (v && 'isSideBarOpen' in v) { found = v; break; }
    }
  }

  if (found) {
    r.fp = {
      name: found.$options ? found.$options.name : null,
      isMobile: found.isMobile,
      isSideBarOpen: found.isSideBarOpen,
      sideBarPosition: found.sideBarPosition,
      sizeType: found.sizeType,
      windowWidth: found.windowWidth,
      hasMergerFunction: found.hasMergerFunction,
      rootPath: found.rootPath
    };
  } else {
    r.fp = 'not found';
  }

  // 侧边栏 DOM
  var sb = document.querySelector('.sidebar, .b-sidebar, aside.sidebar');
  r.sidebarEl = sb ? { cls: sb.className, display: sb.style.display, rect: sb.getBoundingClientRect().toJSON() } : null;

  // 侧边栏按钮
  var btn = document.getElementById('sidebar-btn');
  r.sidebarBtn = btn ? { exists: true, rect: btn.getBoundingClientRect().toJSON() } : { exists: false };

  // 面包屑位置
  var bc = document.querySelector('.breadcrumb-container');
  r.breadcrumb = bc ? bc.getBoundingClientRect().toJSON() : null;

  return JSON.stringify(r, null, 1);
})()
