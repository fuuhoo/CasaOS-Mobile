(function () {
  var r = {};

  // 1) document 上到底有没有我们的监听器？
  r.hasDocListener = false;
  var origAdd = document.addEventListener.bind(document);
  // 没法枚举已注册的监听器，改用事件探针
  var probeHit = 0;
  var probe = function () { probeHit++; };
  origAdd('backbutton', probe);

  // 2) 手动触发 Capacitor 的事件派发
  try {
    window.Capacitor.triggerEvent('backbutton', 'document');
    r.triggerEventOk = true;
  } catch (e) {
    r.triggerEventErr = String(e);
  }
  r.probeHit = probeHit;

  // 3) 直接 dispatchEvent 对比
  var probe2 = 0;
  var probe2fn = function () { probe2++; };
  origAdd('backbutton', probe2fn);
  try {
    document.dispatchEvent(new Event('backbutton'));
  } catch (e) {}
  r.probe2Hit = probe2;

  // 4) createEvent('Events') 是否可用
  try {
    var ev = document.createEvent('Events');
    ev.initEvent('backbutton', false, false);
    r.createEventOk = !!ev;
    r.eventType = ev.type;
  } catch (e) {
    r.createEventErr = String(e);
  }

  // 5) cordova 状态
  r.hasCordova = !!window.cordova;
  r.hasFireDocumentEvent = !!(window.cordova && window.cordova.fireDocumentEvent);
  r.triggerEventFn = typeof (window.Capacitor && window.Capacitor.triggerEvent);

  return JSON.stringify(r, null, 1);
})()
