export const RACE_DISTANCE = 1000;
const DISTANCE_SPEED_SCALE = 12.0;
const REALTIME_SPEED_SCALE = 2.6;

const progressOf = (pos) => pos / RACE_DISTANCE;

export const HORSE_TYPES = [
  {
    id: 'late_surge',
    realtimeBalance: 1,
    name: '후반 폭발마',
    jockey: '기수 김민준',
    description: '초반 400M는 느리게 달리지만 후반에 폭발적으로 가속합니다. 결승선에 가까울수록 무서운 속도를 냅니다.',
    trait: '후반 폭발형',
    color: '#FF4444',
    glColor: [1.0, 0.27, 0.27],
    ability: {
      id: 'final_burst',
      icon: '🔥',
      name: '막판 스퍼트',
      description: '전체 거리 60% 이후 26% 확률로 짧은 시간 동안 1.5배 가속',
      cooldown: 3,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.7) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 2.5, roundsLeft: 1, label: '🔥' },
          message: `${horse.name}, 결승선이 보이자 막판 스퍼트 발동! 2배 가속!`,
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
    name: '선두 돌진마',
    jockey: '기수 이서연',
    description: '출발과 동시에 전력질주합니다. 초반에 압도적이지만 체력이 소진되며 후반에는 크게 처집니다.',
    trait: '선두 질주형',
    color: '#4488FF',
    glColor: [0.27, 0.53, 1.0],
    ability: {
      id: 'opening_strike',
      icon: '⚡',
      name: '기선제압',
      description: '초반 10초 동안 18% 확률로 +60M 즉시 이동',
      cooldown: 1,
      trigger(horse, game) {
        if (game.round > 10) return null;
        if (Math.random() >= 0.18) return null;
        return {
          type: 'self_warp',
          amount: 80,
          message: `${horse.name}이(가) 기선제압! 출발과 동시에 +60M 점프!`,
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
    name: '균형의 달인',
    jockey: '기수 박지우',
    description: '처음부터 끝까지 일정한 페이스를 유지합니다. 화려함은 없지만 꾸준한 성적을 냅니다.',
    trait: '균형 유지형',
    color: '#33CC55',
    glColor: [0.2, 0.8, 0.33],
    ability: {
      id: 'pace_master',
      icon: '🛡️',
      name: '페이스 마스터',
      description: '매 6초마다 짧은 시간 동안 1.5배 가속 (확정 발동)',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 6 !== 0) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 1.5, roundsLeft: 1, label: '🛡️' },
          message: `${horse.name}의 정확한 호흡! 페이스 마스터로 1.5배 가속!`,
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
    name: '럭키 스타',
    jockey: '기수 최하늘',
    description: '완전히 예측 불가능합니다! 운이 좋으면 선두, 나쁘면 꼴찌. 가장 스릴 넘치는 말입니다.',
    trait: '랜덤 폭발형',
    color: '#FFD700',
    glColor: [1.0, 0.84, 0.0],
    ability: {
      id: 'lucky_coin',
      icon: '💰',
      name: '행운의 동전',
      description: '40% 확률로 동전 던지기! 성공 시 +85M, 실패 시 -75M',
      cooldown: 1,
      trigger(horse) {
        if (Math.random() >= 0.4) return null;
        const lucky = Math.random() < 0.6;
        return {
          type: 'self_warp',
          amount: lucky ? 80 : -50,
          message: lucky
            ? `${horse.name}, 행운의 동전 앞면! 단숨에 +85M 점프!`
            : `${horse.name}, 동전 뒷면이 나왔다! -75M 후퇴...`,
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
    name: '중반 강자',
    jockey: '기수 정도현',
    description: '300M~700M 구간에서 최고의 퍼포먼스를 발휘합니다. 중반 레이스의 제왕입니다.',
    trait: '중반 특화형',
    color: '#AA44FF',
    glColor: [0.67, 0.27, 1.0],
    ability: {
      id: 'mud_attack',
      icon: '💥',
      name: '진흙탕 작전',
      description: '25~75% 구간에서 20% 확률로 가장 가까운 라이벌 -80M',
      cooldown: 2,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.25 || horse.position > game.finishLine * 0.75) return null;
        if (Math.random() >= 0.2) return null;
        const target = game.findNearestRival(horse);
        if (!target) return null;
        return {
          type: 'target_pullback',
          targetId: target.laneIndex,
          amount: 80,
          message: `${horse.name}의 진흙탕 작전! ${target.name}이(가) 페이스를 잃고 -80M 후퇴!`,
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
    name: '지구력 전사',
    jockey: '기수 윤승호',
    description: '끊임없이 체력을 비축합니다. 라운드가 거듭될수록 점점 빨라지며 마지막에 진가를 발휘합니다.',
    trait: '점진 가속형',
    color: '#FF8822',
    glColor: [1.0, 0.53, 0.13],
    ability: {
      id: 'second_wind',
      icon: '🔋',
      name: '2단 가속',
      description: '매 8초마다 +180M 즉시 이동 (확정 발동)',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 7 !== 0) return null;
        return {
          type: 'self_warp',
          amount: 180,
          message: `${horse.name}의 비축한 체력 폭발! 2단 가속으로 +180M!`,
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
    name: '번개 질주',
    jockey: '기수 강민아',
    description: '확률적으로 강하게 폭발합니다. 하지만 나머지 시간엔 느립니다. 고위험 고수익 전략의 말.',
    trait: '순간 폭발형',
    color: '#00DDFF',
    glColor: [0.0, 0.87, 1.0],
    ability: {
      id: 'lightning_warp',
      icon: '⚡',
      name: '광속 워프',
      description: '스킬 체크 시 16% 확률로 +100M 순간 워프',
      cooldown: 4,
      trigger(horse) {
        if (Math.random() >= 0.20) return null;
        return {
          type: 'self_warp',
          amount: 100,
          message: `${horse.name}의 광속 워프! 눈 깜짝할 사이 +100M!`,
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
    name: '전략의 귀재',
    jockey: '기수 신예린',
    description: '선두와의 거리를 파악하고 전략적으로 페이스를 조절합니다. 뒤처질수록 더욱 강해집니다.',
    trait: '전략적 적응형',
    color: '#FF66CC',
    glColor: [1.0, 0.4, 0.8],
    ability: {
      id: 'comeback',
      icon: '🏹',
      name: '추격 본능',
      description: '4등 이하일 때 20% 확률로 +70M 즉시 이동',
      cooldown: 2,
      trigger(horse, game) {
        const sorted = game.sortedByPosition;
        const rank = sorted.indexOf(horse) + 1;
        if (rank < 4) return null;
        if (Math.random() >= 0.2) return null;
        return {
          type: 'self_warp',
          amount: 100,
          message: `${horse.name}의 추격 본능 발동! 폭발적으로 +100M 따라잡습니다!`,
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
  late_surge:   { win: 5.3,  place: 1.2 }, // win 15.98% / place 69.27%
  front_runner: { win: 6.1,  place: 3.9 }, // win 13.91% / place 22.02%
  steady:       { win: 26.8, place: 3.9 }, // win  3.18% / place 22.00%
  lucky_star:   { win: 4.9,  place: 3.4 }, // win 17.47% / place 25.27%
  mid_race:     { win: 19.5, place: 1.9 }, // win  4.37% / place 44.51%
  stamina:      { win: 7.9,  place: 2.0 }, // win 10.78% / place 42.65%
  sprinter:     { win: 5.3,  place: 2.9 }, // win 16.08% / place 29.82%
  tactician:    { win: 4.7,  place: 1.9 }, // win 18.25% / place 44.46%
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
