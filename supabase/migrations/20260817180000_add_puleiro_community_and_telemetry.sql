create table if not exists public.mascot_generation_telemetry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 16 and 128),
  modal_job_id text not null,
  stage text not null check (stage in ('master', 'poses')),
  status text not null check (status in ('requested', 'completed', 'failed', 'canceled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  estimated_cost_usd numeric(12, 4) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  actual_cost_usd numeric(12, 4) check (actual_cost_usd is null or actual_cost_usd >= 0),
  cost_source text check (cost_source in ('modal_reservation', 'modal_billing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, modal_job_id, stage)
);

create index if not exists mascot_generation_telemetry_user_started_idx
on public.mascot_generation_telemetry(user_id, started_at desc);

alter table public.mascot_generation_telemetry enable row level security;
revoke all on public.mascot_generation_telemetry from anon;
grant select, insert, update on public.mascot_generation_telemetry to authenticated;

create policy "Users read their own mascot telemetry"
on public.mascot_generation_telemetry for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users write their own mascot telemetry"
on public.mascot_generation_telemetry for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their own mascot telemetry"
on public.mascot_generation_telemetry for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.mascot_public_mascots (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid not null unique references public.mascot_library_items(id) on delete cascade,
  published_by uuid not null references auth.users(id) on delete cascade,
  mascot_code text not null check (mascot_code ~ '^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  pose_snapshot jsonb not null,
  published_at timestamptz not null default now(),
  favorite_count integer not null default 0 check (favorite_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists mascot_public_mascots_rank_idx
on public.mascot_public_mascots(favorite_count desc, published_at desc);

create table if not exists public.mascot_public_mascot_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  public_mascot_id uuid not null references public.mascot_public_mascots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, public_mascot_id)
);

create table if not exists public.mascot_public_mascot_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  public_mascot_id uuid not null references public.mascot_public_mascots(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, public_mascot_id)
);

alter table public.mascot_public_mascots enable row level security;
alter table public.mascot_public_mascot_favorites enable row level security;
alter table public.mascot_public_mascot_saves enable row level security;
revoke all on public.mascot_public_mascots from anon, authenticated;
revoke all on public.mascot_public_mascot_favorites from anon;
revoke all on public.mascot_public_mascot_saves from anon;
grant select, insert, delete on public.mascot_public_mascot_favorites to authenticated;
grant select, insert, delete on public.mascot_public_mascot_saves to authenticated;

create policy "Users manage their own public mascot favorites"
on public.mascot_public_mascot_favorites for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own public mascot saves"
on public.mascot_public_mascot_saves for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.refresh_public_mascot_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid := coalesce(new.public_mascot_id, old.public_mascot_id);
begin
  update public.mascot_public_mascots
  set favorite_count = (select count(*) from public.mascot_public_mascot_favorites where public_mascot_id = target_id),
      save_count = (select count(*) from public.mascot_public_mascot_saves where public_mascot_id = target_id),
      updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists mascot_public_favorite_counts on public.mascot_public_mascot_favorites;
create trigger mascot_public_favorite_counts
after insert or delete on public.mascot_public_mascot_favorites
for each row execute function public.refresh_public_mascot_counts();

drop trigger if exists mascot_public_save_counts on public.mascot_public_mascot_saves;
create trigger mascot_public_save_counts
after insert or delete on public.mascot_public_mascot_saves
for each row execute function public.refresh_public_mascot_counts();
