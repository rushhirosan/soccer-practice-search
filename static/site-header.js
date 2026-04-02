(function () {
  var STORAGE_KEY = 'soccer_selected_menus';
  var FAVORITES_KEY = 'soccer_favorite_videos';

  function syncMemoBadge() {
    var badge = document.getElementById('practice-notes-badge');
    if (!badge) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var items = raw ? JSON.parse(raw) : [];
      var count = Array.isArray(items) ? items.length : 0;
      badge.textContent = count > 0 ? String(count) : '';
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    } catch (e) {
      /* ignore */
    }
  }

  function syncFavoritesBadge() {
    var badge = document.getElementById('favorites-badge');
    if (!badge) return;
    try {
      var raw = localStorage.getItem(FAVORITES_KEY);
      var items = raw ? JSON.parse(raw) : [];
      var count = Array.isArray(items) ? items.length : 0;
      badge.textContent = count > 0 ? String(count) : '';
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    } catch (e) {
      /* ignore */
    }
  }

  /** 印字可能 ASCII のみ（全角・日本語・絵文字などは不可） */
  function asciiPasswordOnly(str) {
    return str.replace(/[^\x20-\x7E]/g, '');
  }

  function sanitizePasswordValue(input) {
    var old = input.value;
    var cleaned = asciiPasswordOnly(old);
    if (old === cleaned) return;
    var pos = input.selectionStart;
    if (pos == null || typeof pos !== 'number') {
      input.value = cleaned;
      return;
    }
    var before = old.slice(0, pos);
    var newPos = asciiPasswordOnly(before).length;
    input.value = cleaned;
    try {
      input.setSelectionRange(newPos, newPos);
    } catch (e) {
      /* ignore */
    }
  }

  var SVG_EYE = '<svg class="password-field__icon-masked" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
  var SVG_EYE_OFF = '<svg class="password-field__icon-plain" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>';

  function setupPasswordFields() {
    document.querySelectorAll('input[type="password"][data-password-enhanced]').forEach(function (input) {
      if (input.getAttribute('data-password-init') === '1') return;
      input.setAttribute('data-password-init', '1');

      if (!input.getAttribute('spellcheck')) input.setAttribute('spellcheck', 'false');
      if (!input.getAttribute('autocapitalize')) input.setAttribute('autocapitalize', 'off');
      if (!input.getAttribute('inputmode')) input.setAttribute('inputmode', 'latin');
      if (!input.getAttribute('lang')) input.setAttribute('lang', 'en');

      var wrap = document.createElement('div');
      wrap.className = 'password-field-wrap';
      input.classList.add('password-field__input');
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-field__toggle';
      btn.setAttribute('aria-label', 'パスワードを表示');
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = SVG_EYE + SVG_EYE_OFF;
      wrap.appendChild(btn);

      function syncToggleUi() {
        var visible = input.type === 'text';
        wrap.classList.toggle('is-visible', visible);
        btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
        btn.setAttribute('aria-label', visible ? 'パスワードを隠す' : 'パスワードを表示');
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        input.type = input.type === 'password' ? 'text' : 'password';
        syncToggleUi();
      });

      syncToggleUi();

      input.addEventListener('beforeinput', function (e) {
        if (!e.data) return;
        if (!/^[\x20-\x7E]*$/.test(e.data)) {
          e.preventDefault();
        }
      });

      input.addEventListener('input', function () {
        sanitizePasswordValue(input);
      });

      input.addEventListener('paste', function (e) {
        e.preventDefault();
        var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
        var cleaned = asciiPasswordOnly(text);
        var start = input.selectionStart || 0;
        var end = input.selectionEnd || 0;
        var val = input.value;
        input.value = val.slice(0, start) + cleaned + val.slice(end);
        sanitizePasswordValue(input);
        var pos = start + cleaned.length;
        try {
          input.setSelectionRange(pos, pos);
        } catch (err) {
          /* ignore */
        }
      });
    });
  }

  function setupMobileNav() {
    var btn = document.getElementById('site-header-menu-btn');
    var nav = document.getElementById('site-header-nav');
    if (!btn || !nav) return;

    function close() {
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('site-header-nav-open');
    }

    function toggle() {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      document.body.classList.toggle('site-header-nav-open', !open);
    }

    btn.addEventListener('click', function () {
      toggle();
    });

    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        if (window.matchMedia('(max-width: 768px)').matches) close();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncMemoBadge();
    syncFavoritesBadge();
    setupMobileNav();
    setupPasswordFields();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) syncMemoBadge();
    if (e.key === FAVORITES_KEY) syncFavoritesBadge();
  });
})();
