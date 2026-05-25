(function () {
  var FAVORITES_KEY = 'soccer_favorite_videos';
  var SORT_STORAGE_KEY = 'soccer_favorites_sort';
  var SORT_SAVED_DESC = 'saved_desc';
  var SORT_TITLE_ASC = 'title_asc';

  function tr(key) {
    return typeof uiS === 'function' ? uiS(key) : key;
  }

  function normalizeForSearch(s) {
    if (s == null || typeof s !== 'string') return '';
    try {
      return s.normalize('NFKC').trim().toLowerCase();
    } catch {
      return String(s).trim().toLowerCase();
    }
  }

  function getSearchNeedle() {
    var el = document.getElementById('favorites-search');
    var raw = el && el.value ? String(el.value) : '';
    return normalizeForSearch(raw.substring(0, 200));
  }

  function haystackForFavorite(item) {
    var parts = [];
    if (item.title) parts.push(String(item.title));
    if (item.channel_category) parts.push(String(item.channel_category));
    if (item.upload_date) parts.push(String(item.upload_date));
    return normalizeForSearch(parts.join('\n'));
  }

  function favoriteMatchesSearch(item, needle) {
    if (!needle) return true;
    return haystackForFavorite(item).includes(needle);
  }

  function getSortKey() {
    var sel = document.getElementById('favorites-sort');
    var v = sel && sel.value ? sel.value : SORT_SAVED_DESC;
    return v === SORT_TITLE_ASC ? SORT_TITLE_ASC : SORT_SAVED_DESC;
  }

  function sortFavorites(items, sortKey) {
    var list = items.slice();
    if (sortKey === SORT_TITLE_ASC) {
      list.sort(function (a, b) {
        var ta = normalizeForSearch(String(a.title || ''));
        var tb = normalizeForSearch(String(b.title || ''));
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return (b.saved_at || 0) - (a.saved_at || 0);
      });
      return list;
    }
    list.sort(function (a, b) {
      return (b.saved_at || 0) - (a.saved_at || 0);
    });
    return list;
  }

  function render() {
    var list = document.getElementById('favorites-list');
    var empty = document.getElementById('favorites-empty');
    var filterEmpty = document.getElementById('favorites-filter-empty');
    var toolbar = document.getElementById('favorites-toolbar');
    if (!list || !empty || typeof getFavorites !== 'function' || typeof buildVideoCard !== 'function') {
      return;
    }

    var all = getFavorites();
    var hasAny = all.length > 0;

    if (toolbar) {
      toolbar.hidden = !hasAny;
    }
    empty.style.display = hasAny ? 'none' : 'block';
    if (filterEmpty) {
      filterEmpty.hidden = true;
    }

    list.innerHTML = '';
    if (!hasAny) {
      return;
    }

    var needle = getSearchNeedle();
    var sortKey = getSortKey();
    var filtered = all.filter(function (item) {
      return favoriteMatchesSearch(item, needle);
    });
    var sorted = sortFavorites(filtered, sortKey);

    if (sorted.length === 0) {
      if (filterEmpty) {
        filterEmpty.hidden = false;
        filterEmpty.textContent = tr('js_fav_search_no_results');
      }
      return;
    }

    sorted.forEach(function (activity) {
      list.appendChild(buildVideoCard(activity, { listContext: 'favorites' }));
    });
  }

  function bindControls() {
    var search = document.getElementById('favorites-search');
    var sort = document.getElementById('favorites-sort');
    if (search) {
      search.addEventListener('input', render);
    }
    if (sort) {
      try {
        var stored = sessionStorage.getItem(SORT_STORAGE_KEY);
        if (stored === SORT_TITLE_ASC || stored === SORT_SAVED_DESC) {
          sort.value = stored;
        }
      } catch (e) { /* ignore */ }
      sort.addEventListener('change', function () {
        try {
          sessionStorage.setItem(SORT_STORAGE_KEY, getSortKey());
        } catch (e) { /* ignore */ }
        render();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindControls();
    render();
  });

  window.addEventListener('soccerUserDataSynced', function () {
    render();
  });

  window.addEventListener('storage', function (e) {
    if (e.key === FAVORITES_KEY) render();
  });

  window.renderFavoritesList = render;
})();
