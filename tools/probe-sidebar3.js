(function () {
  var r = {};
  var sb = document.querySelector('.modal.file-panel .b-sidebar');
  var content = sb ? sb.querySelector('.sidebar-content') : null;

  if (content) {
    var cs = getComputedStyle(content);
    r.content = {
      cls: content.className,
      width: cs.width,
      maxWidth: cs.maxWidth,
      minWidth: cs.minWidth,
      transform: cs.transform,
      position: cs.position,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity
    };
    r.contentRect = content.getBoundingClientRect().toJSON();

    // 相关的 CSS 变量
    var names = ['--sidebar-width', '--sidebar-padding', '--sidebar-transition'];
    r.vars = {};
    for (var i = 0; i < names.length; i++) {
      r.vars[names[i]] = cs.getPropertyValue(names[i]).trim();
    }
    // 父级上的变量
    var p = content.parentElement;
    r.parentVars = {};
    while (p && p !== document.body) {
      var pcs = getComputedStyle(p);
      r.parentVars[p.className || p.tagName] = {
        width: pcs.width,
        maxWidth: pcs.maxWidth,
        '--sidebar-width': pcs.getPropertyValue('--sidebar-width').trim(),
        overflow: pcs.overflow,
        position: pcs.position
      };
      p = p.parentElement;
    }
  }

  r.sbCls = sb ? sb.className : null;
  r.sbRect = sb ? sb.getBoundingClientRect().toJSON() : null;
  r.sbComputed = sb ? (function () {
    var cs = getComputedStyle(sb);
    return {
      width: cs.width, height: cs.height, overflow: cs.overflow,
      display: cs.display, position: cs.position,
      '--sidebar-width': cs.getPropertyValue('--sidebar-width').trim()
    };
  })() : null;

  return JSON.stringify(r, null, 1);
})()
