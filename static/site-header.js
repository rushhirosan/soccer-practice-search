(function () {
  var FAVORITES_KEY = 'soccer_favorite_videos';
  var PENDING_FAV = 'soccer_nav_fav_badge_pending';

  function isNavigationReload() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && nav.type === 'reload') return true;
    } catch (e) { /* ignore */ }
    try {
      if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
        return true;
      }
    } catch (e2) { /* ignore */ }
    return false;
  }

  function applyNavBadgeSessionContext() {
    try {
      if (isNavigationReload()) {
        sessionStorage.removeItem(PENDING_FAV);
        return;
      }
      var p = window.location.pathname || '';
      if (p === '/favorites' || /\/favorites\/?$/.test(p)) sessionStorage.removeItem(PENDING_FAV);
    } catch (e) { /* ignore */ }
  }

  function syncFavoritesBadge() {
    applyNavBadgeSessionContext();
    var badge = document.getElementById('favorites-badge');
    if (!badge) return;
    try {
      var raw = localStorage.getItem(FAVORITES_KEY);
      var items = raw ? JSON.parse(raw) : [];
      var count = Array.isArray(items) ? items.length : 0;
      var show = count > 0 && sessionStorage.getItem(PENDING_FAV) === '1';
      badge.textContent = show ? String(count) : '';
      badge.style.display = show ? 'inline-flex' : 'none';
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
      btn.setAttribute('aria-label', typeof uiS === 'function' ? uiS('js_pw_show') : 'パスワードを表示');
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = SVG_EYE + SVG_EYE_OFF;
      wrap.appendChild(btn);

      function syncToggleUi() {
        var visible = input.type === 'text';
        wrap.classList.toggle('is-visible', visible);
        btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
        btn.setAttribute('aria-label', visible
          ? (typeof uiS === 'function' ? uiS('js_pw_hide') : 'パスワードを隠す')
          : (typeof uiS === 'function' ? uiS('js_pw_show') : 'パスワードを表示'));
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

    window.soccerCloseSiteHeaderNav = close;

    /* bfcache 復帰時にメニュー開状態が残ると、下層が暗く見えたり操作できないことがある */
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        close();
        syncFavoritesBadge();
      }
    });

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

  function updateAuthHeader(j) {
    var chip = document.getElementById('site-header-auth-chip');
    var label = document.getElementById('site-header-auth-label');
    if (!chip || !label) return;
    if (j && j.logged_in && j.nickname) {
      var nick = j.nickname;
      label.textContent = typeof uiS === 'function'
        ? uiS('js_auth_chip').replace('{nick}', nick)
        : ('ログイン中 · ' + nick);
      chip.classList.remove('hidden');
      chip.setAttribute('aria-hidden', 'false');
      chip.setAttribute('aria-label', typeof uiS === 'function'
        ? uiS('js_logged_in_chip').replace('{nick}', nick)
        : ('ログイン中: ' + nick + '。アカウントページへ'));
    } else {
      chip.classList.add('hidden');
      label.textContent = typeof uiS === 'function' ? uiS('js_logged_in') : 'ログイン中';
      chip.setAttribute('aria-hidden', 'true');
      chip.removeAttribute('aria-label');
    }
  }

  window.soccerUpdateAuthHeader = updateAuthHeader;

  document.addEventListener('DOMContentLoaded', function () {
    syncFavoritesBadge();
    setupMobileNav();
    setupPasswordFields();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === FAVORITES_KEY) syncFavoritesBadge();
  });
})();
