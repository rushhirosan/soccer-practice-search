/**
 * ログイン時: サーバーと localStorage を同期（お気に入り・メモ帳など）
 *
 * マージ規約（初回 pull）:
 * - サーバー payload が空オブジェクト → ローカルを PUT でアップロード（初回ログイン・新規端末）。
 * - サーバーにキーが1つでもあれば → サーバー側を applyPayload で localStorage に反映（サーバー優先）。
 * 以降の編集は debounce 付き PUT でサーバーへ反映。
 */
(function () {
  'use strict';

  var SYNC_KEYS = [
    'soccer_favorite_videos',
    'soccer_selected_menus',
    'soccer_saved_practice_plans',
    'soccer_saved_match_results',
    'soccer_saved_daily_notes',
    'soccer_tactical_board',
    'soccer_realtime_search',
    'soccer_search_history',
    'soccer_pending_board_for_plan'
  ];

  var csrfToken = '';
  var pushTimer = null;
  var DEBOUNCE_MS = 2000;

  function getMetaCsrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') || '' : '';
  }

  function setLoggedInFlag(on) {
    if (document.body) document.body.dataset.soccerLoggedIn = on ? '1' : '';
    window.__soccerLoggedIn = !!on;
  }

  function collectPayload() {
    var out = {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var k = SYNC_KEYS[i];
      try {
        var v = localStorage.getItem(k);
        if (v !== null) {
          try {
            out[k] = JSON.parse(v);
          } catch (e) {
            out[k] = v;
          }
        }
      } catch (e) {}
    }
    return out;
  }

  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SYNC_KEYS.indexOf(k) === -1) continue;
      var val = payload[k];
      try {
        if (typeof val === 'string') {
          localStorage.setItem(k, val);
        } else {
          localStorage.setItem(k, JSON.stringify(val));
        }
      } catch (e) {
        console.warn('applyPayload', k, e);
      }
    }
    refreshBadgesFromStorage();
    try {
      window.dispatchEvent(new CustomEvent('soccerUserDataSynced'));
    } catch (e) {}
  }

  function syncBadgesFallback() {
    try {
      var fb = document.getElementById('favorites-badge');
      if (fb) {
        var fr = localStorage.getItem('soccer_favorite_videos');
        var fi = fr ? JSON.parse(fr) : [];
        var fc = Array.isArray(fi) ? fi.length : 0;
        fb.textContent = fc > 0 ? String(fc) : '';
        fb.style.display = fc > 0 ? 'inline-flex' : 'none';
      }
    } catch (e) {}
    try {
      var mb = document.getElementById('practice-notes-badge');
      if (mb) {
        var mr = localStorage.getItem('soccer_selected_menus');
        var mi = mr ? JSON.parse(mr) : [];
        var mc = Array.isArray(mi) ? mi.length : 0;
        mb.textContent = mc > 0 ? String(mc) : '';
        mb.style.display = mc > 0 ? 'inline-flex' : 'none';
      }
    } catch (e) {}
  }

  function refreshBadgesFromStorage() {
    if (typeof window.updateFavoritesBadge === 'function') window.updateFavoritesBadge();
    else syncBadgesFallback();
    if (typeof window.updateSelectedMenusBadge === 'function') window.updateSelectedMenusBadge();
    else syncBadgesFallback();
  }

  function pullFromServer() {
    return fetch('/api/user-data', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error('user-data GET failed');
        return r.json();
      })
      .then(function (j) {
        if (!j) return;
        var payload = j.payload || {};
        var keys = Object.keys(payload);
        if (keys.length === 0) {
          return pushToServer(true);
        }
        applyPayload(payload);
      })
      .catch(function (e) {
        console.warn('pullFromServer', e);
      });
  }

  function pushToServer(force) {
    if (!window.__soccerLoggedIn) return Promise.resolve();
    var payload = collectPayload();
    var headers = {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken || getMetaCsrf()
    };
    return fetch('/api/user-data', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: headers,
      body: JSON.stringify({ payload: payload })
    })
      .then(function (r) {
        if (r.status === 401) return r;
        if (!r.ok) return r.json().then(function (err) {
          throw new Error((err && err.error) || 'save failed');
        });
        return refreshCsrf();
      })
      .catch(function (e) {
        console.warn('pushToServer', e);
      });
  }

  function refreshCsrf() {
    return fetch('/auth/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.csrf_token) csrfToken = j.csrf_token;
      });
  }

  function closeHeaderNavIfOpen() {
    if (typeof window.soccerCloseSiteHeaderNav === 'function') {
      window.soccerCloseSiteHeaderNav();
    }
  }

  function schedulePush() {
    if (!window.__soccerLoggedIn) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushToServer();
    }, DEBOUNCE_MS);
  }

  window.soccerScheduleUserDataPush = schedulePush;

  function init() {
    csrfToken = getMetaCsrf();
    fetch('/auth/status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.csrf_token) csrfToken = j.csrf_token;
        if (typeof window.soccerUpdateAuthHeader === 'function') {
          window.soccerUpdateAuthHeader(j);
        }
        if (j && j.logged_in) {
          setLoggedInFlag(true);
          setTimeout(closeHeaderNavIfOpen, 0);
          return pullFromServer();
        }
        setLoggedInFlag(false);
        setTimeout(closeHeaderNavIfOpen, 0);
      })
      .catch(function (e) {
        console.warn('user-sync init', e);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.soccerRefreshAuthAndSync = function () {
    return refreshCsrf().then(function () {
      return fetch('/auth/status', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }).then(function (j) {
      if (j && j.csrf_token) csrfToken = j.csrf_token;
      if (typeof window.soccerUpdateAuthHeader === 'function') {
        window.soccerUpdateAuthHeader(j);
      }
      if (j && j.logged_in) {
        setLoggedInFlag(true);
        setTimeout(closeHeaderNavIfOpen, 0);
        return pullFromServer();
      }
      setLoggedInFlag(false);
      setTimeout(closeHeaderNavIfOpen, 0);
      return j;
    });
  };
})();
