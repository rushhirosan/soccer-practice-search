/**
 * 練習メモ・メニュー帳
 * 選んだメニュー、メモ、練習ボード図、練習計画の保存・印刷
 */

(function () {
  'use strict';

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
