import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const origin = new URL(process.env.LIVE_SITE || 'https://rocktober-dun.vercel.app').origin;
const label = 'Check_' + randomBytes(6).toString('hex');
function visitor() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const response = await fetch(origin + path, {
      method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const content = await response.text();
    let data;
    try { data = JSON.parse(content); } catch { throw new Error(`Non-JSON response: ${path}, status ${response.status}`); }
    return { status: response.status, data };
  };
}
const a = visitor(), b = visitor();
let runId;
try {
  const health = await a('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.configured, true);
  assert.equal(health.data.mode, 'shared');
  await a('/api/community');
  const added = await a('/api/costumes', 'POST', { name: label, costume: 'Ghost' });
  assert.equal(added.status, 200, added.data.message);
  const shared = await b('/api/community');
  const entry = shared.data.costumes.find(row => row.name === label);
  assert.ok(entry, 'Costume must be visible to a different visitor');
  assert.equal(entry.mine, false);
  const removeOther = await b('/api/costumes', 'DELETE', {});
  assert.equal(removeOther.status, 200);
  assert.equal(removeOther.data.deleted, false);
  assert.ok((await a('/api/community')).data.costumes.some(row => row.name === label));
  for (const costume of ['f**k', 's.h.1.t']) {
    const blocked = await b('/api/costumes', 'POST', { name: label, costume });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.data.error, 'profanity');
  }
  const started = await a('/api/runs/start', 'POST', {});
  assert.equal(started.status, 201, started.data.message);
  runId = started.data.id;
  await new Promise(resolve => setTimeout(resolve, 1200));
  const finished = await a('/api/runs/finish', 'POST', { runId, name: label, actions: [], endTick: 60 });
  assert.equal(finished.status, 200, finished.data.message);
  assert.equal(typeof finished.data.score, 'number');
  if (finished.data.rank <= 20) {
    const board = await b('/api/community');
    assert.ok(board.data.leaderboard.some(row => row.name === label), 'Score must be shared');
  }
  console.log(JSON.stringify({ verified: true, fixtureName: label, runId,
    checks: ['shared health','cross-visitor costumes','owner-only deletion','profanity','verified shared score'] }));
} finally {
  await a('/api/costumes', 'DELETE', {}).catch(() => {});
  console.log(JSON.stringify({ fixtureName: label, runId, cleanup: 'costume removed; host removes the score verification fixture after this run' }));
}
