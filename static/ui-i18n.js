(function () {
  'use strict';
  window.uiS = function (key) {
    var o = window.__UI_STRINGS__;
    if (!o) return key;
    var v = o[key];
    return v !== undefined && v !== null && v !== '' ? v : key;
  };
})();
