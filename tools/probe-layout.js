(function () {
  var r = {};
  r.innerWidth = window.innerWidth;
  r.innerHeight = window.innerHeight;
  r.devicePixelRatio = window.devicePixelRatio;
  r.screen = { w: screen.width, h: screen.height };

  function box(sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return {
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      position: cs.position,
      overflow: cs.overflow,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      height: cs.height,
      zIndex: cs.zIndex,
      display: cs.display
    };
  }

  r.topBar = box('#app .top-bar');
  r.contents = box('#app .contents');
  r.baseBar = box('#app .base-bar');
  r.sideBar = box('#app .side-bar');
  r.app = box('#app');
  r.body = box('body');

  // 找出所有溢出视口右边/下边的元素
  var overflowing = [];
  var all = document.querySelectorAll('#app *');
  for (var i = 0; i < all.length && i < 4000; i++) {
    var el = all[i];
    var b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    if (b.right > window.innerWidth + 1 || b.bottom > window.innerHeight + 1) {
      var cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : (el.className || '');
      if (typeof cls !== 'string') cls = '';
      overflowing.push({
        tag: el.tagName,
        cls: cls.slice(0, 70),
        right: Math.round(b.right),
        bottom: Math.round(b.bottom),
        vw: window.innerWidth,
        vh: window.innerHeight
      });
    }
  }
  r.overflowing = overflowing.slice(0, 12);
  r.overflowingCount = overflowing.length;

  // 底部元素是否互相重叠（footer 与 logo）
  var footer = document.querySelector('#app .base-bar');
  if (footer) {
    var kids = [];
    var ch = footer.children;
    for (var k = 0; k < ch.length; k++) {
      var b2 = ch[k].getBoundingClientRect();
      kids.push({
        tag: ch[k].tagName,
        cls: String(ch[k].className || '').slice(0, 60),
        x: Math.round(b2.x), y: Math.round(b2.y), w: Math.round(b2.width), h: Math.round(b2.height)
      });
    }
    r.baseBarChildren = kids;
  }

  return JSON.stringify(r, null, 1);
})()
