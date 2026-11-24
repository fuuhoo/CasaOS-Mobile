(function () {
  window.__trace = [];
  var t0 = Date.now();

  function snap(tag) {
    var ms = document.querySelectorAll('.modal');
    var list = [];
    for (var i = 0; i < ms.length; i++) {
      list.push(ms[i].className.replace('modal ', '').replace(' is-active', '') +
        '[' + (ms[i].style.display || 'shown') + ']');
    }
    window.__trace.push({ t: Date.now() - t0, tag: tag, modals: list.join(' ') });
  }

  // 给 close 打补丁
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
    if (!vm) continue;
    var orig = vm.close;
    var n = vm.$options && vm.$options.name ? vm.$options.name : '?';
    vm.close = (function (o, nm) {
      return function () {
        window.__trace.push({ t: Date.now() - t0, tag: 'CLOSE:' + nm });
        return o.apply(this, arguments);
      };
    })(orig, n);
  }

  // 监听 hash 变化（goBack 会触发）
  window.addEventListener('hashchange', function () {
    window.__trace.push({ t: Date.now() - t0, tag: 'HASHCHANGE:' + location.hash });
  });

  // 持续采样
  var iv = setInterval(function () { snap('tick'); }, 120);
  setTimeout(function () { clearInterval(iv); snap('end'); }, 5000);

  snap('start');
  return 'tracing 5s';
})()
