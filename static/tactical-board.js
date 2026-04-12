/**
 * 戦術ボード - 少年サッカーコーチ向け
 * Undo/Redo、記録ベースのアニメーション、ショートカット対応
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'soccer_tactical_board';
  const PITCH_COLOR = '#2d5016';
  const LINE_COLOR = '#ffffff';
  const PLAYER_COLORS = { home: '#3b82f6', away: '#ef4444' };
  const MAX_UNDO = 50;
  const DEFAULT_TACTICAL_FORMATION = '3-3-1';
  const DEFAULT_PRACTICE_FORMATIONS = ['1対1', '2対2', '3対3', '4対4', '5対5', '6対6', '7対7', '8人', '11人'];
  const TACTICAL_FORMATION_GROUPS = [
    { label: '11人制', options: ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1'] },
    { label: '8人制（少年）', options: ['3-3-1', '2-3-2', '3-2-2', '2-2-3'] },
  ];

  const FORMATIONS = {
    '4-4-2': [[50, 92], [25, 75], [40, 75], [60, 75], [75, 75], [25, 50], [40, 50], [60, 50], [75, 50], [40, 18], [60, 18]],
    '4-3-3': [[50, 92], [25, 75], [40, 75], [60, 75], [75, 75], [33, 50], [50, 50], [67, 50], [25, 18], [50, 18], [75, 18]],
    '3-5-2': [[50, 92], [25, 75], [50, 75], [75, 75], [20, 50], [40, 50], [50, 50], [60, 50], [80, 50], [40, 18], [60, 18]],
    '4-2-3-1': [[50, 92], [25, 75], [40, 75], [60, 75], [75, 75], [40, 58], [60, 58], [25, 35], [50, 35], [75, 35], [50, 12]],
    '2-3-2': [[50, 90], [35, 75], [65, 75], [25, 50], [50, 50], [75, 50], [40, 22], [60, 22]],
    '3-2-2': [[50, 90], [30, 72], [50, 72], [70, 72], [40, 52], [60, 52], [40, 25], [60, 25]],
    '2-2-3': [[50, 90], [38, 72], [62, 72], [40, 52], [60, 52], [25, 22], [50, 22], [75, 22]],
    '3-3-1': [[50, 90], [25, 72], [50, 72], [75, 72], [25, 48], [50, 48], [75, 48], [50, 18]],
  };

  let stage, pitchLayer, playersLayer, drawLayer, selectionLayer, previewLayer;
  let pitchWidth = 500, pitchHeight = 650;
  let drawStart = null;
  let previewArrow = null;
  let previewLine = null;
  let scenes = [];
  let currentSceneIndex = 0;
  let courtMode = '8';
  let boardType = 'practice';
  let tacticalFormation = DEFAULT_TACTICAL_FORMATION;
  let practiceFormation = '';
  let practiceFormationOptions = [...DEFAULT_PRACTICE_FORMATIONS];
  let animationId = null;
  let isPlaying = false;
  let undoStack = [];
  let redoStack = [];
  let selectedBoard = { players: new Set(), opponents: new Set(), balls: new Set(), arrows: new Set(), lines: new Set() };
  let marqueeStart = null;
  let marqueeRect = null;
  /** soccerUserDataSynced で localStorage の生文字列と比較し、同じなら再 setData しない */
  let lastAppliedBoardStorageRaw;

  /** メンバー仮登録。ピッチ配置時は players[].rosterId / label で紐づけ */
  let roster = [];
  let selectedRosterId = null;

  // Konva のステージ（キャンバス）を画面幅に合わせてスケールする（モバイル横溢れ防止）
  let stageFitScale = 1;
  let stageFitRafId = null;

  function fitStageToCanvasSection() {
    if (!stage) return;
    const canvasSection = document.getElementById('canvas-section');
    if (!canvasSection) return;

    const rect = canvasSection.getBoundingClientRect();
    const width = rect.width;
    if (!width || width <= 0) return;

    const scale = Math.min(1, width / pitchWidth);
    const nextScale = Math.max(0.35, scale);

    if (Math.abs(nextScale - stageFitScale) < 0.001) return;
    stageFitScale = nextScale;

    stage.width(pitchWidth * stageFitScale);
    stage.height(pitchHeight * stageFitScale);
    stage.scale({ x: stageFitScale, y: stageFitScale });

    stage.draw();
  }

  function scheduleFitStageToCanvasSection() {
    if (stageFitRafId) cancelAnimationFrame(stageFitRafId);
    stageFitRafId = requestAnimationFrame(fitStageToCanvasSection);
  }

  function newRosterId() {
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getUsedRosterIdsInCurrentScene() {
    const scene = scenes[currentSceneIndex];
    const used = new Set();
    (scene?.players || []).forEach(p => {
      if (p.rosterId) used.add(p.rosterId);
    });
    return used;
  }

  function isRosterIdUsedInAnyScene(rid) {
    if (!rid) return false;
    return scenes.some(s => (s.players || []).some(p => p.rosterId === rid));
  }

  function renderRosterPanel() {
    const listEl = document.getElementById('roster-bench-list');
    const hintEl = document.getElementById('roster-hint');
    if (!listEl) return;

    const used = getUsedRosterIdsInCurrentScene();
    const bench = roster.filter(r => !used.has(r.id));

    if (bench.length === 0) {
      listEl.innerHTML = '<p class="roster-bench-empty">出場メンバーはいません（未登録か、全員ピッチ上です）</p>';
    } else {
      listEl.innerHTML = bench.map(r => {
        const sel = r.id === selectedRosterId ? ' selected' : '';
        const eid = escapeHtml(r.id);
        const ename = escapeHtml(r.name);
        return (
          '<div class="roster-bench-row" role="listitem" data-roster-id="' + eid + '">' +
          '<button type="button" class="roster-bench-pick' + sel + '" data-roster-id="' + eid + '" title="選択して👤で配置">' +
          '<span class="roster-bench-name">' + ename + '</span></button>' +
          '<button type="button" class="roster-bench-delete" data-roster-id="' + eid + '" title="リストから削除" aria-label="削除">×</button>' +
          '</div>'
        );
      }).join('');
    }

    if (hintEl) {
      if (selectedRosterId) {
        const entry = roster.find(x => x.id === selectedRosterId);
        hintEl.textContent = entry
          ? '「' + entry.name + '」を配置: 👤でピッチをタップ（Escで解除）'
          : '一覧から選び、👤でピッチをタップして配置';
      } else {
        hintEl.textContent = '一覧から選び、👤でピッチをタップして配置';
      }
    }
  }

  function addRosterFromInput() {
    const input = document.getElementById('roster-name-input');
    if (!input) return;
    const name = String(input.value || '').trim().slice(0, 24);
    if (!name) return;
    roster.push({ id: newRosterId(), name });
    input.value = '';
    renderRosterPanel();
  }

  function getPlayerCircleText(p, index, r) {
    const raw = (p.label != null && String(p.label).trim() !== '') ? String(p.label).trim() : '';
    if (raw) {
      const chars = Array.from(raw);
      const text = chars.slice(0, 3).join('');
      const fontSize = text.length >= 3 ? Math.max(9, r * 0.5) : Math.max(10, r * 0.72);
      return { text, fontSize };
    }
    return { text: String(p.number ?? index + 1), fontSize: r * 0.9 };
  }

  function getCurrentTool() {
    const btn = document.querySelector('.tool-btn.active');
    return btn?.dataset?.tool || 'select';
  }

  function pushUndo() {
    const snapshot = getSceneSnapshot(scenes[currentSceneIndex]);
    if (snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
    }
  }

  function getSceneSnapshot(scene) {
    if (!scene) return null;
    return JSON.parse(JSON.stringify({
      players: scene.players || [],
      opponents: scene.opponents || [],
      balls: scene.balls || [],
      arrows: scene.arrows || [],
      lines: scene.lines || [],
    }));
  }

  function applySnapshot(scene, snapshot) {
    if (!scene || !snapshot) return;
    scene.players = (snapshot.players || []).map(p => ({ ...p }));
    scene.opponents = (snapshot.opponents || []).map(p => ({ ...p }));
    scene.balls = (snapshot.balls || []).map(b => ({ ...b }));
    scene.arrows = (snapshot.arrows || []).map(a => ({ ...a }));
    scene.lines = (snapshot.lines || []).map(l => ({ ...l }));
  }

  function undo() {
    if (undoStack.length === 0) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    pushRedo(scene);
    const snapshot = undoStack.pop();
    applySnapshot(scene, snapshot);
    renderCurrentScene();
    renderSequenceList();
  }

  function pushRedo(scene) {
    const snapshot = getSceneSnapshot(scene);
    if (snapshot) redoStack.push(snapshot);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    undoStack.push(getSceneSnapshot(scene));
    const snapshot = redoStack.pop();
    applySnapshot(scene, snapshot);
    renderCurrentScene();
    renderSequenceList();
  }

  function createEmptyScene() {
    return { id: 's-' + Date.now(), name: '', players: [], opponents: [], balls: [], arrows: [], lines: [] };
  }

  function mirrorFormation(positions) {
    return positions.map(([x, y]) => [x, 100 - y]);
  }

  function sortPracticeFormationOptions(values) {
    const uniqueValues = [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))];
    const versus = [];
    const people = [];
    const others = [];

    uniqueValues.forEach(value => {
      let match;
      if ((match = value.match(/^(\d+)対(\d+)$/))) {
        versus.push({ value, left: parseInt(match[1], 10), right: parseInt(match[2], 10) });
      } else if ((match = value.match(/^(\d+)人$/))) {
        people.push({ value, count: parseInt(match[1], 10) });
      } else {
        others.push(value);
      }
    });

    versus.sort((a, b) => a.left - b.left || a.right - b.right);
    people.sort((a, b) => a.count - b.count);
    others.sort((a, b) => a.localeCompare(b, 'ja'));

    return [...versus.map(item => item.value), ...people.map(item => item.value), ...others];
  }

  function parsePracticeFormation(value) {
    const normalized = String(value || '').trim();
    let match = normalized.match(/^(\d+)対(\d+)$/);
    if (match) {
      return { home: parseInt(match[1], 10), away: parseInt(match[2], 10) };
    }
    match = normalized.match(/^(\d+)人$/);
    if (match) {
      return { home: parseInt(match[1], 10), away: 0 };
    }
    return null;
  }

  function getPracticeRowDistribution(count) {
    if (count <= 0) return [];
    const rowCount = Math.min(4, Math.max(1, Math.ceil(count / 3)));
    const base = Math.floor(count / rowCount);
    const remainder = count % rowCount;
    return Array.from({ length: rowCount }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  function getPracticeRowXPositions(count) {
    if (count <= 0) return [];
    if (count === 1) return [50];
    const margin = count === 2 ? 35 : count === 3 ? 25 : count === 4 ? 18 : 12;
    const usableWidth = 100 - margin * 2;
    return Array.from({ length: count }, (_, index) => margin + (usableWidth * index) / (count - 1));
  }

  function createPracticePositions(count) {
    const rows = getPracticeRowDistribution(count);
    if (rows.length === 0) return [];
    const rowStart = 78;
    const rowEnd = 42;

    return rows.flatMap((playersInRow, rowIndex) => {
      const y = rows.length === 1 ? 72 : rowStart - ((rowStart - rowEnd) * rowIndex) / (rows.length - 1);
      return getPracticeRowXPositions(playersInRow).map(x => [x, y]);
    });
  }

  function createTeamFromPositions(positions, color) {
    return positions.map((position, index) => ({
      x: (position[0] / 100) * pitchWidth,
      y: (position[1] / 100) * pitchHeight,
      number: index + 1,
      color,
    }));
  }

  function renderTacticalFormationOptions(selectedValue) {
    const select = document.getElementById('formation-select');
    if (!select) return;

    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'フォーメーションを選択';
    select.appendChild(placeholder);

    TACTICAL_FORMATION_GROUPS.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.options.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        if (value === selectedValue) option.selected = true;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  function renderPracticeFormationOptions(selectedValue) {
    const select = document.getElementById('formation-select');
    if (!select) return;

    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '練習フォーメーションを選択';
    select.appendChild(placeholder);

    practiceFormationOptions.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === selectedValue) option.selected = true;
      select.appendChild(option);
    });
  }

  function updateBoardModeControls() {
    const boardTypeSelect = document.getElementById('board-type-select');
    const formationLabel = document.getElementById('formation-label');
    const formationHint = document.getElementById('formation-hint');

    if (boardTypeSelect) boardTypeSelect.value = boardType;

    if (boardType === 'practice') {
      if (formationLabel) formationLabel.textContent = '練習フォーメーション';
      if (formationHint) formationHint.textContent = 'ホーム検索の人数候補から選択';
      renderPracticeFormationOptions(practiceFormation);
    } else {
      if (formationLabel) formationLabel.textContent = 'フォーメーション';
      if (formationHint) formationHint.textContent = '戦術ボード用のフォーメーションを選択';
      renderTacticalFormationOptions(tacticalFormation);
    }
  }

  async function loadPracticeFormationOptions() {
    try {
      const response = await fetch('/get_unique_values/players');
      if (!response.ok) throw new Error('practice formation fetch failed');
      const data = await response.json();
      const parsedOptions = sortPracticeFormationOptions(data).filter(value => parsePracticeFormation(value));
      practiceFormationOptions = parsedOptions.length ? parsedOptions : [...DEFAULT_PRACTICE_FORMATIONS];
    } catch (_) {
      practiceFormationOptions = [...DEFAULT_PRACTICE_FORMATIONS];
    }

    if (boardType === 'practice') {
      if (!practiceFormation || !practiceFormationOptions.includes(practiceFormation)) {
        practiceFormation = practiceFormationOptions[0] || '';
      }
      renderPracticeFormationOptions(practiceFormation);
    }
  }

  function init(initialStorageRaw) {
    if (!document.getElementById('tactical-container')) return;

    roster = [];
    selectedRosterId = null;

    scenes = [createEmptyScene()];
    scenes[0].name = '1';
    currentSceneIndex = 0;
    undoStack = [];
    redoStack = [];

    stage = new Konva.Stage({
      container: 'tactical-container',
      width: pitchWidth,
      height: pitchHeight,
      draggable: false,
    });

    // 生成直後に初期スケールを当てる（スマホの横溢れ/操作しづらさを軽減）
    fitStageToCanvasSection();

    pitchLayer = new Konva.Layer();
    playersLayer = new Konva.Layer();
    drawLayer = new Konva.Layer();
    selectionLayer = new Konva.Layer();
    previewLayer = new Konva.Layer({ listening: false });
    stage.add(pitchLayer).add(playersLayer).add(drawLayer).add(selectionLayer).add(previewLayer);

    drawPitch();
    updateBoardModeControls();

    function ensureDefaultBallInCurrentScene() {
      const s = scenes[0];
      if (s && (!s.balls || s.balls.length === 0)) {
        s.balls = [{ x: pitchWidth * 0.57, y: pitchHeight * 0.49 }];
        renderCurrentScene();
      }
    }

    let loadedFromStorage = false;
    try {
      if (initialStorageRaw) {
        const d = JSON.parse(initialStorageRaw);
        if (d.scenes?.length) {
          setData(d);
          lastAppliedBoardStorageRaw = initialStorageRaw;
          loadedFromStorage = true;
        }
      }
    } catch (_) { /* 保存が壊れている場合は下のデフォルト初期化へ */ }

    if (!loadedFromStorage) {
      if (boardType === 'practice') {
        loadPracticeFormationOptions().then(() => {
          if (!practiceFormation) practiceFormation = practiceFormationOptions[0] || '';
          updateBoardModeControls();
          if (practiceFormation) applyPracticeFormation(practiceFormation);
          ensureDefaultBallInCurrentScene();
        });
      } else {
        applyFormation(tacticalFormation);
        applyOpponentFormation(tacticalFormation);
        ensureDefaultBallInCurrentScene();
        void loadPracticeFormationOptions();
      }
    } else {
      void loadPracticeFormationOptions();
    }

    setupEventListeners();
    setupKeyboardShortcuts();
    renderSequenceList();
    renderRosterPanel();
    const hint = document.getElementById('tool-hint');
    if (hint) hint.textContent = 'ドラッグで移動';
    const canvasSection = document.getElementById('canvas-section');
    if (canvasSection) canvasSection.classList.remove('place-mode');

    // 画面サイズ変更/回転に追従
    window.addEventListener('resize', scheduleFitStageToCanvasSection, { passive: true });
    window.addEventListener('orientationchange', scheduleFitStageToCanvasSection, { passive: true });
  }

  function drawPitch() {
    pitchLayer.destroyChildren();
    const w = pitchWidth, h = pitchHeight, lw = 3;
    const isEleven = courtMode === '11';
    const dims = isEleven ? {
      penaltyAreaWidth: w * 0.62,
      penaltyAreaDepth: h * 0.18,
      goalAreaWidth: w * 0.28,
      goalAreaDepth: h * 0.075,
      goalWidth: w * 0.112,
      goalDepth: h * 0.02,
      penaltySpotOffset: h * 0.12,
      cornerRadius: Math.min(w, h) * 0.035,
      centerCircleRadius: Math.min(w, h) * 0.12,
      penaltyArcRadius: Math.min(w, h) * 0.095,
      penaltyArcVerticalRadius: Math.min(w, h) * 0.135,
    } : {
      penaltyAreaWidth: w * 0.54,
      penaltyAreaDepth: h * 0.16,
      goalAreaWidth: w * 0.22,
      goalAreaDepth: h * 0.06,
      goalWidth: w * 0.09,
      goalDepth: h * 0.016,
      penaltySpotOffset: h * 0.105,
      cornerRadius: Math.min(w, h) * 0.03,
      centerCircleRadius: Math.min(w, h) * 0.1,
      penaltyArcRadius: Math.min(w, h) * 0.082,
      penaltyArcVerticalRadius: Math.min(w, h) * 0.118,
    };

    const rect = (x, y, width, height, extra = {}) => {
      pitchLayer.add(new Konva.Rect({
        x, y, width, height,
        listening: false,
        ...extra,
      }));
    };
    const line = (x1, y1, x2, y2) => {
      pitchLayer.add(new Konva.Line({ points: [x1, y1, x2, y2], stroke: LINE_COLOR, strokeWidth: lw, listening: false }));
    };

    const arc = (cx, cy, radius, startAngle, endAngle) => {
      pitchLayer.add(new Konva.Shape({
        stroke: LINE_COLOR,
        strokeWidth: lw,
        listening: false,
        sceneFunc(context, shape) {
          context.beginPath();
          context.arc(cx, cy, radius, startAngle, endAngle, false);
          context.strokeShape(shape);
        },
      }));
    };

    const spot = (x, y) => {
      pitchLayer.add(new Konva.Circle({
        x,
        y,
        radius: Math.max(2.8, lw * 0.9),
        fill: LINE_COLOR,
        listening: false,
      }));
    };

    const penaltyArc = (spotY, lineY, isTop) => {
      const rx = dims.penaltyArcRadius;
      const ry = dims.penaltyArcVerticalRadius;
      const ratio = Math.max(-1, Math.min(1, (lineY - spotY) / ry));
      const edgeAngle = Math.asin(ratio);
      const startAngle = isTop ? edgeAngle : Math.PI + Math.abs(edgeAngle);
      const endAngle = isTop ? Math.PI - edgeAngle : (Math.PI * 2) - Math.abs(edgeAngle);

      pitchLayer.add(new Konva.Shape({
        stroke: LINE_COLOR,
        strokeWidth: lw,
        listening: false,
        sceneFunc(context, shape) {
          context.beginPath();
          context.ellipse(w / 2, spotY, rx, ry, 0, startAngle, endAngle, false);
          context.strokeShape(shape);
        },
      }));
    };

    rect(0, 0, w, h, { fill: PITCH_COLOR });

    const stripeCount = 10;
    for (let i = 0; i < stripeCount; i += 1) {
      rect(0, (h / stripeCount) * i, w, h / stripeCount, {
        fill: i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)',
      });
    }

    rect(0, 0, w, h, { stroke: LINE_COLOR, strokeWidth: lw });
    line(0, h / 2, w, h / 2);

    pitchLayer.add(new Konva.Circle({
      x: w / 2,
      y: h / 2,
      radius: dims.centerCircleRadius,
      stroke: LINE_COLOR,
      strokeWidth: lw,
      listening: false,
    }));
    spot(w / 2, h / 2);

    const penaltyLeft = (w - dims.penaltyAreaWidth) / 2;
    const goalLeft = (w - dims.goalAreaWidth) / 2;
    const goalMouthLeft = (w - dims.goalWidth) / 2;

    rect(penaltyLeft, 0, dims.penaltyAreaWidth, dims.penaltyAreaDepth, { stroke: LINE_COLOR, strokeWidth: lw });
    rect(penaltyLeft, h - dims.penaltyAreaDepth, dims.penaltyAreaWidth, dims.penaltyAreaDepth, { stroke: LINE_COLOR, strokeWidth: lw });

    rect(goalLeft, 0, dims.goalAreaWidth, dims.goalAreaDepth, { stroke: LINE_COLOR, strokeWidth: lw });
    rect(goalLeft, h - dims.goalAreaDepth, dims.goalAreaWidth, dims.goalAreaDepth, { stroke: LINE_COLOR, strokeWidth: lw });

    rect(goalMouthLeft, 0, dims.goalWidth, dims.goalDepth, {
      stroke: LINE_COLOR,
      strokeWidth: lw,
      fill: 'rgba(255,255,255,0.08)',
    });
    rect(goalMouthLeft, h - dims.goalDepth, dims.goalWidth, dims.goalDepth, {
      stroke: LINE_COLOR,
      strokeWidth: lw,
      fill: 'rgba(255,255,255,0.08)',
    });

    spot(w / 2, dims.penaltySpotOffset);
    spot(w / 2, h - dims.penaltySpotOffset);

    penaltyArc(dims.penaltySpotOffset, dims.penaltyAreaDepth, true);
    penaltyArc(h - dims.penaltySpotOffset, h - dims.penaltyAreaDepth, false);

    arc(0, 0, dims.cornerRadius, 0, Math.PI / 2);
    arc(w, 0, dims.cornerRadius, Math.PI / 2, Math.PI);
    arc(w, h, dims.cornerRadius, Math.PI, Math.PI * 1.5);
    arc(0, h, dims.cornerRadius, Math.PI * 1.5, Math.PI * 2);

    pitchLayer.batchDraw();
  }

  function createPlayerNode(p, index) {
    const r = courtMode === '8' ? 16 : 20;
    const sel = isInSelection('players', index);
    const group = new Konva.Group({
      x: p.x, y: p.y,
      draggable: getCurrentTool() === 'select',
      playerIndex: index,
    });
    group.add(new Konva.Circle({
      radius: r, fill: p.color || PLAYER_COLORS.home, stroke: sel ? '#3b82f6' : '#1e293b', strokeWidth: sel ? 4 : 2,
    }));
    const circleLabel = getPlayerCircleText(p, index, r);
    group.add(new Konva.Text({
      text: circleLabel.text,
      fontSize: circleLabel.fontSize,
      fontFamily: 'Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif',
      fill: 'white',
      align: 'center', verticalAlign: 'middle', width: r * 2, height: r * 2, x: -r, y: -r, listening: false,
    }));
    group.on('dragstart', () => { group._startX = group.x(); group._startY = group.y(); });
    group.on('dragend', () => {
      const scene = scenes[currentSceneIndex];
      if (!scene?.players[index]) return;
      const dx = group.x() - group._startX, dy = group.y() - group._startY;
      if (selectedBoard.players.has(index)) {
        moveSelectedByDelta(dx, dy);
      } else {
        scene.players[index].x = group.x();
        scene.players[index].y = group.y();
      }
      pushUndo();
      renderCurrentScene();
    });
    group.on('click', (e) => {
      if (getCurrentTool() === 'delete') { removePlayer(index); return; }
      if (getCurrentTool() === 'select') {
        if (!e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) clearBoardSelection();
        selectedBoard.players.add(index);
        renderCurrentScene();
      }
    });
    return group;
  }


  function createBallNode(b, index) {
    const size = 28;
    const sel = isInSelection('balls', index);
    const group = new Konva.Group({ x: b.x, y: b.y, draggable: getCurrentTool() === 'select', ballIndex: index });
    if (sel) {
      const stroke = new Konva.Circle({ radius: size / 2 + 4, stroke: '#3b82f6', strokeWidth: 4, x: 0, y: 0, listening: false });
      group.add(stroke);
    }
    const txt = new Konva.Text({
      text: '⚽',
      fontSize: size,
      width: size,
      height: size,
      x: -size / 2,
      y: -size / 2,
      align: 'center',
      verticalAlign: 'middle',
      listening: true,
    });
    group.add(txt);

    group.on('dragstart', () => { group._startX = group.x(); group._startY = group.y(); });
    group.on('dragend', () => {
      const scene = scenes[currentSceneIndex];
      if (!scene?.balls?.[index]) return;
      const dx = group.x() - group._startX, dy = group.y() - group._startY;
      if (selectedBoard.balls.has(index)) {
        moveSelectedByDelta(dx, dy);
      } else {
        scene.balls[index].x = group.x();
        scene.balls[index].y = group.y();
      }
      pushUndo();
      renderCurrentScene();
    });
    group.on('click', (evt) => {
      if (getCurrentTool() === 'delete') { evt.cancelBubble = true; removeBall(index); return; }
      if (getCurrentTool() === 'select') {
        if (!evt.evt.shiftKey && !evt.evt.ctrlKey && !evt.evt.metaKey) clearBoardSelection();
        selectedBoard.balls.add(index);
        renderCurrentScene();
      }
    });
    return group;
  }

  function removePlayer(index) {
    const s = scenes[currentSceneIndex];
    if (s?.players[index]) { pushUndo(); s.players.splice(index, 1); renderCurrentScene(); renderSequenceList(); }
  }

  function removeOpponent(index) {
    const s = scenes[currentSceneIndex];
    if (s?.opponents?.[index]) { pushUndo(); s.opponents.splice(index, 1); renderCurrentScene(); renderSequenceList(); }
  }

  function createOpponentNode(p, index) {
    const r = courtMode === '8' ? 16 : 20;
    const sel = isInSelection('opponents', index);
    const group = new Konva.Group({
      x: p.x, y: p.y,
      draggable: getCurrentTool() === 'select',
      opponentIndex: index,
    });
    group.add(new Konva.Circle({
      radius: r, fill: p.color || PLAYER_COLORS.away, stroke: sel ? '#3b82f6' : '#1e293b', strokeWidth: sel ? 4 : 2,
    }));
    group.add(new Konva.Text({
      text: String(p.number ?? index + 1), fontSize: r * 0.9, fontFamily: 'Arial', fill: 'white',
      align: 'center', verticalAlign: 'middle', width: r * 2, height: r * 2, x: -r, y: -r, listening: false,
    }));
    group.on('dragstart', () => { group._startX = group.x(); group._startY = group.y(); });
    group.on('dragend', () => {
      const scene = scenes[currentSceneIndex];
      if (!scene?.opponents?.[index]) return;
      const dx = group.x() - group._startX, dy = group.y() - group._startY;
      if (selectedBoard.opponents.has(index)) {
        moveSelectedByDelta(dx, dy);
      } else {
        scene.opponents[index].x = group.x();
        scene.opponents[index].y = group.y();
      }
      pushUndo();
      renderCurrentScene();
    });
    group.on('click', (e) => {
      if (getCurrentTool() === 'delete') { removeOpponent(index); return; }
      if (getCurrentTool() === 'select') {
        if (!e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) clearBoardSelection();
        selectedBoard.opponents.add(index);
        renderCurrentScene();
      }
    });
    return group;
  }

  function applyOpponentFormation(key) {
    const pos = mirrorFormation(FORMATIONS[key] || []);
    if (pos.length === 0) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    if (!scene.opponents) scene.opponents = [];
    scene.opponents = pos.map((p, i) => ({ x: (p[0] / 100) * pitchWidth, y: (p[1] / 100) * pitchHeight, number: i + 1, color: PLAYER_COLORS.away }));
    renderCurrentScene();
    renderSequenceList();
  }

  function removeBall(index) {
    const s = scenes[currentSceneIndex];
    if (s?.balls?.[index]) { pushUndo(); s.balls.splice(index, 1); renderCurrentScene(); renderSequenceList(); }
  }

  function removeArrow(index) {
    const s = scenes[currentSceneIndex];
    if (s?.arrows[index]) { pushUndo(); s.arrows.splice(index, 1); renderCurrentScene(); renderSequenceList(); }
  }

  function removeLine(index) {
    const s = scenes[currentSceneIndex];
    if (s?.lines[index]) { pushUndo(); s.lines.splice(index, 1); renderCurrentScene(); renderSequenceList(); }
  }

  function deleteSelectedBoardItems() {
    const scene = scenes[currentSceneIndex];
    if (!scene || !hasBoardSelection()) return;

    pushUndo();

    scene.players = (scene.players || []).filter((_, i) => !selectedBoard.players.has(i));
    scene.opponents = (scene.opponents || []).filter((_, i) => !selectedBoard.opponents.has(i));
    scene.balls = (scene.balls || []).filter((_, i) => !selectedBoard.balls.has(i));
    scene.arrows = (scene.arrows || []).filter((_, i) => !selectedBoard.arrows.has(i));
    scene.lines = (scene.lines || []).filter((_, i) => !selectedBoard.lines.has(i));

    selectedBoard.players.clear();
    selectedBoard.opponents.clear();
    selectedBoard.balls.clear();
    selectedBoard.arrows.clear();
    selectedBoard.lines.clear();

    renderCurrentScene();
    renderSequenceList();
  }

  function renderCurrentScene() {
    playersLayer.destroyChildren();
    drawLayer.destroyChildren();
    const scene = scenes[currentSceneIndex];
    if (!scene) return;

    (scene.players || []).forEach((p, i) => playersLayer.add(createPlayerNode(p, i)));
    (scene.opponents || []).forEach((p, i) => playersLayer.add(createOpponentNode(p, i)));
    (scene.balls || []).forEach((b, i) => playersLayer.add(createBallNode(b, i)));
    (scene.arrows || []).forEach((arr, idx) => {
      const [x1, y1, x2, y2] = arr.points;
      const sel = isInSelection('arrows', idx);
      const grp = new Konva.Group({ x: x1, y: y1, draggable: getCurrentTool() === 'select', arrowIndex: idx });
      const arrow = new Konva.Arrow({
        points: [0, 0, x2 - x1, y2 - y1],
        stroke: arr.color || '#fbbf24', fill: arr.color || '#fbbf24',
        strokeWidth: sel ? 5 : 3, pointerLength: 10, pointerWidth: 10, listening: true,
      });
      grp.add(arrow);
      grp.on('dragstart', () => { grp._startX = grp.x(); grp._startY = grp.y(); });
      grp.on('dragend', () => {
        const sc = scenes[currentSceneIndex];
        if (!sc?.arrows?.[idx]) return;
        const dx = grp.x() - grp._startX, dy = grp.y() - grp._startY;
        if (selectedBoard.arrows.has(idx)) {
          moveSelectedByDelta(dx, dy);
        } else {
          const gx = grp.x(), gy = grp.y();
          sc.arrows[idx].points = [gx, gy, gx + (x2 - x1), gy + (y2 - y1)];
        }
        pushUndo();
        renderCurrentScene();
      });
      grp.on('click', (evt) => {
        if (getCurrentTool() === 'delete') { evt.cancelBubble = true; removeArrow(idx); return; }
        if (getCurrentTool() === 'select') {
          if (!evt.evt.shiftKey && !evt.evt.ctrlKey && !evt.evt.metaKey) clearBoardSelection();
          selectedBoard.arrows.add(idx);
          renderCurrentScene();
        }
      });
      drawLayer.add(grp);
    });
    (scene.lines || []).forEach((ln, idx) => {
      const [x1, y1, x2, y2] = ln.points;
      const sel = isInSelection('lines', idx);
      const grp = new Konva.Group({ x: x1, y: y1, draggable: getCurrentTool() === 'select', lineIndex: idx });
      const lineNode = new Konva.Line({
        points: [0, 0, x2 - x1, y2 - y1],
        stroke: ln.color || '#94a3b8', strokeWidth: sel ? 6 : 4, hitStrokeWidth: 16, listening: true,
      });
      grp.add(lineNode);
      grp.on('dragstart', () => { grp._startX = grp.x(); grp._startY = grp.y(); });
      grp.on('dragend', () => {
        const sc = scenes[currentSceneIndex];
        if (!sc?.lines?.[idx]) return;
        const dx = grp.x() - grp._startX, dy = grp.y() - grp._startY;
        if (selectedBoard.lines.has(idx)) {
          moveSelectedByDelta(dx, dy);
        } else {
          const gx = grp.x(), gy = grp.y();
          sc.lines[idx].points = [gx, gy, gx + (x2 - x1), gy + (y2 - y1)];
        }
        pushUndo();
        renderCurrentScene();
      });
      grp.on('click', (evt) => {
        if (getCurrentTool() === 'delete') { evt.cancelBubble = true; removeLine(idx); return; }
        if (getCurrentTool() === 'select') {
          if (!evt.evt.shiftKey && !evt.evt.ctrlKey && !evt.evt.metaKey) clearBoardSelection();
          selectedBoard.lines.add(idx);
          renderCurrentScene();
        }
      });
      drawLayer.add(grp);
    });

    playersLayer.getChildren().forEach(n => n.draggable(getCurrentTool() === 'select'));
    drawLayer.getChildren().forEach(n => n.draggable(getCurrentTool() === 'select'));
    playersLayer.batchDraw();
    drawLayer.batchDraw();
    renderSelectionBox();
    renderRosterPanel();
  }

  function applyFormation(key) {
    const pos = FORMATIONS[key];
    if (!pos) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    if (undoStack.length > 0 || scenes.some(s => (s.players?.length || 0) > 0 || (s.opponents?.length || 0) > 0)) pushUndo();
    scene.players = pos.map((p, i) => ({ x: (p[0] / 100) * pitchWidth, y: (p[1] / 100) * pitchHeight, number: i + 1, color: PLAYER_COLORS.home }));
    renderCurrentScene();
    renderSequenceList();
  }

  function applyPracticeFormation(key) {
    const parsed = parsePracticeFormation(key);
    if (!parsed) return;

    const scene = scenes[currentSceneIndex];
    if (!scene) return;

    if ((scene.players?.length || 0) > 0 || (scene.opponents?.length || 0) > 0) pushUndo();

    const homePositions = createPracticePositions(parsed.home);
    const awayPositions = parsed.away > 0 ? mirrorFormation(createPracticePositions(parsed.away)) : [];

    scene.players = createTeamFromPositions(homePositions, PLAYER_COLORS.home);
    scene.opponents = createTeamFromPositions(awayPositions, PLAYER_COLORS.away);

    clearBoardSelection();
    renderCurrentScene();
    renderSequenceList();
  }

  function addPlayerAt(x, y) {
    const s = scenes[currentSceneIndex];
    if (!s) return;
    pushUndo();
    const nextNum = (s.players?.length || 0) + 1;
    const base = { x, y, number: nextNum, color: PLAYER_COLORS.home };
    if (selectedRosterId) {
      const entry = roster.find(r => r.id === selectedRosterId);
      if (entry) {
        base.label = entry.name;
        base.rosterId = entry.id;
      }
      selectedRosterId = null;
    }
    s.players.push(base);
    renderCurrentScene();
    renderSequenceList();
  }

  function addBallAt(x, y) {
    const s = scenes[currentSceneIndex];
    if (!s) return;
    if (!s.balls) s.balls = [];
    pushUndo();
    s.balls.push({ x, y });
    renderCurrentScene();
    renderSequenceList();
  }

  function recordSnapshot() {
    const current = scenes[currentSceneIndex];
    if (!current) return;
    const snap = getSceneSnapshot(current);
    const newScene = { id: 's-' + Date.now(), name: String(scenes.length + 1), players: snap.players, opponents: snap.opponents, balls: snap.balls, arrows: snap.arrows, lines: snap.lines };
    scenes.push(newScene);
    currentSceneIndex = scenes.length - 1;
    undoStack = [];
    redoStack = [];
    renderCurrentScene();
    renderSequenceList();
  }

  function clearPreview() {
    previewArrow?.destroy();
    previewLine?.destroy();
    previewArrow = null;
    previewLine = null;
    marqueeRect?.destroy();
    marqueeRect = null;
    previewLayer.destroyChildren();
    previewLayer.batchDraw();
  }

  function clearBoardSelection() {
    selectedBoard.players.clear();
    selectedBoard.opponents.clear();
    selectedBoard.balls.clear();
    selectedBoard.arrows.clear();
    selectedBoard.lines.clear();
    renderCurrentScene();
  }

  function isInSelection(type, index) {
    return selectedBoard[type]?.has(index) || false;
  }

  function hasBoardSelection() {
    return selectedBoard.players.size > 0 || selectedBoard.opponents.size > 0 ||
      selectedBoard.balls.size > 0 || selectedBoard.arrows.size > 0 || selectedBoard.lines.size > 0;
  }

  function getSelectionBounds() {
    const scene = scenes[currentSceneIndex];
    if (!scene) return null;
    const r = courtMode === '8' ? 16 : 20;
    const ballSize = 14;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedBoard.players.forEach(i => {
      const p = scene.players?.[i];
      if (p) { minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r); maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r); }
    });
    selectedBoard.opponents.forEach(i => {
      const p = scene.opponents?.[i];
      if (p) { minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r); maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r); }
    });
    selectedBoard.balls.forEach(i => {
      const b = scene.balls?.[i];
      if (b) { minX = Math.min(minX, b.x - ballSize); minY = Math.min(minY, b.y - ballSize); maxX = Math.max(maxX, b.x + ballSize); maxY = Math.max(maxY, b.y + ballSize); }
    });
    selectedBoard.arrows.forEach(i => {
      const arr = scene.arrows?.[i];
      if (arr) {
        const [x1, y1, x2, y2] = arr.points;
        minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2); maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2);
      }
    });
    selectedBoard.lines.forEach(i => {
      const ln = scene.lines?.[i];
      if (ln) {
        const [x1, y1, x2, y2] = ln.points;
        minX = Math.min(minX, x1, x2); minY = Math.min(minY, y1, y2); maxX = Math.max(maxX, x1, x2); maxY = Math.max(maxY, y1, y2);
      }
    });
    if (minX === Infinity) return null;
    const pad = 8;
    return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }

  function renderSelectionBox() {
    selectionLayer.destroyChildren();
    if (!hasBoardSelection() || getCurrentTool() !== 'select') return;
    const b = getSelectionBounds();
    if (!b) return;
    const box = new Konva.Rect({
      x: b.x, y: b.y, width: b.width, height: b.height,
      stroke: '#3b82f6', strokeWidth: 2, dash: [6, 4], fill: 'rgba(59,130,246,0.08)',
      listening: true, draggable: true,
    });
    box.on('mouseenter', () => { document.body.style.cursor = 'move'; });
    box.on('mouseleave', () => { document.body.style.cursor = 'default'; });
    box.on('dragstart', () => {
      box._startX = box.x();
      box._startY = box.y();
      box._lastX = box.x();
      box._lastY = box.y();
    });
    box.on('dragmove', () => {
      const dx = box.x() - box._lastX;
      const dy = box.y() - box._lastY;
      if (dx === 0 && dy === 0) return;
      moveSelectedNodesPreview(dx, dy);
      box._lastX = box.x();
      box._lastY = box.y();
    });
    box.on('dragend', () => {
      const dx = box.x() - box._startX, dy = box.y() - box._startY;
      moveSelectedByDelta(dx, dy);
      pushUndo();
      renderCurrentScene();
    });
    selectionLayer.add(box);
    selectionLayer.batchDraw();
  }

  function rectIntersectsPoint(rx, ry, rw, rh, px, py) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  function selectByMarquee(x1, y1, x2, y2) {
    const l = Math.min(x1, x2), t = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    clearBoardSelection();
    if (w < 5 && h < 5) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    (scene.players || []).forEach((p, i) => {
      if (rectIntersectsPoint(l, t, w, h, p.x, p.y)) selectedBoard.players.add(i);
    });
    (scene.opponents || []).forEach((p, i) => {
      if (rectIntersectsPoint(l, t, w, h, p.x, p.y)) selectedBoard.opponents.add(i);
    });
    (scene.balls || []).forEach((b, i) => {
      if (rectIntersectsPoint(l, t, w, h, b.x, b.y)) selectedBoard.balls.add(i);
    });
    (scene.arrows || []).forEach((arr, i) => {
      const [ax1, ay1, ax2, ay2] = arr.points;
      const cx = (ax1 + ax2) / 2, cy = (ay1 + ay2) / 2;
      if (rectIntersectsPoint(l, t, w, h, cx, cy)) selectedBoard.arrows.add(i);
    });
    (scene.lines || []).forEach((ln, i) => {
      const [lx1, ly1, lx2, ly2] = ln.points;
      const cx = (lx1 + lx2) / 2, cy = (ly1 + ly2) / 2;
      if (rectIntersectsPoint(l, t, w, h, cx, cy)) selectedBoard.lines.add(i);
    });
    renderCurrentScene();
  }

  function moveSelectedByDelta(dx, dy) {
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    selectedBoard.players.forEach(i => {
      if (scene.players?.[i]) { scene.players[i].x += dx; scene.players[i].y += dy; }
    });
    selectedBoard.opponents.forEach(i => {
      if (scene.opponents?.[i]) { scene.opponents[i].x += dx; scene.opponents[i].y += dy; }
    });
    selectedBoard.balls.forEach(i => {
      if (scene.balls?.[i]) { scene.balls[i].x += dx; scene.balls[i].y += dy; }
    });
    selectedBoard.arrows.forEach(i => {
      const arr = scene.arrows?.[i];
      if (arr) arr.points = [arr.points[0] + dx, arr.points[1] + dy, arr.points[2] + dx, arr.points[3] + dy];
    });
    selectedBoard.lines.forEach(i => {
      const ln = scene.lines?.[i];
      if (ln) ln.points = [ln.points[0] + dx, ln.points[1] + dy, ln.points[2] + dx, ln.points[3] + dy];
    });
  }

  function moveSelectedNodesPreview(dx, dy) {
    playersLayer.getChildren().forEach(node => {
      const playerIndex = node.getAttr('playerIndex');
      const opponentIndex = node.getAttr('opponentIndex');
      const ballIndex = node.getAttr('ballIndex');
      if (playerIndex !== undefined && selectedBoard.players.has(playerIndex)) {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      } else if (opponentIndex !== undefined && selectedBoard.opponents.has(opponentIndex)) {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      } else if (ballIndex !== undefined && selectedBoard.balls.has(ballIndex)) {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      }
    });
    drawLayer.getChildren().forEach(node => {
      const arrowIndex = node.getAttr('arrowIndex');
      const lineIndex = node.getAttr('lineIndex');
      if (arrowIndex !== undefined && selectedBoard.arrows.has(arrowIndex)) {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      } else if (lineIndex !== undefined && selectedBoard.lines.has(lineIndex)) {
        node.x(node.x() + dx);
        node.y(node.y() + dy);
      }
    });
    playersLayer.batchDraw();
    drawLayer.batchDraw();
  }

  function setupEventListeners() {
    stage.on('mousedown touchstart', (e) => {
      const t = e.target, parent = t.getParent?.();
      const isPlayer = (t.getClassName?.() === 'Group' && (t.getAttr?.('playerIndex') !== undefined || t.getAttr?.('opponentIndex') !== undefined)) || parent?.getAttr?.('playerIndex') !== undefined || parent?.getAttr?.('opponentIndex') !== undefined;
      const isBall = (t.getClassName?.() === 'Group' && t.getAttr?.('ballIndex') !== undefined) || parent?.getAttr?.('ballIndex') !== undefined;
      const isDraw = t.getClassName?.() === 'Arrow' || t.getClassName?.() === 'Line' || parent?.getAttr?.('arrowIndex') !== undefined || parent?.getAttr?.('lineIndex') !== undefined;
      const isSelectionBox = parent === selectionLayer;
      if (isPlayer || isBall || isDraw || isSelectionBox) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      const tool = getCurrentTool();
      // 選手・ボールの配置は click/tap のみ（mousedown と併用すると同一クリックで2重追加になる）
      if (tool === 'arrow' || tool === 'line') {
        drawStart = { x: pos.x, y: pos.y };
      } else if (tool === 'select') {
        marqueeStart = { x: pos.x, y: pos.y };
      }
    });

    stage.on('mousemove touchmove', () => {
      const pos = stage.getPointerPosition();
      const tool = getCurrentTool();
      document.body.style.cursor = (drawStart || marqueeStart || tool === 'ball' || tool === 'player') ? 'crosshair' : 'default';

      if (marqueeStart && pos) {
        clearPreview();
        const l = Math.min(marqueeStart.x, pos.x), t = Math.min(marqueeStart.y, pos.y), w = Math.abs(pos.x - marqueeStart.x), h = Math.abs(pos.y - marqueeStart.y);
        marqueeRect?.destroy();
        marqueeRect = new Konva.Rect({ x: l, y: t, width: w, height: h, stroke: '#3b82f6', strokeWidth: 2, dash: [6, 4], fill: 'rgba(59,130,246,0.1)' });
        previewLayer.add(marqueeRect);
        previewLayer.batchDraw();
      } else if (drawStart && pos) {
        clearPreview();
        if (tool === 'arrow') {
          previewArrow = new Konva.Arrow({
            points: [drawStart.x, drawStart.y, pos.x, pos.y],
            stroke: '#fbbf24', fill: '#fbbf24', strokeWidth: 3, pointerLength: 10, pointerWidth: 10,
          });
          previewLayer.add(previewArrow);
        } else if (tool === 'line') {
          previewLine = new Konva.Line({
            points: [drawStart.x, drawStart.y, pos.x, pos.y],
            stroke: '#94a3b8', strokeWidth: 4,
          });
          previewLayer.add(previewLine);
        }
        previewLayer.batchDraw();
      }
    });

    stage.on('mouseup touchend', () => {
      const pos = stage.getPointerPosition();
      const tool = getCurrentTool();
      if (marqueeStart && pos) {
        selectByMarquee(marqueeStart.x, marqueeStart.y, pos.x, pos.y);
        marqueeStart = null;
        clearPreview();
      } else if (drawStart && pos && (tool === 'arrow' || tool === 'line')) {
        const dx = Math.abs(pos.x - drawStart.x);
        const dy = Math.abs(pos.y - drawStart.y);
        if (dx > 5 || dy > 5) {
          const s = scenes[currentSceneIndex];
          if (s) {
            pushUndo();
            if (tool === 'arrow') s.arrows.push({ points: [drawStart.x, drawStart.y, pos.x, pos.y], color: '#fbbf24' });
            else s.lines.push({ points: [drawStart.x, drawStart.y, pos.x, pos.y], color: '#94a3b8' });
            renderCurrentScene();
            renderSequenceList();
          }
        }
        drawStart = null;
        clearPreview();
      } else {
        drawStart = null;
        marqueeStart = null;
        clearPreview();
      }
    });

    stage.on('mouseleave', () => {
      if (drawStart || marqueeStart) { drawStart = null; marqueeStart = null; clearPreview(); }
    });

    document.addEventListener('mouseup', () => {
      if (drawStart || marqueeStart) { drawStart = null; marqueeStart = null; clearPreview(); }
    });

    stage.on('click tap', (e) => {
      if (drawStart) return;
      const t = e.target, parent = t.getParent?.();
      const isPlayer = (t.getClassName?.() === 'Group' && (t.getAttr?.('playerIndex') !== undefined || t.getAttr?.('opponentIndex') !== undefined)) || parent?.getAttr?.('playerIndex') !== undefined || parent?.getAttr?.('opponentIndex') !== undefined;
      const isBall = (t.getClassName?.() === 'Group' && t.getAttr?.('ballIndex') !== undefined) || parent?.getAttr?.('ballIndex') !== undefined;
      const isDraw = t.getClassName?.() === 'Arrow' || t.getClassName?.() === 'Line' || parent?.getAttr?.('arrowIndex') !== undefined || parent?.getAttr?.('lineIndex') !== undefined;
      if (isPlayer || isBall || isDraw) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      const tool = getCurrentTool();
      if (tool === 'player') addPlayerAt(pos.x, pos.y);
      else if (tool === 'ball') addBallAt(pos.x, pos.y);
    });

    const toolHints = { select: '四角で範囲選択、選択範囲をドラッグで一括移動', player: 'クリックで選手を追加', ball: 'クリックでボールを置く', arrow: 'ドラッグで矢印を描く', line: 'ドラッグでラインを描く', delete: 'クリックで削除' };
    const canvasSection = document.getElementById('canvas-section');
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        drawStart = null;
        marqueeStart = null;
        if (btn.dataset.tool !== 'select') clearBoardSelection();
        clearPreview();
        const tool = btn.dataset.tool;
        const hint = document.getElementById('tool-hint');
        if (hint) hint.textContent = toolHints[tool] || '';
        if (canvasSection) {
          const isPlace = tool === 'player' || tool === 'ball';
          const isDraw = tool === 'arrow' || tool === 'line';
          canvasSection.classList.toggle('place-mode', isPlace);
          canvasSection.classList.toggle('draw-mode', isDraw);
          canvasSection.dataset.hint = (tool === 'player' ? 'クリックで選手を追加' : tool === 'ball' ? 'クリックでボールを置く' : (tool === 'arrow' ? 'ドラッグで矢印' : tool === 'line' ? 'ドラッグでライン' : ''));
        }
        renderCurrentScene();
      });
    });

    document.getElementById('board-type-select')?.addEventListener('change', async (e) => {
      boardType = e.target.value === 'practice' ? 'practice' : 'tactical';
      if (boardType === 'practice') {
        await loadPracticeFormationOptions();
        if (!practiceFormation) practiceFormation = practiceFormationOptions[0] || '';
        updateBoardModeControls();
        if (practiceFormation) applyPracticeFormation(practiceFormation);
      } else {
        updateBoardModeControls();
        if (tacticalFormation) {
          applyFormation(tacticalFormation);
          applyOpponentFormation(tacticalFormation);
        }
      }
    });

    document.getElementById('formation-select')?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (!v) return;
      if (boardType === 'practice') {
        practiceFormation = v;
        applyPracticeFormation(v);
      } else {
        tacticalFormation = v;
        applyFormation(v);
        applyOpponentFormation(v);
      }
    });

    document.getElementById('court-mode')?.addEventListener('change', (e) => {
      courtMode = e.target.value;
      drawPitch();
      renderCurrentScene();
    });

    document.getElementById('btn-add-effect')?.addEventListener('click', recordSnapshot);

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      const s = scenes[currentSceneIndex];
      if (!s) return;
      if (!confirm('現在の配置を全てクリアしますか？')) return;
      pushUndo();
      s.players = [];
      s.opponents = [];
      s.balls = [];
      s.arrows = [];
      s.lines = [];
      renderCurrentScene();
      renderSequenceList();
    });

    document.getElementById('save-dropdown-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('save-dropdown-menu');
      menu.setAttribute('aria-hidden', menu.getAttribute('aria-hidden') === 'false' ? 'true' : 'false');
    });
    document.getElementById('save-dropdown-menu')?.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('save-dropdown-menu').setAttribute('aria-hidden', 'true');
        const a = btn.dataset.action;
        if (a === 'save') saveToStorage();
        else if (a === 'load') loadFromStorage();
        else if (a === 'export-json') exportJSON();
        else if (a === 'import') document.getElementById('file-input').click();
        else if (a === 'export-png') exportPNG();
        else if (a === 'add-to-notes') addToPracticeNotes();
      });
    });
    document.addEventListener('click', (e) => {
      if (!document.querySelector('.save-dropdown')?.contains(e.target)) document.getElementById('save-dropdown-menu')?.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('file-input')?.addEventListener('change', loadFromFile);

    document.getElementById('roster-add-btn')?.addEventListener('click', () => addRosterFromInput());
    document.getElementById('roster-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addRosterFromInput();
      }
    });
    document.getElementById('roster-bench-list')?.addEventListener('click', (e) => {
      const del = e.target.closest('.roster-bench-delete');
      if (del) {
        e.preventDefault();
        const rid = del.dataset.rosterId;
        if (!rid) return;
        if (isRosterIdUsedInAnyScene(rid)) {
          alert('このメンバーはピッチ上にいます。先にコマを削除するか、別の場面でピッチから外れていることを確認してからリストから削除してください。');
          return;
        }
        roster = roster.filter(r => r.id !== rid);
        if (selectedRosterId === rid) selectedRosterId = null;
        renderRosterPanel();
        return;
      }
      const pick = e.target.closest('.roster-bench-pick');
      if (pick) {
        const rid = pick.dataset.rosterId;
        if (!rid) return;
        selectedRosterId = selectedRosterId === rid ? null : rid;
        renderRosterPanel();
        if (selectedRosterId) document.querySelector('.tool-btn[data-tool="player"]')?.click();
      }
    });

    document.getElementById('btn-play')?.addEventListener('click', () => {
      isPlaying ? pauseAnimation() : playAnimation();
    });
    document.getElementById('btn-stop')?.addEventListener('click', stopAnimation);
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        selectedRosterId = null;
        clearBoardSelection();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if (e.key === 'y') { e.preventDefault(); redo(); }
      } else if (!e.target.matches('input, select, textarea')) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && hasBoardSelection()) {
          e.preventDefault();
          deleteSelectedBoardItems();
          return;
        }
        const k = e.key.toLowerCase();
        const tools = { v: 'select', p: 'player', b: 'ball', a: 'arrow', l: 'line', d: 'delete' };
        if (tools[k]) {
          const btn = document.querySelector(`.tool-btn[data-tool="${tools[k]}"]`);
          if (btn) { document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); if (k !== 'v') clearBoardSelection(); renderCurrentScene(); }
        }
        if (e.code === 'Space') { e.preventDefault(); isPlaying ? pauseAnimation() : playAnimation(); }
      }
    });
  }

  function renderSequenceList() {
    const list = document.getElementById('animation-list');
    if (!list) return;
    list.innerHTML = scenes.map((s, i) => `
      <div class="animation-item ${i === currentSceneIndex ? 'active' : ''}" data-index="${i}" draggable="true">
        <span class="animation-item-drag" title="ドラッグで順序変更">⋮⋮</span>
        <span class="animation-item-num">${i + 1}</span>
        <span class="animation-item-label">${s.name || 'フレーム ' + (i + 1)}</span>
        <button type="button" class="animation-item-delete" data-index="${i}" title="削除">×</button>
      </div>
    `).join('');
    list.querySelectorAll('.animation-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.animation-item-delete')) return;
        if (e.target.closest('.animation-item-drag')) return;
        currentSceneIndex = parseInt(el.dataset.index, 10);
        clearBoardSelection();
        renderCurrentScene();
        renderSequenceList();
      });
    });
    list.querySelectorAll('.animation-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        if (scenes.length <= 1) return;
        scenes.splice(idx, 1);
        if (currentSceneIndex >= scenes.length) currentSceneIndex = scenes.length - 1;
        else if (currentSceneIndex >= idx) currentSceneIndex = Math.max(0, currentSceneIndex - 1);
        renderCurrentScene();
        renderSequenceList();
        updatePlayButtonState();
      });
    });
    setupAnimationListDragDrop(list);
    updatePlayButtonState();
  }

  function setupAnimationListDragDrop(list) {
    let draggedIdx = null;
    list.querySelectorAll('.animation-item').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        draggedIdx = parseInt(el.dataset.index, 10);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedIdx));
      });
      el.addEventListener('dragend', () => {
        list.querySelectorAll('.animation-item').forEach(x => x.classList.remove('dragging', 'drag-over'));
        draggedIdx = null;
      });
      el.addEventListener('dragenter', (e) => e.preventDefault());
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedIdx === null) return;
        const targetIdx = parseInt(el.dataset.index, 10);
        if (targetIdx !== draggedIdx) {
          list.querySelectorAll('.animation-item').forEach(x => x.classList.remove('drag-over'));
          el.classList.add('drag-over');
        }
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        list.querySelectorAll('.animation-item').forEach(x => x.classList.remove('drag-over'));
        const targetIdx = parseInt(el.dataset.index, 10);
        if (draggedIdx === null || draggedIdx === targetIdx) return;
        const viewedScene = scenes[currentSceneIndex];
        const item = scenes.splice(draggedIdx, 1)[0];
        scenes.splice(targetIdx, 0, item);
        const newIdx = scenes.findIndex(s => s.id === viewedScene?.id);
        currentSceneIndex = newIdx >= 0 ? newIdx : 0;
        renderCurrentScene();
        renderSequenceList();
      });
    });
  }

  function updatePlayButtonState() {
    const playBtn = document.getElementById('btn-play');
    if (!playBtn) return;
    if (isPlaying) {
      playBtn.textContent = '一時停止';
      playBtn.classList.add('playing');
      playBtn.title = '一時停止 (Space)';
    } else {
      playBtn.textContent = '再生';
      playBtn.classList.remove('playing');
      playBtn.title = '再生 (Space)';
    }
  }

  function getData() {
    return {
      courtMode,
      boardType,
      tacticalFormation,
      practiceFormation,
      roster: roster.map(r => ({ id: r.id, name: r.name })),
      scenes: scenes.map(s => ({ ...s, players: [...(s.players || [])], opponents: [...(s.opponents || [])], balls: [...(s.balls || [])], arrows: [...(s.arrows || [])], lines: [...(s.lines || [])] })),
      currentSceneIndex,
    };
  }

  function setData(data) {
    courtMode = data.courtMode || '8';
    boardType = data.boardType === 'practice' ? 'practice' : 'tactical';
    tacticalFormation = data.tacticalFormation || DEFAULT_TACTICAL_FORMATION;
    practiceFormation = data.practiceFormation || '';
    roster = (Array.isArray(data.roster) ? data.roster : []).map(e => ({
      id: (e.id != null && String(e.id).trim()) ? String(e.id).trim() : newRosterId(),
      name: (e.name != null ? String(e.name) : '').trim().slice(0, 24),
    })).filter(e => e.name);
    selectedRosterId = null;
    clearBoardSelection();
    scenes = (data.scenes || [createEmptyScene()]).map(s => ({
      id: s.id || 's-' + Date.now(), name: s.name || '', players: s.players || [], opponents: s.opponents || [], balls: s.balls || [], arrows: s.arrows || [], lines: s.lines || [],
    }));
    currentSceneIndex = Math.min(data.currentSceneIndex || 0, Math.max(0, scenes.length - 1));
    scenes.forEach((s, i) => {
      if (!s.opponents?.length) {
        const pos = mirrorFormation(FORMATIONS['3-3-1'] || []);
        s.opponents = pos.map((p, j) => ({ x: (p[0] / 100) * pitchWidth, y: (p[1] / 100) * pitchHeight, number: j + 1, color: PLAYER_COLORS.away }));
      }
    });
    document.getElementById('court-mode').value = courtMode;
    updateBoardModeControls();
    loadPracticeFormationOptions();
    drawPitch();
    renderCurrentScene();
    renderSequenceList();
  }

  function saveToStorage() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getData())); lastAppliedBoardStorageRaw = localStorage.getItem(STORAGE_KEY); if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush(); alert('保存しました'); } catch (e) { alert('保存失敗: ' + e.message); } }
  function loadFromStorage() { try { const r = localStorage.getItem(STORAGE_KEY); if (!r) { alert('保存データがありません'); return; } setData(JSON.parse(r)); lastAppliedBoardStorageRaw = r; alert('読込ました'); } catch (e) { alert('読込失敗: ' + e.message); } }
  function loadFromFile(e) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { setData(JSON.parse(ev.target.result)); alert('読込ました'); } catch (err) { alert('読込失敗'); } }; r.readAsText(f); e.target.value = ''; }
  function exportJSON() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' })); a.download = 'tactical-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(a.href); }
  function exportPNG() { const a = document.createElement('a'); a.href = stage.toDataURL({ pixelRatio: 2 }); a.download = 'tactical-' + new Date().toISOString().slice(0, 10) + '.png'; a.click(); }

  function addToPracticeNotes() {
    try {
      const imageDataUrl = stage.toDataURL({ pixelRatio: 2 });
      const boardData = getData();
      const payload = { imageDataUrl, boardData, savedAt: new Date().toISOString() };
      localStorage.setItem('soccer_pending_board_for_plan', JSON.stringify(payload)); if (typeof window.soccerScheduleUserDataPush === 'function') window.soccerScheduleUserDataPush();
      alert('メニュー帳に追加する準備ができました。\n練習メモ帳ページで「ボード図を取り込む」をクリックしてください。');
      window.location.href = '/practice-notes';
    } catch (e) {
      alert('エラー: ' + (e.message || '処理に失敗しました'));
    }
  }

  function playAnimation() {
    if (scenes.length === 0) return;
    isPlaying = true;
    updatePlayButtonState();
    let idx = 0;
    const sec = parseFloat(document.getElementById('anim-speed')?.value || 1);
    const dur = Math.round(sec * 1000);
    function anim() {
      if (!isPlaying) return;
      currentSceneIndex = idx;
      renderCurrentScene();
      renderSequenceList();
      idx = (idx + 1) % scenes.length;
      animationId = setTimeout(anim, dur);
    }
    anim();
  }

  function pauseAnimation() {
    isPlaying = false;
    if (animationId) { clearTimeout(animationId); animationId = null; }
    updatePlayButtonState();
  }

  function stopAnimation() {
    pauseAnimation();
    currentSceneIndex = 0;
    renderCurrentScene();
    renderSequenceList();
  }

  document.addEventListener('DOMContentLoaded', () => {
    let initialRaw = null;
    try {
      initialRaw = localStorage.getItem(STORAGE_KEY);
    } catch (_) {}
    init(initialRaw);
    /* user-sync の applyPayload のたびに発火するが、内容が同じなら setData しない（ログイン直後のちらつき防止） */
    window.addEventListener('soccerUserDataSynced', () => {
      try {
        const r = localStorage.getItem(STORAGE_KEY);
        if (!r) {
          if (lastAppliedBoardStorageRaw === undefined) return;
          lastAppliedBoardStorageRaw = undefined;
          location.reload();
          return;
        }
        if (r === lastAppliedBoardStorageRaw) return;
        const d = JSON.parse(r);
        if (!d.scenes?.length) return;
        setData(d);
        lastAppliedBoardStorageRaw = r;
      } catch (_) {
        if (lastAppliedBoardStorageRaw !== undefined) location.reload();
      }
    });
  });
})();
