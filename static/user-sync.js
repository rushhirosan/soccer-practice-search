/**
 * ログイン時: サーバーと localStorage を同期（お気に入り・メモ帳など）
 *
 * アカウントにログインして同期したデータは「アカウントのデータ」として扱う:
 * - ログアウト時・セッション切れ時は localStorage の同期キーを消し、画面からは見えないようにする。
 * - 次回ログインでサーバーから再取得する。
 *
 * 未ログインのみの利用では soccer_account_local_mirror を立てない（ゲストの local は消さない）。
 *
 * 初回同期規約（ログイン直後）:
 * - 自動マージはしない。サーバー優先/この端末のデータ取り込みをユーザーに選んでもらう。
 * - 以降の編集は debounce 付き PUT でサーバーへ反映。
 */
(function () {
  'use strict';

  var SYNC_KEYS = [
    'soccer_favorite_videos',
    'soccer_selected_menus',
    'soccer_saved_practice_plans',
    'soccer_saved_match_results',
    'soccer_saved_daily_notes',
    'soccer_saved_boards',
    'soccer_tactical_board',
    'soccer_search_history',
    'soccer_pending_board_for_plan'
  ];

  var csrfToken = '';
  var pushTimer = null;
  var DEBOUNCE_MS = 2000;
  var POST_AUTH_TOAST_KEY = 'soccerPostAuthToast';
  var POST_AUTH_TOAST_MS = 6500;
  /** サーバーでログイン済みのときだけ立つ。セッション切れ検知に使う（ゲストと区別）。 */
  var ACCOUNT_LOCAL_MIRROR_KEY = 'soccer_account_local_mirror';
  var syncChoiceModalPromise = null;

  function showGlobalAuthToast(message) {
    if (!message) return;
    var el = document.getElementById('soccer-global-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'soccer-global-toast';
      el.className = 'soccer-global-toast hidden';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove('hidden');
    requestAnimationFrame(function () {
      el.classList.add('soccer-global-toast--visible');
    });
    var hideTimer = null;
    function hide() {
      if (hideTimer) clearTimeout(hideTimer);
      el.classList.remove('soccer-global-toast--visible');
      setTimeout(function () {
        el.classList.add('hidden');
        el.textContent = '';
      }, 320);
    }
    hideTimer = setTimeout(hide, POST_AUTH_TOAST_MS);
  }

  function consumePostAuthToastIfAny() {
    var kind;
    try {
      kind = sessionStorage.getItem(POST_AUTH_TOAST_KEY);
      if (kind) sessionStorage.removeItem(POST_AUTH_TOAST_KEY);
    } catch (e) {
      return;
    }
    if (!kind) return;
    if (!window.__soccerLoggedIn) return;
    var messages = {
      login: 'ログインしました。お気に入り・メモなどを同期します。',
      register: '登録ありがとうございます。回復用キーは安全な場所に保管してください。'
    };
    showGlobalAuthToast(messages[kind] || messages.login);
  }

  function getMetaCsrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') || '' : '';
  }

  function setLoggedInFlag(on) {
    if (document.body) document.body.dataset.soccerLoggedIn = on ? '1' : '';
    window.__soccerLoggedIn = !!on;
  }

  function markAccountLocalMirror() {
    try {
      localStorage.setItem(ACCOUNT_LOCAL_MIRROR_KEY, '1');
    } catch (e) {}
  }

  function clearLocalSyncedUserData(options) {
    var preserveAccountMirror = !!(options && options.preserveAccountMirror);
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      try {
        localStorage.removeItem(SYNC_KEYS[i]);
      } catch (e) {}
    }
    if (!preserveAccountMirror) {
      try {
        localStorage.removeItem(ACCOUNT_LOCAL_MIRROR_KEY);
      } catch (e) {}
    }
    refreshBadgesFromStorage();
    try {
      window.dispatchEvent(new CustomEvent('soccerUserDataSynced'));
    } catch (e) {}
  }

  /** ログアウト／アカウント削除直後に呼ぶ（明示的ログアウト用） */
  window.soccerClearSyncedUserDataOnLogout = clearLocalSyncedUserData;

  function clearSyncedDataIfSessionExpired() {
    try {
      if (localStorage.getItem(ACCOUNT_LOCAL_MIRROR_KEY) === '1') {
        clearLocalSyncedUserData();
      }
    } catch (e) {}
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

  function payloadHasMeaningfulData(payload) {
    if (!payload || typeof payload !== 'object') return false;
    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SYNC_KEYS.indexOf(k) === -1) continue;
      var val = payload[k];
      if (Array.isArray(val) && val.length > 0) return true;
      if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) return true;
      if (typeof val === 'string' && val.trim() !== '' && val !== '[]' && val !== '{}') return true;
      if (typeof val === 'number' || typeof val === 'boolean') return true;
    }
    return false;
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

  function applyNavBadgeSessionContextForSync() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && nav.type === 'reload') {
        sessionStorage.removeItem('soccer_nav_fav_badge_pending');
        sessionStorage.removeItem('soccer_nav_memo_badge_pending');
        return;
      }
    } catch (e) {}
    try {
      if (typeof performance !== 'undefined' && performance.navigation && performance.navigation.type === 1) {
        sessionStorage.removeItem('soccer_nav_fav_badge_pending');
        sessionStorage.removeItem('soccer_nav_memo_badge_pending');
        return;
      }
    } catch (e2) {}
    try {
      var p = window.location.pathname || '';
      if (p === '/favorites' || /\/favorites\/?$/.test(p)) sessionStorage.removeItem('soccer_nav_fav_badge_pending');
      if (p === '/practice-notes' || /\/practice-notes\/?$/.test(p)) sessionStorage.removeItem('soccer_nav_memo_badge_pending');
    } catch (e3) {}
  }

  function syncBadgesFallback() {
    applyNavBadgeSessionContextForSync();
    try {
      var fb = document.getElementById('favorites-badge');
      if (fb) {
        var fr = localStorage.getItem('soccer_favorite_videos');
        var fi = fr ? JSON.parse(fr) : [];
        var fc = Array.isArray(fi) ? fi.length : 0;
        var showF = fc > 0 && sessionStorage.getItem('soccer_nav_fav_badge_pending') === '1';
        fb.textContent = showF ? String(fc) : '';
        fb.style.display = showF ? 'inline-flex' : 'none';
      }
    } catch (e) {}
    try {
      var mb = document.getElementById('practice-notes-badge');
      if (mb) {
        var mr = localStorage.getItem('soccer_selected_menus');
        var mi = mr ? JSON.parse(mr) : [];
        var mc = Array.isArray(mi) ? mi.length : 0;
        var showM = mc > 0 && sessionStorage.getItem('soccer_nav_memo_badge_pending') === '1';
        mb.textContent = showM ? String(mc) : '';
        mb.style.display = showM ? 'inline-flex' : 'none';
      }
    } catch (e) {}
  }

  function refreshBadgesFromStorage() {
    if (typeof window.updateFavoritesBadge === 'function') window.updateFavoritesBadge();
    else syncBadgesFallback();
    if (typeof window.updateSelectedMenusBadge === 'function') window.updateSelectedMenusBadge();
    else syncBadgesFallback();
  }

  function fetchServerPayload() {
    return fetch('/api/user-data', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) return null;
        if (!r.ok) throw new Error('user-data GET failed');
        return r.json();
      })
      .then(function (j) {
        if (!j) return null;
        return j.payload || {};
      })
      .catch(function (e) {
        console.warn('fetchServerPayload', e);
        return null;
      });
  }

  function ensureSyncChoiceModal() {
    var existing = document.getElementById('soccer-sync-choice-modal');
    if (existing) return existing;
    var root = document.createElement('div');
    root.id = 'soccer-sync-choice-modal';
    root.className = 'soccer-sync-choice-modal hidden';
    root.innerHTML = ''
      + '<div class="soccer-sync-choice-modal__panel" role="dialog" aria-modal="true" aria-labelledby="soccer-sync-choice-title">'
      +   '<h2 id="soccer-sync-choice-title" class="soccer-sync-choice-modal__title">同期方法を選んでください</h2>'
      +   '<p class="soccer-sync-choice-modal__text">この端末には未ログイン時のデータがあります。別の人のデータが混ざる事故を防ぐため、同期方法を選んでください。</p>'
      +   '<p class="soccer-sync-choice-modal__text soccer-sync-choice-modal__text--warn">推奨: 既存のアカウントデータを使う（この端末のローカルデータは破棄）。</p>'
      +   '<div class="soccer-sync-choice-modal__actions">'
      +     '<button type="button" id="soccer-sync-choice-server" class="soccer-sync-choice-modal__btn soccer-sync-choice-modal__btn--primary">既存のアカウントデータを使う（推奨）</button>'
      +     '<button type="button" id="soccer-sync-choice-local" class="soccer-sync-choice-modal__btn soccer-sync-choice-modal__btn--outline">この端末のデータをこのアカウントに取り込む</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(root);
    return root;
  }

  function askSyncChoice() {
    if (syncChoiceModalPromise) return syncChoiceModalPromise;
    var modal = ensureSyncChoiceModal();
    modal.classList.remove('hidden');
    syncChoiceModalPromise = new Promise(function (resolve) {
      var btnServer = document.getElementById('soccer-sync-choice-server');
      var btnLocal = document.getElementById('soccer-sync-choice-local');
      function choose(kind) {
        modal.classList.add('hidden');
        btnServer && btnServer.removeEventListener('click', onServer);
        btnLocal && btnLocal.removeEventListener('click', onLocal);
        syncChoiceModalPromise = null;
        resolve(kind);
      }
      function onServer() { choose('server'); }
      function onLocal() { choose('local'); }
      if (btnServer) btnServer.addEventListener('click', onServer);
      if (btnLocal) btnLocal.addEventListener('click', onLocal);
    });
    return syncChoiceModalPromise;
  }

  function handleLoginSyncFlow() {
    var hasMirror = false;
    try {
      hasMirror = localStorage.getItem(ACCOUNT_LOCAL_MIRROR_KEY) === '1';
    } catch (e) {}
    if (hasMirror) {
      return fetchServerPayload().then(function (payload) {
        if (payloadHasMeaningfulData(payload)) {
          applyPayload(payload);
        }
        markAccountLocalMirror();
      });
    }

    var localPayload = collectPayload();
    var hasLocalData = payloadHasMeaningfulData(localPayload);
    return fetchServerPayload().then(function (serverPayload) {
      var hasServerData = payloadHasMeaningfulData(serverPayload);
      if (!hasLocalData && hasServerData) {
        applyPayload(serverPayload);
        markAccountLocalMirror();
        return;
      }
      if (!hasLocalData && !hasServerData) {
        markAccountLocalMirror();
        return;
      }
      return askSyncChoice().then(function (choice) {
        if (choice === 'local') {
          return pushToServer(true).then(function () {
            markAccountLocalMirror();
          });
        }
        if (hasServerData) {
          applyPayload(serverPayload);
        } else {
          clearLocalSyncedUserData({ preserveAccountMirror: true });
        }
        markAccountLocalMirror();
      });
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
          return handleLoginSyncFlow().then(function () {
            consumePostAuthToastIfAny();
          });
        }
        clearSyncedDataIfSessionExpired();
        setLoggedInFlag(false);
        setTimeout(closeHeaderNavIfOpen, 0);
        consumePostAuthToastIfAny();
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
        return handleLoginSyncFlow().then(function () {
          consumePostAuthToastIfAny();
        });
      }
      clearSyncedDataIfSessionExpired();
      setLoggedInFlag(false);
      setTimeout(closeHeaderNavIfOpen, 0);
      return j;
    });
  };
})();
