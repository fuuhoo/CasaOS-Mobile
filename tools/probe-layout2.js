(function () {
  var r = {};
  var dpr = window.devicePixelRatio;
  r.dpr = dpr;

  function rect(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }

  var brand = document.querySelector('#app .base-bar .brand-bar');
  r.brandBar = rect(brand);
  if (brand) {
    r.brandChildren = [];
    var ch = brand.children;
    for (var i = 0; i < ch.length; i++) {
      var cs = getComputedStyle(ch[i]);
      r.brandChildren.push({
        tag: ch[i].tagName,
        cls: String(ch[i].className || '').slice(0, 50),
        rect: rect(ch[i]),
        position: cs.position,
        float: cs.float,
        overflow: cs.overflow
      });
    }
    r.brandHTML = brand.innerHTML.replace(/\s+/g, ' ').slice(0, 400);
  }

  // 顶栏
  var top = document.querySelector('#app .top-bar');
  r.topBar = rect(top);
  r.topBarExists = !!top;
  if (top) {
    var cs = getComputedStyle(top);
    r.topBarStyle = { position: cs.position, display: cs.display, height: cs.height, paddingTop: cs.paddingTop, zIndex: cs.zIndex };
  }

  // contents
  var cont = document.querySelector('#app .contents');
  r.contents = rect(cont);
  if (cont) {
    var cs2 = getComputedStyle(cont);
    r.contentsStyle = { position: cs2.position, height: cs2.height, paddingTop: cs2.paddingTop, paddingBottom: cs2.paddingBottom, overflow: cs2.overflow };
  }

  // 安全区变量读数
  var rootStyle = getComputedStyle(document.documentElement);
  r.safeAreaVars = {
    top: rootStyle.getPropertyValue('--sa-top').trim(),
    bottom: rootStyle.getPropertyValue('--sa-bottom').trim(),
    left: rootStyle.getPropertyValue('--sa-left').trim(),
    right: rootStyle.getPropertyValue('--sa-right').trim()
  };

  // body / html 尺寸与滚动
  r.html = { clientW: document.documentElement.clientWidth, clientH: document.documentElement.clientHeight,
             scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth };
  r.body = { clientW: document.body.clientWidth, clientH: document.body.clientHeight,
             scrollH: document.body.scrollHeight };

  return JSON.stringify(r, null, 1);
})()
