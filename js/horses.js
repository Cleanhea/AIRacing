export const HORSE_TYPES = [
  {
    id: 'late_surge',
    name: '후반 폭발마',
    jockey: '기수 김민준',
    description: '초반 40M는 느리게 달리지만 후반에 폭발적으로 가속합니다. 결승선에 가까울수록 무서운 속도를 냅니다.',
    trait: '후반 폭발형',
    color: '#FF4444',
    glColor: [1.0, 0.27, 0.27],
    getSpeedRange(pos) {
      const p = pos / 100;
      if (p < 0.3) return [1, 3];
      if (p < 0.6) return [2, 6];
      return [6, 10];
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
    getSpeedRange(pos) {
      const p = pos / 100;
      if (p < 0.35) return [7, 10];
      if (p < 0.65) return [4, 7];
      return [1, 4];
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
    getSpeedRange(_pos) {
      return [4, 7];
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
    getSpeedRange(_pos) {
      const r = Math.random();
      if (r < 0.25) return [8, 10];
      if (r < 0.45) return [1, 2];
      return [3, 7];
    }
  },
  {
    id: 'mid_race',
    name: '중반 강자',
    jockey: '기수 정도현',
    description: '30M~70M 구간에서 최고의 퍼포먼스를 발휘합니다. 중반 레이스의 제왕입니다.',
    trait: '중반 특화형',
    color: '#AA44FF',
    glColor: [0.67, 0.27, 1.0],
    getSpeedRange(pos) {
      const p = pos / 100;
      const peak = Math.exp(-Math.pow((p - 0.5) * 5, 2));
      return [2 + peak * 4, 3 + peak * 7];
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
    getSpeedRange(pos) {
      const p = pos / 100;
      return [1 + p * 5, 3 + p * 7];
    }
  },
  {
    id: 'sprinter',
    name: '번개 질주',
    jockey: '기수 강민아',
    description: '25% 확률로 10M 폭발! 하지만 나머지 시간엔 느립니다. 고위험 고수익 전략의 말.',
    trait: '순간 폭발형',
    color: '#00DDFF',
    glColor: [0.0, 0.87, 1.0],
    getSpeedRange(_pos) {
      if (Math.random() < 0.25) return [9, 10];
      return [1, 3];
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
    getSpeedRange(pos, leadPos) {
      const gap = Math.max(0, (leadPos || pos) - pos);
      const urgency = Math.min(1, gap / 25);
      return [3 + urgency * 3, 5 + urgency * 5];
    }
  }
];

export function calculateSpeed(horseType, position, leadPosition) {
  const [min, max] = horseType.getSpeedRange(position, leadPosition);
  const raw = min + Math.random() * (max - min);
  return Math.max(1, Math.min(10, raw));
}
