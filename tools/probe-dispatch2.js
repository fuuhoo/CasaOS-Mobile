(function () {
  window.__log = [];

  function snapshot() {
    var ms = document.querySelectorAll('.modal');
    var r = [];
    for (var i = 0; i < ms.length; i++) {
      r.push(ms[i].className.replace('modal ', '').replace(' is-active', '') +
        '[' + (ms[i].style.display || 'shown') + ']');
    }
    return r.join(' | ');
  }

  if (!window.__hooked3) {
    window.__hooked3 = true;

    var origDoc = document.dispatchEvent.bind(document);
    document.dispatchEvent = function (ev) {
      var e = { via: 'document', type: ev.type, cancelable: ev.cancelable, at: Date.now() };
      window.__log.push(e);
      var r = origDoc(ev);
      e.after = snapshot();
      return r;
    };

    var origWin = window.dispatchEvent.bind(window);
    window.dispatchEvent = function (ev) {
      var e = { via: 'window', type: ev.type, cancelable: ev.cancelable, at: Date.now() };
      window.__log.push(e);
      var r = origWin(ev);
      e.after = snapshot();
      return r;
    };
  }

  // 记录 App 插件的 backButton 监听器是否还在
  try {
    var app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (app && app.listeners) {
      window.__appListeners = Object.keys(app.listeners);
    }
  } catch (e) {}

  window.__snap = snapshot;
  return 'hooked both';
})()
