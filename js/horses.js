export const RACE_DISTANCE = 1000;
const DISTANCE_SPEED_SCALE = 6.0;

const progressOf = (pos) => pos / RACE_DISTANCE;

export const HORSE_TYPES = [
  {
    id: 'late_surge',
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
      description: '600M 이후 24% 확률로 1라운드 동안 1.35배 가속',
      cooldown: 3,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.6) return null;
        if (Math.random() >= 0.24) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 1.35, roundsLeft: 1, label: '🔥' },
          message: `${horse.name}, 결승선이 보이자 막판 스퍼트 발동! 1.35배 가속!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      if (p < 0.3) return [8, 10];
      if (p < 0.6) return [10, 13];
      return [15, 18];
    }
  },
  {
    id: 'front_runner',
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
      description: '초반 15라운드 동안 32% 확률로 +16M 즉시 이동',
      cooldown: 1,
      trigger(horse, game) {
        if (game.round > 15) return null;
        if (Math.random() >= 0.32) return null;
        return {
          type: 'self_warp',
          amount: 16,
          message: `${horse.name}이(가) 기선제압! 출발과 동시에 +16M 점프!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      if (p < 0.35) return [16, 19];
      if (p < 0.65) return [10, 14];
      return [7, 10];
    }
  },
  {
    id: 'steady',
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
      description: '매 5라운드마다 1.32배 가속 (확정 발동)',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 5 !== 0) return null;
        return {
          type: 'self_buff',
          buff: { kind: 'speed_mult', value: 1.32, roundsLeft: 1, label: '🛡️' },
          message: `${horse.name}의 정확한 호흡! 페이스 마스터로 1.32배 가속!`,
        };
      },
    },
    getSpeedRange(_pos) {
      return [10.9, 13.9];
    }
  },
  {
    id: 'lucky_star',
    name: '럭키 스타',
    jockey: '기수 최하늘',
    description: '완전히 예측 불가능합니다! 운이 좋으면 선두, 나쁘면 꼴찌. 가장 스릴 넘치는 말입니다.',
    trait: '랜덤 폭발형',
    color: '#FFD700',
    glColor: [1.0, 0.84, 0.0],
    ability: {
      id: 'lucky_dice',
      icon: '🎲',
      name: '행운의 주사위',
      description: '24% 확률로 주사위! 50% 확률로 +18M, 50% 확률로 -14M',
      cooldown: 1,
      trigger(horse) {
        if (Math.random() >= 0.24) return null;
        const lucky = Math.random() < 0.5;
        return {
          type: 'self_warp',
          amount: lucky ? 18 : -14,
          message: lucky
            ? `${horse.name}, 행운의 주사위 대박! 단숨에 +18M 점프!`
            : `${horse.name}, 주사위가 빗나갔다! -14M 후퇴...`,
        };
      },
    },
    getSpeedRange(_pos) {
      const r = Math.random();
      if (r < 0.18) return [17, 20];
      if (r < 0.48) return [7, 9];
      return [10, 15];
    }
  },
  {
    id: 'mid_race',
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
      description: '250~750M 구간에서 22% 확률로 가장 가까운 라이벌 -14M',
      cooldown: 3,
      trigger(horse, game) {
        if (horse.position < game.finishLine * 0.25 || horse.position > game.finishLine * 0.75) return null;
        if (Math.random() >= 0.22) return null;
        const target = game.findNearestRival(horse);
        if (!target) return null;
        return {
          type: 'target_pullback',
          targetId: target.laneIndex,
          amount: 14,
          message: `${horse.name}의 진흙탕 작전! ${target.name}이(가) 페이스를 잃고 -14M 후퇴!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      const peak = Math.exp(-Math.pow((p - 0.5) * 4.5, 2));
      return [9.6 + peak * 6.6, 11.6 + peak * 8.4];
    }
  },
  {
    id: 'stamina',
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
      description: '매 12라운드마다 +14M 즉시 이동 (확정 발동)',
      cooldown: 0,
      trigger(horse, game) {
        if (game.round === 0 || game.round % 12 !== 0) return null;
        return {
          type: 'self_warp',
          amount: 14,
          message: `${horse.name}의 비축한 체력 폭발! 2단 가속으로 +14M!`,
        };
      },
    },
    getSpeedRange(pos) {
      const p = progressOf(pos);
      return [8.5 + p * 5.3, 10.5 + p * 6.8];
    }
  },
  {
    id: 'sprinter',
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
      description: '매 라운드 18% 확률로 +18M 순간 워프',
      cooldown: 4,
      trigger(horse) {
        if (Math.random() >= 0.18) return null;
        return {
          type: 'self_warp',
          amount: 18,
          message: `${horse.name}의 광속 워프! 눈 깜짝할 사이 +18M!`,
        };
      },
    },
    getSpeedRange(_pos) {
      if (Math.random() < 0.28) return [18.5, 21];
      return [7.5, 10.5];
    }
  },
  {
    id: 'tactician',
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
      description: '4등 이하일 때 25% 확률로 +16M 즉시 이동',
      cooldown: 2,
      trigger(horse, game) {
        const sorted = game.sortedByPosition;
        const rank = sorted.indexOf(horse) + 1;
        if (rank < 4) return null;
        if (Math.random() >= 0.25) return null;
        return {
          type: 'self_warp',
          amount: 16,
          message: `${horse.name}의 추격 본능 발동! 폭발적으로 +16M 따라잡습니다!`,
        };
      },
    },
    getSpeedRange(pos, leadPos) {
      const gap = Math.max(0, (leadPos || pos) - pos);
      const urgency = Math.min(1, gap / 140);
      return [8.3 + urgency * 4.2, 11.7 + urgency * 6.1];
    }
  }
];

export function calculateSpeed(horseType, position, leadPosition, buffs = []) {
  const [min, max] = horseType.getSpeedRange(position, leadPosition);
  let raw = min + Math.random() * (max - min);
  for (const b of buffs) {
    if (b.kind === 'speed_mult') raw *= b.value;
  }
  raw *= DISTANCE_SPEED_SCALE;
  return Math.max(40, Math.min(175, raw));
}
