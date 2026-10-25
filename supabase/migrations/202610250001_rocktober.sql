-- Shared Rocktober data. Browser clients have no direct table/RPC access.
begin;

create table if not exists public.rocktober_costumes (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null unique check (length(owner_hash) = 43),
  name text not null check (char_length(name) between 1 and 32),
  costume text not null check (char_length(costume) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rocktober_scores (
  owner_hash text primary key check (length(owner_hash) = 43),
  name text not null check (char_length(name) between 1 and 24),
  score integer not null check (score between 0 and 10000000),
  rocks integer not null check (rocks between 0 and 36000),
  ticks integer not null check (ticks between 1 and 36000),
  achieved_at timestamptz not null default now()
);

create table if not exists public.rocktober_runs (
  id uuid primary key,
  owner_hash text not null check (length(owner_hash) = 43),
  seed bigint not null check (seed between 0 and 4294967295),
  rules_version text not null check (char_length(rules_version) between 1 and 40),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  check (expires_at > started_at)
);

create table if not exists public.rocktober_rate_buckets (
  key text primary key check (length(key) between 1 and 200),
  bucket_start timestamptz not null,
  hits integer not null check (hits > 0),
  updated_at timestamptz not null default now()
);

create index if not exists rocktober_costumes_created_idx on public.rocktober_costumes (created_at desc);
create index if not exists rocktober_scores_rank_idx on public.rocktober_scores (score desc, achieved_at asc);
create index if not exists rocktober_runs_expiry_idx on public.rocktober_runs (expires_at);
create index if not exists rocktober_limits_updated_idx on public.rocktober_rate_buckets (updated_at);

alter table public.rocktober_costumes enable row level security;
alter table public.rocktober_scores enable row level security;
alter table public.rocktober_runs enable row level security;
alter table public.rocktober_rate_buckets enable row level security;

revoke all on public.rocktober_costumes, public.rocktober_scores,
  public.rocktober_runs, public.rocktober_rate_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.rocktober_costumes to service_role;
grant select, insert, update on public.rocktober_scores to service_role;
grant select, insert, update, delete on public.rocktober_runs to service_role;
grant select, insert, update, delete on public.rocktober_rate_buckets to service_role;

-- Atomic, database-backed limits survive concurrent and cold serverless workers.
create or replace function public.rocktober_rate_limit(
  p_key text, p_window_seconds integer, p_limit integer
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if length(p_key) not between 1 and 200 or p_window_seconds not between 1 and 86400
    or p_limit not between 1 and 10000 then
    raise exception 'invalid_rate_limit';
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.rocktober_rate_buckets (key, bucket_start, hits, updated_at)
  values (p_key, v_bucket, 1, clock_timestamp())
  on conflict (key) do update set
    hits = case when rocktober_rate_buckets.bucket_start = excluded.bucket_start
      then least(rocktober_rate_buckets.hits + 1, 1000000000) else 1 end,
    bucket_start = excluded.bucket_start,
    updated_at = excluded.updated_at
  returning hits into v_count;

  -- Bounded housekeeping without requiring a scheduler or another service.
  if random() < 0.01 then
    delete from public.rocktober_rate_buckets where updated_at < now() - interval '2 days';
    delete from public.rocktober_runs where expires_at < now() - interval '2 days';
  end if;
  return v_count <= p_limit;
end;
$$;

-- A run can be consumed exactly once. Its best-score update and rank are committed
-- in the same transaction, so simultaneous submissions cannot overwrite a best.
create or replace function public.rocktober_finish_run(
  p_run_id uuid, p_owner_hash text, p_name text,
  p_score integer, p_rocks integer, p_ticks integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_run public.rocktober_runs%rowtype;
  v_best public.rocktober_scores%rowtype;
  v_rank bigint;
begin
  select * into v_run from public.rocktober_runs
    where id = p_run_id and owner_hash = p_owner_hash for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.finished_at is not null then raise exception 'run_used'; end if;
  if v_run.expires_at < clock_timestamp() then raise exception 'run_expired'; end if;

  update public.rocktober_runs set finished_at = clock_timestamp() where id = p_run_id;
  insert into public.rocktober_scores (owner_hash, name, score, rocks, ticks, achieved_at)
  values (p_owner_hash, p_name, p_score, p_rocks, p_ticks, clock_timestamp())
  on conflict (owner_hash) do update set
    name = excluded.name, score = excluded.score, rocks = excluded.rocks,
    ticks = excluded.ticks, achieved_at = excluded.achieved_at
  where excluded.score > rocktober_scores.score;

  select * into v_best from public.rocktober_scores where owner_hash = p_owner_hash;
  select count(*) + 1 into v_rank from public.rocktober_scores
  where score > v_best.score
    or (score = v_best.score and achieved_at < v_best.achieved_at)
    or (score = v_best.score and achieved_at = v_best.achieved_at and owner_hash < v_best.owner_hash);
  return jsonb_build_object('rank', v_rank, 'best_score', v_best.score);
end;
$$;

revoke all on function public.rocktober_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rocktober_finish_run(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.rocktober_rate_limit(text, integer, integer) to service_role;
grant execute on function public.rocktober_finish_run(uuid, text, text, integer, integer, integer) to service_role;

commit;
