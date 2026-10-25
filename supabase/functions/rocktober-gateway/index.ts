// The hash below is public verification material; the actual secret lives only
// in Vercel's encrypted environment. Replace this marker when deploying.
const EXPECTED_SECRET_SHA256 = "__ROCKTOBER_GATEWAY_SECRET_SHA256__";
const MAX_BODY_BYTES = 32768;
const OWNER = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class GatewayError extends Error {
  status: number;
  code: string;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== "string" || value.length < min || value.length > max) throw new GatewayError("invalid_request");
  return value;
}
function owner(value: unknown): string {
  const result = text(value, 43, 43);
  if (!OWNER.test(result)) throw new GatewayError("invalid_request");
  return result;
}
function uuid(value: unknown): string {
  const result = text(value, 36, 36);
  if (!UUID.test(result)) throw new GatewayError("invalid_request");
  return result;
}
function integer(value: unknown, low: number, high: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < low || (value as number) > high) throw new GatewayError("invalid_request");
  return value as number;
}
async function authorized(req: Request): Promise<boolean> {
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.get("Authorization") || "");
  if (!match || !/^[a-f0-9]{64}$/.test(EXPECTED_SECRET_SHA256)) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1])));
  const expected = new Uint8Array(EXPECTED_SECRET_SHA256.match(/../g)!.map(byte => parseInt(byte, 16)));
  let difference = digest.length ^ expected.length;
  for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ expected[i];
  return difference === 0;
}
async function readBody(req: Request) {
  if (!req.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new GatewayError("invalid_request", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new GatewayError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new GatewayError("body_too_large", 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(buffer));
    if (!body || typeof body !== "object" || !body.args || typeof body.args !== "object" || Array.isArray(body.args)) throw new Error();
    return body;
  } catch { throw new GatewayError("invalid_request"); }
}
function adminKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch { /* Legacy runtime compatibility. */ }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new GatewayError("storage_error", 503);
  return legacy;
}
async function database(path: string, method = "GET", body?: unknown, prefer?: string): Promise<any> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new GatewayError("storage_error", 503);
  const key = adminKey();
  const headers: Record<string,string> = {apikey: key, "Content-Type": "application/json"};
  // Modern secret keys belong only in apikey; legacy service-role keys are JWTs.
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  if (prefer) headers.Prefer = prefer;
  const result = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  const raw = await result.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { throw new GatewayError("storage_error", 502); }
  if (!result.ok) {
    const message = typeof data?.message === "string" ? data.message : "";
    for (const [code, status] of [["run_not_found",404],["run_used",409],["run_expired",410]] as const) {
      if (message.includes(code)) throw new GatewayError(code, status);
    }
    throw new GatewayError("storage_error", 502);
  }
  return data;
}
const costumeEntry = (row: any, own: string) => ({ id: row.id, name: row.name, costume: row.costume, createdAt: row.created_at, mine: row.owner_hash === own });
const costumeColumns = "id,name,costume,created_at,owner_hash";
async function dispatch(action: unknown, args: Record<string,unknown>): Promise<unknown> {
  switch (action) {
    case "health":
      await database("rocktober_costumes?select=id&limit=1");
      return true;
    case "rateLimit":
      return await database("rpc/rocktober_rate_limit", "POST", {
        p_key: text(args.key,200), p_window_seconds: integer(args.windowSeconds,1,86400), p_limit: integer(args.limit,1,10000)
      });
    case "listCostumes": {
      const own = owner(args.owner);
      const rows = await database(`rocktober_costumes?select=${costumeColumns}&order=created_at.desc&limit=500`);
      return rows.map((row: any) => costumeEntry(row,own));
    }
    case "upsertCostume": {
      const own = owner(args.owner);
      const rows = await database(`rocktober_costumes?on_conflict=owner_hash&select=${costumeColumns}`, "POST", {
        owner_hash: own, name: text(args.name,32), costume: text(args.costume,64), updated_at: new Date().toISOString()
      }, "resolution=merge-duplicates,return=representation");
      return costumeEntry(rows[0],own);
    }
    case "deleteCostume": {
      const own = owner(args.owner);
      const rows = await database(`rocktober_costumes?owner_hash=eq.${own}&select=id`, "DELETE", undefined, "return=representation");
      return rows.length > 0;
    }
    case "hasCostume": {
      const own = owner(args.owner);
      const rows = await database(`rocktober_costumes?owner_hash=eq.${own}&select=id&limit=1`);
      return rows.length > 0;
    }
    case "listLeaderboard": {
      const limit = integer(args.limit ?? 10,1,50);
      const rows = await database(`rocktober_scores?select=name,score,rocks,ticks&order=score.desc,achieved_at.asc,owner_hash.asc&limit=${limit}`);
      return rows.map((row: any, index: number) => ({rank:index+1,name:row.name,score:row.score,rocks:row.rocks,seconds:Math.floor(row.ticks/60)}));
    }
    case "createRun": {
      const run = args.run as Record<string,unknown>;
      if (!run || typeof run !== "object") throw new GatewayError("invalid_request");
      const started = text(run.started_at,40);
      const expires = text(run.expires_at,40);
      if (!Number.isFinite(Date.parse(started)) || !Number.isFinite(Date.parse(expires))) throw new GatewayError("invalid_request");
      const rows = await database("rocktober_runs?select=*", "POST", {
        id: uuid(run.id), owner_hash: owner(run.owner_hash), seed: integer(run.seed,0,4294967295),
        rules_version: text(run.rules_version,40), started_at:started, expires_at:expires
      }, "return=representation");
      return rows[0];
    }
    case "getRun": {
      const rows = await database(`rocktober_runs?id=eq.${uuid(args.id)}&owner_hash=eq.${owner(args.owner)}&select=*&limit=1`);
      return rows[0] || null;
    }
    case "finishRun": {
      const result = await database("rpc/rocktober_finish_run", "POST", {
        p_run_id: uuid(args.id), p_owner_hash: owner(args.owner), p_name: text(args.name,24),
        p_score: integer(args.score,0,10000000), p_rocks: integer(args.rocks,0,36000), p_ticks: integer(args.ticks,1,36000)
      });
      return {rank:result.rank,bestScore:result.best_score};
    }
    default: throw new GatewayError("invalid_action", 400);
  }
}
Deno.serve(async req => {
  if (req.method !== "POST") return response({error:"method_not_allowed"},405);
  if (!await authorized(req)) return response({error:"unauthorized"},401);
  try {
    const body = await readBody(req);
    return response({data:await dispatch(body.action,body.args)});
  } catch (error) {
    if (error instanceof GatewayError) return response({error:error.code,message:error.code},error.status);
    return response({error:"storage_error",message:"Storage request failed."},502);
  }
});
