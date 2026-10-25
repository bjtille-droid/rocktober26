import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApi } from '../api/index.js';
import { MemoryStore, SupabaseGatewayStore } from '../lib/store.js';
import { replayGame } from '../public/game-core.js';

const origin = 'https://rocktober.test';
const env = { NODE_ENV: 'test', SESSION_SECRET: 'test-secret-is-at-least-thirty-two-characters-long', APP_ORIGIN: origin };

function setup() {
  let clock = Date.parse('2026-10-25T12:00:00Z');
  const store = new MemoryStore();
  const api = createApi({ store, env, now: () => clock });
  const advance = milliseconds => { clock += milliseconds; };

  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const req = Readable.from(body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]);
    req.url = path;
    req.method = method;
    req.headers = { host: 'rocktober.test', origin, ...headers };
    if (body !== undefined) req.headers['content-type'] = headers['content-type'] || 'application/json';
    if (cookie) req.headers.cookie = cookie;
    req.socket = { remoteAddress: '127.0.0.1' };
    const result = { status: 0, headers: {}, body: null };
    const res = {
      statusCode: 200,
      setHeader(key, value) { result.headers[key.toLowerCase()] = value; },
      end(value) { result.status = this.statusCode; result.body = JSON.parse(value); },
    };
    await api(req, res);
    result.cookie = result.headers['set-cookie']?.split(';')[0];
    return result;
  }
  return { request, store, advance };
}

test('guest entries are shared but editing and deletion are owner-only', async () => {
  const { request } = setup();
  const a = await request('/api/community');
  const b = await request('/api/community');
  assert.notEqual(a.cookie, b.cookie);
  assert.match(a.headers['set-cookie'], /HttpOnly/);
  assert.match(a.headers['set-cookie'], /SameSite=Lax/);

  const created = await request('/api/costumes', { method: 'POST', cookie: a.cookie, body: { name: 'Alex', costume: 'Mothman' } });
  assert.equal(created.status, 200);
  const otherView = await request('/api/community', { cookie: b.cookie });
  assert.equal(otherView.body.costumes[0].name, 'Alex');
  assert.equal(otherView.body.costumes[0].mine, false);
  assert.equal(otherView.body.viewer.hasCostume, false);

  const forgedDelete = await request('/api/costumes', { method: 'DELETE', cookie: b.cookie, body: { id: created.body.entry.id } });
  assert.equal(forgedDelete.status, 400);
  const ownDeleteWithoutEntry = await request('/api/costumes', { method: 'DELETE', cookie: b.cookie, body: {} });
  assert.equal(ownDeleteWithoutEntry.body.deleted, false);
  assert.equal((await request('/api/community', { cookie: a.cookie })).body.costumes.length, 1);

  await request('/api/costumes', { method: 'POST', cookie: a.cookie, body: { name: 'Alex', costume: 'Disco skeleton' } });
  const changed = await request('/api/community', { cookie: a.cookie });
  assert.equal(changed.body.costumes.length, 1);
  assert.equal(changed.body.costumes[0].costume, 'Disco skeleton');
  assert.equal(changed.body.costumes[0].mine, true);
  const removed = await request('/api/costumes', { method: 'DELETE', cookie: a.cookie, body: {} });
  assert.equal(removed.body.deleted, true);
  assert.equal((await request('/api/community', { cookie: b.cookie })).body.costumes.length, 0);
});

test('direct API writes cannot bypass profanity, origin, type or size checks', async () => {
  const { request } = setup();
  const viewer = await request('/api/community');
  for (const data of [{ name: 'f.u.c.k', costume: 'Ghost' }, { name: 'Alex', costume: 'sh1t' }]) {
    const result = await request('/api/costumes', { method: 'POST', cookie: viewer.cookie, body: data });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'profanity');
  }
  const crossOrigin = await request('/api/costumes', { method: 'POST', body: {}, headers: { origin: 'https://evil.test' } });
  assert.equal(crossOrigin.status, 403);
  const wrongType = await request('/api/costumes', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } });
  assert.equal(wrongType.status, 415);
  const oversize = await request('/api/costumes', { method: 'POST', body: { name: 'Alex', costume: 'x'.repeat(9000) } });
  assert.equal(oversize.status, 413);
  const community = await request('/api/community', { cookie: viewer.cookie });
  assert.deepEqual(community.body.costumes, []);
});

