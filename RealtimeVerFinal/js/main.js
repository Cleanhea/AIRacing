import { HORSE_TYPES, BASE_ODDS } from './horses.js';
import { GameState } from './game.js';
import { Renderer } from './renderer.js';
import { Tournament, MODE_BET, MODE_POINT, POINT_TABLE, TOTAL_ROUNDS, MAX_TEAMS } from './teams.js';

let game = null;
let renderer = null;
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

let tournament = null;
let teamNames = Array.from({ length: MAX_TEAMS }, (_, i) => `${i + 1}조`);

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

// ── Screen helpers ───────────────────────────────────────────────
const SCREEN_IDS = ['setup-screen', 'config-screen', 'round-prep-screen', 'race-screen', 'round-result-screen', 'final-screen'];
function showScreen(id) {
  for (const s of SCREEN_IDS) {
    document.getElementById(s)?.classList.toggle('active', s === id);
  }
}

// ── Game Config Screen (모드/조 설정) ────────────────────────────
function enterConfigScreen() {
  collectJockeyNames();
  if (selectedHorseIndices.length === 0) {
    alert('참전할 말을 최소 1마리 선택해주세요.');
    return;
  }
  if (selectedHorseIndices.length < 2) {
    alert('최소 2마리 이상 선택해야 경주가 가능합니다.');
    return;
  }
  buildTeamNameInputs();
  updateStartingResourceHint();
  showScreen('config-screen');
}

function buildTeamNameInputs() {
  const count = clampTeamCount(Number(document.getElementById('team-count-input').value));
  const container = document.getElementById('team-names');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const wrap = document.createElement('label');
    wrap.className = 'team-name-field';
    wrap.innerHTML = `
      <span>${i + 1}조</span>
      <input class="api-input team-name-input" data-team-index="${i}" type="text" value="${teamNames[i] ?? `${i + 1}조`}" placeholder="${i + 1}조">
    `;
    container.appendChild(wrap);
  }
  container.querySelectorAll('.team-name-input').forEach(input => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.teamIndex);
      teamNames[idx] = input.value;
    });
  });
}

function clampTeamCount(n) {
  if (!Number.isFinite(n)) return 4;
  return Math.max(2, Math.min(MAX_TEAMS, Math.floor(n)));
}

function updateStartingResourceHint() {
  const mode = getSelectedMode();
  const panel = document.getElementById('starting-resource-panel');
  // 모드 2(포인트): 0점부터 시작이라 시작 자원 입력 불필요 → 패널 자체를 숨김
  panel.style.display = mode === MODE_BET ? '' : 'none';
}

function getSelectedMode() {
  const checked = document.querySelector('input[name="game-mode"]:checked');
  return checked?.value === 'point' ? MODE_POINT : MODE_BET;
}

function startTournament() {
  const teamCount = clampTeamCount(Number(document.getElementById('team-count-input').value));
  const startingResource = Math.max(1, Math.floor(Number(document.getElementById('starting-resource-input').value) || 0));
  const mode = getSelectedMode();
  // 최신 입력값 반영
  document.querySelectorAll('.team-name-input').forEach(input => {
    teamNames[Number(input.dataset.teamIndex)] = input.value;
  });
  tournament = new Tournament({
    mode,
    teamCount,
    teamNames,
    startingResource,
  });
  enterRoundPrepScreen();
}

// ── Round Prep Screen (배당/베팅/투자 입력) ──────────────────────
// 배당은 100,000회 시뮬레이션으로 사전 측정한 값(horses.js의 BASE_ODDS)을 그대로 사용
const ODDS_SIM_RUNS_LABEL = '100,000';

function buildAutoOdds() {
  const odds = {};
  for (const i of selectedHorseIndices) {
    const id = HORSE_TYPES[i].id;
    odds[i] = BASE_ODDS[id] ?? { win: 5.0, place: 2.0 };
  }
  return odds;
}

