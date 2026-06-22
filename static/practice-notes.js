/**
 * 試合記録・メモ（試合結果 / 日々の気づき）
 */

(function () {
  'use strict';

  function tr(k) {
    return typeof uiS === 'function' ? uiS(k) : k;
  }

  const SAVED_MATCH_RESULTS_KEY = 'soccer_saved_match_results';
  const SAVED_DAILY_NOTES_KEY = 'soccer_saved_daily_notes';
  const PENDING_MATCH_BOARD_KEY = 'soccer_pending_board_for_match';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function readList(key) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }

  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
    } catch (e) {
      console.warn(tr('js_pn_save_fail'), e);
    }
  }

  function formatISOToJa(isoDate) {
    try {
      if (!isoDate) return '-';
      // isoDate = YYYY-MM-DD
      const [y, m, d] = isoDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString((typeof window !== 'undefined' && window.__UI_LOCALE__ === 'en') ? 'en-US' : 'ja-JP');
    } catch {
      return isoDate || '-';
    }
  }

  function groupByDate(entries) {
    const map = new Map();
    entries.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    const dates = Array.from(map.keys()).sort((a, b) => (b || '').localeCompare(a || ''));
    return dates.map((date) => ({ date, items: map.get(date) || [] }));
  }

  /** 旧形式（score/events のみ）と新形式（games 配列）を統一 */
  function normalizeMatchGames(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (Array.isArray(entry.games) && entry.games.length > 0) {
      return entry.games.map((g, i) => ({
        n: typeof g.n === 'number' ? g.n : i + 1,
        score: (g.score != null ? String(g.score) : '').trim(),
        events: (g.events != null ? String(g.events) : '').trim()
      }));
    }
    const score = entry.score != null ? String(entry.score).trim() : '';
    const events = entry.events != null ? String(entry.events).trim() : '';
    if (score || events) {
      return [{ n: 1, score, events }];
    }
    return [];
  }

  function getPendingMatchBoard() {
    try {
      let s = sessionStorage.getItem(PENDING_MATCH_BOARD_KEY);
      if (!s) s = localStorage.getItem(PENDING_MATCH_BOARD_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  function clearPendingMatchBoard() {
    try {
      sessionStorage.removeItem(PENDING_MATCH_BOARD_KEY);
      localStorage.removeItem(PENDING_MATCH_BOARD_KEY);
    } catch (_) {}
  }

  /** ボードから遷移した直後の取り込み（pageshow でも再試行） */
  function consumePendingMatchBoardIfAny() {
    const pendingAtLoad = getPendingMatchBoard();
    if (!pendingAtLoad || !pendingAtLoad.snapshot) return false;
    setMatchFormationSnapshot({
      ...pendingAtLoad.snapshot,
      capturedAt: pendingAtLoad.savedAt || new Date().toISOString(),
    });
    clearPendingMatchBoard();
    return true;
  }

  function normalizeFormationSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const starters = Array.isArray(snapshot.starters)
      ? snapshot.starters.map((name) => String(name || '').trim()).filter(Boolean)
      : [];
    const formation = String(snapshot.formation || '').trim();
    const boardName = String(snapshot.boardName || '').trim();
    return {
      boardType: snapshot.boardType === 'practice' ? 'practice' : 'tactical',
      boardId: snapshot.boardId != null ? String(snapshot.boardId) : null,
      boardName,
      sceneIndex: typeof snapshot.sceneIndex === 'number' ? snapshot.sceneIndex : 0,
      formation,
      starters,
      capturedAt: String(snapshot.capturedAt || '').trim(),
    };
  }

  function formationSummaryText(snapshot) {
    const s = normalizeFormationSnapshot(snapshot);
    if (!s) return '';
    const lines = [];
    const label = s.boardType === 'practice' ? tr('js_pn_practice_shape') : tr('js_pn_formation');
    if (s.formation) lines.push(`${label}: ${s.formation}`);
    if (s.starters.length > 0) lines.push(`${tr('js_pn_starters')}: ${s.starters.join(' / ')}`);
    if (s.boardName) lines.push(`${tr('js_pn_source_board')}: ${s.boardName}`);
    const joined = lines.join('\n');
    if (joined) return joined;
    return tr('js_pn_formation_import_fallback');
  }

  function setMatchFormationSnapshot(snapshot) {
    currentMatchFormationSnapshot = normalizeFormationSnapshot(snapshot);
    const box = document.getElementById('match-formation-preview');
    const text = document.getElementById('match-formation-preview-text');
    if (!box || !text) return;
    const summary = formationSummaryText(currentMatchFormationSnapshot);
    if (!summary) {
      box.hidden = true;
      text.textContent = '';
      return;
    }
    text.textContent = summary;
    box.hidden = false;
  }

  function matchRecordTitleText(entry) {
    const opponent = entry.opponent ? `vs ${entry.opponent}` : tr('js_pn_vs_unset');
    const games = normalizeMatchGames(entry);
    if (games.length === 0) return opponent;
    if (games.length === 1 && games[0].score) {
      return `${opponent} / ${games[0].score}`;
    }
    return `${opponent}${tr('js_pn_games_count').replace('{n}', String(games.length))}`;
  }

  function matchRecordSummaryText(entry) {
    const games = normalizeMatchGames(entry);
    if (games.length === 0) return '';
    return games
      .map((g, i) => {
        const n = g.n || i + 1;
        const parts = [tr('js_pn_game_n').replace('{n}', String(n))];
        if (g.score) parts.push(g.score);
        if (g.events) parts.push(g.events);
        return parts.join(' ');
      })
      .join('\n');
  }

  function normalizeForSearch(s) {
    if (s == null || typeof s !== 'string') return '';
    try {
      return s.normalize('NFKC').trim().toLowerCase();
    } catch {
      return String(s).trim().toLowerCase();
    }
  }

  function getSavedRecordsSearchNeedle() {
    const el = document.getElementById('saved-records-search');
    const raw = el && el.value ? String(el.value) : '';
    return normalizeForSearch(raw.substring(0, 200));
  }

  function haystackForRecordEntry(entry) {
    const parts = [];
    if (entry.date) {
      parts.push(entry.date);
      parts.push(formatISOToJa(entry.date));
    }
    if (entry.type === 'match') {
      if (entry.opponent != null) parts.push(String(entry.opponent));
      parts.push(matchRecordTitleText(entry));
      parts.push(matchRecordSummaryText(entry));
      parts.push(formationSummaryText(entry.formationSnapshot));
    } else if (entry.content != null) {
      parts.push(String(entry.content));
    }
    return normalizeForSearch(parts.join('\n'));
  }

  function entryMatchesSavedSearch(entry, needle) {
    if (!needle) return true;
    return haystackForRecordEntry(entry).includes(needle);
  }

  let editingMatchId = null;
  let editingDailyId = null;
  let currentMatchFormationSnapshot = null;

  function getMatchGamesListEl() {
    return document.getElementById('match-games-list');
  }

  function initialMatchEventsText(initial) {
    if (initial && initial.events != null && String(initial.events).trim()) {
      return String(initial.events);
    }
    return '';
  }

  function createMatchGameRow(initial) {
    const matchGamesList = getMatchGamesListEl();
    const row = document.createElement('div');
    row.className = 'match-game-row';
    row.innerHTML = `
        <div class="match-game-row__label"></div>
        <div class="match-game-row__grid">
          <label class="form-field" style="margin:0">
            <span>${tr('js_pn_score')}</span>
            <span class="form-field-control">
              <input type="text" class="match-game-score" placeholder="${tr('js_pn_score_ph')}" autocomplete="off" />
            </span>
          </label>
          <label class="form-field" style="margin:0">
            <span>${tr('js_pn_events')}</span>
            <span class="form-field-control">
              <textarea class="match-game-events memo-textarea" rows="3" placeholder="${tr('js_pn_events_ph')}"></textarea>
            </span>
          </label>
        </div>
        <div class="match-game-row__actions">
          <button type="button" class="match-game-row__remove no-print" aria-label="${tr('js_pn_remove_game_aria')}">${tr('js_pn_remove_game')}</button>
        </div>`;
    const scoreInput = row.querySelector('.match-game-score');
    const eventsTa = row.querySelector('.match-game-events');
    if (scoreInput) {
      scoreInput.value = initial && initial.score != null ? String(initial.score) : '';
    }
    if (eventsTa) {
      eventsTa.value = initialMatchEventsText(initial);
    }
    const removeBtn = row.querySelector('.match-game-row__remove');
    removeBtn.addEventListener('click', () => {
      if (!matchGamesList || matchGamesList.querySelectorAll('.match-game-row').length <= 1) return;
      row.remove();
      refreshMatchGameRowLabels();
    });
    return row;
  }

  function refreshMatchGameRowLabels() {
    const matchGamesList = getMatchGamesListEl();
    if (!matchGamesList) return;
    matchGamesList.querySelectorAll('.match-game-row').forEach((row, i) => {
      const lab = row.querySelector('.match-game-row__label');
      if (lab) lab.textContent = tr('js_pn_game_n').replace('{n}', String(i + 1));
      const btn = row.querySelector('.match-game-row__remove');
      if (btn) btn.style.display = matchGamesList.querySelectorAll('.match-game-row').length > 1 ? 'inline-block' : 'none';
    });
  }

  function resetMatchGameRows() {
    const matchGamesList = getMatchGamesListEl();
    if (!matchGamesList) return;
    matchGamesList.innerHTML = '';
    matchGamesList.appendChild(createMatchGameRow());
    refreshMatchGameRowLabels();
  }

  function fillMatchFormFromEntry(entry) {
    const matchDate = document.getElementById('match-date');
    const matchOpponent = document.getElementById('match-opponent');
    const matchGamesList = getMatchGamesListEl();
    if (matchDate) matchDate.value = entry.date || toTodayISO();
    if (matchOpponent) matchOpponent.value = entry.opponent ? String(entry.opponent) : '';
    const games = normalizeMatchGames(entry);
    if (!matchGamesList) return;
    matchGamesList.innerHTML = '';
    if (games.length === 0) {
      matchGamesList.appendChild(createMatchGameRow());
    } else {
      games.forEach((g) => {
        matchGamesList.appendChild(createMatchGameRow({ score: g.score, events: g.events }));
      });
    }
    refreshMatchGameRowLabels();
    setMatchFormationSnapshot(entry.formationSnapshot || null);
  }

  function activateNotesTab(panelId) {
    const tabBtns = document.querySelectorAll('.notes-tab');
    const panels = document.querySelectorAll('.notes-tab-panel');
    tabBtns.forEach((btn) => {
      const target = btn.getAttribute('data-target');
      const isActive = target === panelId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((p) => {
      p.classList.toggle('is-active', p.id === panelId);
    });
  }

  function syncEditUi() {
    const hint = document.getElementById('practice-notes-edit-hint');
    const btnMatch = document.getElementById('btn-save-match');
    const btnDaily = document.getElementById('btn-save-daily');
    if (btnMatch) btnMatch.textContent = editingMatchId ? tr('js_pn_update') : tr('js_pn_save');
    if (btnDaily) btnDaily.textContent = editingDailyId ? tr('js_pn_update') : tr('js_pn_save');
    if (hint) {
      if (editingMatchId) {
        hint.hidden = false;
        hint.textContent = tr('js_pn_hint_match_edit');
      } else if (editingDailyId) {
        hint.hidden = false;
        hint.textContent = tr('js_pn_hint_daily_edit');
      } else {
        hint.hidden = true;
        hint.textContent = '';
      }
    }
  }

  function clearEditing() {
    editingMatchId = null;
    editingDailyId = null;
    syncEditUi();
  }

  function beginEditMatch(id) {
    const list = readList(SAVED_MATCH_RESULTS_KEY);
    const entry = list.find((m) => m.id === id);
    if (!entry) return;
    editingMatchId = id;
    editingDailyId = null;
    fillMatchFormFromEntry(entry);
    activateNotesTab('tab-match');
    syncEditUi();
    document.getElementById('record-input-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function beginEditDaily(id) {
    const list = readList(SAVED_DAILY_NOTES_KEY);
    const entry = list.find((d) => d.id === id);
    if (!entry) return;
    editingDailyId = id;
    editingMatchId = null;
    const dailyDate = document.getElementById('daily-date');
    const dailyContent = document.getElementById('daily-content');
    if (dailyDate) dailyDate.value = entry.date || toTodayISO();
    if (dailyContent) dailyContent.value = entry.content != null ? String(entry.content) : '';
    activateNotesTab('tab-daily');
    syncEditUi();
    document.getElementById('record-input-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSavedRecords() {
    const container = document.getElementById('saved-records-container');
    const empty = document.getElementById('empty-records');
    const emptyDefault = document.getElementById('empty-records-default');
    const emptyFilter = document.getElementById('empty-records-filter');
    if (!container || !empty) return;

    const matches = readList(SAVED_MATCH_RESULTS_KEY);
    const daily = readList(SAVED_DAILY_NOTES_KEY);

    const all = [
      ...matches.map((m) => ({ type: 'match', ...m })),
      ...daily.map((d) => ({ type: 'daily', ...d }))
    ];

    all.sort((a, b) => {
      if ((a.date || '') !== (b.date || '')) return (b.date || '').localeCompare(a.date || '');
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    const needle = getSavedRecordsSearchNeedle();
    const filtered = needle ? all.filter((e) => entryMatchesSavedSearch(e, needle)) : all;

    container.innerHTML = '';

    if (all.length === 0) {
      empty.style.display = 'block';
      if (emptyDefault) emptyDefault.hidden = false;
      if (emptyFilter) {
        emptyFilter.hidden = true;
        emptyFilter.textContent = '';
      }
      return;
    }

    if (filtered.length === 0) {
      empty.style.display = 'block';
      if (emptyDefault) emptyDefault.hidden = true;
      if (emptyFilter) {
        emptyFilter.hidden = false;
        emptyFilter.textContent = tr('js_pn_search_no_results');
      }
      return;
    }

    empty.style.display = 'none';
    if (emptyDefault) emptyDefault.hidden = false;
    if (emptyFilter) {
      emptyFilter.hidden = true;
      emptyFilter.textContent = '';
    }

    const grouped = groupByDate(filtered);
    grouped.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'record-date-group';

      const dateEl = document.createElement('div');
      dateEl.className = 'record-date';
      dateEl.textContent = formatISOToJa(group.date);
      groupEl.appendChild(dateEl);

      group.items.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'record-card';

        const header = document.createElement('div');
        header.className = 'record-card-header';

        const left = document.createElement('div');
        left.className = 'record-card-left';

        const badge = document.createElement('div');
        badge.className = 'record-type-badge';
        badge.textContent = entry.type === 'match' ? tr('js_pn_badge_match') : tr('js_pn_badge_daily');

        const title = document.createElement('div');
        title.className = 'record-title';
        if (entry.type === 'match') {
          title.textContent = matchRecordTitleText(entry);
        } else {
          title.textContent = tr('js_pn_daily_title');
        }

        left.appendChild(badge);
        left.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'record-actions no-print';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = tr('js_pn_edit');
        editBtn.addEventListener('click', () => {
          if (entry.type === 'match') beginEditMatch(entry.id);
          else beginEditDaily(entry.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = tr('js_pn_delete');
        deleteBtn.addEventListener('click', () => deleteEntry(entry.type, entry.id));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(left);
        header.appendChild(actions);

        const summary = document.createElement('div');
        summary.className = 'record-summary';
        if (entry.type === 'match') {
          const matchSummary = matchRecordSummaryText(entry);
          const formationSummary = formationSummaryText(entry.formationSnapshot);
          summary.textContent = [matchSummary, formationSummary].filter(Boolean).join('\n');
        } else {
          summary.textContent = entry.content || '';
        }

        card.appendChild(header);
        card.appendChild(summary);
        groupEl.appendChild(card);
      });
      container.appendChild(groupEl);
    });
  }

  function deleteEntry(type, id) {
    if (!id) return;
    if (!confirm(tr('js_pn_delete_record_confirm'))) return;

    if (type === 'match') {
      const matches = readList(SAVED_MATCH_RESULTS_KEY).filter((m) => m.id !== id);
      writeList(SAVED_MATCH_RESULTS_KEY, matches);
      if (id === editingMatchId) clearEditing();
    } else {
      const daily = readList(SAVED_DAILY_NOTES_KEY).filter((d) => d.id !== id);
      writeList(SAVED_DAILY_NOTES_KEY, daily);
      if (id === editingDailyId) clearEditing();
    }
    renderSavedRecords();
  }

  function bindUi() {
    document.querySelectorAll('.notes-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (targetId) activateNotesTab(targetId);
      });
    });

    const matchDate = document.getElementById('match-date');
    const matchOpponent = document.getElementById('match-opponent');
    const matchGamesList = getMatchGamesListEl();
    const btnAddMatchGame = document.getElementById('btn-add-match-game');

    const dailyDate = document.getElementById('daily-date');
    const dailyContent = document.getElementById('daily-content');

    if (matchDate) matchDate.value = toTodayISO();
    if (dailyDate) dailyDate.value = toTodayISO();

    if (matchGamesList && !matchGamesList.querySelector('.match-game-row')) {
      resetMatchGameRows();
    } else if (matchGamesList) {
      refreshMatchGameRowLabels();
    }

    if (btnAddMatchGame && matchGamesList) {
      btnAddMatchGame.addEventListener('click', () => {
        matchGamesList.appendChild(createMatchGameRow());
        refreshMatchGameRowLabels();
      });
    }
    const btnSaveMatch = document.getElementById('btn-save-match');
    const btnClearMatch = document.getElementById('btn-clear-match');

    if (btnSaveMatch) {
      btnSaveMatch.addEventListener('click', () => {
        const date = (matchDate && matchDate.value) ? matchDate.value : '';
        const opponent = (matchOpponent && matchOpponent.value ? matchOpponent.value : '').trim();
        const games = [];
        if (matchGamesList) {
          matchGamesList.querySelectorAll('.match-game-row').forEach((row) => {
            const score = (row.querySelector('.match-game-score')?.value || '').trim();
            const events = (row.querySelector('.match-game-events')?.value || '').trim();
            // 失点のみ試合(例: 0-2)も記録できるよう、スコアがあれば保存対象にする
            if (score) games.push({ score, events });
          });
        }

        if (!date || !opponent) {
          alert(tr('js_pn_alert_match_required'));
          return;
        }
        if (games.length === 0) {
          alert(tr('js_pn_alert_match_game_required'));
          return;
        }

        const gamesPayload = games.map((g, i) => ({ n: i + 1, score: g.score, events: g.events }));
        const list = readList(SAVED_MATCH_RESULTS_KEY);

        if (editingMatchId) {
          const idx = list.findIndex((m) => m.id === editingMatchId);
          if (idx === -1) {
            alert(tr('js_pn_alert_edit_missing'));
            clearEditing();
            return;
          }
          const prev = list[idx];
          list[idx] = {
            id: editingMatchId,
            date,
            opponent,
            games: gamesPayload,
            formationSnapshot: currentMatchFormationSnapshot ? { ...currentMatchFormationSnapshot } : null,
            createdAt: prev.createdAt || new Date().toISOString()
          };
          writeList(SAVED_MATCH_RESULTS_KEY, list);
        } else {
          const entry = {
            id: 'match-' + Date.now(),
            date,
            opponent,
            games: gamesPayload,
            formationSnapshot: currentMatchFormationSnapshot ? { ...currentMatchFormationSnapshot } : null,
            createdAt: new Date().toISOString()
          };
          list.unshift(entry);
          writeList(SAVED_MATCH_RESULTS_KEY, list);
        }

        clearEditing();
        if (matchOpponent) matchOpponent.value = '';
        if (matchDate) matchDate.value = toTodayISO();
        resetMatchGameRows();
        setMatchFormationSnapshot(null);
        renderSavedRecords();
      });
    }

    if (btnClearMatch) {
      btnClearMatch.addEventListener('click', () => {
        clearEditing();
        if (matchOpponent) matchOpponent.value = '';
        if (matchDate) matchDate.value = toTodayISO();
        resetMatchGameRows();
        setMatchFormationSnapshot(null);
      });
    }

    const btnSaveDaily = document.getElementById('btn-save-daily');
    const btnClearDaily = document.getElementById('btn-clear-daily');

    if (btnSaveDaily) {
      btnSaveDaily.addEventListener('click', () => {
        const date = (dailyDate && dailyDate.value) ? dailyDate.value : '';
        const content = (dailyContent && dailyContent.value ? dailyContent.value : '').trim();

        if (!date || !content) {
          alert(tr('js_pn_alert_daily_required'));
          return;
        }

        const list = readList(SAVED_DAILY_NOTES_KEY);

        if (editingDailyId) {
          const idx = list.findIndex((d) => d.id === editingDailyId);
          if (idx === -1) {
            alert(tr('js_pn_alert_edit_missing'));
            clearEditing();
            return;
          }
          const prev = list[idx];
          list[idx] = {
            id: editingDailyId,
            type: 'daily',
            date,
            content,
            createdAt: prev.createdAt || new Date().toISOString()
          };
          writeList(SAVED_DAILY_NOTES_KEY, list);
        } else {
          const entry = {
            id: 'daily-' + Date.now(),
            type: 'daily',
            date,
            content,
            createdAt: new Date().toISOString()
          };
          list.unshift(entry);
          writeList(SAVED_DAILY_NOTES_KEY, list);
        }

        clearEditing();
        if (dailyContent) dailyContent.value = '';
        if (dailyDate) dailyDate.value = toTodayISO();
        renderSavedRecords();
      });
    }

    if (btnClearDaily) {
      btnClearDaily.addEventListener('click', () => {
        clearEditing();
        if (dailyContent) dailyContent.value = '';
        if (dailyDate) dailyDate.value = toTodayISO();
      });
    }

    syncEditUi();

    const recSearch = document.getElementById('saved-records-search');
    if (recSearch) {
      recSearch.addEventListener('input', function () {
        renderSavedRecords();
      });
    }

    if (!consumePendingMatchBoardIfAny()) {
      setMatchFormationSnapshot(null);
    }
  }

  function setup() {
    bindUi();
    renderSavedRecords();
  }

  document.addEventListener('DOMContentLoaded', setup);
  window.addEventListener('pageshow', function () {
    consumePendingMatchBoardIfAny();
  });
  window.addEventListener('soccerUserDataSynced', function () {
    renderSavedRecords();
  });

})();
