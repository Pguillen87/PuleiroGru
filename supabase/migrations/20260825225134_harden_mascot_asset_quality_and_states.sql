set local lock_timeout = '3s';

alter table public.mascot_attempts
  drop constraint if exists mascot_attempts_status_check;

alter table public.mascot_attempts
  add constraint mascot_attempts_status_check check (status in (
    'registered', 'awaiting_generation_authorization', 'queued',
    'generating_masters', 'validating_masters', 'awaiting_master_approval',
    'validating_master', 'master_approved', 'generating_poses',
    'validating_poses', 'awaiting_set_approval', 'packaging',
    'ready', 'failed', 'canceled'
  )) not valid;

alter table public.mascot_attempts
  validate constraint mascot_attempts_status_check;

drop index if exists public.mascot_attempts_resumption_idx;
create index mascot_attempts_resumption_idx
  on public.mascot_attempts(user_id, status, updated_at desc)
  where status in (
    'registered', 'awaiting_generation_authorization', 'queued',
    'generating_masters', 'validating_masters', 'awaiting_master_approval',
    'validating_master', 'master_approved', 'generating_poses',
    'validating_poses', 'awaiting_set_approval', 'packaging', 'failed'
  );

create unique index if not exists mascot_generation_telemetry_attempt_stage_uidx
  on public.mascot_generation_telemetry(user_id, attempt_id, stage);

create table if not exists public.mascot_asset_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 16 and 128),
  modal_job_id text not null check (char_length(modal_job_id) between 8 and 128),
  asset_type text not null check (asset_type in ('master', 'pose')),
  asset_id text not null check (asset_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  qc_status text not null check (qc_status in ('passed', 'failed')),
  safe_reasons text[] not null default '{}',
  alpha_ratio numeric(8, 6) not null check (alpha_ratio between 0 and 1),
  border_opaque_ratio numeric(8, 6) not null check (border_opaque_ratio between 0 and 1),
  foreground_components integer not null check (foreground_components between 0 and 100),
  model_version text not null check (char_length(model_version) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 64),
  template_version text check (template_version is null or char_length(template_version) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mascot_asset_checks_owner_attempt_fk
    foreign key (user_id, attempt_id)
    references public.mascot_attempts(user_id, attempt_id)
    on delete cascade,
  constraint mascot_asset_checks_unique unique (user_id, attempt_id, asset_type, asset_id)
);

create index if not exists mascot_asset_checks_job_idx
  on public.mascot_asset_checks(user_id, modal_job_id, created_at desc);

alter table public.mascot_asset_checks enable row level security;
revoke all on public.mascot_asset_checks from anon;
grant select, insert, update on public.mascot_asset_checks to authenticated;

create policy "Users read their own mascot asset checks"
  on public.mascot_asset_checks for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own mascot asset checks"
  on public.mascot_asset_checks for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own mascot asset checks"
  on public.mascot_asset_checks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
