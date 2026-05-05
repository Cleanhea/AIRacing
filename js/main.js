import { HORSE_TYPES } from './horses.js';
import { GameState } from './game.js';
import { Renderer } from './renderer.js';
import { getCommentary } from './gemini.js';

let game = null;
let renderer = null;
let apiKey = '';
let selectedCount = 4;
let rafId = null;
let lastTime = 0;
let autoAdvance = false;
let autoTimer = 0;
const AUTO_INTERVAL = 2.5; // seconds between auto rounds

// ── Setup Screen ────────────────────────────────────────────────
function buildSetup() {
  // Count buttons
  const countRow = document.getElementById('count-buttons');
  for (let n = 1; n <= 8; n++) {
    const btn = document.createElement('button');
    btn.className = 'count-btn' + (n === selectedCount ? ' active' : '');
    btn.textContent = n;
    btn.onclick = () => {
      selectedCount = n;
      countRow.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildHorseCards();
    };
    countRow.appendChild(btn);
  }
  buildHorseCards();
}

function buildHorseCards() {
  const container = document.getElementById('horse-cards');
  container.innerHTML = '';
  HORSE_TYPES.slice(0, selectedCount).forEach(h => {
    const card = document.createElement('div');
    card.className = 'horse-card';
    card.innerHTML = `
      <div class="horse-card-header">
        <div class="horse-dot" style="background:${h.color}"></div>
        <div>
          <div class="horse-name">${h.name}</div>
          <span class="trait-badge">${h.trait}</span>
        </div>
      </div>
      <div class="horse-desc">${h.description}</div>
      <div class="horse-jockey">${h.jockey}</div>`;
    container.appendChild(card);
  });
}

// ── Race Screen ──────────────────────────────────────────────────
function startGame() {
  apiKey = document.getElementById('api-key').value.trim();
  game = new GameState(selectedCount);

  document.getElementById('setup-screen').classList.remove('active');
  const raceScreen = document.getElementById('race-screen');
  raceScreen.classList.add('active');

  const glCanvas = document.getElementById('race-canvas');
  const ovCanvas = document.getElementById('overlay-canvas');
  renderer = new Renderer(glCanvas, ovCanvas);

  updateScoreboard();
  document.getElementById('round-display').textContent = `0 / 100`;
  document.getElementById('commentary').textContent = '경기 시작을 기다리는 중...';

  lastTime = performance.now();
  rafId = requestAnimationFrame(renderLoop);
}

function renderLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  renderer.render(game, dt);

  if (autoAdvance && !game.isFinished) {
    autoTimer += dt;
    if (autoTimer >= AUTO_INTERVAL) {
      autoTimer = 0;
      advanceRound();
    }
  }

  rafId = requestAnimationFrame(renderLoop);
}

async function advanceRound() {
  if (game.isFinished) { showResult(); return; }

  const nextBtn = document.getElementById('next-round-btn');
  nextBtn.disabled = true;

  const roundData = game.runRound();
  document.getElementById('round-display').textContent = `${game.round} / 100`;
  updateScoreboard();

  // Commentary
  const commentaryEl = document.getElementById('commentary');
  commentaryEl.textContent = '🎙 중계 생성 중...';
  commentaryEl.className = 'loading';

  const text = await getCommentary(apiKey, roundData, game.horses);
  commentaryEl.className = '';

  if (text) {
    commentaryEl.textContent = text;
  } else {
    const leader = game.leader;
    const sorted = game.sortedByPosition;
    commentaryEl.textContent = `[${game.round}라운드] ${leader.name}이(가) ${leader.position.toFixed(1)}M로 선두를 달리고 있습니다! ` +
      (sorted.length > 1 ? `${sorted[1].name}이(가) ${sorted[1].position.toFixed(1)}M로 뒤를 추격합니다.` : '');
  }

  if (game.isFinished) {
    setTimeout(() => showResult(), 800);
  } else {
    nextBtn.disabled = false;
  }
}

function updateScoreboard() {
  const el = document.getElementById('scoreboard');
  el.innerHTML = '';
  const sorted = game.sortedByPosition;
  sorted.forEach((horse, i) => {
    const rank = i + 1;
    const pct = (horse.position / 100) * 100;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const finLabel = horse.finished ? ' ✅' : '';
    el.innerHTML += `
      <div class="sb-item">
        <div class="rank-badge ${rankClass}">${rank}</div>
        <div class="sb-info">
          <div class="sb-name" style="color:${horse.type.color}">${horse.name}${finLabel}</div>
          <div class="sb-bar"><div class="sb-fill" style="width:${pct}%;background:${horse.type.color}"></div></div>
        </div>
        <div class="sb-dist">${horse.position.toFixed(1)}M</div>
      </div>`;
  });
}

function showResult() {
  cancelAnimationFrame(rafId);
  document.getElementById('race-screen').classList.remove('active');
  document.getElementById('result-screen').classList.add('active');

  const sorted = [...game.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const medals = ['🥇', '🥈', '🥉'];
  const container = document.getElementById('final-results');
  container.innerHTML = `<p class="subtitle">총 ${game.round}라운드 진행</p>`;
  sorted.forEach((horse, i) => {
    const medal = medals[i] ?? `${i+1}위`;
    const label = horse.finished ? `${horse.finishRound}라운드에 골인!` : `${horse.position.toFixed(1)}M (미완주)`;
    container.innerHTML += `
      <div class="result-item">
        <span class="result-rank">${medal}</span>
        <div class="horse-dot" style="background:${horse.type.color}"></div>
        <div class="result-info">
          <div style="color:${horse.type.color};font-weight:bold">${horse.name}</div>
          <div class="result-sub">${horse.type.jockey} · ${label}</div>
        </div>
      </div>`;
  });
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSetup();

  document.getElementById('start-btn').addEventListener('click', startGame);

  document.getElementById('next-round-btn').addEventListener('click', advanceRound);

  document.getElementById('auto-check').addEventListener('change', e => {
    autoAdvance = e.target.checked;
    autoTimer = 0;
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('result-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.add('active');
    game = null;
    renderer = null;
  });
});
