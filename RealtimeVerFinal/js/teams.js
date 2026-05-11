// 토너먼트(3라운드 + 2개 모드 + 최대 8개 조) 메타 상태
// - 모드 1: 베팅 모드 — 1등 맞추기 / 3등 안 맞추기, 운영자가 배당률 수동 입력
// - 모드 2: 포인트 모드 — 매 라운드 각 조가 말 1마리 선택, 등수 점수(10·7·6·5·4·3·2·1) 누적

export const MODE_BET = 'bet';
export const MODE_POINT = 'point';
export const TOTAL_ROUNDS = 3;
export const MAX_TEAMS = 8;
export const POINT_TABLE = [10, 7, 6, 5, 4, 3, 2, 1];

export class Tournament {
  constructor({ mode, teamCount, teamNames, startingResource }) {
    this.mode = mode;
    this.totalRounds = TOTAL_ROUNDS;
    this.currentRound = 0;
    // 모드 1만 시작 자원 사용. 모드 2는 점수 0부터 시작.
    this.startingResource = mode === MODE_BET ? startingResource : 0;
    this.teams = Array.from({ length: teamCount }, (_, i) => ({
      id: i,
      name: (teamNames[i] && teamNames[i].trim()) || `${i + 1}조`,
      // 모드 1: balance(누적 자금) = 최종 순위
      // 모드 2: score(누적 점수) = 최종 순위
      balance: this.startingResource,
      score: 0,
      history: [],
    }));
    this.rounds = [];
  }

  // 라운드 준비: 운영자/각 조 입력을 받기 직전 단계 데이터 초기화
  // autoOdds: 모드 1에서 외부(시뮬레이션)에서 산정한 자동 배당. { horseId: { win, place } }
  beginRoundPrep(horseList, autoOdds = null) {
    this.currentRound++;

    if (this.mode === MODE_BET) {
      // 매 라운드 시작 시 500원 지급 (파산 방지)
      for (const t of this.teams) t.balance += 500;

      // 자동 배당 (시뮬레이션 결과). 없으면 안전한 폴백.
      const odds = {};
      for (const h of horseList) {
        odds[h.id] = autoOdds?.[h.id] ?? { win: 2.0, place: 1.5 };
      }
      // 각 조의 베팅 (단일): { teamId: { kind: 'win'|'place'|null, horseId: number|null, amount: number } }
      const bets = {};
      for (const t of this.teams) {
        bets[t.id] = { kind: null, horseId: null, amount: 0 };
      }
      this.currentPrep = { horseList, odds, bets };
    } else {
      // 모드 2: 각 조가 말 1마리 선택 { teamId: horseId | null }
      const picks = {};
      for (const t of this.teams) picks[t.id] = null;
      this.currentPrep = { horseList, picks };
    }

    return this.currentPrep;
  }

  // 모드 1: 한 조의 베팅 정보
  betOf(teamId) {
    return this.currentPrep?.bets?.[teamId] ?? { kind: null, horseId: null, amount: 0 };
  }
  totalBetOf(teamId) {
    return this.betOf(teamId).amount || 0;
  }

  // 모드 2: 한 조의 선택 말 id (없으면 null)
  pickOf(teamId) {
    return this.currentPrep?.picks?.[teamId] ?? null;
  }

  // 라운드 시작 직전 검증 → 베팅금 즉시 차감 등의 처리
  commitBets() {
    if (this.mode !== MODE_BET) return { ok: true };
    const errors = [];
    for (const t of this.teams) {
      const b = this.betOf(t.id);
      if (!b.kind) {
        errors.push(`${t.name}이(가) 베팅 종류(1등 / 3등안)를 선택하지 않았습니다.`);
      } else if (b.horseId == null) {
        errors.push(`${t.name}이(가) 말을 선택하지 않았습니다.`);
      } else if (!b.amount || b.amount <= 0) {
        errors.push(`${t.name}의 베팅 금액이 0입니다. 1 이상 입력해야 합니다.`);
      } else if (b.amount > t.balance) {
        errors.push(`${t.name}의 베팅 금액(${b.amount})이 보유 자금(${t.balance})을 초과합니다.`);
      }
    }
    if (errors.length) return { ok: false, errors };
    for (const t of this.teams) {
      t.balance -= this.totalBetOf(t.id);
    }
    return { ok: true };
  }

  commitPicks() {
    if (this.mode !== MODE_POINT) return { ok: true };
    const errors = [];
    for (const t of this.teams) {
      if (this.pickOf(t.id) == null) {
        errors.push(`${t.name}이(가) 말을 선택하지 않았습니다.`);
      }
    }
    if (errors.length) return { ok: false, errors };
    return { ok: true };
  }

  // 레이스 종료 후 정산
  // raceResult: [{ horseId, rank }] — rank는 1부터
  settleRound(raceResult) {
    const top1 = raceResult.find(r => r.rank === 1)?.horseId;
    const top3 = raceResult.filter(r => r.rank <= 3).map(r => r.horseId);
    const rankByHorse = {};
    for (const r of raceResult) rankByHorse[r.horseId] = r.rank;

    const summary = [];

    if (this.mode === MODE_BET) {
      const odds = this.currentPrep.odds;
      for (const t of this.teams) {
        const b = this.betOf(t.id);
        let winnings = 0;
        let hit = false;
        let usedOdds = 0;
        if (b.kind && b.horseId != null && b.amount > 0) {
          const o = odds[b.horseId];
          if (b.kind === 'win' && Number(b.horseId) === Number(top1)) {
            usedOdds = o.win;
            winnings = b.amount * o.win;
            hit = true;
          } else if (b.kind === 'place' && top3.includes(Number(b.horseId))) {
            usedOdds = o.place;
            winnings = b.amount * o.place;
            hit = true;
          }
        }
        const stake = b.amount || 0;
        t.balance += winnings;
        t.history.push({ round: this.currentRound, stake, winnings, balance: t.balance });
        summary.push({
          teamId: t.id,
          name: t.name,
          kind: b.kind,
          horseId: b.horseId,
          stake,
          hit,
          odds: usedOdds,
          winnings,
          balance: t.balance,
        });
      }
    } else {
      const picks = this.currentPrep.picks;
      for (const t of this.teams) {
        const horseId = picks[t.id];
        const rank = horseId != null ? rankByHorse[Number(horseId)] : null;
        const rankPoint = rank ? (POINT_TABLE[rank - 1] ?? 0) : 0;
        t.score += rankPoint;
        t.history.push({ round: this.currentRound, pickedHorseId: horseId, rank, rankPoint, score: t.score });
        summary.push({ teamId: t.id, name: t.name, pickedHorseId: horseId, rank, rankPoint, score: t.score });
      }
    }

    this.rounds.push({ round: this.currentRound, raceResult, summary });
    this.currentPrep = null;
    return summary;
  }

  get isFinished() {
    return this.currentRound >= this.totalRounds && !this.currentPrep;
  }

  get standings() {
    if (this.mode === MODE_BET) {
      return [...this.teams].sort((a, b) => b.balance - a.balance);
    }
    return [...this.teams].sort((a, b) => b.score - a.score);
  }
}
