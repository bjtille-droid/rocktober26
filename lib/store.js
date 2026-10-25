import { randomUUID } from 'node:crypto';

export class StoreError extends Error {
  constructor(message, code = 'storage_error') {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

export class MemoryStore {
  constructor() {
    this.mode = 'development';
    this.costumes = new Map();
    this.runs = new Map();
    this.scores = new Map();
    this.limits = new Map();
  }
  async health() { return true; }
  async rateLimit(key, windowSeconds, limit, now = Date.now()) {
    const bucket = Math.floor(now / (windowSeconds * 1000));
    const current = this.limits.get(key);
    const count = current?.bucket === bucket ? current.count + 1 : 1;
    this.limits.set(key, { bucket, count });
    return count <= limit;
  }
  async listCostumes(owner) {
    return [...this.costumes.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 500).map(row => ({
        id: row.id, name: row.name, costume: row.costume,
        createdAt: row.created_at, mine: row.owner_hash === owner,
      }));
  }
  async upsertCostume(owner, name, costume, now) {
    const old = this.costumes.get(owner);
    const row = { id: old?.id || randomUUID(), owner_hash: owner, name, costume,
      created_at: old?.created_at || new Date(now).toISOString(), updated_at: new Date(now).toISOString() };
    this.costumes.set(owner, row);
    return { id: row.id, name, costume, createdAt: row.created_at, mine: true };
  }
  async deleteCostume(owner) { return this.costumes.delete(owner); }
  async hasCostume(owner) { return this.costumes.has(owner); }
  async listLeaderboard(limit = 20) {
    return [...this.scores.values()]
      .sort((a, b) => b.score - a.score || a.achieved_at.localeCompare(b.achieved_at))
      .slice(0, limit).map((row, index) => ({
        rank: index + 1, name: row.name, score: row.score,
        rocks: row.rocks, seconds: row.ticks / 60,
      }));
  }
  async createRun(run) {
    const row = { ...run, finished_at: null };
    this.runs.set(row.id, row);
    return row;
  }
  async getRun(id, owner) {
    const row = this.runs.get(id);
    return row?.owner_hash === owner ? { ...row } : null;
  }
  async finishRun({ id, owner, name, score, rocks, ticks, now }) {
    // This method has no await between its check and write, matching the SQL transaction.
    const run = this.runs.get(id);
    if (!run || run.owner_hash !== owner) throw new StoreError('Run not found.', 'run_not_found');
    if (run.finished_at) throw new StoreError('This run has already been submitted.', 'run_used');
    if (new Date(run.expires_at).getTime() < now) throw new StoreError('This run has expired.', 'run_expired');
    run.finished_at = new Date(now).toISOString();
    const previous = this.scores.get(owner);
    if (!previous || previous.score < score) {
      this.scores.set(owner, { owner_hash: owner, name, score, rocks, ticks, achieved_at: new Date(now).toISOString() });
    }
    const best = this.scores.get(owner);
    const ordered = [...this.scores.values()].sort((a, b) => b.score - a.score || a.achieved_at.localeCompare(b.achieved_at));
    return { rank: ordered.findIndex(row => row.owner_hash === owner) + 1, bestScore: best.score };
  }
}

export class SupabaseStore {
  constructor(url, key, fetchImpl = fetch) {
    this.mode = 'shared';
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.fetchImpl = fetchImpl;
  }
  async request(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: this.key, 'Content-Type': 'application/json' };
    // New secret keys are not JWTs; PostgREST authenticates them using apikey.
    if (!this.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${this.key}`;
    if (prefer) headers.Prefer = prefer;
    const response = await this.fetchImpl(`${this.url}/rest/v1/${path}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const message = String(data?.message || 'Shared storage is unavailable.');
      const code = ['run_not_found', 'run_used', 'run_expired'].find(code => message.includes(code));
      throw new StoreError(code || 'Shared storage is unavailable.', code || 'storage_error');
    }
    return data;
  }
  async rpc(name, parameters) { return this.request(`rpc/${name}`, { method: 'POST', body: parameters }); }
  async health() { await this.request('rocktober_costumes?select=id&limit=1'); return true; }
  async rateLimit(key, windowSeconds, limit) {
    return this.rpc('rocktober_rate_limit', { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
  }
  async listCostumes(owner) {
    const rows = await this.request('rocktober_costumes?select=id,owner_hash,name,costume,created_at&order=created_at.desc&limit=500');
    return rows.map(row => ({ id: row.id, name: row.name, costume: row.costume,
      createdAt: row.created_at, mine: row.owner_hash === owner }));
  }
  async upsertCostume(owner, name, costume) {
    const rows = await this.request('rocktober_costumes?on_conflict=owner_hash', {
      method: 'POST', body: { owner_hash: owner, name, costume, updated_at: new Date().toISOString() },
      prefer: 'resolution=merge-duplicates,return=representation',
    });
    const row = rows[0];
    return { id: row.id, name: row.name, costume: row.costume, createdAt: row.created_at, mine: true };
  }
  async deleteCostume(owner) {
    const rows = await this.request(`rocktober_costumes?owner_hash=eq.${encodeURIComponent(owner)}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    return rows.length > 0;
  }
  async hasCostume(owner) {
    const rows = await this.request(`rocktober_costumes?select=id&owner_hash=eq.${encodeURIComponent(owner)}&limit=1`);
    return rows.length > 0;
  }
  async listLeaderboard(limit = 20) {
    const rows = await this.request(`rocktober_scores?select=name,score,rocks,ticks,achieved_at&order=score.desc,achieved_at.asc&limit=${limit}`);
    return rows.map((row, index) => ({ rank: index + 1, name: row.name, score: row.score,
      rocks: row.rocks, seconds: row.ticks / 60 }));
  }
  async createRun(run) {
    const rows = await this.request('rocktober_runs', { method: 'POST', body: run, prefer: 'return=representation' });
    return rows[0];
  }
  async getRun(id, owner) {
    const rows = await this.request(`rocktober_runs?select=*&id=eq.${encodeURIComponent(id)}&owner_hash=eq.${encodeURIComponent(owner)}&limit=1`);
    return rows[0] || null;
  }
  async finishRun({ id, owner, name, score, rocks, ticks }) {
    const result = await this.rpc('rocktober_finish_run', {
      p_run_id: id, p_owner_hash: owner, p_name: name,
      p_score: score, p_rocks: rocks, p_ticks: ticks,
    });
    return { rank: result.rank, bestScore: result.best_score };
  }
}

// A private Edge gateway can use its built-in Supabase secret without extracting
// that secret into another provider. The gateway only accepts these named actions.
export class SupabaseGatewayStore {
  constructor(url, secret, fetchImpl = fetch) {
    this.mode = 'shared';
    this.url = url;
    this.secret = secret;
    this.fetchImpl = fetchImpl;
  }
  async call(action, args = {}) {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ action, args }),
      signal: AbortSignal.timeout(10000),
    });
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok || !result || !Object.hasOwn(result, 'data')) {
      const code = ['run_not_found', 'run_used', 'run_expired'].includes(result?.error) ? result.error : 'storage_error';
      throw new StoreError('Shared storage is unavailable.', code);
    }
    return result.data;
  }
  async health() { return this.call('health'); }
  async rateLimit(key, windowSeconds, limit) { return this.call('rateLimit', { key, windowSeconds, limit }); }
  async listCostumes(owner) { return this.call('listCostumes', { owner }); }
  async upsertCostume(owner, name, costume) { return this.call('upsertCostume', { owner, name, costume }); }
  async deleteCostume(owner) { return this.call('deleteCostume', { owner }); }
  async hasCostume(owner) { return this.call('hasCostume', { owner }); }
  async listLeaderboard(limit = 20) { return this.call('listLeaderboard', { limit }); }
  async createRun(run) { return this.call('createRun', { run }); }
  async getRun(id, owner) { return this.call('getRun', { id, owner }); }
  async finishRun({ id, owner, name, score, rocks, ticks }) {
    return this.call('finishRun', { id, owner, name, score, rocks, ticks });
  }
}
