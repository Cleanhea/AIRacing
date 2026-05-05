import { HORSE_TYPES, calculateSpeed } from './horses.js';

export class GameState {
  constructor(count) {
    this.horses = HORSE_TYPES.slice(0, count).map((type, i) => ({
      id: i,
      type,
      name: type.name,
      position: 0,
      lastMove: 0,
      finished: false,
      finishRound: null,
      rank: null,
      laneIndex: i,
    }));
    this.round = 0;
    this.maxRounds = 100;
    this.finishLine = 100;
    this.finishOrder = [];
    this.isFinished = false;
    this.lastRoundData = null;
  }

  get leader() {
    return this.horses.reduce((a, b) => (a.position >= b.position ? a : b));
  }

  get sortedByPosition() {
    return [...this.horses].sort((a, b) => b.position - a.position);
  }

  runRound() {
    if (this.isFinished) return null;
    this.round++;

    const leadPos = this.leader.position;
    const moves = [];

    for (const horse of this.horses) {
      if (horse.finished) {
        moves.push({ horse, moved: 0 });
        continue;
      }
      const speed = calculateSpeed(horse.type, horse.position, leadPos);
      horse.lastMove = speed;
      horse.position = Math.min(this.finishLine, horse.position + speed);

      if (horse.position >= this.finishLine && !horse.finished) {
        horse.finished = true;
        horse.finishRound = this.round;
        horse.rank = this.finishOrder.length + 1;
        this.finishOrder.push(horse);
      }
      moves.push({ horse, moved: speed });
    }

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

    this.lastRoundData = { round: this.round, moves, leader: this.leader };
    return this.lastRoundData;
  }
}
