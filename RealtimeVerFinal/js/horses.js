export const RACE_DISTANCE = 1000;
const DISTANCE_SPEED_SCALE = 12.0;
const REALTIME_SPEED_SCALE = 2.6;

const progressOf = (pos) => pos / RACE_DISTANCE;

export const HORSE_TYPES = [
  {
    id: 'late_surge',
    realtimeBalance: 1,
    name: '홍염 역습',
    jockey: '기수 김민준',
    description: '초반 300M는 절제된 페이스로 달립니다. 70% 지점을 넘는 순간 잠자던 불꽃이 폭발해 2.5배 가속으로 모두를 제칩니다.',
    trait: '후반 폭발형',
    color: '#FF4444',
    glColor: [1.0, 0.27, 0.27],
    ability: {
      id: 'final_burst',
      icon: '🔥',
      name: '막판 스퍼트',
      description: '위치 70% 이상 도달 시 확정 발동. 2.5배 가속',
      cooldown: 3,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.7) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 2.5, roundsLeft: 1, label: '🔥' },
          message: `홍염 역습, 결승선이 보이자 막판 스퍼트 발동! 2.5배 가속!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      if (p < 0.3) return [8, 12];
      if (p < 0.6) return [10, 13];
      return [15, 23];
    }
  },
  {
    id: 'front_runner',
    realtimeBalance: 1,
    name: '화무십일홍',
    jockey: '기수 이서연',
    description: '출발 총성과 동시에 전력 질주합니다. 초반 10초 안에 +80M 순간 돌파로 선두를 선점하지만, 체력 소진으로 후반엔 급격히 처집니다.',
    trait: '선두 질주형',
    color: '#4488FF',
    glColor: [0.27, 0.53, 1.0],
    ability: {
      id: 'opening_strike',
      icon: '⚡',
      name: '기선제압',
      description: '초반 10초 이내 1초마다 18% 확률로 +80M 즉시 워프, 쿨다운 1초',
      cooldown: 1,
      trigger(horse, game) {
        if (game.round > 10) return null;
        if (Math.random() >= 0.18) return null;
        return {
          type: 'self_warp',
          amount: 80,
          message: `화무십일홍, 기선제압! 출발과 동시에 +80M 점프!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      if (p < 0.35) return [14, 24];
      if (p < 0.65) return [12, 18];
      return [10, 13];
    }
  },
  {
    id: 'steady',
    realtimeBalance: 1,
    name: '메트로놈',
    jockey: '기수 박지우',
    description: '시작부터 끝까지 일정한 박자로 달립니다. 화려함은 없지만 매 5초마다 정확히 1.6배 가속이 확정 발동됩니다.',
    trait: '균형 유지형',
    color: '#33CC55',
    glColor: [0.2, 0.8, 0.33],
    ability: {
      id: 'pace_master',
      icon: '🛡️',
      name: '페이스 마스터',
      description: '매 5초마다 1.6배 가속 확정 발동',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 5 !== 0) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 1.6, roundsLeft: 1, label: '🛡️' },
          message: `메트로놈의 정확한 호흡! 페이스 마스터로 1.6배 가속!`,
        };
      },
    },
    getSpeedRange(_pos) {
      return [11, 20];
    }
  },
  {
    id: 'lucky_star',
    realtimeBalance: 1,
    name: '럭키스타',
    jockey: '기수 최하늘',
    description: '완전히 예측 불가능합니다. 40% 확률로 동전 던지기 — 앞면이면 +80M 도약, 뒷면이면 -50M 후퇴. 운이 전부인 말.',
    trait: '랜덤 폭발형',
    color: '#FFD700',
    glColor: [1.0, 0.84, 0.0],
    ability: {
      id: 'lucky_coin',
      icon: '💰',
      name: '행운의 동전',
      description: '1초마다 40% 확률로 발동. 앞면(60%) +80M, 뒷면(40%) -50M, 쿨다운 1초',
      cooldown: 1,
      trigger(horse) {
        if (Math.random() >= 0.4) return null;
        const lucky = Math.random() < 0.6;
        return {
          type: 'self_warp',
          amount: lucky ? 80 : -50,
          message: lucky
            ? `럭키스타, 행운의 동전 앞면! 단숨에 +80M 도약!`
            : `럭키스타, 동전 뒷면이 나왔다! -50M 후퇴...`,
        };
      },
    },
    getSpeedRange(_pos) {
      const r = Math.random();
      if (r < 0.18) return [12, 15];
      if (r < 0.48) return [8, 10];
      return [10, 13];
    }
  },
  {
    id: 'mid_race',
    realtimeBalance: 1.25,
    name: '중원패왕',
    jockey: '기수 정도현',
    description: '250M~750M 구간에서 최고 폼을 발휘합니다. 방해 공작으로 가장 가까운 라이벌을 -80M 끌어당겨 중반 지배권을 장악합니다.',
    trait: '중반 특화형',
    color: '#AA44FF',
    glColor: [0.67, 0.27, 1.0],
    ability: {
      id: 'mud_attack',
      icon: '💥',
      name: '진흙탕 작전',
      description: '25~75% 구간에서 1초마다 30% 확률로 최근접 라이벌 -80M 끌어당김, 쿨다운 2초',
      cooldown: 1,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.25 || horse.position > game.finishLine * 0.75) return null;
        if (Math.random() >= 0.3) return null;
        const target = game.findNearestRival(horse);
        if (!target) return null;
        return {
          type: 'target_pullback',
          targetId: target.laneIndex,
          amount: 80,
          message: `중원패왕의 진흙탕 작전! ${target.name}이(가) 페이스를 잃고 -80M 후퇴!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      const peak = Math.exp(-Math.pow((p - 0.5) * 4.5, 2));
      return [11 + peak * 2, 15 + peak * 5];
    }
  },
  {
    id: 'stamina',
    realtimeBalance: 1,
    name: '불굴의 철마',
    jockey: '기수 윤승호',
    description: '초반은 느리지만 달릴수록 강해집니다. 매 7초마다 +180M 폭발 점프로 단숨에 판세를 뒤집습니다.',
    trait: '점진 가속형',
    color: '#FF8822',
    glColor: [1.0, 0.53, 0.13],
    ability: {
      id: 'second_wind',
      icon: '🔋',
      name: '2단 가속',
      description: '매 7초마다 +180M 즉시 워프 확정 발동',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 7 !== 0) return null;
        return {
          type: 'self_warp',
          amount: 180,
          message: `불굴의 철마, 비축한 체력 폭발! 2단 가속으로 +180M!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      return [9 + p * 2, 9 + p * 2.5];
    }
  },
  {
    id: 'sprinter',
    realtimeBalance: 1,
    name: '번개질주',
    jockey: '기수 강민아',
    description: '평소엔 느리지만 순간 폭발력이 무섭습니다. 쿨다운마다 20% 확률로 +100M 순간 워프, 28% 확률로 고속 구간 돌입.',
    trait: '순간 폭발형',
    color: '#00DDFF',
    glColor: [0.0, 0.87, 1.0],
    ability: {
      id: 'lightning_warp',
      icon: '⚡',
      name: '광속 워프',
      description: '쿨다운 4초마다 20% 확률로 +100M 순간 워프',
      cooldown: 4,
      trigger(horse) {
        if (Math.random() >= 0.20) return null;
        return {
          type: 'self_warp',
          amount: 100,
          message: `번개질주, 광속 워프! 눈 깜짝할 사이 +100M!`,
        };
      },
    },
    getSpeedRange(_pos) {
      if (Math.random() < 0.28) return [15, 18];
      return [9, 12];
    }
  },
  {
    id: 'tactician',
    realtimeBalance: 1.15,
    name: '역전의 귀재',
    jockey: '기수 신예린',
    description: '4위 이하로 뒤처지면 추격 본능이 불타오릅니다. 20% 확률로 +100M 워프, 선두와 거리가 멀수록 기본 속도도 빨라집니다.',
    trait: '전략적 적응형',
    color: '#FF66CC',
    glColor: [1.0, 0.4, 0.8],
    ability: {
      id: 'comeback',
      icon: '🏹',
      name: '추격 본능',
      description: '4등 이하일 때 20% 확률로 +100M 즉시 워프, 쿨다운 2초',
      cooldown: 2,
      trigger(horse, game) {
        const sorted = game.sortedByPosition;
        const rank = sorted.indexOf(horse) + 1;
        if (rank < 4) return null;
        if (Math.random() >= 0.2) return null;
        return {
          type: 'self_warp',
          amount: 100,
          message: `역전의 귀재, 추격 본능 발동! 폭발적으로 +100M 따라잡습니다!`,
        };
      },
    },
    getSpeedRange(pos, leadPos) {
      const gap = Math.max(0, (leadPos || pos) - pos);
      const urgency = Math.min(1, gap / 140);
      return [9.5 + urgency * 3, 12 + urgency * 4];
    }
  }
];