function enterRoundPrepScreen() {
  if (!tournament) {
    console.warn('enterRoundPrepScreen called without active tournament');
    showScreen('config-screen');
    return;
  }
  const horseList = selectedHorseIndices.map(i => {
    const customJockey = jockeyNames[i]?.trim();
    return { id: i, name: HORSE_TYPES[i].name, color: HORSE_TYPES[i].color, jockey: customJockey || HORSE_TYPES[i].jockey || '' };
  });
  const autoOdds = tournament.mode === MODE_BET ? buildAutoOdds() : null;
  tournament.beginRoundPrep(horseList, autoOdds);

  document.getElementById('prep-title').textContent = `라운드 ${tournament.currentRound} / ${tournament.totalRounds} 준비`;
  document.getElementById('prep-subtitle').textContent = tournament.mode === MODE_BET
    ? '운영자가 각 말의 1등/3등안 배당률을 정한 뒤, 각 조가 자유 분배 베팅합니다.'
    : '각 조가 보유 풀을 말에 분배 투자합니다. 등수점수 × 투자비율의 합이 라운드 점수.';

  buildHorseInfoPanel();
  buildOddsPanel(horseList);
  buildTeamsInput(horseList);
  showScreen('round-prep-screen');
}

function buildHorseInfoPanel() {
  const container = document.getElementById('prep-horse-info');
  if (!container) return;
  container.innerHTML = selectedHorseIndices.map(i => {
    const h = HORSE_TYPES[i];
    const ability = h.ability ? `
      <div class="prep-ability" style="border-color:${h.color}55">
        <div class="prep-ability-tag" style="color:${h.color}">${h.ability.icon} ${h.ability.name}</div>
        <div class="prep-ability-desc">${h.ability.description}</div>
      </div>` : '<div class="prep-ability prep-ability-empty">특수 능력 없음</div>';
    return `
      <div class="prep-horse-card" style="border-color:${h.color}55">
        <div class="prep-horse-head">
          <span class="horse-dot" style="background:${h.color}"></span>
          <div class="prep-horse-title">
            <div class="prep-horse-name" style="color:${h.color}">${h.name}</div>
            <div class="prep-horse-meta">
              <span class="trait-badge">${h.trait}</span>
            </div>
          </div>
        </div>
        <div class="prep-horse-desc">${h.description}</div>
        ${ability}
      </div>
    `;
  }).join('');
}

function buildOddsPanel(horseList) {
  const panel = document.getElementById('odds-panel');
  if (tournament.mode !== MODE_BET) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  const labelEl = panel.querySelector('.panel-label');
  if (labelEl) labelEl.textContent = `🤖 자동 산정 배당 (${ODDS_SIM_RUNS_LABEL}회 시뮬레이션 기준)`;
  const tbl = document.getElementById('odds-table');
  tbl.innerHTML = `
    <div class="odds-row odds-head">
      <div>말</div>
      <div>1등 배당</div>
      <div>3등안 배당</div>
    </div>
    ${horseList.map(h => `
      <div class="odds-row">
        <div class="horse-tag"><span class="horse-dot" style="background:${h.color}"></span>${h.name}</div>
        <div class="odds-value">×${tournament.currentPrep.odds[h.id].win.toFixed(1)}</div>
        <div class="odds-value">×${tournament.currentPrep.odds[h.id].place.toFixed(1)}</div>
      </div>
    `).join('')}
  `;
}

