import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { RULES_VERSION, MAX_TICKS, replayGame } from '../public/game-core.js';
import { validatePublicText, ValidationError } from '../lib/moderation.js';
import { MemoryStore, SupabaseStore, SupabaseGatewayStore, StoreError } from '../lib/store.js';

const COOKIE_NAME = 'rocktober_session';
const SESSION_SECONDS = 365 * 24 * 60 * 60;
const RUN_MS = 60 * 60 * 1000;
const ID_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sign(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }
function equal(left, right) {
  const a = Buffer.from(left || ''), b = Buffer.from(right || '');
  return a.length === b.length && timingSafeEqual(a, b);
}
function parseCookie(header, key) {
  if (typeof header !== 'string') return null;
  return header.split(';').map(part => part.trim()).find(part => part.startsWith(`${key}=`))?.slice(key.length + 1) || null;
}
function session(req, res, secret, timestamp, production) {
  const raw = parseCookie(req.headers.cookie, COOKIE_NAME);
  const parts = raw?.split('.') || [];
  let id;
  if (parts.length === 3 && /^[\w-]{32}$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const issued = Number(parts[1]);
    const age = timestamp / 1000 - issued;
    if (age >= -60 && age <= SESSION_SECONDS && equal(parts[2], sign(`${parts[0]}.${parts[1]}`, secret))) id = parts[0];
  }
  if (!id) {
    id = randomBytes(24).toString('base64url');
    const payload = `${id}.${Math.floor(timestamp / 1000)}`;
    const secure = production || req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${payload}.${sign(payload, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`);
  }
  return sign(`owner:${id}`, secret);
}
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function checkOrigin(req, env) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || req.headers['sec-fetch-site'] === 'cross-site') {
    throw new ApiError(403, 'origin_denied', 'Please submit from the Rocktober website.');
  }
  const expected = new Set();
  if (env.APP_ORIGIN) {
    try { expected.add(new URL(env.APP_ORIGIN).origin); } catch {}
  }
  const host = req.headers.host;
  if (typeof host === 'string' && /^[a-z0-9.:[\]-]+$/i.test(host)) {
    expected.add(`https://${host}`);
    if (env.NODE_ENV !== 'production') expected.add(`http://${host}`);
  }
  if (!expected.has(origin)) throw new ApiError(403, 'origin_denied', 'Please submit from the Rocktober website.');
}
async function readJson(req, maxBytes) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'json_required', 'Send an application/json request.');
  }
  if (Number(req.headers['content-length']) > maxBytes) throw new ApiError(413, 'body_too_large', 'That submission is too large.');
  let data = req.body;
  if (data === undefined) {
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buffer.length;
      if (length > maxBytes) throw new ApiError(413, 'body_too_large', 'That submission is too large.');
      chunks.push(buffer);
    }
    data = Buffer.concat(chunks).toString('utf8') || '{}';
  }
  if (Buffer.isBuffer(data)) data = data.toString('utf8');
  if (typeof data === 'string') {
    if (Buffer.byteLength(data) > maxBytes) throw new ApiError(413, 'body_too_large', 'That submission is too large.');
    try { data = JSON.parse(data); } catch { throw new ApiError(400, 'invalid_json', 'That submission is not valid JSON.'); }
  } else if (Buffer.byteLength(JSON.stringify(data) || '') > maxBytes) {
    throw new ApiError(413, 'body_too_large', 'That submission is too large.');
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new ApiError(400, 'invalid_json', 'Send a JSON object.');
  return data;
}
function requireFields(body, allowed) {
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    throw new ApiError(400, 'invalid_fields', 'That submission contains unexpected fields.');
  }
}
function routeFor(req) {
  const url = new URL(req.url || '/', 'http://rocktober.local');
  const route = url.searchParams.get('route') || req.query?.route;
  return route ? `/api/${String(route).replace(/^\/+|\/+$/g, '')}` : url.pathname.replace(/\/$/, '');
}

