import { HORSE_TYPES } from './horses.js';
import { GameState } from './game.js';
import { Renderer } from './renderer.js';
import { getCommentary } from './gemini.js';

let game = null;
let renderer = null;
let apiKey = '';
let selectedHorseIndices = HORSE_TYPES.map((_, i) => i);
let jockeyNames = HORSE_TYPES.map(() => '');
let rafId = null;
let lastTime = 0;
let isPaused = false;
let resultQueued = false;
let commentaryTimer = 0;
let commentaryBusy = false;
let lastCommentaryTime = -Infinity;
const COMMENTARY_INTERVAL = 10;
const GAME_TIME_SCALE = 0.82;

const panKeysPressed = new Set();
let isDragging = false;
let lastDragX = 0;
const PAN_KEY_SPEED = 35; // meters per second

// ── Setup Screen ────────────────────────────────────────────────
function buildSetup() {
  const countRow = document.getElementById('count-buttons');
  countRow.innerHTML = `
    <button class="count-btn" id="select-all-btn">전체 선택</button>
    <button class="count-btn" id="clear-selection-btn">선택 해제</button>
  `;
  document.getElementById('select-all-btn').addEventListener('click', () => {
    collectJockeyNames();
    selectedHorseIndices = HORSE_TYPES.map((_, i) => i);
    buildHorseCards();
  });
  document.getElementById('clear-selection-btn').addEventListener('click', () => {
    collectJockeyNames();
    selectedHorseIndices = [];
    buildHorseCards();
  });
  buildHorseCards();
}

function collectJockeyNames() {
  document.querySelectorAll('.jockey-input').forEach(input => {
    const index = Number(input.dataset.horseIndex);
    if (Number.isInteger(index)) {
      jockeyNames[index] = input.value.trim();
    }
  });
}

function buildHorseCards() {
  const container = document.getElementById('horse-cards');
  container.innerHTML = '';
  HORSE_TYPES.forEach((h, i) => {
    const selected = selectedHorseIndices.includes(i);
    const card = document.createElement('div');
    card.className = 'horse-card' + (selected ? ' selected' : '');
    const abilityHtml = h.ability ? `
      <div class="ability-block" style="border-color:${h.color}33">
        <div class="ability-tag" style="color:${h.color}">${h.ability.icon} ${h.ability.name}</div>
        <div class="ability-desc">${h.ability.description}</div>
      </div>` : '';
    card.innerHTML = `
      <div class="horse-card-header">
        <label class="horse-select">
          <input class="horse-select-input" data-horse-index="${i}" type="checkbox" ${selected ? 'checked' : ''}>
          <span></span>
        </label>
        <div class="horse-dot" style="background:${h.color}"></div>
        <div>
          <div class="horse-name">${h.name}</div>
          <span class="trait-badge">${h.trait}</span>
        </div>
      </div>
      <div class="horse-desc">${h.description}</div>
      ${abilityHtml}
      <label class="jockey-field">
        <span class="horse-jockey">기수 이름</span>
        <input class="jockey-input" data-horse-index="${i}" type="text" value="${jockeyNames[i] ?? ''}" placeholder="기수 이름 입력">
      </label>`;
    container.appendChild(card);
  });

  container.querySelectorAll('.horse-select-input').forEach(input => {
    input.addEventListener('change', () => {
      collectJockeyNames();
      selectedHorseIndices = [...container.querySelectorAll('.horse-select-input')]
        .filter(el => el.checked)
        .map(el => Number(el.dataset.horseIndex));
      buildHorseCards();
    });
  });
}

