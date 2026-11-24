(function () {
  var r = {};
  function info(el, label) {
    if (!el) return null;
    var cs = getComputedStyle(el);
    var b = el.getBoundingClientRect();
    return {
      label: label,
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ''),
      rect: { w: Math.round(b.width), h: Math.round(b.height) },
      transform: cs.transform,
      animation: cs.animation,
      animationName: cs.animationName,
      opacity: cs.opacity,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      lineHeight: cs.lineHeight,
      display: cs.display
    };
  }

  var closeBtn = document.querySelector('.close-button');
  r.closeBtn = info(closeBtn, '.close-button');
  r.closeIcon = info(closeBtn && closeBtn.children[0], 'icon i');
  r.closeContainer = info(closeBtn && closeBtn.parentElement, '.modal-close-container');

  // ::before 的 content 与字体
  if (closeBtn && closeBtn.children[0]) {
    var i = closeBtn.children[0];
    var before = getComputedStyle(i, '::before');
    r.before = {
      content: before.content,
      fontFamily: before.fontFamily,
      fontSize: before.fontSize,
      display: before.display
    };
    var after = getComputedStyle(i, '::after');
    r.after = { content: after.content, fontFamily: after.fontFamily };
  }

  // 字体是否加载成功
  r.fontsLoaded = document.fonts ? document.fonts.status : 'n/a';
  var loaded = [];
  if (document.fonts) {
    document.fonts.forEach(function (f) { loaded.push(f.family + ':' + f.status); });
  }
  r.fontList = loaded.slice(0, 20);

  // 页面上所有 casa 图标的整体尺寸统计
  var icons = document.querySelectorAll('i.casa');
  var zero = 0, nonzero = 0;
  for (var i = 0; i < icons.length; i++) {
    var b = icons[i].getBoundingClientRect();
    if (b.width < 1 || b.height < 1) zero++; else nonzero++;
  }
  r.icons = { total: icons.length, zeroSize: zero, normalSize: nonzero };

  // 动画名称相关样式表里搜 picon / casa icon 的动画
  var animRules = [];
  for (var si = 0; si < document.styleSheets.length; si++) {
    var sheet = document.styleSheets[si];
    var rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (var ri = 0; ri < rules.length; ri++) {
      var rule = rules[ri];
      if (rule.type === 7 && rule.style && rule.style.animation) {
        animRules.push(rule.selectorText + ' => ' + rule.style.animation);
      }
    }
  }
  r.animRules = animRules.slice(0, 15);

  return JSON.stringify(r, null, 1);
})()