export function createApi({ store: providedStore, env = process.env, now = Date.now } = {}) {
  const secret = env.SESSION_SECRET || '';
  const production = env.NODE_ENV === 'production';
  let store = providedStore;
  if (!store && !production && env.DEVELOPMENT_STORE === 'memory') store = new MemoryStore();
  if (!store && env.SUPABASE_GATEWAY_URL && env.SUPABASE_GATEWAY_SECRET?.length >= 32) {
    store = new SupabaseGatewayStore(env.SUPABASE_GATEWAY_URL, env.SUPABASE_GATEWAY_SECRET);
  }
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!store && env.SUPABASE_URL && key) store = new SupabaseStore(env.SUPABASE_URL, key);
  const configured = Boolean(store && secret.length >= 32 && !(production && store instanceof MemoryStore));

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Cookie, Origin');
    const path = routeFor(req);
    const method = req.method || 'GET';
    try {
      if (path === '/api/health') {
        if (method !== 'GET') throw new ApiError(405, 'method_not_allowed', 'Use GET for this endpoint.');
        let healthy = false;
        if (configured) {
          try { healthy = await store.health(); } catch {}
        }
        return send(res, 200, { configured: Boolean(configured && healthy), mode: configured && healthy ? store.mode : 'unavailable' });
      }
      if (!configured) throw new ApiError(503, 'not_configured', 'The shared guest book and arcade are not connected yet. Please try again later.');
      const routes = {
        '/api/community': ['GET'], '/api/costumes': ['POST', 'DELETE'],
        '/api/runs/start': ['POST'], '/api/runs/finish': ['POST'],
      };
      if (!routes[path]) throw new ApiError(404, 'not_found', 'That endpoint does not exist.');
      if (!routes[path].includes(method)) {
        res.setHeader('Allow', routes[path].join(', '));
        throw new ApiError(405, 'method_not_allowed', 'That method is not supported.');
      }
      if (method !== 'GET') checkOrigin(req, env);
      const timestamp = now();
      const owner = session(req, res, secret, timestamp, production);
      const rawIp = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const ip = sign(`ip:${String(rawIp).split(',')[0].trim()}`, secret);

      async function limit(group, ownerLimit, ipLimit, windowSeconds) {
        const [ownerOk, ipOk] = await Promise.all([
          store.rateLimit(`${group}:owner:${owner}`, windowSeconds, ownerLimit, timestamp),
          store.rateLimit(`${group}:ip:${ip}`, windowSeconds, ipLimit, timestamp),
        ]);
        if (!ownerOk || !ipOk) {
          res.setHeader('Retry-After', String(windowSeconds));
          throw new ApiError(429, 'rate_limited', 'The crypt needs a breather. Please try again shortly.');
        }
      }

      if (path === '/api/community') {
        await limit('read', 120, 3000, 60);
        const [costumes, leaderboard, hasCostume] = await Promise.all([
          store.listCostumes(owner), store.listLeaderboard(), store.hasCostume(owner),
        ]);
        return send(res, 200, { costumes, leaderboard, viewer: { hasCostume }, mode: store.mode });
      }

      if (path === '/api/costumes') {
        await limit('costume', 15, 120, 600);
        const body = await readJson(req, 8192);
        if (method === 'DELETE') {
          requireFields(body, []);
          const deleted = await store.deleteCostume(owner);
          return send(res, 200, { deleted });
        }
        requireFields(body, ['name', 'costume']);
        const name = validatePublicText(body.name, { label: 'Name', max: 32 });
        const costume = validatePublicText(body.costume, { label: 'Costume', max: 64 });
        const entry = await store.upsertCostume(owner, name, costume, timestamp);
        return send(res, 200, { entry });
      }

      if (path === '/api/runs/start') {
        await limit('start', 90, 1000, 3600);
        const body = await readJson(req, 4096);
        requireFields(body, []);
        const seed = randomBytes(4).readUInt32BE() || 1;
        const run = await store.createRun({
          id: randomUUID(), owner_hash: owner, seed, rules_version: RULES_VERSION,
          started_at: new Date(timestamp).toISOString(), expires_at: new Date(timestamp + RUN_MS).toISOString(),
        });
        return send(res, 201, { id: run.id, seed, rulesVersion: RULES_VERSION, startedAt: run.started_at });
      }

      if (path === '/api/runs/finish') {
        await limit('finish', 90, 1000, 3600);
        const body = await readJson(req, 1024 * 1024);
        requireFields(body, ['runId', 'name', 'actions', 'endTick']);
        const name = validatePublicText(body.name, { label: 'Arcade name', max: 24 });
        if (typeof body.runId !== 'string' || !ID_PATTERN.test(body.runId)) throw new ApiError(400, 'invalid_run', 'Start a new arcade run first.');
        if (!Number.isInteger(body.endTick) || body.endTick < 1 || body.endTick > MAX_TICKS || !Array.isArray(body.actions) || body.actions.length > 10000) {
          throw new ApiError(400, 'invalid_replay', 'That arcade replay is invalid. Please start a new run.');
        }
        const run = await store.getRun(body.runId, owner);
        if (!run) throw new ApiError(404, 'run_not_found', 'This arcade run does not belong to this browser.');
        if (run.finished_at) throw new ApiError(409, 'run_used', 'This run has already been submitted.');
        if (run.rules_version !== RULES_VERSION) throw new ApiError(409, 'rules_changed', 'The arcade was updated. Start a fresh run.');
        if (new Date(run.expires_at).getTime() < timestamp) throw new ApiError(410, 'run_expired', 'That arcade run has expired. Start a fresh run.');
        if (body.endTick / 60 * 1000 > timestamp - new Date(run.started_at).getTime() + 1500) {
          throw new ApiError(400, 'invalid_timing', 'That run was submitted too quickly. Please start a new run.');
        }
        let replay;
        try { replay = replayGame(Number(run.seed), body.actions, body.endTick); }
        catch { throw new ApiError(400, 'invalid_replay', 'That arcade replay is invalid. Please start a new run.'); }
        const result = await store.finishRun({
          id: run.id, owner, name, score: replay.score, rocks: replay.rocks, ticks: replay.tick, now: timestamp,
        });
        return send(res, 200, { score: replay.score, rocks: replay.rocks, seconds: replay.tick / 60, ...result });
      }
    } catch (error) {
      if (error instanceof ApiError || error instanceof ValidationError) {
        return send(res, error.status, { error: error.code, message: error.message });
      }
      if (error instanceof StoreError && ['run_not_found', 'run_used', 'run_expired'].includes(error.code)) {
        const status = error.code === 'run_not_found' ? 404 : error.code === 'run_used' ? 409 : 410;
        return send(res, status, { error: error.code, message: 'That run is unavailable. Please start a new run.' });
      }
      console.error('Rocktober API failed:', error instanceof StoreError ? error.code : error?.name || 'Error');
      return send(res, 503, { error: 'temporarily_unavailable', message: 'The crypt is temporarily unavailable. Please try again shortly.' });
    }
  };
}

export default createApi();
