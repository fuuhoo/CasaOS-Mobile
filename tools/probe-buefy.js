(function () {
  var r = {};
  r.hasBuefyGlobal = typeof window.Buefy !== 'undefined';
  r.hasDollarBuefy = !!(window.$buefy);
  var app = document.querySelector('#app');
  r.hasAppEl = !!app;
  // 找到根 Vue 实例
  var vm = null;
  var candidates = document.querySelectorAll('body > *');
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].__vue__) { vm = candidates[i].__vue__; break; }
  }
  r.rootFound = !!vm;
  if (vm) {
    r.rootName = vm.$options ? vm.$options.name : null;
    r.hasDollarBuefyOnRoot = !!vm.$buefy;
    if (vm.$buefy) {
      r.buefyKeys = Object.keys(vm.$buefy);
      r.hasDialog = !!vm.$buefy.dialog;
      r.hasModal = !!vm.$buefy.modal;
      r.dialogHasConfirm = !!(vm.$buefy.dialog && vm.$buefy.dialog.confirm);
    }
  }
  return JSON.stringify(r, null, 1);
})()
