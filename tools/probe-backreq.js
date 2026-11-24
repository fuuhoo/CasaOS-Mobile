(function () {
  var r = {};
  var all = document.querySelectorAll('*');
  var fpVm = null;
  for (var i = 0; i < all.length; i++) {
    var v = all[i].__vue__;
    if (v && 'isSideBarOpen' in v) { fpVm = v; break; }
  }
  if (!fpVm) return 'no fpVm';

  r.currentPath = fpVm.$store.state.currentPath;
  r.parentPath = fpVm.parentPath ? fpVm.parentPath() : 'n/a';
  r.hasListeners = !!fpVm.$listeners;
  r.listenerKeys = fpVm.$listeners ? Object.keys(fpVm.$listeners) : [];
  r.isModalOpen = fpVm.isModalOpen;
  r.isShowDetial = fpVm.isShowDetial;
  r.isPanelVisible = fpVm.isPanelVisible ? fpVm.isPanelVisible() : 'n/a';

  // 直接调用 handleBackRequest
  var replyValue = null;
  fpVm.handleBackRequest(function (ok) { replyValue = ok; });
  r.reply = replyValue;

  return new Promise(function (resolve) {
    setTimeout(function () {
      var ms = document.querySelectorAll('.modal');
      var list = [];
      for (var i = 0; i < ms.length; i++) {
        list.push(ms[i].className + ' | disp=' + (ms[i].style.display || 'shown'));
      }
      r.modalsAfter = list;
      resolve(JSON.stringify(r, null, 1));
    }, 800);
  });
})()