function runTestSimulation(raceCount = 10000) {
  collectJockeyNames();

  const summaryEl = document.getElementById('test-summary');
  const resultsEl = document.getElementById('test-results');

  if (selectedHorseIndices.length === 0) {
    summaryEl.textContent = '참전할 말을 최소 1마리 선택해주세요.';
    resultsEl.innerHTML = '';
    return;
  }

  const stats = new Map(selectedHorseIndices.map(index => {
    const horseType = HORSE_TYPES[index];
    return [horseType.id, {
      name: horseType.name,
      color: horseType.color,
      places: Array(selectedHorseIndices.length).fill(0),
    }];
  }));

  for (let i = 0; i < raceCount; i++) {
    const sim = new GameState(selectedHorseIndices, jockeyNames);
    while (!sim.isFinished) sim.update(0.25);

    [...sim.horses]
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .forEach((horse, rankIndex) => {
        stats.get(horse.type.id).places[rankIndex]++;
      });
  }

  renderTestResults([...stats.values()], raceCount);
}

function renderTestResults(rows, raceCount) {
  const summaryEl = document.getElementById('test-summary');
  const resultsEl = document.getElementById('test-results');
  const rankCount = rows[0]?.places.length ?? 0;

  summaryEl.textContent = `${raceCount}회 테스트 완료 · 현재 선택 ${rankCount}마리 기준`;

  const headers = Array.from({ length: rankCount }, (_, i) => `<th>${i + 1}등</th>`).join('');
  const body = rows.map(row => {
    const cells = row.places
      .map(count => `<td>${((count / raceCount) * 100).toFixed(0)}%</td>`)
      .join('');
    return `
      <tr>
        <th scope="row"><span class="test-color" style="background:${row.color}"></span>${row.name}</th>
        ${cells}
      </tr>`;
  }).join('');

  resultsEl.innerHTML = `
    <div class="test-table-wrap">
      <table class="test-table">
        <thead>
          <tr><th>말</th>${headers}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ── Race Screen ──────────────────────────────────────────────────
function startGame() {
  apiKey = document.getElementById('api-key').value.trim();
  collectJockeyNames();
  if (selectedHorseIndices.length === 0) {
    alert('참전할 말을 최소 1마리 선택해주세요.');
    return;
  }
  game = new GameState(selectedHorseIndices, jockeyNames);

  document.getElementById('setup-screen').classList.remove('active');
  const raceScreen = document.getElementById('race-screen');
  raceScreen.classList.add('active');

  const glCanvas = document.getElementById('race-canvas');
  const ovCanvas = document.getElementById('overlay-canvas');
  renderer = new Renderer(glCanvas, ovCanvas);

  scoreboardEls.clear();
  document.getElementById('scoreboard').innerHTML = '';
  updateScoreboard();
  renderAbilityEvents([]);
  document.getElementById('round-display').textContent = formatRaceTime(game.elapsedTime);
  document.getElementById('commentary').textContent = '경기 시작을 기다리는 중...';
  const nextBtn = document.getElementById('next-round-btn');
  nextBtn.disabled = false;
  nextBtn.textContent = '일시정지';
  const autoLabel = document.querySelector('.auto-label');
  if (autoLabel) autoLabel.style.display = 'none';
  isPaused = false;
  resultQueued = false;
  commentaryTimer = 0;
  commentaryBusy = false;
  lastCommentaryTime = -Infinity;

  lastTime = performance.now();
  rafId = requestAnimationFrame(renderLoop);
}

function formatRaceTime(seconds = 0) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = (total % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${secs}`;
}

function renderLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (renderer) {
    let panInput = 0;
    if (panKeysPressed.has('ArrowLeft')) panInput -= 1;
    if (panKeysPressed.has('ArrowRight')) panInput += 1;
    if (panInput !== 0) {
      renderer.userPanOffset += panInput * PAN_KEY_SPEED * dt;
    }
    renderer.userPanLocked = (panInput !== 0) || isDragging;
  }

  if (!isPaused && game && !game.isFinished) {
    const gameDt = dt * GAME_TIME_SCALE;
    const tickData = game.update(gameDt);
    document.getElementById('round-display').textContent = formatRaceTime(game.elapsedTime);

    if (tickData?.abilityEvents?.length) {
      renderAbilityEvents(tickData.abilityEvents);
      if (renderer) renderer.queueCinematics(tickData.abilityEvents);
      requestCommentary(tickData, true);
    }

    commentaryTimer += gameDt;
    if (commentaryTimer >= COMMENTARY_INTERVAL) {
      commentaryTimer = 0;
      requestCommentary(tickData, false);
    }
  }

  renderer.render(game, dt);
  updateScoreboard();

  if (game?.isFinished && !resultQueued) {
    resultQueued = true;
    setTimeout(() => showResult(), 900);
  }

  rafId = requestAnimationFrame(renderLoop);
}

