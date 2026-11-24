(function () {
  var r = {};
  var all = document.querySelectorAll('*');
  var fpVm = null;
  for (var i = 0; i < all.length; i++) {
    var v = all[i].__vue__;
    if (v && 'isSideBarOpen' in v) { fpVm = v; break; }
  }
  if (!fpVm) return 'no fpVm';

  // 强制关闭
  fpVm.isSideBarOpen = false;
  r.forcedClose = true;

  return new Promise(function (resolve) {
    setTimeout(function () {
      r.stateAfterClose = fpVm.isSideBarOpen;
      var c = document.querySelector('.modal.file-panel .sidebar-content');
      r.widthAfterClose = c ? Math.round(c.getBoundingClientRect().width) : null;

      // 真实派发鼠标事件序列（模拟手指点击）
      var btn = document.getElementById('file-sidebar-btn');
      var rect = btn.getBoundingClientRect();
      var opts = {
        bubbles: true, cancelable: true, view: window,
        clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2
      };
      btn.dispatchEvent(new MouseEvent('mousedown', opts));
      btn.dispatchEvent(new MouseEvent('mouseup', opts));
      btn.dispatchEvent(new MouseEvent('click', opts));

      setTimeout(function () {
        r.stateAfterClick = fpVm.isSideBarOpen;
        var c2 = document.querySelector('.modal.file-panel .sidebar-content');
        r.widthAfterClick = c2 ? Math.round(c2.getBoundingClientRect().width) : null;
        resolve(JSON.stringify(r, null, 1));
      }, 600);
    }, 600);
  });
})()
