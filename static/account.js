(function () {
  'use strict';

  function msg(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('account-message--error', !!isError);
  }

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') || '' : '';
  }

  function setMetaCsrf(t) {
    var m = document.querySelector('meta[name="csrf-token"]');
    if (m && t) m.setAttribute('content', t);
  }

  function showRecoveryModal(secret) {
    var modal = document.getElementById('account-recovery-modal');
    var ta = document.getElementById('register-recovery-text');
    if (ta) ta.value = secret || '';
    if (modal) modal.classList.remove('hidden');
  }

  function hideRecoveryModal() {
    var modal = document.getElementById('account-recovery-modal');
    if (modal) modal.classList.add('hidden');
  }

  function showLoggedIn(nickname) {
    var out = document.getElementById('account-logged-out');
    var inn = document.getElementById('account-logged-in');
    var line = document.getElementById('account-nickname-line');
    /* Chrome: パスワード入力にフォーカスがあるままログイン後ビューを display:none にすると
       オートフィル／キーボードまわりの半透明レイヤーが残ることがある → 先に blur してから切替 */
    try {
      var ae = document.activeElement;
      if (ae && typeof ae.blur === 'function') ae.blur();
    } catch (e) {}
    var apply = function () {
      if (out) out.classList.add('hidden');
      if (inn) inn.classList.remove('hidden');
      if (line) line.textContent = nickname || '';
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(apply);
    } else {
      apply();
    }
  }

  function showLoggedOut() {
    var out = document.getElementById('account-logged-out');
    var inn = document.getElementById('account-logged-in');
    if (out) out.classList.remove('hidden');
    if (inn) inn.classList.add('hidden');
    hideRecoveryModal();
  }

  function setTab(which) {
    var tabLogin = document.getElementById('tab-login');
    var tabReg = document.getElementById('tab-register');
    var panelLogin = document.getElementById('panel-login');
    var panelReg = document.getElementById('panel-register');
    if (!tabLogin || !tabReg || !panelLogin || !panelReg) return;

    var loginActive = which === 'login';
    tabLogin.classList.toggle('is-active', loginActive);
    tabReg.classList.toggle('is-active', !loginActive);
    tabLogin.setAttribute('aria-selected', loginActive ? 'true' : 'false');
    tabReg.setAttribute('aria-selected', loginActive ? 'false' : 'true');
    tabLogin.setAttribute('tabindex', loginActive ? '0' : '-1');
    tabReg.setAttribute('tabindex', loginActive ? '-1' : '0');

    panelLogin.classList.toggle('hidden', !loginActive);
    panelReg.classList.toggle('hidden', loginActive);
    panelLogin.setAttribute('aria-hidden', loginActive ? 'false' : 'true');
    panelReg.setAttribute('aria-hidden', loginActive ? 'true' : 'false');
  }

  function refreshUi() {
    return fetch('/auth/status', { credentials: 'same-origin' })
      .then(function (r) {
        return r.text().then(function (text) {
          var j = {};
          if (text) {
            try {
              j = JSON.parse(text);
            } catch (ignore) {
              j = {};
            }
          }
          return j;
        });
      })
      .then(function (j) {
        if (j.csrf_token) setMetaCsrf(j.csrf_token);
        if (j.logged_in && j.nickname) showLoggedIn(j.nickname);
        else showLoggedOut();
        return j;
      });
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrf()
      },
      body: JSON.stringify(body)
    });
  }

  /** HTML や空ボディのとき r.json() が壊れるので、テキスト経由で JSON を読む */
  function parsePostJsonResponse(r) {
    return r.text().then(function (text) {
      var j = null;
      if (text) {
        try {
          j = JSON.parse(text);
        } catch (ignore) {
          j = null;
        }
      }
      if (j !== null && typeof j === 'object') {
        return j;
      }
      if (r.status === 401) {
        throw new Error('ニックネームまたはパスワードが正しくありません');
      }
      if (r.status === 400 || r.status === 403) {
        throw new Error('セキュリティトークンが無効です。ページを再読み込みしてからお試しください。');
      }
      if (r.status === 429) {
        throw new Error('試行回数が多すぎます。しばらく待ってからお試しください。');
      }
      throw new Error('サーバーから予期しない応答でした。しばらくしてからお試しください。');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var elMsg = document.getElementById('account-message');

    var tabLogin = document.getElementById('tab-login');
    var tabReg = document.getElementById('tab-register');
    if (tabLogin) {
      tabLogin.addEventListener('click', function () { setTab('login'); });
    }
    if (tabReg) {
      tabReg.addEventListener('click', function () { setTab('register'); });
    }

    refreshUi().then(function (j) {
      if (j && j.logged_in && j.nickname) showLoggedIn(j.nickname);
    });

    var formReg = document.getElementById('form-register');
    if (formReg) {
      formReg.addEventListener('submit', function (e) {
        e.preventDefault();
        msg(elMsg, '');
        postJson('/auth/register', {
          nickname: document.getElementById('reg-nick').value,
          password: document.getElementById('reg-pw').value
        }).then(function (r) {
          return parsePostJsonResponse(r).then(function (j) {
            if (!r.ok) throw new Error(j.error || '登録に失敗しました');
            return j;
          });
        }).then(function (j) {
          if (j.recovery_secret) {
            showRecoveryModal(j.recovery_secret);
          }
          msg(elMsg, '登録しました。回復用キーを保存してください。');
          showLoggedIn(j.nickname || '');
          if (window.soccerRefreshAuthAndSync) window.soccerRefreshAuthAndSync();
        }).catch(function (err) {
          msg(elMsg, err.message || String(err), true);
        });
      });
    }

    var btnCopy = document.getElementById('register-recovery-copy');
    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        var ta = document.getElementById('register-recovery-text');
        if (!ta) return;
        ta.select();
        document.execCommand('copy');
        msg(elMsg, 'クリップボードにコピーしました。');
      });
    }

    var btnDismiss = document.getElementById('register-recovery-dismiss');
    if (btnDismiss) {
      btnDismiss.addEventListener('click', function () {
        hideRecoveryModal();
        msg(elMsg, '');
      });
    }

    var formLogin = document.getElementById('form-login');
    if (formLogin) {
      formLogin.addEventListener('submit', function (e) {
        e.preventDefault();
        msg(elMsg, '');
        postJson('/auth/login', {
          nickname: document.getElementById('login-nick').value,
          password: document.getElementById('login-pw').value
        }).then(function (r) {
          return parsePostJsonResponse(r).then(function (j) {
            if (!r.ok) throw new Error(j.error || 'ログインに失敗しました');
            return j;
          });
        }).then(function (j) {
          msg(elMsg, 'ログインしました。');
          showLoggedIn(j.nickname);
          if (window.soccerRefreshAuthAndSync) window.soccerRefreshAuthAndSync();
        }).catch(function (err) {
          msg(elMsg, err.message || String(err), true);
        });
      });
    }

    var formReset = document.getElementById('form-reset');
    if (formReset) {
      formReset.addEventListener('submit', function (e) {
        e.preventDefault();
        msg(elMsg, '');
        postJson('/auth/reset-password', {
          nickname: document.getElementById('reset-nick').value,
          recovery_secret: document.getElementById('reset-secret').value,
          new_password: document.getElementById('reset-newpw').value
        }).then(function (r) {
          return parsePostJsonResponse(r).then(function (j) {
            if (!r.ok) throw new Error(j.error || '再設定に失敗しました');
            return j;
          });
        }).then(function () {
          msg(elMsg, 'パスワードを再設定しました。ログインしてください。');
          setTab('login');
          var det = document.getElementById('account-reset-details');
          if (det) det.removeAttribute('open');
          formReset.reset();
        }).catch(function (err) {
          msg(elMsg, err.message || String(err), true);
        });
      });
    }

    var btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        postJson('/auth/logout', {}).then(function () {
          showLoggedOut();
          setTab('login');
          msg(elMsg, 'ログアウトしました。');
          if (window.soccerRefreshAuthAndSync) window.soccerRefreshAuthAndSync();
        });
      });
    }

    var formCh = document.getElementById('form-change-pw');
    if (formCh) {
      formCh.addEventListener('submit', function (e) {
        e.preventDefault();
        msg(elMsg, '');
        postJson('/auth/change-password', {
          old_password: document.getElementById('old-pw').value,
          new_password: document.getElementById('new-pw').value
        }).then(function (r) {
          return parsePostJsonResponse(r).then(function (j) {
            if (!r.ok) throw new Error(j.error || '変更に失敗しました');
            return j;
          });
        }).then(function () {
          msg(elMsg, 'パスワードを変更しました。');
          document.getElementById('old-pw').value = '';
          document.getElementById('new-pw').value = '';
        }).catch(function (err) {
          msg(elMsg, err.message || String(err), true);
        });
      });
    }

    var formDel = document.getElementById('form-delete');
    if (formDel) {
      formDel.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.confirm('本当にアカウントと同期データを削除しますか？')) return;
        msg(elMsg, '');
        postJson('/auth/delete-account', {
          password: document.getElementById('delete-pw').value
        }).then(function (r) {
          return parsePostJsonResponse(r).then(function (j) {
            if (!r.ok) throw new Error(j.error || '削除に失敗しました');
            return j;
          });
        }).then(function () {
          msg(elMsg, 'アカウントを削除しました。');
          showLoggedOut();
          setTab('login');
          if (window.soccerRefreshAuthAndSync) window.soccerRefreshAuthAndSync();
        }).catch(function (err) {
          msg(elMsg, err.message || String(err), true);
        });
      });
    }
  });
})();
