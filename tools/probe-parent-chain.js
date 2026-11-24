(function () {
  var el = document.querySelector('.modal.app-panel') || document.querySelector('.modal');
  if (!el) return 'no .modal found';
  var vm = el.__vue__;
  var chain = [];
  var cur = vm;
  var guard = 0;
  while (cur && guard < 12) {
    chain.push({
      name: cur.$options ? cur.$options.name : null,
      tag: cur.$options ? cur.$options._componentTag : null,
      hasClose: typeof cur.close === 'function',
      isActive: cur.isActive,
      active: cur.active,
      programmatic: cur.programmatic,
      destroyed: cur.destroyed
    });
    cur = cur.$parent;
    guard++;
  }
  return JSON.stringify({ chain: chain }, null, 1);
})()
