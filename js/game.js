import { HORSE_TYPES, RACE_DISTANCE, calculateSpeed } from './horses.js';

const VISUAL_SPEED = 55;

export class GameState {
  constructor(selectedHorseIndices = HORSE_TYPES.map((_, i) => i), jockeyNames = []) {
    const horseIndices = Array.isArray(selectedHorseIndices)
      ? selectedHorseIndices
      : HORSE_TYPES.slice(0, selectedHorseIndices).map((_, i) => i);

    this.horses = horseIndices.map((horseIndex, laneIndex) => {
      const baseType = HORSE_TYPES[horseIndex];
      const customJockey = jockeyNames[horseIndex]?.trim();
      const type = {
        ...baseType,
        jockey: customJockey || '',
      };

      return {
      id: horseIndex,
      type,
      name: type.name,
      position: 0,
      displayPosition: 0,
      moveStartPosition: 0,
      moveTargetPosition: 0,
      moveProgress: 1,
      moveDuration: 0,
      runEffectTime: 0,
      runningEffectActive: false,
      dustTimer: 0,
      lastMove: 0,
      finished: false,
      finishRound: null,
      finishProgress: null,
      rank: null,
      laneIndex,
      spriteIndex: horseIndex,
      buffs: [],
      abilityCooldown: 0,
      abilityFlashTime: 0,
      };
    });
    this.round = 0;
    this.maxRounds = 100;
    this.finishLine = RACE_DISTANCE;
    this.finishOrder = [];
    this.isFinished = false;
    this.lastRoundData = null;
  }

  get leader() {
    return this.sortedByPosition[0] || this.horses[0];
  }

  get sortedByPosition() {
    return [...this.horses].sort((a, b) => {
      if (a.finished && b.finished) return a.rank - b.rank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.position - a.position;
    });
  }

  get liveRanking() {
    return [...this.horses].sort((a, b) => {
      if (a.finished && b.finished) return a.rank - b.rank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      const aPos = a.displayPosition ?? a.position;
      const bPos = b.displayPosition ?? b.position;
      return bPos - aPos;
    });
  }

  findNearestRival(horse) {
    let best = null;
    let bestDist = Infinity;
    for (const h of this.horses) {
      if (h === horse || h.finished) continue;
      const d = Math.abs(h.position - horse.position);
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  _applyAbilityEvent(source, event) {
    switch (event.type) {
      case 'self_buff':
        source.buffs.push({ ...event.buff });
        source.abilityFlashTime = 1.2;
        break;
      case 'self_warp':
        source.position = Math.max(0, Math.min(this.finishLine, source.position + event.amount));
        source.abilityFlashTime = 1.2;
        break;
      case 'target_pullback': {
        const target = this.horses.find(h => h.laneIndex === event.targetId);
        if (target && !target.finished) {
          target.position = Math.max(0, target.position - event.amount);
          target.abilityFlashTime = 1.2;
          source.abilityFlashTime = 1.2;
        }
        break;
      }
    }
  }

  runRound() {
    if (this.isFinished) return null;
    this.round++;

    const events = [];

    for (const horse of this.horses) {
      if (horse.abilityCooldown > 0) horse.abilityCooldown--;
      if (horse.buffs && horse.buffs.length) {
        horse.buffs.forEach(b => b.roundsLeft--);
        horse.buffs = horse.buffs.filter(b => b.roundsLeft > 0);
      }
    }

    for (const horse of this.horses) {
      if (horse.finished) continue;
      if ((horse.abilityCooldown || 0) > 0) continue;
      const ability = horse.type.ability;
      if (!ability) continue;
      const event = ability.trigger(horse, this);
      if (!event) continue;
      horse.abilityCooldown = ability.cooldown || 0;
      this._applyAbilityEvent(horse, event);
      events.push({
        sourceLane: horse.laneIndex,
        sourceName: horse.name,
        sourceColor: horse.type.color,
        icon: ability.icon,
        abilityName: ability.name,
        message: event.message,
      });
    }

    const leadPos = this.leader.position;
    const moves = [];
    const newlyFinished = [];

    for (const horse of this.horses) {
      if (horse.finished) {
        moves.push({ horse, moved: 0 });
        continue;
      }
      horse.moveStartPosition = horse.displayPosition ?? horse.position;
      const startPosition = horse.position;
      const speed = calculateSpeed(horse.type, horse.position, leadPos, horse.buffs);
      horse.lastMove = speed;
      horse.position = Math.min(this.finishLine, horse.position + speed);
      horse.moveTargetPosition = horse.position;
      horse.moveProgress = 0;
      const visualDistance = Math.abs(horse.moveTargetPosition - horse.moveStartPosition);
      horse.moveDuration = Math.max(0.25, visualDistance / VISUAL_SPEED);
      horse.runEffectTime = horse.moveDuration + 0.3;
      horse.runningEffectActive = true;

      if (horse.position >= this.finishLine && !horse.finished) {
        horse.finished = true;
        horse.finishRound = this.round;
        horse.finishProgress = (this.finishLine - startPosition) / Math.max(0.000001, speed);
        newlyFinished.push(horse);
      }
      moves.push({ horse, moved: speed });
    }

    newlyFinished
      .sort((a, b) => {
        const progressDiff = a.finishProgress - b.finishProgress;
        if (Math.abs(progressDiff) > 0.000001) return progressDiff;
        return b.lastMove - a.lastMove;
      })
      .forEach(horse => {
        horse.rank = this.finishOrder.length + 1;
        this.finishOrder.push(horse);
        horse.buffs = [];
        horse.abilityCooldown = 0;
      });

    const allFinished = this.horses.every(h => h.finished);
    if (allFinished || this.round >= this.maxRounds) {
      this.isFinished = true;
      let nextRank = this.finishOrder.length + 1;
      for (const h of this.sortedByPosition) {
        if (!h.finished) {
          h.rank = nextRank++;
        }
      }
    }

    this.lastRoundData = { round: this.round, moves, leader: this.leader, abilityEvents: events, finishLine: this.finishLine, maxRounds: this.maxRounds };
    return this.lastRoundData;
  }
}
