// 100,000회 레이스 시뮬레이션으로 각 말의 1등 / 3등 안 확률 → 자동 배당 산정
import { HORSE_TYPES } from '../js/horses.js';
import { GameState } from '../js/game.js';

const RUNS = Number(process.argv[2]) || 100000;
const MARGIN = 0.85; // 하우스 마진 (1.0이면 공정 배당)

const counts = HORSE_TYPES.map(() => ({ win: 0, place: 0 }));

console.log(`▶ 시뮬레이션 시작 (${RUNS.toLocaleString()}회, ${HORSE_TYPES.length}마리)`);
console.time('simulate');

for (let i = 0; i < RUNS; i++) {
  const sim = new GameState();
  while (!sim.isFinished) sim.update(0.25);
  const ranked = [...sim.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (ranked[0]) counts[ranked[0].id].win++;
  ranked.slice(0, 3).forEach(h => counts[h.id].place++);

  if ((i + 1) % 10000 === 0) {
    process.stdout.write(`  ${(i + 1).toLocaleString()} / ${RUNS.toLocaleString()}\r`);
  }
}

console.log('');
console.timeEnd('simulate');

const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

console.log('\n=== 결과 ===');
console.log('말 | 1등 확률 | 1등 배당 | 3등안 확률 | 3등안 배당');
console.log('-'.repeat(60));

const baseOdds = {};
HORSE_TYPES.forEach((h, i) => {
  const c = counts[i];
  const winProb = c.win / RUNS;
  const placeProb = c.place / RUNS;
  const winOdds = clamp(round1(MARGIN / Math.max(0.005, winProb)), 1.2, 99);
  const placeOdds = clamp(round1(MARGIN / Math.max(0.01, placeProb)), 1.1, 30);
  baseOdds[h.id] = { win: winOdds, place: placeOdds };
  console.log(
    `${h.name.padEnd(10)} | ${(winProb * 100).toFixed(2).padStart(5)}% | × ${winOdds.toString().padStart(4)} | ${(placeProb * 100).toFixed(2).padStart(5)}% | × ${placeOdds.toString().padStart(4)}`
  );
});

console.log('\n=== horses.js에 박을 baseOdds (id 기준) ===');
console.log(JSON.stringify(baseOdds, null, 2));
