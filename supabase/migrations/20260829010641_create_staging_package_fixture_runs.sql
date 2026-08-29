create table if not exists public.staging_package_fixture_runs (
  operation_id text primary key check (operation_id ~ '^fixture-[0-9a-f-]{36}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_job_id text not null,
  item_id uuid,
  package_id uuid,
  import_code_id uuid,
  storage_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(storage_paths) = 'array'),
  cleanup_status text not null default 'active' check (cleanup_status in ('active', 'cleaning', 'cleaned', 'failed')),
  cleanup_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(cleanup_counts) = 'object'),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staging_package_fixture_runs_owner_expiry_idx
on public.staging_package_fixture_runs(user_id, expires_at);

alter table public.staging_package_fixture_runs enable row level security;
revoke all on public.staging_package_fixture_runs from anon, authenticated;
