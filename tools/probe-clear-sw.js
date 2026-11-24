(async function () {
  var r = {};

  // 1) 列出并注销所有 Service Worker
  var regs = await navigator.serviceWorker.getRegistrations();
  r.registrations = regs.length;
  for (var i = 0; i < regs.length; i++) {
    try {
      await regs[i].unregister();
    } catch (e) {
      r.unregErr = String(e);
    }
  }
  r.afterUnregister = (await navigator.serviceWorker.getRegistrations()).length;

  // 2) 删掉所有 Cache
  var keys = await caches.keys();
  r.cacheKeys = keys;
  for (var j = 0; j < keys.length; j++) {
    await caches.delete(keys[j]);
  }
  r.cacheKeysAfter = await caches.keys();

  return JSON.stringify(r, null, 1);
})()
