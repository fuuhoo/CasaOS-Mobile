(function () {
  var r = {};
  var cap = window.Capacitor;
  r.hasCapacitor = !!cap;
  r.hasPlugins = !!(cap && cap.Plugins);
  r.pluginNames = cap && cap.Plugins ? Object.keys(cap.Plugins) : null;
  r.hasApp = !!(cap && cap.Plugins && cap.Plugins.App);
  r.appHasAddListener = !!(cap && cap.Plugins && cap.Plugins.App &&
    typeof cap.Plugins.App.addListener === 'function');
  r.hasReady = !!(cap && cap.ready);
  r.readyType = cap && cap.ready ? typeof cap.ready.then : null;

  // 我们的 setupBackButton 到底注册成功没有？检查 App 插件的本地记账
  try {
    var app = cap && cap.Plugins && cap.Plugins.App;
    r.appKeys = app ? Object.keys(app) : null;
    if (app && app.listeners) {
      r.appListenerKeys = Object.keys(app.listeners);
    }
  } catch (e) {
    r.err = String(e);
  }

  // 手动注册一个，看原生侧会不会触发
  if (r.appHasAddListener) {
    window.__manualBack = 0;
    try {
      cap.Plugins.App.addListener('backButton', function (d) {
        window.__manualBack++;
        window.__manualBackData = d;
      });
      r.manualRegistered = true;
    } catch (e) {
      r.manualErr = String(e);
    }
  }
  return JSON.stringify(r, null, 1);
})()
