(async function () {
  var r = {};
  r.plugins = Object.keys(window.Capacitor.Plugins || {});
  r.hasSystemInsets = !!(window.Capacitor.Plugins && window.Capacitor.Plugins.SystemInsets);
  r.isNative = window.Capacitor.isNativePlatform();
  try {
    var res = await window.Capacitor.Plugins.SystemInsets.get();
    r.getResult = res;
  } catch (e) {
    r.getError = String(e);
  }
  var root = getComputedStyle(document.documentElement);
  r.vars = {
    top: root.getPropertyValue('--sa-top').trim(),
    bottom: root.getPropertyValue('--sa-bottom').trim(),
    left: root.getPropertyValue('--sa-left').trim(),
    right: root.getPropertyValue('--sa-right').trim()
  };
  r.inlineStyle = document.documentElement.getAttribute('style');
  r.innerW = window.innerWidth;
  r.innerH = window.innerHeight;
  return JSON.stringify(r, null, 1);
})()
