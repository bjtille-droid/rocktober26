import {
  RULES_VERSION, TICKS_PER_SECOND, MAX_TICKS, MAX_ACTIONS,
  GAME_WIDTH, GAME_HEIGHT, PLAYER_Y, createGame, stepGame
} from './game-core.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('gameStatus');
const startButton = document.getElementById('startGame');
const bankButton = document.getElementById('bankGame');
const submitButton = document.getElementById('submitScore');
const scoreStatus = document.getElementById('scoreStatus');
const nameInput = document.getElementById('playerName');
const scoreDisplay = document.getElementById('rockScore');
const livesDisplay = document.getElementById('lives');
const bestDisplay = document.getElementById('bestScore');
const localBestKey = 'rocktober-arcade-personal-best-v2';

let best = 0;
try { best = Math.max(0, Number(localStorage.getItem(localBestKey)) || 0); } catch {}
let game = createGame(1);
let mode = 'idle';
let run = null;
let history = [];
let pendingDirection = 0;
let frameId = 0;
let generation = 0;
let lastTime = 0;
let accumulator = 0;
let submitted = false;
let submitInFlight = false;

canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;
bestDisplay.textContent = `YOUR BEST ${best.toLocaleString()}`;

function randomSeed() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

async function request(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data;
    try { data = await response.json(); } catch {
      throw new Error('The shared arcade is unavailable right now.');
    }
    if (!response.ok) throw new Error(data.message || 'The request could not be completed.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The shared arcade took too long to respond.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function updateHud() {
  document.getElementById('scoreEntry').hidden = mode !== 'finished';
  scoreDisplay.textContent = `SCORE ${String(game.score).padStart(6, '0')}`;
  livesDisplay.textContent = `LIVES ${game.lives}`;
  bestDisplay.textContent = `YOUR BEST ${best.toLocaleString()}`;
  bankButton.disabled = !['playing', 'paused'].includes(mode) || game.tick < TICKS_PER_SECOND;
  submitButton.disabled = mode !== 'finished' || !run || submitted || submitInFlight;
}

function laneX(lane) { return [GAME_WIDTH * .2, GAME_WIDTH * .5, GAME_WIDTH * .8][lane]; }

function drawGhost(x, y) {
  ctx.fillStyle = '#e7dfc9';
  ctx.beginPath();
  ctx.moveTo(x - 17, y + 16);
  ctx.lineTo(x - 17, y - 3);
  ctx.arc(x, y - 3, 17, Math.PI, 0);
  ctx.lineTo(x + 17, y + 16);
  ctx.lineTo(x + 9, y + 9);
  ctx.lineTo(x + 2, y + 16);
  ctx.lineTo(x - 5, y + 9);
  ctx.lineTo(x - 12, y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#211d1a';
  ctx.beginPath();
  ctx.ellipse(x - 6, y - 3, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 6, y - 3, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(x, y) {
  ctx.fillStyle = '#a99b80';
  ctx.strokeStyle = '#d4e477';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 15, y + 8);
  ctx.lineTo(x - 12, y - 6);
  ctx.lineTo(x - 3, y - 13);
  ctx.lineTo(x + 10, y - 10);
  ctx.lineTo(x + 16, y + 2);
  ctx.lineTo(x + 10, y + 11);
  ctx.lineTo(x - 7, y + 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPumpkin(x, y) {
  if (mode === 'playing' && game.tick < game.invincibleUntil && Math.floor(game.tick / 4) % 2) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ee4d2c';
  ctx.strokeStyle = '#f5c55b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-9, 0, 8, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(9, 0, 8, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#687d2c';
  ctx.fillRect(-3, -23, 7, 9);
  ctx.fillStyle = '#211d1a';
  ctx.beginPath();
  ctx.moveTo(-11, -4); ctx.lineTo(-5, -12); ctx.lineTo(-1, -4); ctx.closePath();
  ctx.moveTo(3, -4); ctx.lineTo(8, -12); ctx.lineTo(12, -4); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 6); ctx.lineTo(8, 6); ctx.lineTo(4, 12); ctx.lineTo(-4, 12); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw() {
  const w = GAME_WIDTH, h = GAME_HEIGHT;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#111014';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d4c39f';
  ctx.beginPath(); ctx.arc(w - 86, 56, 29, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#756954';
  [[75,42],[120,91],[260,58],[370,35],[526,78],[660,37]].forEach(([x,y]) => ctx.fillRect(x,y,2,2));
  ctx.fillStyle = '#25212a';
  ctx.fillRect(0, h - 24, w, 24);
  for (let i = 0; i < 8; i++) {
    const x = 25 + i * 104, height = 18 + (i * 13) % 20;
    ctx.fillStyle = i % 2 ? '#302a2e' : '#393137';
    ctx.fillRect(x, h - 24 - height, 25, height);
    ctx.beginPath(); ctx.arc(x + 12.5, h - 24 - height, 12.5, Math.PI, 0); ctx.fill();
  }
  ctx.strokeStyle = '#eee3c940';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 9]);
  ctx.lineDashOffset = (game.tick * 1.5) % 14;
  [w / 3, w * 2 / 3].forEach(x => {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 24); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  game.objects.forEach(item => {
    if (item.type === 'ghost') drawGhost(laneX(item.lane), item.y);
    else drawRock(laneX(item.lane), item.y);
  });
  drawPumpkin(laneX(game.lane), PLAYER_Y);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d4e477';
  ctx.font = '700 12px Courier New';
  ctx.fillText(`ROCKS ${game.rocks}  /  STREAK ${game.combo}`, 13, 20);
  ctx.fillStyle = '#b6a98e';
  ctx.fillText(`${Math.floor(game.tick / 60)}s`, 13, 38);
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = '#00000012';
    ctx.fillRect(0, y, w, 1);
  }
  if (mode !== 'playing') {
    ctx.fillStyle = '#0a090cc9';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4e477';
    ctx.font = '900 22px Courier New';
    const title = mode === 'finished' ? 'RUN OVER' : mode === 'paused' ? 'PAUSED' :
      mode === 'starting' ? 'OPENING THE GATE…' : 'ROCK RUN // AFTERLIFE ARCADE';
    ctx.fillText(title, w / 2, h / 2 - 16);
    ctx.fillStyle = '#eee3c9';
    ctx.font = '700 13px Courier New';
    const subtitle = mode === 'finished' ? `${game.score.toLocaleString()} POINTS · ${game.rocks} ROCKS` :
      mode === 'paused' ? 'Press P or Resume to return to the crypt.' :
      mode === 'starting' ? 'Connecting your leaderboard run.' :
      'COLLECT ROCKS · BUILD COMBOS · DODGE GHOSTS';
    ctx.fillText(subtitle, w / 2, h / 2 + 12);
    if (mode === 'idle') {
      ctx.fillStyle = '#b5a98f';
      ctx.font = '700 11px Courier New';
      ctx.fillText('THREE LIVES. ONE VERY LONG NIGHT.', w / 2, h / 2 + 40);
    }
  }
}

function stopLoop() {
  cancelAnimationFrame(frameId);
  frameId = 0;
  lastTime = 0;
  accumulator = 0;
}

function finish(reason) {
  if (!['playing', 'paused'].includes(mode)) return;
  stopLoop();
  mode = 'finished';
  pendingDirection = 0;
  if (game.score > best) {
    best = game.score;
    try { localStorage.setItem(localBestKey, String(best)); } catch {}
  }
  startButton.textContent = 'Run it back';
  status.textContent = reason === 'banked' ? 'Score banked. That was a close one.' :
    game.reason === 'time' ? 'You survived the full ten-minute haunting!' : 'The ghosts caught you. Run it back?';
  scoreStatus.textContent = run ? 'Enter your arcade name to put this run on the shared leaderboard.' :
    'Practice run finished. Shared scoring was unavailable when this run began.';
  updateHud();
  draw();
}

function frame(timestamp, token) {
  if (token !== generation || mode !== 'playing') return;
  const delta = lastTime ? Math.min(timestamp - lastTime, 250) : 0;
  lastTime = timestamp;
  accumulator += delta;
  const stepMs = 1000 / TICKS_PER_SECOND;
  while (accumulator >= stepMs && mode === 'playing') {
    const direction = pendingDirection;
    pendingDirection = 0;
    if (direction) {
      if (history.length >= MAX_ACTIONS) { finish('banked'); return; }
      history.push({ tick: game.tick, direction });
    }
    stepGame(game, direction);
    accumulator -= stepMs;
    if (game.lastEvent?.type === 'rock') status.textContent = `+${game.lastEvent.points} points. Rock streak: ${game.combo}!`;
    if (game.lastEvent?.type === 'hit') status.textContent = `${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left. Keep moving.`;
    if (game.ended || game.tick >= MAX_TICKS) { finish('ended'); return; }
  }
  updateHud();
  draw();
  frameId = requestAnimationFrame(time => frame(time, token));
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'playing';
  lastTime = 0;
  accumulator = 0;
  pendingDirection = 0;
  startButton.textContent = 'Pause run';
  status.textContent = 'Back into the graveyard. P or Escape pauses.';
  canvas.focus({ preventScroll: true });
  frameId = requestAnimationFrame(time => frame(time, generation));
  updateHud();
}

function pause() {
  if (mode !== 'playing') return;
  stopLoop();
  mode = 'paused';
  pendingDirection = 0;
  startButton.textContent = 'Resume run';
  status.textContent = 'Paused. Your run will wait. Press P or Resume when you’re ready.';
  updateHud();
  draw();
}

async function begin() {
  if (mode === 'playing') { pause(); return; }
  if (mode === 'paused') { resume(); return; }
  if (mode === 'starting' || submitInFlight) return;
  stopLoop();
  const token = ++generation;
  mode = 'starting';
  run = null;
  submitted = false;
  history = [];
  pendingDirection = 0;
  startButton.disabled = true;
  startButton.textContent = 'Opening the gate…';
  scoreStatus.textContent = '';
  draw();
  updateHud();
  let seed = randomSeed();
  let unavailableMessage = '';
  try {
    await window.rocktoberSessionReady;
    const result = await request('/api/runs/start', {});
    if (result.rulesVersion !== RULES_VERSION) throw new Error('The arcade has updated. Reload before trying a leaderboard run.');
    if (typeof result.id !== 'string' || !Number.isInteger(result.seed) || result.seed < 0 || result.seed > 0xffffffff) {
      throw new Error('The arcade could not open a verified run.');
    }
    run = result;
    seed = result.seed;
  } catch (error) {
    unavailableMessage = error.message;
  }
  if (token !== generation) return;
  game = createGame(seed);
  mode = 'playing';
  startButton.disabled = false;
  startButton.textContent = 'Pause run';
  status.textContent = run ? 'Leaderboard run. ← / → or A / D to move. P pauses.' :
    'Practice mode. Shared scoring is unavailable; this run stays on your device.';
  scoreStatus.textContent = unavailableMessage ? `${unavailableMessage} You can still practice.` : '';
  lastTime = 0;
  accumulator = 0;
  canvas.focus({ preventScroll: true });
  updateHud();
  frameId = requestAnimationFrame(time => frame(time, token));
}

function requestMove(direction) {
  if (mode === 'playing') pendingDirection = direction;
}

startButton.addEventListener('click', begin);
bankButton.addEventListener('click', () => {
  if (game.tick >= TICKS_PER_SECOND) finish('banked');
});
document.getElementById('leftButton').addEventListener('click', () => requestMove(-1));
document.getElementById('rightButton').addEventListener('click', () => requestMove(1));

document.addEventListener('keydown', event => {
  if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable]')) return;
  const key = event.key.toLowerCase();
  if ((key === 'p' || key === 'escape') && ['playing', 'paused'].includes(mode)) {
    event.preventDefault();
    if (mode === 'playing') pause(); else resume();
  } else if (mode === 'playing' && (key === 'arrowleft' || key === 'a')) {
    event.preventDefault(); requestMove(-1);
  } else if (mode === 'playing' && (key === 'arrowright' || key === 'd')) {
    event.preventDefault(); requestMove(1);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
let pointerX = null;
canvas.addEventListener('pointerdown', event => { pointerX = event.clientX; });
canvas.addEventListener('pointerup', event => {
  if (pointerX !== null && Math.abs(event.clientX - pointerX) > 12) requestMove(event.clientX > pointerX ? 1 : -1);
  pointerX = null;
});
canvas.addEventListener('pointercancel', () => { pointerX = null; });

document.getElementById('scoreForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (mode !== 'finished' || !run || submitted || submitInFlight) return;
  const name = nameInput.value.trim();
  if (!name) { scoreStatus.textContent = 'Add your arcade name first.'; nameInput.focus(); return; }
  if ([...name].length > 24) { scoreStatus.textContent = 'Keep your arcade name to 24 characters.'; return; }
  submitInFlight = true;
  startButton.disabled = true;
  scoreStatus.textContent = 'Verifying your run…';
  updateHud();
  try {
    const result = await request('/api/runs/finish', {
      runId: run.id, name, actions: history, endTick: game.tick
    });
    submitted = true;
    scoreStatus.textContent = `Verified: ${Number(result.score).toLocaleString()} points. ${result.rank ? `You’re #${result.rank} on the board.` : 'Your best is on the board.'}`;
    window.dispatchEvent(new CustomEvent('rocktober:refresh'));
  } catch (error) {
    scoreStatus.textContent = error.message || 'Could not submit. Your run is still here—try again.';
  } finally {
    submitInFlight = false;
    startButton.disabled = false;
    updateHud();
  }
});

updateHud();
draw();
