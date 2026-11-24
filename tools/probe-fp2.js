(function () {
  var r = {};

  // 找文件管理器的 modal（custom-class="file-panel"）
  var fp = document.querySelector('.modal.file-panel');
  r.fpModal = !!fp;
  if (!fp) {
    var all = document.querySelectorAll('.modal');
    r.modals = [];
    for (var i = 0; i < all.length; i++) {
      r.modals.push({ cls: all[i].className, display: all[i].style.display || '(shown)' });
    }
    return JSON.stringify(r, null, 1);
  }

  r.fpDisplay = fp.style.display || '(shown)';
  r.fpRect = fp.getBoundingClientRect().toJSON();

  // modal 内的所有 sidebar-btn
  var btns = fp.querySelectorAll('#sidebar-btn, [id*=sidebar], [class*=sidebar-button]');
  r.buttons = [];
  for (var i = 0; i < btns.length; i++) {
    var el = btns[i];
    var b = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    r.buttons.push({
      tag: el.tagName,
      id: el.id,
      cls: String(el.className || '').slice(0, 60),
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      html: el.outerHTML.slice(0, 300)
    });
  }

  // modal 内的 header
  var header = fp.querySelector('header.modal-card-head');
  r.header = header ? {
    rect: header.getBoundingClientRect().toJSON(),
    html: header.outerHTML.slice(0, 900)
  } : null;

  // modal 内的 b-sidebar
  var sb = fp.querySelector('.b-sidebar');
  r.sidebar = sb ? {
    cls: sb.className,
    rect: sb.getBoundingClientRect().toJSON(),
    display: getComputedStyle(sb).display,
    visibility: getComputedStyle(sb).visibility
  } : null;

  return JSON.stringify(r, null, 1);
})()
