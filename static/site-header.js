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
  });

  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) syncMemoBadge();
    if (e.key === FAVORITES_KEY) syncFavoritesBadge();
  });
})();
