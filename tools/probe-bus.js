(function () {
  window.__log = [];
  var root = document.querySelector('#app');
  var bus = root.__vue__.$EventBus;

  if (!bus.__hooked) {
    bus.__hooked = true;
    var origEmit = bus.$emit.bind(bus);
    bus.$emit = function (name, cb) {
      if (name === 'fileBack') {
        window.__log.push({ ev: 'emit:fileBack' });
        var origCb = cb;
        var wrapped = function (ok) {
          window.__log.push({ ev: 'fileBack reply', ok: ok });
          return origCb(ok);
        };
        return origEmit(name, wrapped);
      }
      return origEmit(name, cb);
    };
  }

  // 同时 hook 每个 modal 的 close，看有没有被调用
  function findModal(el) {
    var vm = el.__vue__;
    for (var d = 0; vm && d < 12; d++) {
      if (typeof vm.close === 'function' && vm.isActive !== undefined) return vm;
      vm = vm.$parent;
    }
    return null;
  }
  var all = document.querySelectorAll('.modal');
  for (var i = 0; i < all.length; i++) {
    var vm = findModal(all[i]);
    if (!vm || vm.__hookedClose) continue;
    vm.__hookedClose = true;
    var orig = vm.close;
    var n = vm.$options && vm.$options.name ? vm.$options.name : '?';
    vm.close = (function (o, nm) {
      return function () {
        window.__log.push({ ev: 'close:' + nm });
        return o.apply(this, arguments);
      };
    })(orig, n);
  }

  // 记录文件管理器的可见性判断
  var fp = null;
  var all2 = document.querySelectorAll('*');
  for (var j = 0; j < all2.length; j++) {
    var v = all2[j].__vue__;
    if (v && 'isSideBarOpen' in v) { fp = v; break; }
  }
  if (fp) {
    window.__fp = fp;
    window.__log.push({
      ev: 'fpState',
      storeOpen: fp.$store.state.fileBrowserOpen,
      isPanelVisible: fp.isPanelVisible(),
      path: fp.$store.state.currentPath
    });
  }

  return 'hooked eventbus + close';
})()
