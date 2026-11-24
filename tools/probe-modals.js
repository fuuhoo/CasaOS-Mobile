(function () {
  var out = [];
  var ms = document.querySelectorAll('.modal');
  for (var i = 0; i < ms.length; i++) {
    var el = ms[i];
    var vm = el.__vue__;
    out.push({
      idx: i,
      cls: el.className,
      display: el.style.display,
      parentTag: el.parentElement ? el.parentElement.tagName : null,
      parentId: el.parentElement ? el.parentElement.id : null,
      hasVue: !!vm,
      vmName: vm && vm.$options ? vm.$options.name : null,
      isActive: vm ? vm.isActive : null,
      activeProp: vm ? vm.active : null,
      closeType: vm ? typeof vm.close : null,
      destroyed: vm ? vm.destroyed : null,
      programmatic: vm ? vm.programmatic : null
    });
  }
  return JSON.stringify({
    modalCount: ms.length,
    modalClasses: Array.prototype.map.call(ms, function (m) { return m.className; }),
    modals: out
  }, null, 1);
})()
