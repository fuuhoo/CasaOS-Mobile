(function () {
  var r = {};

  // 记录 backbutton 监听器被调用时，各个 modal 的状态
  var probe = document.createElement('div');
  probe.id = 'back-probe';

  // 在事件派发前快照
  var before = [];
  var ms = document.querySelectorAll('.modal');
  for (var i = 0; i < ms.length; i++) {
    var el = ms[i];
    var vm = el.__vue__;
    // 复刻 findModalInstance
    var found = null;
    var cur = vm;
    for (var d = 0; cur && d < 12; d++) {
      if (typeof cur.close === 'function' && cur.isActive !== undefined) { found = cur; break; }
      cur = cur.$parent;
    }
    before.push({
      cls: el.className,
      disp: el.style.display || 'shown',
      hasVm: !!vm,
      vmName: vm && vm.$options ? vm.$options.name : null,
      foundModal: !!found,
      opened: found ? found.isActive : null
    });
  }
  r.before = before;

  // 派发 backbutton
  var ev = new Event('backbutton', { cancelable: true, bubbles: true });
  document.dispatchEvent(ev);
  r.defaultPrevented = ev.defaultPrevented;

  return new Promise(function (resolve) {
    setTimeout(function () {
      var after = [];
      var ms2 = document.querySelectorAll('.modal');
      for (var i = 0; i < ms2.length; i++) {
        var el = ms2[i];
        after.push({ cls: el.className, disp: el.style.display || 'shown' });
      }
      r.after = after;
      resolve(JSON.stringify(r, null, 1));
    }, 900);
  });
})()
