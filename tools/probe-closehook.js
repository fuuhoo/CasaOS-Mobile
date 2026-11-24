(function () {
  window.__closeLog = [];
  window.__modalSnap = [];

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
    var el = all[i];
    var vm = findModal(el);
    if (!vm) continue;
    var orig = vm.close;
    var name = vm.$options && vm.$options.name ? vm.$options.name : '?';
    vm.close = (function (o, n) {
      return function () {
        window.__closeLog.push('close() on ' + n + ' @' + Date.now());
        try {
          return o.apply(this, arguments);
        } catch (e) {
          window.__closeLog.push('close ERR ' + String(e));
        }
      };
    })(orig, name);
  }

  window.__snapshot = function () {
    var ms = document.querySelectorAll('.modal');
    var out = [];
    for (var i = 0; i < ms.length; i++) {
      out.push(ms[i].className.split(' ')[0] + '/' + (ms[i].style.display || 'shown'));
    }
    return out.join(', ');
  };

  window.__modalSnap.push('before: ' + window.__snapshot());
  return 'hooked ' + all.length + ' modals';
})()
