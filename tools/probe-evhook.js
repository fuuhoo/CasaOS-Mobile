(function () {
  // 记录所有派发到 document 的事件
  window.__evLog = [];

  if (!window.__patched) {
    window.__patched = true;
    var origDispatch = document.dispatchEvent.bind(document);
    document.dispatchEvent = function (ev) {
      try {
        window.__evLog.push({ type: ev.type, t: Date.now(), cancelable: ev.cancelable });
      } catch (e) {}
      return origDispatch(ev);
    };

    // 同时记录 window 上的
    var origWinDispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = function (ev) {
      try {
        window.__evLog.push({ type: 'win:' + ev.type, t: Date.now() });
      } catch (e) {}
      return origWinDispatch(ev);
    };
  }

  // 记录 App 插件的 backButton 监听器
  window.__appPluginLog = [];
  try {
    var app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (app && app.addListener) {
      var origAdd = app.addListener.bind(app);
      app.addListener = function (name, cb) {
        window.__appPluginLog.push('addListener:' + name + ' @' + Date.now());
        if (name === 'backButton') {
          return origAdd(name, function (data) {
            window.__appPluginLog.push('backButton FIRED @' + Date.now() + ' data=' + JSON.stringify(data));
            try { cb(data); } catch (e) {}
          });
        }
        return origAdd(name, cb);
      };
      window.__appPluginLog.push('patched App.addListener');
    }
  } catch (e) {
    window.__appPluginLog.push('patch failed: ' + String(e));
  }

  return 'patched';
})()
