/**
 * 練習メモ・メニュー帳
 * 選んだメニュー、メモ、練習ボード図、練習計画の保存・印刷
 */

(function () {
  'use strict';

  // 新UI（試合結果 / 気づき）: `practice_notes.html` の場合のみこちらを有効化
  if (document.getElementById('saved-records-container')) {
    const SAVED_MATCH_RESULTS_KEY = 'soccer_saved_match_results';
    const SAVED_DAILY_NOTES_KEY = 'soccer_saved_daily_notes';

    function pad2(n) {
      return String(n).padStart(2, '0');
    }

    function toTodayISO() {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text || '';
      return div.innerHTML;
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
        console.warn('保存失敗:', e);
      }
    }

    function formatISOToJa(isoDate) {
      try {
        if (!isoDate) return '-';
        // isoDate = YYYY-MM-DD
        const [y, m, d] = isoDate.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('ja-JP');
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

    function renderSavedRecords() {
      const container = document.getElementById('saved-records-container');
      const empty = document.getElementById('empty-records');
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

      container.innerHTML = '';

      if (all.length === 0) {
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      const grouped = groupByDate(all);
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
          badge.textContent = entry.type === 'match' ? '試合結果' : '日々の気づき';

          const title = document.createElement('div');
          title.className = 'record-title';
          if (entry.type === 'match') {
            const opponent = entry.opponent ? `vs ${entry.opponent}` : 'vs（未設定）';
            const score = entry.score ? ` / ${entry.score}` : '';
            title.textContent = `${opponent}${score}`;
          } else {
            title.textContent = '今日の気づき';
          }

          left.appendChild(badge);
          left.appendChild(title);

          const actions = document.createElement('div');
          actions.className = 'record-actions no-print';

          const printBtn = document.createElement('button');
          printBtn.type = 'button';
          printBtn.textContent = '印刷';
          printBtn.addEventListener('click', () => printEntry(entry));

          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = '削除';
          deleteBtn.addEventListener('click', () => deleteEntry(entry.type, entry.id));

          actions.appendChild(printBtn);
          actions.appendChild(deleteBtn);

          header.appendChild(left);
          header.appendChild(actions);

          const summary = document.createElement('div');
          summary.className = 'record-summary';
          if (entry.type === 'match') {
            summary.textContent = entry.events || '';
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
      if (!confirm('この記録を削除しますか？')) return;

      if (type === 'match') {
        const matches = readList(SAVED_MATCH_RESULTS_KEY).filter((m) => m.id !== id);
        writeList(SAVED_MATCH_RESULTS_KEY, matches);
      } else {
        const daily = readList(SAVED_DAILY_NOTES_KEY).filter((d) => d.id !== id);
        writeList(SAVED_DAILY_NOTES_KEY, daily);
      }
      renderSavedRecords();
    }

    function buildPrintHtmlMatch(entry) {
      const dateStr = formatISOToJa(entry.date);
      const opponent = entry.opponent || '-';
      const score = entry.score || '-';
      const events = entry.events || '';

      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>試合結果（${escapeHtml(dateStr)}）</title>
  <style>
    body { font-family: sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 6px; }
    .meta { color: #666; margin-bottom: 14px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>試合結果</h1>
  <div class="meta">${escapeHtml(dateStr)} / ${escapeHtml(opponent)} / ${escapeHtml(score)}</div>
  <h2 style="font-size:16px;margin:12px 0 8px;">得点者・失点者 / 主な出来事</h2>
  <div class="box">${escapeHtml(events)}</div>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;
    }

    function buildPrintHtmlDaily(entry) {
      const dateStr = formatISOToJa(entry.date);
      const content = entry.content || '';
      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>日々の気づき（${escapeHtml(dateStr)}）</title>
  <style>
    body { font-family: sans-serif; padding: 24px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 6px; }
    .meta { color: #666; margin-bottom: 14px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 12px 14px; white-space: pre-wrap; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>日々の気づき</h1>
  <div class="meta">${escapeHtml(dateStr)}</div>
  <div class="box">${escapeHtml(content)}</div>
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;
    }

    function printEntry(entry) {
      const w = window.open('', '_blank');
      if (!w) {
        alert('印刷ウィンドウを開けませんでした。ポップアップを許可してください。');
        return;
      }
      const html = entry.type === 'match' ? buildPrintHtmlMatch(entry) : buildPrintHtmlDaily(entry);
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try { w.print(); } catch (_) {}
        try { w.close(); } catch (_) {}
      }, 300);
    }

    function bindUi() {
      // tabs
      const tabBtns = document.querySelectorAll('.notes-tab');
      const panels = document.querySelectorAll('.notes-tab-panel');
      tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          tabBtns.forEach((b) => {
            b.classList.remove('is-active');
            b.setAttribute('aria-selected', 'false');
          });
          panels.forEach((p) => p.classList.remove('is-active'));

          btn.classList.add('is-active');
          btn.setAttribute('aria-selected', 'true');
          const targetId = btn.getAttribute('data-target');
          const panel = document.getElementById(targetId);
          panel && panel.classList.add('is-active');
        });
      });

      const matchDate = document.getElementById('match-date');
      const matchOpponent = document.getElementById('match-opponent');
      const matchScore = document.getElementById('match-score');
      const matchEvents = document.getElementById('match-events');

      const dailyDate = document.getElementById('daily-date');
      const dailyContent = document.getElementById('daily-content');

      if (matchDate) matchDate.value = toTodayISO();
      if (dailyDate) dailyDate.value = toTodayISO();

      const btnSaveMatch = document.getElementById('btn-save-match');
      const btnClearMatch = document.getElementById('btn-clear-match');

      if (btnSaveMatch) {
        btnSaveMatch.addEventListener('click', () => {
          const date = (matchDate && matchDate.value) ? matchDate.value : '';
          const opponent = (matchOpponent && matchOpponent.value ? matchOpponent.value : '').trim();
          const score = (matchScore && matchScore.value ? matchScore.value : '').trim();
          const events = (matchEvents && matchEvents.value ? matchEvents.value : '').trim();

          if (!date || !opponent || !score || !events) {
            alert('日付・対戦相手・勝敗/スコア・出来事を入力してください。');
            return;
          }

          const entry = {
            id: 'match-' + Date.now(),
            type: 'match',
            date,
            opponent,
            score,
            events,
            createdAt: new Date().toISOString()
          };

          const list = readList(SAVED_MATCH_RESULTS_KEY);
          list.unshift(entry);
          writeList(SAVED_MATCH_RESULTS_KEY, list);

          if (matchOpponent) matchOpponent.value = '';
          if (matchScore) matchScore.value = '';
          if (matchEvents) matchEvents.value = '';
          if (matchDate) matchDate.value = toTodayISO();

          renderSavedRecords();
        });
      }

      if (btnClearMatch) {
        btnClearMatch.addEventListener('click', () => {
          if (matchOpponent) matchOpponent.value = '';
          if (matchScore) matchScore.value = '';
          if (matchEvents) matchEvents.value = '';
          if (matchDate) matchDate.value = toTodayISO();
        });
      }

      const btnSaveDaily = document.getElementById('btn-save-daily');
      const btnClearDaily = document.getElementById('btn-clear-daily');

      if (btnSaveDaily) {
        btnSaveDaily.addEventListener('click', () => {
          const date = (dailyDate && dailyDate.value) ? dailyDate.value : '';
          const content = (dailyContent && dailyContent.value ? dailyContent.value : '').trim();

          if (!date || !content) {
            alert('日付とメモ本文を入力してください。');
            return;
          }

          const entry = {
            id: 'daily-' + Date.now(),
            type: 'daily',
            date,
            content,
            createdAt: new Date().toISOString()
          };

          const list = readList(SAVED_DAILY_NOTES_KEY);
          list.unshift(entry);
          writeList(SAVED_DAILY_NOTES_KEY, list);

          if (dailyContent) dailyContent.value = '';
          if (dailyDate) dailyDate.value = toTodayISO();
          renderSavedRecords();
        });
      }

      if (btnClearDaily) {
        btnClearDaily.addEventListener('click', () => {
          if (dailyContent) dailyContent.value = '';
          if (dailyDate) dailyDate.value = toTodayISO();
        });
      }
    }

    function setup() {
      bindUi();
      renderSavedRecords();
    }

    document.addEventListener('DOMContentLoaded', setup);
    return;
  }

  const SELECTED_MENUS_KEY = 'soccer_selected_menus';
  const SAVED_PLANS_KEY = 'soccer_saved_practice_plans';
  const PENDING_BOARD_KEY = 'soccer_pending_board_for_plan';

  function getSelectedMenus() {
    try {
      const s = localStorage.getItem(SELECTED_MENUS_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }

  function saveSelectedMenus(items) {
    try {
      localStorage.setItem(SELECTED_MENUS_KEY, JSON.stringify(items));
      if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
      return true;
    } catch (e) {
      console.warn('保存失敗:', e);
      return false;
    }
  }

  function getSavedPlans() {
    try {
      const s = localStorage.getItem(SAVED_PLANS_KEY);
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }

  function savePlans(plans) {
    try {
      localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans));
      if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
      return true;
    } catch (e) {
      console.warn('保存失敗:', e);
      return false;
    }
  }

  function getPendingBoard() {
    try {
      const s = localStorage.getItem(PENDING_BOARD_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  }

  function clearPendingBoard() {
    try {
      localStorage.removeItem(PENDING_BOARD_KEY);
    } catch (_) {}
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function renderSelectedMenus() {
    const list = document.getElementById('selected-menus-list');
    const empty = document.getElementById('empty-selected');
    const actions = document.getElementById('selected-actions');
    if (!list || !empty || !actions) return;

    const items = getSelectedMenus();
    list.innerHTML = '';

    if (items.length === 0) {
      empty.style.display = 'block';
      actions.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    actions.style.display = 'flex';

    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'menu-item';
      div.innerHTML = `
        <div class="menu-item-header">
          <span class="menu-item-title">${escapeHtml(item.title)}</span>
          <button type="button" class="menu-item-remove" data-idx="${idx}" aria-label="削除">削除</button>
        </div>
        <textarea class="menu-item-memo" placeholder="メモを入力..." data-idx="${idx}">${escapeHtml(item.memo || '')}</textarea>
      `;
      list.appendChild(div);
    });

    list.querySelectorAll('.menu-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const items = getSelectedMenus();
        items.splice(idx, 1);
        saveSelectedMenus(items);
        renderSelectedMenus();
      });
    });

    list.querySelectorAll('.menu-item-memo').forEach(ta => {
      let saveTimer;
      const saveMemo = () => {
        const idx = parseInt(ta.dataset.idx, 10);
        const items = getSelectedMenus();
        if (items[idx]) {
          items[idx].memo = ta.value;
          saveSelectedMenus(items);
        }
      };
      ta.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveMemo, 300);
      });
      ta.addEventListener('change', saveMemo);
    });
  }

  function renderSavedPlans() {
    const ul = document.getElementById('saved-plans-list');
    const empty = document.getElementById('empty-plans');
    if (!ul || !empty) return;

    const plans = getSavedPlans();
    ul.innerHTML = '';

    if (plans.length === 0) {
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';

    plans.forEach((plan, idx) => {
      const li = document.createElement('li');
      li.className = 'plan-card';
      const dateStr = plan.date ? new Date(plan.date).toLocaleDateString('ja-JP') : '-';
      let boardHtml = '';
      if (plan.boardImage) {
        boardHtml = `<img src="${plan.boardImage}" alt="ボード図" class="board-preview" style="max-width:200px;max-height:120px;">`;
      }
      li.innerHTML = `
        <div class="plan-card-header">
          <span class="plan-card-title">${escapeHtml(plan.title || '無題')}</span>
          <span class="plan-card-date">${escapeHtml(dateStr)}</span>
        </div>
        <p style="font-size:0.9rem;color:var(--text-secondary);">${plan.items ? plan.items.length : 0} メニュー</p>
        ${boardHtml}
        <div class="plan-card-actions no-print">
          <button type="button" class="btn-secondary plan-print-btn" data-idx="${idx}">印刷</button>
          <button type="button" class="btn-secondary plan-delete-btn" data-idx="${idx}">削除</button>
        </div>
      `;
      ul.appendChild(li);
    });

    ul.querySelectorAll('.plan-print-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const plans = getSavedPlans();
        if (plans[idx]) printPlan(plans[idx]);
      });
    });

    ul.querySelectorAll('.plan-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('この練習計画を削除しますか？')) return;
        const idx = parseInt(btn.dataset.idx, 10);
        const plans = getSavedPlans();
        plans.splice(idx, 1);
        savePlans(plans);
        renderSavedPlans();
      });
    });
  }

  function importBoard() {
    const board = getPendingBoard();
    if (!board) {
      alert('ボードから取り込むデータがありません。\nまずボードページで図を描き、「この図をメニュー帳に追加」をクリックしてください。');
      return;
    }
    window.currentBoardData = board;
    clearPendingBoard();
    alert('ボード図を取り込みました。練習計画として保存すると、この図も一緒に保存されます。');
  }

  function openSaveModal() {
    document.getElementById('save-plan-modal').style.display = 'flex';
    document.getElementById('plan-title-input').value = '';
    document.getElementById('plan-title-input').focus();
  }

  function closeSaveModal() {
    document.getElementById('save-plan-modal').style.display = 'none';
  }

  function savePlan() {
    const title = (document.getElementById('plan-title-input').value || '').trim() || '無題の練習計画';
    const items = getSelectedMenus();
    if (items.length === 0) {
      alert('選んだメニューがありません。');
      return;
    }

    const plan = {
      id: 'plan-' + Date.now(),
      title,
      date: new Date().toISOString(),
      items: items.map(it => ({ ...it })),
      boardImage: null,
      boardData: null,
    };

    if (window.currentBoardData && window.currentBoardData.imageDataUrl) {
      plan.boardImage = window.currentBoardData.imageDataUrl;
      plan.boardData = window.currentBoardData.boardData;
    } else {
      const pending = getPendingBoard();
      if (pending && pending.imageDataUrl) {
        plan.boardImage = pending.imageDataUrl;
        plan.boardData = pending.boardData;
        clearPendingBoard();
      }
    }

    const plans = getSavedPlans();
    plans.unshift(plan);
    savePlans(plans);
    window.currentBoardData = null;
    closeSaveModal();
    renderSavedPlans();
  }

  function printCurrentSelection() {
    const items = getSelectedMenus();
    if (items.length === 0) {
      alert('印刷するメニューがありません。');
      return;
    }

    const board = getPendingBoard() || window.currentBoardData;
    const printContent = buildPrintHtml(items, board);
    const w = window.open('', '_blank');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
  }

  function printPlan(plan) {
    const printContent = buildPrintHtml(plan.items || [], plan.boardImage ? { imageDataUrl: plan.boardImage } : null);
    const w = window.open('', '_blank');
    w.document.write(printContent);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
  }

  function buildPrintHtml(items, boardInfo) {
    const dateStr = new Date().toLocaleDateString('ja-JP');
    let itemsHtml = items.map((it, i) => `
      <div style="margin-bottom:1rem;padding:0.75rem;border:1px solid #ddd;border-radius:8px;">
        <strong>${i + 1}. ${escapeHtml(it.title)}</strong>
        ${it.channel_category ? `<p style="font-size:0.9em;color:#666;">${escapeHtml(it.channel_category)}</p>` : ''}
        ${it.memo ? `<p style="margin-top:0.5rem;white-space:pre-wrap;">${escapeHtml(it.memo)}</p>` : ''}
      </div>
    `).join('');

    let boardHtml = '';
    if (boardInfo && boardInfo.imageDataUrl) {
      boardHtml = `<div style="margin-top:1.5rem;page-break-inside:avoid;"><h3>練習ボード図</h3><img src="${boardInfo.imageDataUrl}" alt="ボード図" style="max-width:100%;max-height:400px;border:1px solid #ddd;"></div>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>練習メニュー帳 - ${dateStr}</title></head><body style="font-family:sans-serif;padding:2rem;max-width:800px;margin:0 auto;">
      <h1>練習メニュー帳</h1>
      <p style="color:#666;">${dateStr}</p>
      <h2>メニュー一覧</h2>
      ${itemsHtml}
      ${boardHtml}
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;
  }

  function setup() {
    renderSelectedMenus();
    renderSavedPlans();

    document.getElementById('btn-import-board')?.addEventListener('click', importBoard);
    document.getElementById('btn-save-plan')?.addEventListener('click', openSaveModal);
    document.getElementById('btn-print')?.addEventListener('click', printCurrentSelection);
    document.getElementById('btn-cancel-save')?.addEventListener('click', closeSaveModal);
    document.getElementById('btn-confirm-save')?.addEventListener('click', savePlan);
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
