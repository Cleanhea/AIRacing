import { HORSE_TYPES, RACE_DISTANCE, calculateSpeed, calculateRealtimeSpeed } from './horses.js';

const VISUAL_SPEED = 55;
const TRAILING_SPEED_BOOSTS = { 5: 1.05, 6: 1.15, 7: 1.25, 8: 1.3 };

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
      abilityCheckTimer: Math.random(),
      abilityFlashTime: 0,
      };
    });
    this.round = 0;
    this.maxRounds = 100;
    this.elapsedTime = 0;
    this.maxRaceSeconds = 90;
    this.finishLine = RACE_DISTANCE;
    this.finishOrder = [];
    this.isFinished = false;
    this.lastRoundData = null;
    this.lastTickData = null;
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

  get runningRanking() {
    return [...this.horses].sort((a, b) => {
      if (a.finished && b.finished) return a.rank - b.rank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.position - a.position;
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
    const smoothWarp = target => {
      target.moveStartPosition = target.displayPosition ?? target.position;
      target.moveTargetPosition = target.position;
      target.moveProgress = 0;
      target.moveDuration = 0.45;
      target.runEffectTime = 0.7;
      target.runningEffectActive = true;
    };

    switch (event.type) {
      case 'self_buff':
        source.buffs.push({ durationLeft: 2.0, ...event.buff });
        source.abilityFlashTime = 1.2;
        break;
      case 'self_warp':
        source.position = Math.max(0, Math.min(this.finishLine, source.position + event.amount));
        smoothWarp(source);
        source.abilityFlashTime = 1.2;
        break;
      case 'target_pullback': {
        const target = this.horses.find(h => h.laneIndex === event.targetId);
        if (target && !target.finished) {
          target.position = Math.max(0, target.position - event.amount);
          smoothWarp(target);
          target.abilityFlashTime = 1.2;
          source.abilityFlashTime = 1.2;
        }
        break;
      }
    }
  }

  _formatAbilityEvent(horse, ability, event) {
    return {
      sourceLane: horse.laneIndex,
      sourceName: horse.name,
      sourceColor: horse.type.color,
      icon: ability.icon,
      abilityName: ability.name,
      message: event.message,
    };
  }

  update(dt) {
    if (this.isFinished) return null;

    const step = Math.max(0, Math.min(dt, 0.1));
    const startTime = this.elapsedTime;
    this.elapsedTime += step;
    this.round = Math.floor(this.elapsedTime);

    const events = [];
    for (const horse of this.horses) {
      horse.abilityCooldown = Math.max(0, (horse.abilityCooldown || 0) - step);
      horse.abilityCheckTimer = Math.max(0, (horse.abilityCheckTimer || 0) - step);
      if (horse.buffs && horse.buffs.length) {
        horse.buffs.forEach(b => {
          if (typeof b.durationLeft === 'number') b.durationLeft -= step;
          else b.roundsLeft -= step;
        });
        horse.buffs = horse.buffs.filter(b => (b.durationLeft ?? b.roundsLeft ?? 0) > 0);
      }
    }

    for (const horse of this.horses) {
      if (horse.finished) continue;
      if ((horse.abilityCooldown || 0) > 0 || (horse.abilityCheckTimer || 0) > 0) continue;
      horse.abilityCheckTimer = 1;
      const ability = horse.type.ability;
      if (!ability) continue;
      const event = ability.trigger(horse, this);
      if (!event) continue;
      horse.abilityCooldown = Math.max(0, ability.cooldown || 0);
      this._applyAbilityEvent(horse, event);
      events.push(this._formatAbilityEvent(horse, ability, event));
    }

    const leadPos = this.leader.position;
    const moves = [];
    const newlyFinished = [];
    const rankByHorse = new Map(this.runningRanking.map((horse, index) => [horse, index + 1]));

    for (const horse of this.horses) {
      if (horse.finished) {
        moves.push({ horse, moved: 0 });
        continue;
      }

      const startPosition = horse.position;
      let speed = calculateRealtimeSpeed(horse.type, horse.position, leadPos, horse.buffs);
      
      // Give trailing horses a small catch-up boost based on simulation position.
      const currentRank = rankByHorse.get(horse) || 1;
      if (currentRank >= 5) {
        const boost = TRAILING_SPEED_BOOSTS[currentRank] || TRAILING_SPEED_BOOSTS[8];
        speed *= boost;
      }
      
      const moved = speed * step;
      horse.lastMove = speed;
      horse.position = Math.min(this.finishLine, horse.position + moved);
      horse.runEffectTime = 0.15;
      horse.runningEffectActive = true;

      if (horse.position >= this.finishLine && !horse.finished) {
        horse.finished = true;
        const needed = this.finishLine - startPosition;
        const finishRatio = needed / Math.max(0.000001, moved);
        horse.finishRound = this.round;
        horse.finishTime = startTime + step * finishRatio;
        horse.finishProgress = finishRatio;
        newlyFinished.push(horse);
      }
      moves.push({ horse, moved });
    }

    newlyFinished
      .sort((a, b) => {
        const timeDiff = a.finishTime - b.finishTime;
        if (Math.abs(timeDiff) > 0.000001) return timeDiff;
        return b.lastMove - a.lastMove;
      })
      .forEach(horse => {
        horse.rank = this.finishOrder.length + 1;
        this.finishOrder.push(horse);
        horse.buffs = [];
        horse.abilityCooldown = 0;
      });

    const allFinished = this.horses.every(h => h.finished);
    if (allFinished || this.elapsedTime >= this.maxRaceSeconds) {
      this.isFinished = true;
      let nextRank = this.finishOrder.length + 1;
      for (const h of this.sortedByPosition) {
        if (!h.finished) {
          h.rank = nextRank++;
        }
      }
    }

    this.lastTickData = {
      round: this.round,
      elapsedTime: this.elapsedTime,
      moves,
      leader: this.leader,
      abilityEvents: events,
      finishLine: this.finishLine,
      maxRounds: this.maxRaceSeconds,
    };
    return this.lastTickData;
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
      events.push(this._formatAbilityEvent(horse, ability, event));
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
