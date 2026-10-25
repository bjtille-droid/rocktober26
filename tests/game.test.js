import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, replayGame, GameReplayError, MAX_TICKS, MAX_ACTIONS, PLAYER_Y
} from '../public/game-core.js';

test('the same seed and moves produce an exact server replay', () => {
  const game = createGame(0x1248beef);
  const actions = [];
  while (!game.ended && game.tick < 500) {
    const direction = game.tick % 47 === 0 ? (game.lane === 2 ? -1 : 1) : 0;
    if (direction) actions.push({ tick: game.tick, direction });
    stepGame(game, direction);
  }
  assert.deepEqual(replayGame(0x1248beef, actions, game.tick), game);
});

test('zero is a valid seed and remains deterministic', () => {
  assert.deepEqual(replayGame(0, [], 60), replayGame(0, [], 60));
});

test('a run continues beyond five rocks and rock streaks increase points', () => {
  const game = createGame(2);
  game.nextSpawnTick = 1000;
  for (let index = 0; index < 7; index++) {
    game.objects.push({ lane: 1, type: 'rock', position: PLAYER_Y * 1000 - 2400, y: PLAYER_Y - 2.4 });
    stepGame(game);
  }
  assert.equal(game.rocks, 7);
  assert.equal(game.combo, 7);
  assert.equal(game.ended, false);
  assert.ok(game.score > 700);
});

test('ghost collisions cost lives, give a brief recovery, and end after three hits', () => {
  const game = createGame(3);
  game.nextSpawnTick = MAX_TICKS;
  for (let hit = 0; hit < 3; hit++) {
    game.objects.push({ lane: 1, type: 'ghost', position: PLAYER_Y * 1000 - 2400, y: PLAYER_Y - 2.4 });
    stepGame(game);
    if (hit < 2) for (let i = 0; i < 50; i++) stepGame(game);
  }
  assert.equal(game.lives, 0);
  assert.equal(game.ended, true);
  assert.equal(game.reason, 'ghosts');
});

test('surviving earns points even without collecting a rock', () => {
  const game = createGame(7);
  game.nextSpawnTick = MAX_TICKS;
  for (let i = 0; i < 120; i++) stepGame(game);
  assert.equal(game.rocks, 0);
  assert.equal(game.score, 10);
});

test('replay rejects reordered, duplicate, noninteger, future, or impossible input', () => {
  const invalid = [
    [{ tick: 10, direction: 1 }, { tick: 9, direction: -1 }],
    [{ tick: 0, direction: 1 }, { tick: 0, direction: 1 }],
    [{ tick: 1.5, direction: -1 }],
    [{ tick: 60, direction: 1 }],
    [{ tick: 0, direction: 2 }],
    [null]
  ];
  for (const actions of invalid) assert.throws(() => replayGame(1, actions, 60), GameReplayError);
  assert.throws(() => replayGame(1, new Array(MAX_ACTIONS + 1).fill({ tick: 0, direction: 1 }), 60), GameReplayError);
  for (const endTick of [0, -1, 1.2, Infinity, MAX_TICKS + 1]) {
    assert.throws(() => replayGame(1, [], endTick), GameReplayError);
  }
  for (const seed of [-1, 0x100000000, NaN, '1']) {
    assert.throws(() => replayGame(seed, [], 60), GameReplayError);
  }
});

test('replay cannot add survival points after death', () => {
  const game = createGame(99);
  while (!game.ended) stepGame(game);
  assert.equal(game.reason, 'ghosts');
  assert.deepEqual(replayGame(99, [], game.tick), game);
  assert.throws(() => replayGame(99, [], game.tick + 1), GameReplayError);
});
