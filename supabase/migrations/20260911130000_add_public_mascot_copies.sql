alter table public.mascot_library_items
  add column if not exists source_public_mascot_id uuid,
  add column if not exists origin text not null default 'generated',
  add column if not exists copy_state text not null default 'ready',
  add column if not exists provenance jsonb not null default '{}'::jsonb;

comment on column public.mascot_library_items.source_public_mascot_id is
  'Immutable provenance identifier; deliberately not an FK so unpublishing the source preserves completed copies.';

alter table public.mascot_library_items
  alter column attempt_id drop not null,
  alter column modal_job_id drop not null,
  alter column master_id drop not null;

alter table public.mascot_library_items
  drop constraint if exists mascot_library_items_user_job_unique;

create unique index if not exists mascot_library_items_user_job_idx
  on public.mascot_library_items(user_id, modal_job_id)
  where modal_job_id is not null;

create unique index if not exists mascot_library_items_user_public_source_idx
  on public.mascot_library_items(user_id, source_public_mascot_id)
  where source_public_mascot_id is not null;

alter table public.mascot_library_items
  drop constraint if exists mascot_library_items_origin_check,
  drop constraint if exists mascot_library_items_copy_state_check,
  drop constraint if exists mascot_library_items_origin_fields_check,
  drop constraint if exists mascot_library_items_provenance_object_check;

alter table public.mascot_library_items
  add constraint mascot_library_items_origin_check
    check (origin in ('generated', 'public_copy')),
  add constraint mascot_library_items_copy_state_check
    check (copy_state in ('pending', 'ready', 'failed')),
  add constraint mascot_library_items_origin_fields_check
    check (
      (origin = 'generated' and attempt_id is not null and modal_job_id is not null and master_id is not null)
      or (origin = 'public_copy' and source_public_mascot_id is not null and attempt_id is null and modal_job_id is null and master_id is null)
    ),
  add constraint mascot_library_items_provenance_object_check
    check (jsonb_typeof(provenance) = 'object');

drop policy if exists "Users add their own mascot library items" on public.mascot_library_items;
create policy "Users add their own mascot library items"
on public.mascot_library_items for insert to authenticated
with check ((select auth.uid()) = user_id and origin = 'generated');

drop policy if exists "Users update their own mascot library items" on public.mascot_library_items;
create policy "Users update their own mascot library items"
on public.mascot_library_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id and origin = 'generated');

create table if not exists public.mascot_library_item_assets (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.mascot_library_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('normal', 'listening', 'transcribing')),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  expected_bytes integer not null check (expected_bytes > 0),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  created_at timestamptz not null default now(),
  unique (library_item_id, role)
);

create index if not exists mascot_library_item_assets_user_idx
  on public.mascot_library_item_assets(user_id, library_item_id);

alter table public.mascot_library_item_assets enable row level security;
revoke all on public.mascot_library_item_assets from public, anon, authenticated;
grant select on public.mascot_library_item_assets to service_role;

insert into storage.buckets (id, name, public)
values ('mascot-library-copies', 'mascot-library-copies', false)
on conflict (id) do nothing;

create or replace function public.create_public_mascot_copy(
  p_user_id uuid,
  p_source_public_mascot_id uuid,
  p_copy_id uuid,
  p_display_name text,
  p_mascot_code text,
  p_pose_snapshot jsonb,
  p_provenance jsonb,
  p_assets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_public public.mascot_public_mascots%rowtype;
  v_source public.mascot_library_items%rowtype;
  v_item public.mascot_library_items%rowtype;
  v_name text := btrim(p_display_name);
  v_asset jsonb;
  v_asset_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'PUBLIC_MASCOT_COPY_BACKEND_ONLY' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 32
     or coalesce(p_mascot_code, '') !~ '^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$'
     or coalesce(jsonb_typeof(p_pose_snapshot), '') <> 'array'
     or coalesce(jsonb_typeof(p_provenance), '') <> 'object'
     or coalesce(jsonb_typeof(p_assets), '') <> 'array' then
    raise exception 'PUBLIC_MASCOT_COPY_INVALID' using errcode = 'P0001';
  end if;

  select * into v_public
  from public.mascot_public_mascots
  where id = p_source_public_mascot_id
  for share;
  if not found then
    raise exception 'PUBLIC_MASCOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_source
  from public.mascot_library_items
  where id = v_public.source_item_id and origin = 'generated';
  if not found then
    raise exception 'PUBLIC_MASCOT_SOURCE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select * into v_item
  from public.mascot_library_items
  where user_id = p_user_id and source_public_mascot_id = p_source_public_mascot_id
  for update;
  if found then
    if v_item.copy_state = 'ready' then
      return jsonb_build_object('item', to_jsonb(v_item), 'idempotent_replay', true);
    end if;
    raise exception 'PUBLIC_MASCOT_COPY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  select count(*) into v_asset_count from jsonb_array_elements(p_assets);
  if jsonb_array_length(p_pose_snapshot) <> 3
     or v_asset_count <> 3
     or (select count(distinct case when jsonb_typeof(entry) = 'object' then entry ->> 'role' end) from jsonb_array_elements(p_pose_snapshot) entry) <> 3
     or (select count(*) from jsonb_array_elements(p_pose_snapshot) entry where jsonb_typeof(entry) <> 'object' or coalesce(case when jsonb_typeof(entry) = 'object' then entry ->> 'role' end, '') not in ('normal', 'listening', 'transcribing')) > 0
     or (select count(distinct case when jsonb_typeof(entry) = 'object' then entry ->> 'role' end) from jsonb_array_elements(p_assets) entry) <> 3
     or (select count(*) from jsonb_array_elements(p_assets) entry where jsonb_typeof(entry) <> 'object' or coalesce(case when jsonb_typeof(entry) = 'object' then entry ->> 'role' end, '') not in ('normal', 'listening', 'transcribing')) > 0 then
    raise exception 'PUBLIC_MASCOT_COPY_ASSETS_INVALID' using errcode = 'P0001';
  end if;

  insert into public.mascot_library_items (
    id, user_id, attempt_id, modal_job_id, master_id, mascot_code,
    pose_snapshot, display_name, source_public_mascot_id, origin,
    copy_state, provenance
  ) values (
    p_copy_id, p_user_id, null, null, null, p_mascot_code,
    p_pose_snapshot, v_name, p_source_public_mascot_id, 'public_copy',
    'pending', p_provenance
  ) returning * into v_item;

  for v_asset in select * from jsonb_array_elements(p_assets) loop
    if (v_asset ->> 'storagePath') not like 'copies/' || p_user_id::text || '/' || p_copy_id::text || '/%'
       or (v_asset ->> 'role') not in ('normal', 'listening', 'transcribing') then
      raise exception 'PUBLIC_MASCOT_COPY_ASSET_PATH_INVALID' using errcode = 'P0001';
    end if;
    insert into public.mascot_library_item_assets (
      library_item_id, user_id, role, storage_path, sha256, expected_bytes, mime_type
    ) values (
      p_copy_id, p_user_id, v_asset ->> 'role', v_asset ->> 'storagePath',
      v_asset ->> 'sha256', (v_asset ->> 'expectedBytes')::integer, v_asset ->> 'mimeType'
    );
  end loop;

  update public.mascot_library_items
  set copy_state = 'ready'
  where id = p_copy_id and user_id = p_user_id
  returning * into v_item;

  return jsonb_build_object('item', to_jsonb(v_item), 'idempotent_replay', false);
end;
$$;

revoke all on function public.create_public_mascot_copy(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_public_mascot_copy(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb) to service_role;
