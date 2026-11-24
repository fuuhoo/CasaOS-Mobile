(function () {
  window.__log = [];

  function findModal(el) {
    var vm = el.__vue__;
    for (var d = 0; vm && d < 12; d++) {
      if (typeof vm.close === 'function' && vm.isActive !== undefined) return vm;
      vm = vm.$parent;
    }
    return null;
  }

  function inspect(tag) {
    var ms = document.querySelectorAll('.modal');
    var out = [];
    for (var i = 0; i < ms.length; i++) {
      var el = ms[i];
      var vm = findModal(el);
      out.push({
        cls: el.className.replace('modal ', '').replace(' is-active', ''),
        disp: el.style.display || 'shown',
        hasVue: !!el.__vue__,
        vueName: el.__vue__ && el.__vue__.$options ? el.__vue__.$options.name : null,
        found: !!vm,
        foundName: vm && vm.$options ? vm.$options.name : null,
        isActive: vm ? vm.isActive : null
      });
    }
    return { tag: tag, modals: out };
  }

  if (!window.__hooked4) {
    window.__hooked4 = true;
    var orig = document.dispatchEvent.bind(document);
    document.dispatchEvent = function (ev) {
      window.__log.push(inspect('BEFORE-' + ev.type));
      var r = orig(ev);
      window.__log.push(inspect('AFTER-' + ev.type));
      return r;
    };
  }

  return 'hooked with inspection';
})()
