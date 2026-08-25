-- Expand-only observability fields. Existing RLS policies remain the boundary;
-- these columns contain correlation and safe error codes only, never assets or credentials.
set local lock_timeout = '2s';

alter table public.mascot_attempts
  add column if not exists puleiro_trace_id text,
  add column if not exists operation_id text,
  add column if not exists current_stage text,
  add column if not exists last_error_code text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists mascot_attempts_trace_idx
  on public.mascot_attempts(puleiro_trace_id)
  where puleiro_trace_id is not null;

create index if not exists mascot_attempts_resumption_idx
  on public.mascot_attempts(user_id, status, updated_at desc)
  where status in ('registered', 'awaiting_generation_authorization', 'queued', 'generating_masters', 'generating_poses', 'failed');

alter table public.mascot_generation_telemetry
  add column if not exists puleiro_trace_id text,
  add column if not exists operation_id text,
  add column if not exists safe_error_code text;

create index if not exists mascot_generation_telemetry_trace_idx
  on public.mascot_generation_telemetry(puleiro_trace_id, started_at desc)
  where puleiro_trace_id is not null;
