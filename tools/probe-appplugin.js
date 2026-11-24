(function () {
  var r = {};
  var cap = window.Capacitor;
  r.hasCapacitor = !!cap;
  r.hasPlugins = !!(cap && cap.Plugins);
  r.pluginNames = cap && cap.Plugins ? Object.keys(cap.Plugins) : null;
  r.hasTriggerEvent = !!(cap && typeof cap.triggerEvent === 'function');

  var app = cap && cap.Plugins ? cap.Plugins.App : null;
  r.hasAppPlugin = !!app;
  if (app) {
    try {
      r.listenerKeys = app.listeners ? Object.keys(app.listeners) : null;
      r.listenerCount = app.listeners ? app.listeners.length : null;
      r.hasAddListener = typeof app.addListener === 'function';
    } catch (e) {
      r.listenersErr = String(e);
    }
  }

  // 我们自己注册�� document backbutton 监听器了吗？
  // 无法直接枚举，但可以检查 Capacitor 的 dummy 监听器是否产生了副作用：
  // Capacitor 会在注册时给 App 插件加 'backButton' 监听器。
  // 这里通过再注册一次同名事件，观察 listeners 数量变化来推断。
  var before = app && app.listeners ? app.listeners.length : -1;
  r.before = before;

  // 检查 Cordova 兼容层
  r.hasCordova = !!window.cordova;
  r.hasFireDocumentEvent = !!(window.cordova && window.cordova.fireDocumentEvent);

  return JSON.stringify(r, null, 1);
})()