function buildTeamsInput(horseList) {
  const label = document.getElementById('teams-input-label');
  label.textContent = tournament.mode === MODE_BET
    ? '각 조의 베팅 입력 (1등 / 3등안)'
    : '각 조의 응원 말 선택 (1마리)';

  const container = document.getElementById('teams-input');
  container.innerHTML = '';

  for (const team of tournament.teams) {
    const card = document.createElement('div');
    card.className = 'team-bet-card';

    if (tournament.mode === MODE_BET) {
      const head = `
        <div class="team-bet-head">
          <div class="team-bet-name">${team.name}</div>
          <div class="team-bet-resource">보유 자금 <strong>${team.balance}</strong></div>
          <div class="team-bet-total" data-team-id="${team.id}">베팅 미설정</div>
        </div>
      `;
      const kindGroup = `
        <div class="bet-kind-row">
          <label class="bet-kind-option">
            <input type="radio" name="kind-team-${team.id}" data-team-id="${team.id}" data-kind="win" class="kind-input">
            <div class="bet-kind-card">🥇 1등 맞추기</div>
          </label>
          <label class="bet-kind-option">
            <input type="radio" name="kind-team-${team.id}" data-team-id="${team.id}" data-kind="place" class="bet-kind-card-place kind-input">
            <div class="bet-kind-card">🏅 3등 안 맞추기</div>
          </label>
        </div>
      `;
      const horseGroup = `
        <div class="pick-grid">
          ${horseList.map(h => `
            <label class="pick-option">
              <input type="radio" name="horse-team-${team.id}" data-team-id="${team.id}" data-horse-id="${h.id}" class="bet-horse-input">
              <div class="pick-card" style="--horse-color:${h.color}">
                <span class="horse-dot" style="background:${h.color}"></span>
                <span class="pick-card-name">${h.name}</span>
                <span class="pick-card-odds" data-team-id="${team.id}" data-horse-id="${h.id}">×${tournament.currentPrep.odds[h.id].win.toFixed(1)} / ×${tournament.currentPrep.odds[h.id].place.toFixed(1)}</span>
              </div>
            </label>
          `).join('')}
        </div>
      `;
      const amountInput = `
        <div class="bet-amount-row">
          <span class="bet-amount-label">베팅 금액</span>
          <input type="number" min="0" step="1" value="0" placeholder="0" class="api-input bet-amount-input" data-team-id="${team.id}">
          <button type="button" class="ghost-btn bet-allin-btn" data-team-id="${team.id}">올인</button>
        </div>
      `;
      card.innerHTML = head + kindGroup + horseGroup + amountInput;
    } else {
      const head = `
        <div class="team-bet-head">
          <div class="team-bet-name">${team.name}</div>
          <div class="team-bet-resource">누적 점수 <strong>${team.score}</strong></div>
          <div class="team-bet-total" data-team-id="${team.id}">선택 안 함</div>
        </div>
      `;
      const body = horseList.map(h => `
        <label class="pick-option">
          <input type="radio" name="pick-team-${team.id}" data-team-id="${team.id}" data-horse-id="${h.id}" class="pick-input">
          <div class="pick-card" style="--horse-color:${h.color}">
            <span class="horse-dot" style="background:${h.color}"></span>
            <span>${h.name}</span>
          </div>
        </label>
      `).join('');
      card.innerHTML = head + `<div class="pick-grid">${body}</div>`;
    }

    container.appendChild(card);
  }

  if (tournament.mode === MODE_BET) {
    container.querySelectorAll('.kind-input').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        const teamId = Number(input.dataset.teamId);
        tournament.currentPrep.bets[teamId].kind = input.dataset.kind;
        refreshTeamTotals();
      });
    });
    container.querySelectorAll('.bet-horse-input').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        const teamId = Number(input.dataset.teamId);
        const horseId = Number(input.dataset.horseId);
        tournament.currentPrep.bets[teamId].horseId = horseId;
        refreshTeamTotals();
      });
    });
    container.querySelectorAll('.bet-amount-input').forEach(input => {
      input.addEventListener('input', () => {
        const teamId = Number(input.dataset.teamId);
        const v = Math.max(0, Math.floor(Number(input.value) || 0));
        tournament.currentPrep.bets[teamId].amount = v;
        refreshTeamTotals();
      });
    });
    container.querySelectorAll('.bet-allin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const teamId = Number(btn.dataset.teamId);
        const team = tournament.teams.find(t => t.id === teamId);
        if (!team) return;
        tournament.currentPrep.bets[teamId].amount = team.balance;
        const inp = container.querySelector(`.bet-amount-input[data-team-id="${teamId}"]`);
        if (inp) inp.value = team.balance;
        refreshTeamTotals();
      });
    });
  } else {
    container.querySelectorAll('.pick-input').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        const teamId = Number(input.dataset.teamId);
        const horseId = Number(input.dataset.horseId);
        tournament.currentPrep.picks[teamId] = horseId;
        refreshTeamTotals();
      });
    });
  }
  refreshTeamTotals();
}

