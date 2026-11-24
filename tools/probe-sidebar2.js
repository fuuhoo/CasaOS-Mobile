(function () {
  var r = {};
  var root = document.querySelector('#app');
  var bus = root.__vue__.$EventBus;

  var fpVm = null;
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var v = all[i].__vue__;
    if (v && 'isSideBarOpen' in v) { fpVm = v; break; }
  }

  r.before = fpVm ? fpVm.isSideBarOpen : null;

  // 触发事件
  bus.$emit('showFilesSidebar');
  r.emitted = true;

  // 同步检查 + 下一帧再检查
  r.afterSync = fpVm ? fpVm.isSideBarOpen : null;

  return new Promise(function (resolve) {
    setTimeout(function () {
      var sb = document.querySelector('.modal.file-panel .b-sidebar');
      r.afterTick = fpVm ? fpVm.isSideBarOpen : null;
      r.sidebarRect = sb ? sb.getBoundingClientRect().toJSON() : null;
      r.sidebarCls = sb ? sb.className : null;
      resolve(JSON.stringify(r, null, 1));
    }, 600);
  });
})()
