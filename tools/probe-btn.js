(function () {
  var r = {};
  var btn = document.getElementById('sidebar-btn');
  if (!btn) return 'no #sidebar-btn';

  function desc(el, label) {
    if (!el) return null;
    var cs = getComputedStyle(el);
    var b = el.getBoundingClientRect();
    return {
      label: label,
      tag: el.tagName,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''),
      rect: { w: Math.round(b.width), h: Math.round(b.height) },
      display: cs.display,
      visibility: cs.visibility,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      minWidth: cs.minWidth,
      overflow: cs.overflow,
      flex: cs.flex,
      flexBasis: cs.flexBasis,
      fontSize: cs.fontSize
    };
  }

  r.btn = desc(btn, '#sidebar-btn');
  r.parent = desc(btn.parentElement, 'parent (.breadcrumb-container)');
  r.parentParent = desc(btn.parentElement && btn.parentElement.parentElement, 'grandparent (header)');
  r.children = [];
  var ch = btn.children;
  for (var i = 0; i < ch.length; i++) {
    r.children.push(desc(ch[i], 'child ' + i));
    var gc = ch[i].children;
    for (var k = 0; k < gc.length; k++) {
      r.children.push(desc(gc[k], 'grandchild ' + i + '.' + k));
    }
  }

  // 顶栏里的其它图标做对照（面包屑第二行）
  var bc = document.querySelector('.breadcrumb-container .breadcrumb, .bread-crumb, [class*=breadcrumb]');
  r.breadcrumbSibling = desc(bc, 'breadcrumb element');

  // 对照：顶栏右侧的关闭按钮（有图标）
  var closeBtn = document.querySelector('.close-button');
  r.closeBtn = desc(closeBtn, '.close-button');
  if (closeBtn && closeBtn.children.length) {
    r.closeBtnChild = desc(closeBtn.children[0], 'close icon');
    if (closeBtn.children[0].children.length) {
      r.closeBtnIcon = desc(closeBtn.children[0].children[0], 'close svg');
    }
  }

  return JSON.stringify(r, null, 1);
})()
