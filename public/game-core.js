// Shared, deterministic rules. The server replays the exact same simulation.
export const RULES_VERSION = 'rock-run-2';
export const TICKS_PER_SECOND = 60;
export const MAX_TICKS = 60 * 60 * 10;
export const MAX_ACTIONS = 10000;
export const GAME_WIDTH = 760;
export const GAME_HEIGHT = 310;
export const PLAYER_Y = GAME_HEIGHT - 48;

export class GameReplayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameReplayError';
  }
}

function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new GameReplayError('Invalid game seed.');
  }
}

export function createGame(seed) {
  validateSeed(seed);
  return {
    tick: 0,
    lane: 1,
    score: 0,
    rocks: 0,
    lives: 3,
    combo: 0,
    ended: false,
    reason: null,
    objects: [],
    rng: (seed || 0x6d2b79f5) >>> 0,
    nextSpawnTick: 30,
    invincibleUntil: 0,
    lastEvent: null
  };
}

function random(state) {
  let value = state.rng;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 4294967296;
}

export function stepGame(state, direction = 0) {
  if (direction !== -1 && direction !== 0 && direction !== 1) {
    throw new GameReplayError('Invalid movement.');
  }
  if (state.ended) return state;

  state.lastEvent = null;
  state.lane = Math.max(0, Math.min(2, state.lane + direction));

  if (state.tick >= state.nextSpawnTick) {
    state.objects.push({
      lane: Math.floor(random(state) * 3),
      type: random(state) < 0.56 ? 'ghost' : 'rock',
      position: -25000,
      y: -25
    });
    state.nextSpawnTick = state.tick + Math.max(25, 66 - Math.floor(state.tick / 900) * 3);
  }

  // Integer positions avoid frame-rate differences between client and server.
  const velocity = Math.min(7200, 2400 + Math.floor(state.tick / 1200) * 250);
  const playerPosition = PLAYER_Y * 1000;

  for (let index = state.objects.length - 1; index >= 0; index--) {
    const item = state.objects[index];
    item.position += velocity;
    item.y = item.position / 1000;

    if (item.lane === state.lane && Math.abs(item.position - playerPosition) < 24000) {
      state.objects.splice(index, 1);
      if (item.type === 'rock') {
        state.rocks++;
        state.combo++;
        const points = 100 + Math.min(state.combo - 1, 8) * 25;
        state.score += points;
        state.lastEvent = { type: 'rock', points, tick: state.tick };
      } else if (state.tick >= state.invincibleUntil) {
        state.lives--;
        state.combo = 0;
        state.invincibleUntil = state.tick + 50;
        state.lastEvent = { type: 'hit', tick: state.tick };
      }
    } else if (item.position > (GAME_HEIGHT + 30) * 1000) {
      state.objects.splice(index, 1);
      if (item.type === 'rock') state.combo = 0;
    }
  }

  state.tick++;
  if (state.tick % TICKS_PER_SECOND === 0) state.score += 5;
  if (state.lives <= 0) {
    state.ended = true;
    state.reason = 'ghosts';
  } else if (state.tick >= MAX_TICKS) {
    state.ended = true;
    state.reason = 'time';
  }
  return state;
}

export function replayGame(seed, actions, endTick) {
  validateSeed(seed);
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > MAX_TICKS) {
    throw new GameReplayError('Invalid run duration.');
  }
  if (!Array.isArray(actions) || actions.length > MAX_ACTIONS) {
    throw new GameReplayError('Invalid movement history.');
  }
  let previousTick = -1;
  for (const action of actions) {
    if (!action || typeof action !== 'object' ||
        !Number.isInteger(action.tick) || action.tick <= previousTick ||
        action.tick < 0 || action.tick >= endTick ||
        (action.direction !== -1 && action.direction !== 1)) {
      throw new GameReplayError('Invalid movement history.');
    }
    previousTick = action.tick;
  }

  const state = createGame(seed);
  let actionIndex = 0;
  while (state.tick < endTick) {
    if (state.ended) throw new GameReplayError('Run continued after game over.');
    let direction = 0;
    if (actionIndex < actions.length && actions[actionIndex].tick === state.tick) {
      direction = actions[actionIndex++].direction;
    }
    stepGame(state, direction);
  }
  return state;
}
