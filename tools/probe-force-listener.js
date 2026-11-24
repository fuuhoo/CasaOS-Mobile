(function () {
  var r = {};
  var cap = window.Capacitor;

  // 记录 App 插件 addListener 的调用
  var calls = [];
  var app = cap && cap.Plugins ? cap.Plugins.App : null;
  if (app && typeof app.addListener === 'function') {
    var orig = app.addListener.bind(app);
    app.addListener = function (name, cb) {
      calls.push(name);
      return orig(name, cb);
    };
  }
  r.addListenerCalls = calls;

  // 手动加一个 backButton 监听器，强制原生侧 hasListeners 为 true
  if (app && typeof app.addListener === 'function') {
    app.addListener('backButton', function (data) {
      window.__appBackBtn = (window.__appBackBtn || 0) + 1;
      window.__appBackBtnData = data;
    });
    r.added = true;
  }

  r.before = window.__casaosBackLog ? window.__casaosBackLog.length : null;
  return JSON.stringify(r);
})()