function refreshTeamTotals() {
  for (const team of tournament.teams) {
    const el = document.querySelector(`.team-bet-total[data-team-id="${team.id}"]`);
    if (!el) continue;
    if (tournament.mode === MODE_BET) {
      const b = tournament.betOf(team.id);
      const ready = b.kind && b.horseId != null && b.amount > 0;
      const over = b.amount > team.balance;
      const horse = b.horseId != null
        ? tournament.currentPrep.horseList.find(h => h.id === b.horseId)
        : null;
      const odds = (b.kind && horse) ? tournament.currentPrep.odds[b.horseId][b.kind] : null;
      const kindLabel = b.kind === 'win' ? '🥇 1등' : b.kind === 'place' ? '🏅 3등안' : null;
      let html = '베팅 미설정';
      if (ready) {
        html = `${kindLabel} · <strong>${horse?.name ?? '-'}</strong> · ${b.amount} (×${odds.toFixed(1)})`;
      } else if (b.kind || b.horseId != null || b.amount > 0) {
        const parts = [];
        if (kindLabel) parts.push(kindLabel);
        if (horse) parts.push(horse.name);
        if (b.amount > 0) parts.push(`${b.amount}`);
        html = `<span class="neg">미완성:</span> ${parts.join(' / ')}`;
      }
      if (over) html += ' <span class="neg">(자금 초과)</span>';
      el.innerHTML = html;
      el.classList.toggle('over', over || (!ready && (b.kind || b.horseId != null || b.amount > 0)));
    } else {
      const pick = tournament.pickOf(team.id);
      if (pick == null) {
        el.innerHTML = '선택 안 함';
        el.classList.add('over');
      } else {
        const horse = tournament.currentPrep.horseList.find(h => h.id === pick);
        el.innerHTML = `선택: <strong>${horse?.name ?? '-'}</strong>`;
        el.classList.remove('over');
      }
    }
  }
}

function startRaceFromPrep() {
  const commit = tournament.mode === MODE_BET ? tournament.commitBets() : tournament.commitPicks();
  if (!commit.ok) {
    alert(commit.errors.join('\n'));
    return;
  }
  startRace();
}

// ── Race Screen ──────────────────────────────────────────────────
function playRaceSound(src) {
  const bgm = document.getElementById('bgm');
  const audio = new Audio(src);
  audio.volume = bgm?.muted ? 0 : (bgm?.volume ?? 0.4);
  audio.play().catch(() => {});
}

function runCountdown() {
  return new Promise(resolve => {
    const overlay = document.getElementById('countdown-overlay');
    const numEl = document.getElementById('countdown-number');
    overlay.hidden = false;

    let count = 3;
    const tick = () => {
      numEl.textContent = String(count);
      numEl.style.animation = 'none';
      void numEl.offsetWidth; // reflow로 animation 재시작
      numEl.style.animation = '';
      playRaceSound('bgm/RaceCount.wav');
      count--;
      if (count > 0) {
        setTimeout(tick, 1000);
      } else {
        setTimeout(() => {
          overlay.hidden = true;
          playRaceSound('bgm/StartGun.wav');
          resolve();
        }, 1000);
      }
    };
    setTimeout(tick, 1000); // 화면 로드 안정화 대기
  });
}

