(function () {
  window.__log = [];

  if (!window.__hooked2) {
    window.__hooked2 = true;
    var orig = document.dispatchEvent.bind(document);
    document.dispatchEvent = function (ev) {
      var entry = { type: ev.type, cancelable: ev.cancelable, at: Date.now() };
      window.__log.push(entry);
      try {
        var r = orig(ev);
        // dispatchEvent 是同步的，返回时 handler 已执行完
        var appPanel = document.querySelector('.modal.app-panel');
        var filePanel = document.querySelector('.modal.file-panel');
        entry.after = {
          appPanel: appPanel ? (appPanel.style.display || 'shown') : 'none-exists',
          filePanel: filePanel ? (filePanel.style.display || 'shown') : 'none-exists',
          modalCount: document.querySelectorAll('.modal').length
        };
        return r;
      } catch (e) {
        entry.err = String(e);
        throw e;
      }
    };
  }

  // 顺便记录未捕获错误
  window.addEventListener('error', function (e) {
    window.__log.push({ error: e.message, at: Date.now() });
  });

  return 'hooked';
})()
