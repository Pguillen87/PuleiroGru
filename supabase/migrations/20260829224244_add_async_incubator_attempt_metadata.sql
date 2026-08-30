set local lock_timeout = '2s';

alter table public.mascot_attempts
  add column if not exists workflow_mode text,
  add column if not exists incubation_config jsonb,
  add column if not exists subject_hint jsonb,
  add column if not exists master_selection jsonb,
  add column if not exists generation_ready_at timestamptz,
  add column if not exists hatched_at timestamptz;

alter table public.mascot_attempts
  add constraint mascot_attempts_workflow_mode_check
  check (workflow_mode is null or workflow_mode in ('legacy_manual', 'async_incubator_v1'))
  not valid;

alter table public.mascot_attempts
  validate constraint mascot_attempts_workflow_mode_check;

alter table public.mascot_attempts
  add constraint mascot_attempts_incubation_config_check
  check (
    incubation_config is null
    or (
      jsonb_typeof(incubation_config) = 'object'
      and incubation_config ? 'subjectIdentity'
      and incubation_config ? 'poseChoices'
    )
  ) not valid;

alter table public.mascot_attempts
  validate constraint mascot_attempts_incubation_config_check;

create index if not exists mascot_attempts_active_incubator_idx
  on public.mascot_attempts(user_id, updated_at desc)
  where workflow_mode = 'async_incubator_v1' and status <> 'ready';

comment on column public.mascot_attempts.workflow_mode is
  'Null and legacy_manual preserve the existing manual flow; async_incubator_v1 enables the durable incubator projection.';
comment on column public.mascot_attempts.incubation_config is
  'Validated owner configuration required before any asynchronous generation begins.';
comment on column public.mascot_attempts.subject_hint is
  'Sanitized, non-authoritative CPU subject hint; never replaces the explicit owner choice.';
comment on column public.mascot_attempts.master_selection is
  'Sanitized deterministic ranking result for the automatically selected Master.';
