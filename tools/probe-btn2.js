(function () {
  var btn = document.getElementById('sidebar-btn');
  if (!btn) return 'no #sidebar-btn';
  var html = btn.outerHTML;
  if (html.length > 1200) html = html.slice(0, 1200) + ' ...[truncated]';

  var r = { outerHTML: html };

  // 逐层量尺寸
  var chain = [];
  var el = btn;
  for (var i = 0; i < 8 && el; i++) {
    var cs = getComputedStyle(el);
    var b = el.getBoundingClientRect();
    chain.push({
      i: i,
      tag: el.tagName,
      id: el.id,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''),
      rectW: Math.round(b.width * 100) / 100,
      rectH: Math.round(b.height * 100) / 100,
      cssW: cs.width,
      cssH: cs.height,
      display: cs.display,
      position: cs.position,
      zoom: cs.zoom,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      flexBasis: cs.flexBasis,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      overflow: cs.overflow,
      contain: cs.contain,
      contentVisibility: cs.contentVisibility
    });
    el = el.parentElement;
  }
  r.chain = chain;

  // 同一个 header 里所有直接子元素的尺寸
  var header = btn.closest('header');
  if (header) {
    r.headerKids = [];
    var kids = header.children;
    for (var k = 0; k < kids.length; k++) {
      var kb = kids[k].getBoundingClientRect();
      var kcs = getComputedStyle(kids[k]);
      r.headerKids.push({
        tag: kids[k].tagName,
        cls: String(kids[k].className || '').slice(0, 60),
        w: Math.round(kb.width),
        h: Math.round(kb.height),
        display: kcs.display
      });
    }
  }
  return JSON.stringify(r, null, 1);
})()