// 100,000회 시뮬레이션 기반 사전 측정 배당 (8마리 모두 출전 기준, margin 0.85)
// 측정 확률은 주석에 함께 기록 (변경 시 scripts/simulate-odds.mjs 재실행)
export const BASE_ODDS = {
  late_surge:   { win: 5.7,  place: 1.3 }, // win 14.80% / place 67.64%
  front_runner: { win: 5.8,  place: 3.8 }, // win 14.65% / place 22.25%
  steady:       { win: 13.8, place: 2.6 }, // win  6.17% / place 32.56%
  lucky_star:   { win: 5.2,  place: 3.7 }, // win 16.35% / place 23.15%
  mid_race:     { win: 13.4, place: 1.8 }, // win  6.36% / place 47.71%
  stamina:      { win: 7.4,  place: 2.0 }, // win 11.45% / place 41.71%
  sprinter:     { win: 6.3,  place: 3.5 }, // win 13.42% / place 24.52%
  tactician:    { win: 5.1,  place: 2.1 }, // win 16.79% / place 40.47%
};

export function calculateSpeed(horseType, position, leadPosition, buffs = []) {
  const [min, max] = horseType.getSpeedRange(position, leadPosition);
  let raw = min + Math.random() * (max - min);
  for (const b of buffs) {
    if (b.kind === 'speed_mult') raw *= b.value;
  }
  raw *= DISTANCE_SPEED_SCALE;
  return Math.max(40, Math.min(175, raw));
}

export function calculateRealtimeSpeed(horseType, position, leadPosition, buffs = []) {
  const [min, max] = horseType.getSpeedRange(position, leadPosition);
  let raw = min + Math.random() * (max - min);
  for (const b of buffs) {
    if (b.kind === 'speed_mult') raw *= b.value;
  }
  raw *= REALTIME_SPEED_SCALE;
  raw *= horseType.realtimeBalance ?? 1;
  return raw;
}
