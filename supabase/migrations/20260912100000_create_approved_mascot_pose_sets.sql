create table if not exists public.mascot_approved_pose_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id text not null,
  modal_job_id text not null,
  master_id text not null,
  pose_set_qc jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'READY', 'FAILED')),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (user_id, attempt_id),
  unique (user_id, modal_job_id)
);

create table if not exists public.mascot_approved_pose_assets (
  id uuid primary key default gen_random_uuid(),
  pose_set_id uuid not null references public.mascot_approved_pose_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('normal', 'listening', 'transcribing')),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  expected_bytes integer not null check (expected_bytes > 0),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  qc jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (pose_set_id, role)
);

create index if not exists mascot_approved_pose_sets_user_idx
  on public.mascot_approved_pose_sets(user_id, created_at desc);
create index if not exists mascot_approved_pose_assets_user_idx
  on public.mascot_approved_pose_assets(user_id, pose_set_id);

alter table public.mascot_approved_pose_sets enable row level security;
alter table public.mascot_approved_pose_assets enable row level security;
revoke all on public.mascot_approved_pose_sets, public.mascot_approved_pose_assets from public, anon, authenticated;
grant select on public.mascot_approved_pose_sets, public.mascot_approved_pose_assets to service_role;

insert into storage.buckets (id, name, public)
values ('mascot-approved-assets', 'mascot-approved-assets', false)
on conflict (id) do nothing;

create or replace function public.complete_post_birth_profile_v2(
  p_user_id uuid,
  p_attempt_id text,
  p_expected_revision integer,
  p_display_name text,
  p_journal_config jsonb,
  p_modal_job_id text,
  p_master_id text,
  p_mascot_code text,
  p_pose_snapshot jsonb,
  p_pose_set_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_set public.mascot_approved_pose_sets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'POST_BIRTH_PROFILE_BACKEND_ONLY' using errcode = '42501';
  end if;

  select * into v_set
  from public.mascot_approved_pose_sets
  where id = p_pose_set_id
    and user_id = p_user_id
    and attempt_id = p_attempt_id
    and modal_job_id = p_modal_job_id
    and master_id = p_master_id
    and status = 'READY'
  for share;

  if not found or (select count(*) from public.mascot_approved_pose_assets where pose_set_id = v_set.id) <> 3 then
    raise exception 'POST_BIRTH_APPROVED_SET_NOT_READY' using errcode = 'P0001';
  end if;

  return public.complete_post_birth_profile(
    p_user_id, p_attempt_id, p_expected_revision, p_display_name,
    p_journal_config, p_modal_job_id, p_master_id, p_mascot_code,
    p_pose_snapshot
  );
end;
$$;

revoke all on function public.complete_post_birth_profile_v2(uuid, text, integer, text, jsonb, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.complete_post_birth_profile_v2(uuid, text, integer, text, jsonb, text, text, text, jsonb, uuid) to service_role;
