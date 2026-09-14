-- Record confirmed Modal job loss without deleting the attempt or its evidence.
set lock_timeout = '2s';

create table if not exists public.mascot_incubation_recovery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  attempt_id text not null,
  modal_job_id text not null,
  status text not null default 'CONFIRMED_MISSING'
    check (status in ('CONFIRMED_MISSING', 'RETIRED')),
  error_code text not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mascot_incubation_recovery_user_attempt_unique
    unique (user_id, attempt_id),
  constraint mascot_incubation_recovery_attempt_fk
    foreign key (user_id, attempt_id)
    references public.mascot_attempts (user_id, attempt_id)
    on delete cascade,
  constraint mascot_incubation_recovery_retired_check
    check (retired_at is null or status = 'RETIRED')
);

create index if not exists mascot_incubation_recovery_user_status_idx
  on public.mascot_incubation_recovery (user_id, status, updated_at desc);

create index if not exists mascot_incubation_recovery_job_idx
  on public.mascot_incubation_recovery (modal_job_id);

create or replace function public.set_mascot_incubation_recovery_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mascot_incubation_recovery_set_updated_at
  on public.mascot_incubation_recovery;
create trigger mascot_incubation_recovery_set_updated_at
before update on public.mascot_incubation_recovery
for each row execute function public.set_mascot_incubation_recovery_updated_at();

alter table public.mascot_incubation_recovery enable row level security;
revoke all on public.mascot_incubation_recovery from anon, authenticated;
grant select on public.mascot_incubation_recovery to authenticated;

drop policy if exists "Users read their own incubation recovery" on public.mascot_incubation_recovery;
create policy "Users read their own incubation recovery"
on public.mascot_incubation_recovery for select
to authenticated
using ((select auth.uid()) = user_id);

-- Recovery writes are backend-only through the service-role client.
revoke all on function public.set_mascot_incubation_recovery_updated_at() from public, anon, authenticated;

create or replace function public.list_pending_incubation_attempts(p_limit integer default 50)
returns setof public.mascot_attempts
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.*
  from public.mascot_attempts a
  where a.user_id = auth.uid()
    and a.workflow_mode = 'async_incubator_v1'
    and a.status <> 'ready'
    and not exists (
      select 1
      from public.mascot_post_birth_profiles p
      where p.user_id = a.user_id
        and p.attempt_id = a.attempt_id
        and p.state = 'ACTIVE'
        and p.library_item_id is not null
    )
    and not exists (
      select 1
      from public.mascot_incubation_recovery r
      where r.user_id = a.user_id
        and r.attempt_id = a.attempt_id
        and r.retired_at is not null
    )
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.list_pending_incubation_attempts(integer) from public, anon;
grant execute on function public.list_pending_incubation_attempts(integer) to authenticated;
