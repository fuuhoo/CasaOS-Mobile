(function () {
  window.__tr = [];
  var t0 = Date.now();
  function snap(tag) {
    var ms = document.querySelectorAll('.modal');
    var list = [];
    for (var i = 0; i < ms.length; i++) {
      list.push(ms[i].className.replace('modal ', '').replace(' is-active', '') +
        '[' + (ms[i].style.display || 'shown') + ']');
    }
    // 文件管理器的可见性判断
    var fpVis = 'n/a';
    var fp = null;
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var v = all[i].__vue__;
      if (v && 'isSideBarOpen' in v) { fp = v; break; }
    }
    if (fp) {
      fpVis = 'store=' + fp.$store.state.fileBrowserOpen +
        ',isPanelVisible=' + fp.isPanelVisible() +
        ',path=' + fp.$store.state.currentPath;
    }
    window.__tr.push({ t: Date.now() - t0, tag: tag, modals: list.join(' '), fp: fpVis });
  }

  // patch close
  function findModal(el) {
    var vm = el.__vue__;
    for (var d = 0; vm && d < 12; d++) {
      if (typeof vm.close === 'function' && vm.isActive !== undefined) return vm;
      vm = vm.$parent;
    }
    return null;
  }
  function patchCloses() {
    var all = document.querySelectorAll('.modal');
    for (var i = 0; i < all.length; i++) {
      var vm = findModal(all[i]);
      if (!vm || vm.__patchedClose) continue;
      vm.__patchedClose = true;
      var orig = vm.close;
      var n = vm.$options && vm.$options.name ? vm.$options.name : '?';
      vm.close = (function (o, nm) {
        return function () {
          window.__tr.push({ t: Date.now() - t0, tag: 'CLOSE:' + nm });
          return o.apply(this, arguments);
        };
      })(orig, n);
    }
  }
  patchCloses();

  window.addEventListener('hashchange', function () {
    window.__tr.push({ t: Date.now() - t0, tag: 'HASHCHANGE:' + location.hash });
  });

  var iv = setInterval(function () { patchCloses(); snap('tick'); }, 150);
  setTimeout(function () { clearInterval(iv); snap('end'); }, 9000);

  snap('start');
  return 'tracing 9s';
})()