async function startRace() {
  game = new GameState(selectedHorseIndices, jockeyNames);

  showScreen('race-screen');

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
  nextBtn.disabled = true;
  nextBtn.textContent = '일시정지';
  const autoLabel = document.querySelector('.auto-label');
  if (autoLabel) autoLabel.style.display = 'none';
  isPaused = true;
  resultQueued = false;
  commentaryTimer = 0;
  commentaryBusy = false;
  lastCommentaryTime = -Infinity;

  lastTime = performance.now();
  rafId = requestAnimationFrame(renderLoop);

  await runCountdown();

  isPaused = false;
  nextBtn.disabled = false;
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
  commentaryEl.className = '';
  commentaryEl.textContent = fallback;
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

  const sortedHorses = [...game.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const raceResult = sortedHorses.map((h, i) => ({ horseId: h.id, rank: h.rank ?? (i + 1) }));

  const summary = tournament.settleRound(raceResult);
  renderRoundResultScreen(sortedHorses, summary);
  showScreen('round-result-screen');
}

function renderRoundResultScreen(sortedHorses, summary) {
  const titleEl = document.getElementById('round-result-title');
  titleEl.textContent = `라운드 ${tournament.currentRound} / ${tournament.totalRounds} 결과`;

  const medals = ['🥇', '🥈', '🥉'];
  const rankEl = document.getElementById('race-rank-list');
  rankEl.innerHTML = `<p class="subtitle">총 ${formatRaceTime(game.elapsedTime)} 진행</p>` + sortedHorses.map((horse, i) => {
    const medal = medals[i] ?? `${i + 1}위`;
    const label = horse.finished ? `${formatRaceTime(horse.finishTime ?? game.elapsedTime)}에 골인` : `${horse.position.toFixed(1)}M (미완주)`;
    const jockeyLabel = horse.type.jockey ? `${horse.type.jockey} · ` : '';
    const rankPoint = (i < POINT_TABLE.length) ? POINT_TABLE[i] : 0;
    return `
      <div class="result-item">
        <span class="result-rank">${medal}</span>
        <div class="horse-dot" style="background:${horse.type.color}"></div>
        <div class="result-info">
          <div style="color:${horse.type.color};font-weight:bold">${horse.name} <span class="rank-point">+${rankPoint}점</span></div>
          <div class="result-sub">${jockeyLabel}${label}</div>
        </div>
      </div>`;
  }).join('');

  const settleLabel = document.getElementById('round-settle-label');
  settleLabel.textContent = tournament.mode === MODE_BET ? '라운드 정산 (베팅 결과)' : '라운드 정산 (포인트)';

  const settleEl = document.getElementById('round-settle');
  settleEl.innerHTML = renderSettlement(summary, sortedHorses);

  const nextBtn = document.getElementById('next-round-flow-btn');
  if (tournament.currentRound >= tournament.totalRounds) {
    nextBtn.textContent = '🏆 최종 순위 보기';
  } else {
    nextBtn.textContent = `다음 라운드 (${tournament.currentRound + 1}/${tournament.totalRounds}) ▶`;
  }
}

function renderSettlement(summary, sortedHorses = []) {
  const horseName = (id) => sortedHorses.find(h => h.id === id)?.name ?? `#${id}`;
  const horseColor = (id) => sortedHorses.find(h => h.id === id)?.type?.color ?? '#aaa';
  if (tournament.mode === MODE_BET) {
    return `
      <div class="settle-table bet-settle">
        <div class="settle-row settle-head">
          <div>조</div><div>베팅</div><div>결과</div><div>잔여 자금</div>
        </div>
        ${summary.map(s => {
          const profit = s.winnings - s.stake;
          const sign = profit >= 0 ? '+' : '';
          const kindLabel = s.kind === 'win' ? '🥇 1등' : s.kind === 'place' ? '🏅 3등안' : '미베팅';
          const horseLabel = s.horseId != null
            ? `<span class="horse-tag"><span class="horse-dot" style="background:${horseColor(s.horseId)}"></span>${horseName(s.horseId)}</span>`
            : '-';
          const betCell = s.stake > 0
            ? `${kindLabel} · ${horseLabel} · <strong>${s.stake}</strong>`
            : '<span class="neg">미베팅</span>';
          const resultCell = s.stake > 0
            ? (s.hit
                ? `<span class="pos">적중! +${s.winnings.toFixed(0)}</span> <span class="profit">(×${s.odds.toFixed(1)})</span>`
                : `<span class="neg">실패 (-${s.stake})</span>`)
            : '-';
          return `
            <div class="settle-row">
              <div>${s.name}</div>
              <div>${betCell}</div>
              <div>${resultCell} <span class="profit">${sign}${profit.toFixed(0)}</span></div>
              <div><strong>${s.balance.toFixed(0)}</strong></div>
            </div>`;
        }).join('')}
      </div>
    `;
  }
  return `
    <div class="settle-table point-table">
      <div class="settle-row settle-head">
        <div>조</div><div>선택 말 / 등수</div><div>+점수</div><div>누적 점수</div>
      </div>
      ${summary.map(s => {
        const pickLabel = s.pickedHorseId != null
          ? `<span class="horse-tag"><span class="horse-dot" style="background:${horseColor(s.pickedHorseId)}"></span>${horseName(s.pickedHorseId)}</span> · ${s.rank ?? '-'}등`
          : '<span class="neg">미선택</span>';
        return `
          <div class="settle-row">
            <div>${s.name}</div>
            <div>${pickLabel}</div>
            <div class="${s.rankPoint > 0 ? 'pos' : ''}">+${s.rankPoint}</div>
            <div><strong>${s.score}</strong></div>
          </div>`;
      }).join('')}
    </div>
  `;
}

function advanceTournament() {
  if (tournament.currentRound >= tournament.totalRounds) {
    showFinalScreen();
  } else {
    enterRoundPrepScreen();
  }
}

function showFinalScreen() {
  const standings = tournament.standings;
  const medals = ['🥇', '🥈', '🥉'];
  const container = document.getElementById('final-standings');
  const isBet = tournament.mode === MODE_BET;
  container.innerHTML = `
    <p class="subtitle">${tournament.totalRounds}라운드 종료 · ${isBet ? '누적 자금' : '누적 점수'} 기준</p>
    ${standings.map((t, i) => {
      const medal = medals[i] ?? `${i + 1}위`;
      const value = isBet ? `${t.balance.toFixed(0)} 원` : `${t.score} 점`;
      return `
        <div class="result-item">
          <span class="result-rank">${medal}</span>
          <div class="result-info">
            <div style="font-weight:bold">${t.name}</div>
            <div class="result-sub">${value}</div>
          </div>
        </div>`;
    }).join('')}
  `;
  showScreen('final-screen');
}

// ── BGM ──────────────────────────────────────────────────────────
const BGM_VOLUME_KEY = 'airacing.bgmVolume';
const BGM_MUTED_KEY = 'airacing.bgmMuted';

function setupBgm() {
  const audio = document.getElementById('bgm');
  const slider = document.getElementById('sound-volume');
  const label = document.getElementById('sound-volume-label');
  const toggle = document.getElementById('sound-toggle');
  if (!audio || !slider || !toggle) return;

  // localStorage에서 마지막 볼륨/음소거 복원
  const savedVol = Number(localStorage.getItem(BGM_VOLUME_KEY));
  const savedMuted = localStorage.getItem(BGM_MUTED_KEY) === '1';
  const initialVol = Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 100 ? savedVol : 40;

  slider.value = String(initialVol);
  label.textContent = String(initialVol);
  audio.volume = initialVol / 100;
  audio.muted = savedMuted;
  toggle.textContent = savedMuted || initialVol === 0 ? '🔇' : '🔊';

  const tryPlay = () => {
    audio.play().catch(() => { /* 자동재생 차단 — 다음 인터랙션 대기 */ });
  };
  // 페이지 진입 즉시 시도 (자동재생 허용된 환경에서)
  tryPlay();
  // 차단됐을 경우 첫 사용자 인터랙션에서 재생
  const onFirstInteraction = () => {
    tryPlay();
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
  };
  window.addEventListener('pointerdown', onFirstInteraction);
  window.addEventListener('keydown', onFirstInteraction);

  slider.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, Number(slider.value) || 0));
    audio.volume = v / 100;
    label.textContent = String(v);
    localStorage.setItem(BGM_VOLUME_KEY, String(v));
    if (v > 0 && audio.muted) {
      audio.muted = false;
      localStorage.setItem(BGM_MUTED_KEY, '0');
    }
    toggle.textContent = (audio.muted || v === 0) ? '🔇' : '🔊';
  });

  toggle.addEventListener('click', () => {
    audio.muted = !audio.muted;
    localStorage.setItem(BGM_MUTED_KEY, audio.muted ? '1' : '0');
    toggle.textContent = audio.muted || audio.volume === 0 ? '🔇' : '🔊';
    if (!audio.muted) tryPlay();
  });
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupBgm();
  buildSetup();
  setupCameraControls();

  document.getElementById('start-btn').addEventListener('click', enterConfigScreen);
  document.getElementById('run-test-btn').addEventListener('click', () => runTestSimulation(100));

  document.getElementById('next-round-btn').addEventListener('click', advanceRound);

  document.getElementById('auto-check').addEventListener('change', e => {
    isPaused = !e.target.checked;
  });

  // Config screen
  document.getElementById('config-back-btn').addEventListener('click', () => showScreen('setup-screen'));
  document.getElementById('config-next-btn').addEventListener('click', startTournament);
  document.getElementById('team-count-input').addEventListener('input', buildTeamNameInputs);
  document.querySelectorAll('input[name="game-mode"]').forEach(radio => {
    radio.addEventListener('change', updateStartingResourceHint);
  });

  // Round prep screen
  document.getElementById('prep-back-btn').addEventListener('click', () => {
    // 라운드 프렙은 진행 중인 currentPrep을 무시하고 한 단계 뒤로
    if (tournament && tournament.currentRound > 1) {
      // 이전 라운드 결과 화면으로 (이미 정산된 상태)
      tournament.currentRound--; // beginRoundPrep에서 다시 ++ 되도록 되돌림
      tournament.currentPrep = null;
      showScreen('round-result-screen');
    } else {
      tournament = null;
      showScreen('config-screen');
    }
  });
  document.getElementById('prep-start-btn').addEventListener('click', startRaceFromPrep);

  // Round result screen → 다음 라운드 또는 최종
  document.getElementById('next-round-flow-btn').addEventListener('click', advanceTournament);

  document.getElementById('restart-btn').addEventListener('click', () => {
    tournament = null;
    game = null;
    renderer = null;
    showScreen('setup-screen');
  });
});
