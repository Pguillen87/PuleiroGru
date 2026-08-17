create table if not exists public.mascot_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null check (char_length(attempt_id) between 16 and 128),
  modal_job_id text not null,
  master_id text not null,
  mascot_code text not null check (mascot_code ~ '^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  pose_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mascot_library_items_user_job_unique unique (user_id, modal_job_id),
  constraint mascot_library_items_code_unique unique (mascot_code)
);

create index if not exists mascot_library_items_user_created_idx
on public.mascot_library_items(user_id, created_at desc);

create or replace function public.set_mascot_library_item_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mascot_library_items_set_updated_at on public.mascot_library_items;
create trigger mascot_library_items_set_updated_at
before update on public.mascot_library_items
for each row execute function public.set_mascot_library_item_updated_at();

alter table public.mascot_library_items enable row level security;
revoke all on public.mascot_library_items from anon;
grant select, insert, update on public.mascot_library_items to authenticated;

create policy "Users read their own mascot library"
on public.mascot_library_items for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users add their own mascot library items"
on public.mascot_library_items for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their own mascot library items"
on public.mascot_library_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