function setupCameraControls() {
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      panKeysPressed.add(e.key);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    panKeysPressed.delete(e.key);
  });
  window.addEventListener('blur', () => {
    panKeysPressed.clear();
  });

  const canvasWrap = document.querySelector('.canvas-wrap');
  if (!canvasWrap) return;

  canvasWrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDragging = true;
    lastDragX = e.clientX;
    canvasWrap.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging || !renderer) return;
    const dx = e.clientX - lastDragX;
    lastDragX = e.clientX;
    const deltaMeters = -dx / Math.max(1, renderer.mToPx);
    renderer.userPanOffset += deltaMeters;
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    canvasWrap.classList.remove('dragging');
  });
}

function waitForRaceAnimation() {
  return new Promise(resolve => {
    const check = () => {
      if (!renderer || !game) { resolve(); return; }
      if (!renderer.isAnimating(game) && !renderer.isCinematicActive()) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function advanceRound() {
  if (!game || game.isFinished) return;
  const nextBtn = document.getElementById('next-round-btn');
  isPaused = !isPaused;
  nextBtn.textContent = isPaused ? '계속 진행' : '일시정지';
}

async function requestCommentary(roundData, force = false) {
  if (!roundData || commentaryBusy) return;
  if (!force && game.elapsedTime - lastCommentaryTime < COMMENTARY_INTERVAL * 0.8) return;
  lastCommentaryTime = game.elapsedTime;

  const commentaryEl = document.getElementById('commentary');
  const fallback = buildLiveCommentary(roundData);

  if (!apiKey) {
    commentaryEl.className = '';
    commentaryEl.textContent = fallback;
    return;
  }

  commentaryBusy = true;
  commentaryEl.textContent = '?럺 以묎퀎 ?앹꽦 以?..';
  commentaryEl.className = 'loading';

  const text = await getCommentary(apiKey, roundData, game.horses);
  commentaryEl.className = '';
  commentaryEl.textContent = text || fallback;
  commentaryBusy = false;
}

function buildLiveCommentary(roundData) {
  const leader = game.leader;
  const sorted = game.sortedByPosition;
  const time = formatRaceTime(roundData.elapsedTime);
  const second = sorted[1];
  return `[${time}] ${leader.name} 선두, ${leader.position.toFixed(1)}M 지점입니다! ` +
    (second ? `${second.name}이 ${second.position.toFixed(1)}M에서 추격 중입니다.` : '');
}

const scoreboardEls = new Map();

function buildScoreboardItem() {
  const el = document.createElement('div');
  el.className = 'sb-item';
  el.innerHTML = `
    <div class="rank-badge"></div>
    <div class="sb-info">
      <div class="sb-name">
        <span class="sb-text"></span>
        <span class="sb-buff" hidden></span>
        <span class="sb-cd" hidden></span>
      </div>
      <div class="sb-bar"><div class="sb-fill"></div></div>
    </div>
    <div class="sb-dist"></div>
  `;
  return el;
}

function updateScoreboard() {
  if (!game) return;
  const container = document.getElementById('scoreboard');

  for (const horse of game.horses) {
    if (!scoreboardEls.has(horse.laneIndex)) {
      const el = buildScoreboardItem();
      scoreboardEls.set(horse.laneIndex, el);
      container.appendChild(el);
    }
  }

  const sorted = game.liveRanking;
  sorted.forEach((horse, i) => {
    const el = scoreboardEls.get(horse.laneIndex);
    if (!el) return;

    const rank = i + 1;
    const displayPosition = horse.displayPosition ?? horse.position;

    const badge = el.querySelector('.rank-badge');
    const badgeText = String(rank);
    if (badge.textContent !== badgeText) badge.textContent = badgeText;
    const badgeClass = `rank-badge ${rank <= 3 ? `rank-${rank}` : 'rank-other'}`;
    if (badge.className !== badgeClass) badge.className = badgeClass;

    const name = el.querySelector('.sb-name');
    if (name.style.color !== horse.type.color) name.style.color = horse.type.color;

    const text = el.querySelector('.sb-text');
    const newText = horse.name + (horse.finished ? ' ✅' : '');
    if (text.textContent !== newText) text.textContent = newText;

    const buffIcons = (horse.buffs || []).map(b => b.label || '✨').join('');
    const buffSpan = el.querySelector('.sb-buff');
    if (buffSpan.textContent !== buffIcons) buffSpan.textContent = buffIcons;
    if (buffSpan.hidden === !!buffIcons) buffSpan.hidden = !buffIcons;

    const cdSpan = el.querySelector('.sb-cd');
    const cdText = (horse.abilityCooldown || 0) > 0 ? `CD ${Math.ceil(horse.abilityCooldown)}` : '';
    if (cdSpan.textContent !== cdText) cdSpan.textContent = cdText;
    if (cdSpan.hidden === !!cdText) cdSpan.hidden = !cdText;

    const fill = el.querySelector('.sb-fill');
    fill.style.width = `${Math.min(100, (displayPosition / game.finishLine) * 100)}%`;
    if (fill.style.background !== horse.type.color) fill.style.background = horse.type.color;

    const dist = el.querySelector('.sb-dist');
    const distText = `${displayPosition.toFixed(1)}M`;
    if (dist.textContent !== distText) dist.textContent = distText;

    if (container.children[i] !== el) {
      container.insertBefore(el, container.children[i] || null);
    }
  });
}

function renderAbilityEvents(events) {
  const section = document.getElementById('ability-section');
  if (section) section.style.display = 'none'; // 스킬 메시지를 캔버스 레일 위에 띄우므로 기존 UI는 숨김 처리
}

function showResult() {
  cancelAnimationFrame(rafId);
  document.getElementById('race-screen').classList.remove('active');
  document.getElementById('result-screen').classList.add('active');

  const sorted = [...game.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const medals = ['🥇', '🥈', '🥉'];
  const container = document.getElementById('final-results');
  container.innerHTML = `<p class="subtitle">총 ${formatRaceTime(game.elapsedTime)} 진행</p>`;
  sorted.forEach((horse, i) => {
    const medal = medals[i] ?? `${i+1}위`;
    const label = horse.finished ? `${formatRaceTime(horse.finishTime ?? game.elapsedTime)}에 골인!` : `${horse.position.toFixed(1)}M (미완주)`;
    const jockeyLabel = horse.type.jockey ? `${horse.type.jockey} · ` : '';
    container.innerHTML += `
      <div class="result-item">
        <span class="result-rank">${medal}</span>
        <div class="horse-dot" style="background:${horse.type.color}"></div>
        <div class="result-info">
          <div style="color:${horse.type.color};font-weight:bold">${horse.name}</div>
          <div class="result-sub">${jockeyLabel}${label}</div>
        </div>
      </div>`;
  });
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSetup();
  setupCameraControls();

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('run-test-btn').addEventListener('click', () => runTestSimulation(100));

  document.getElementById('next-round-btn').addEventListener('click', advanceRound);

  document.getElementById('auto-check').addEventListener('change', e => {
    isPaused = !e.target.checked;
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.add('active');
    game = null;
    renderer = null;
  });
});
