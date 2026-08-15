create table if not exists public.mascot_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 16 and 128),
  modal_job_id text,
  status text not null default 'registered' check (status in (
    'registered',
    'awaiting_generation_authorization',
    'queued',
    'generating_masters',
    'awaiting_master_approval',
    'master_approved',
    'generating_poses',
    'awaiting_set_approval',
    'packaging',
    'ready',
    'failed',
    'canceled'
  )),
  selected_master_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mascot_attempts_user_attempt_unique unique (user_id, attempt_id)
);

create index if not exists mascot_attempts_user_id_idx on public.mascot_attempts(user_id);
create index if not exists mascot_attempts_modal_job_id_idx on public.mascot_attempts(modal_job_id) where modal_job_id is not null;

create or replace function public.set_mascot_attempt_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mascot_attempts_set_updated_at on public.mascot_attempts;
create trigger mascot_attempts_set_updated_at
before update on public.mascot_attempts
for each row execute function public.set_mascot_attempt_updated_at();

alter table public.mascot_attempts enable row level security;
revoke all on public.mascot_attempts from anon;
grant select, insert, update on public.mascot_attempts to authenticated;

drop policy if exists "Users read their own mascot attempts" on public.mascot_attempts;
create policy "Users read their own mascot attempts"
on public.mascot_attempts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own mascot attempts" on public.mascot_attempts;
create policy "Users create their own mascot attempts"
on public.mascot_attempts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own mascot attempts" on public.mascot_attempts;
create policy "Users update their own mascot attempts"
on public.mascot_attempts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