test('leaderboard uses a server replay and consumes each owner-bound run once', async () => {
  const { request, advance } = setup();
  const a = await request('/api/community');
  const b = await request('/api/community');
  const run = await request('/api/runs/start', { method: 'POST', cookie: a.cookie, body: {} });
  assert.equal(run.status, 201);
  const replay = replayGame(run.body.seed, [], 60);
  const body = { runId: run.body.id, name: 'Rockstar', actions: [], endTick: 60 };
  const forged = await request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body: { ...body, score: 9999999 } });
  assert.equal(forged.status, 400);
  const wrongOwner = await request('/api/runs/finish', { method: 'POST', cookie: b.cookie, body });
  assert.equal(wrongOwner.status, 404);
  advance(1000);
  const saved = await request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.score, replay.score);
  assert.equal(saved.body.bestScore, replay.score);
  const reused = await request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body });
  assert.equal(reused.status, 409);
  const publicBoard = await request('/api/community', { cookie: b.cookie });
  assert.equal(publicBoard.body.leaderboard[0].name, 'Rockstar');
  assert.equal(publicBoard.body.leaderboard[0].score, replay.score);
  assert.equal('owner_hash' in publicBoard.body.leaderboard[0], false);
});

test('invalid replay actions and impossible wall-clock runs are rejected', async () => {
  const { request, advance } = setup();
  const a = await request('/api/community');
  const run = await request('/api/runs/start', { method: 'POST', cookie: a.cookie, body: {} });
  const base = { runId: run.body.id, name: 'Alex', actions: [], endTick: 600 };
  assert.equal((await request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body: base })).body.error, 'invalid_timing');
  advance(15000);
  const broken = { ...base, actions: [{ tick: 20, direction: -1 }, { tick: 20, direction: 1 }] };
  assert.equal((await request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body: broken })).body.error, 'invalid_replay');
});

test('concurrent score submissions consume a run only once', async () => {
  const { request, advance } = setup();
  const a = await request('/api/community');
  const run = await request('/api/runs/start', { method: 'POST', cookie: a.cookie, body: {} });
  advance(2000);
  const body = { runId: run.body.id, name: 'Alex', actions: [], endTick: 60 };
  const results = await Promise.all([
    request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body }),
    request('/api/runs/finish', { method: 'POST', cookie: a.cookie, body }),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test('tampering with a signed owner cookie does not grant deletion rights', async () => {
  const { request } = setup();
  const a = await request('/api/community');
  await request('/api/costumes', { method: 'POST', cookie: a.cookie, body: { name: 'Alex', costume: 'Ghost' } });
  const tampered = a.cookie.replace(/(rocktober_session=)./, '$1!');
  const attempt = await request('/api/costumes', { method: 'DELETE', cookie: tampered, body: {} });
  assert.equal(attempt.body.deleted, false);
  assert.ok(attempt.cookie);
  assert.equal((await request('/api/community', { cookie: a.cookie })).body.costumes.length, 1);
});

test('durable limits reject repeated writes rather than admitting unlimited spam', async () => {
  const { request } = setup();
  const a = await request('/api/community');
  for (let i = 0; i < 15; i++) {
    assert.equal((await request('/api/costumes', { method: 'POST', cookie: a.cookie, body: { name: 'Alex', costume: 'Ghost' } })).status, 200);
  }
  assert.equal((await request('/api/costumes', { method: 'POST', cookie: a.cookie, body: { name: 'Alex', costume: 'Ghost' } })).status, 429);
});

test('production never silently substitutes process-local memory for shared storage', async () => {
  const handler = createApi({ store: new MemoryStore(), env: { ...env, NODE_ENV: 'production' } });
  const req = Readable.from([]);
  req.url = '/api/health'; req.method = 'GET'; req.headers = { host: 'rocktober.test' };
  let data;
  const res = { setHeader() {}, end(value) { data = JSON.parse(value); } };
  await handler(req, res);
  assert.deepEqual(data, { configured: false, mode: 'unavailable' });
});

test('gateway transport has a closed action shape and does not leak privileged errors', async () => {
  const calls = [];
  const gateway = new SupabaseGatewayStore('https://example.supabase.co/functions/v1/rocktober-gateway', 'a'.repeat(64), async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });
  assert.deepEqual(await gateway.listCostumes('owner-hash'), []);
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'listCostumes', args: { owner: 'owner-hash' } });
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${'a'.repeat(64)}`);
});
