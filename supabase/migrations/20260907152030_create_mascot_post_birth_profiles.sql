create table if not exists public.mascot_post_birth_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 16 and 128),
  modal_job_id text not null check (char_length(btrim(modal_job_id)) > 0),
  state text not null default 'DRAFT' check (state in ('DRAFT', 'ACTIVE')),
  display_name text,
  journal_config jsonb not null default '{"version": 1}'::jsonb,
  configuration_revision integer not null default 0 check (configuration_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint mascot_post_birth_profiles_user_attempt_unique unique (user_id, attempt_id),
  constraint mascot_post_birth_profiles_user_job_unique unique (user_id, modal_job_id),
  constraint mascot_post_birth_profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 2 and 32
  ),
  constraint mascot_post_birth_profiles_journal_config_object check (
    jsonb_typeof(journal_config) = 'object'
    and journal_config ? 'version'
    and journal_config ->> 'version' = '1'
    and journal_config - 'version' = '{}'::jsonb
  ),
  constraint mascot_post_birth_profiles_active_name check (
    state = 'DRAFT' or display_name is not null
  ),
  constraint mascot_post_birth_profiles_activated_state check (
    activated_at is null or state = 'ACTIVE'
  )
);

create index if not exists mascot_post_birth_profiles_user_updated_idx
  on public.mascot_post_birth_profiles(user_id, updated_at desc);

create or replace function public.set_mascot_post_birth_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mascot_post_birth_profiles_set_updated_at on public.mascot_post_birth_profiles;
create trigger mascot_post_birth_profiles_set_updated_at
before update on public.mascot_post_birth_profiles
for each row execute function public.set_mascot_post_birth_profile_updated_at();

alter table public.mascot_post_birth_profiles enable row level security;
revoke all on public.mascot_post_birth_profiles from anon;
grant select, insert, update on public.mascot_post_birth_profiles to authenticated;

drop policy if exists "Users read their own post-birth profiles" on public.mascot_post_birth_profiles;
create policy "Users read their own post-birth profiles"
on public.mascot_post_birth_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own post-birth profiles" on public.mascot_post_birth_profiles;
create policy "Users create their own post-birth profiles"
on public.mascot_post_birth_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own post-birth profiles" on public.mascot_post_birth_profiles;
create policy "Users update their own post-birth profiles"
on public.mascot_post_birth_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
