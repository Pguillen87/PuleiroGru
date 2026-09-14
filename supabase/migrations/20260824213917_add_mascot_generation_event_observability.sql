set lock_timeout = '2s';

create table if not exists public.mascot_generation_events (
  id bigint generated always as identity primary key,
  trace_id uuid not null,
  modal_job_id text not null check (modal_job_id ~ '^job_[A-Za-z0-9]{16,96}$'),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  stage text not null check (stage in ('api', 'scheduler', 'worker', 'model', 'storage')),
  outcome text not null check (outcome in ('accepted', 'succeeded', 'failed', 'blocked', 'canceled')),
  occurred_at timestamptz not null default now(),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  gpu_elapsed_ms integer check (gpu_elapsed_ms is null or gpu_elapsed_ms >= 0),
  reserved_cost_usd numeric(12, 6) check (reserved_cost_usd is null or reserved_cost_usd >= 0),
  model_version text check (model_version is null or char_length(model_version) <= 128),
  prompt_version text check (prompt_version is null or char_length(prompt_version) <= 64),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.mascot_generation_events enable row level security;

drop policy if exists "deny direct client access to telemetry" on public.mascot_generation_events;
create policy "deny direct client access to telemetry"
on public.mascot_generation_events
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.mascot_generation_events from anon, authenticated;
grant select, insert on table public.mascot_generation_events to service_role;
grant usage, select on sequence public.mascot_generation_events_id_seq to service_role;

-- The table is new and empty, so these initial index builds cannot block live writes.
create index if not exists mascot_generation_events_job_time_idx
  on public.mascot_generation_events (modal_job_id, occurred_at desc);
create index if not exists mascot_generation_events_trace_time_idx
  on public.mascot_generation_events (trace_id, occurred_at asc);
create index if not exists mascot_generation_events_outcome_time_idx
  on public.mascot_generation_events (outcome, occurred_at desc);

create index if not exists mascot_public_mascot_favorites_mascot_idx
  on public.mascot_public_mascot_favorites (public_mascot_id);
create index if not exists mascot_public_mascot_saves_mascot_idx
  on public.mascot_public_mascot_saves (public_mascot_id);
create index if not exists mascot_public_mascots_published_by_idx
  on public.mascot_public_mascots (published_by);

revoke execute on function public.refresh_public_mascot_counts() from public, anon, authenticated;;
