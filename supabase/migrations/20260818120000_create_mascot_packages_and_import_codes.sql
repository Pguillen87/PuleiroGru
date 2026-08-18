create table if not exists public.mascot_packages (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null unique references public.mascot_library_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_version text not null check (package_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  manifest jsonb not null,
  status text not null default 'ready' check (status in ('pending', 'ready', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mascot_import_codes (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.mascot_packages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mascot_packages_user_idx on public.mascot_packages(user_id, created_at desc);
create index if not exists mascot_import_codes_user_idx on public.mascot_import_codes(user_id, created_at desc);

alter table public.mascot_packages enable row level security;
alter table public.mascot_import_codes enable row level security;
revoke all on public.mascot_packages, public.mascot_import_codes from anon;
grant select on public.mascot_packages, public.mascot_import_codes to authenticated;

create policy "Users read their own mascot packages"
on public.mascot_packages for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read their own mascot import codes"
on public.mascot_import_codes for select to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('mascot-packages', 'mascot-packages', false)
on conflict (id) do nothing;
