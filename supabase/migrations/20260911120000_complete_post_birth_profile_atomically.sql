alter table public.mascot_post_birth_profiles
  add column if not exists library_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mascot_post_birth_profiles_library_item_fk'
      and conrelid = 'public.mascot_post_birth_profiles'::regclass
  ) then
    alter table public.mascot_post_birth_profiles
      add constraint mascot_post_birth_profiles_library_item_fk
      foreign key (library_item_id)
      references public.mascot_library_items(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists mascot_post_birth_profiles_library_item_uidx
  on public.mascot_post_birth_profiles(library_item_id)
  where library_item_id is not null;

comment on column public.mascot_post_birth_profiles.library_item_id is
  'The personal library item created by the atomic post-birth completion.';

create or replace function public.complete_post_birth_profile(
  p_user_id uuid,
  p_attempt_id text,
  p_expected_revision integer,
  p_display_name text,
  p_journal_config jsonb,
  p_modal_job_id text,
  p_master_id text,
  p_mascot_code text,
  p_pose_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.mascot_post_birth_profiles%rowtype;
  v_attempt public.mascot_attempts%rowtype;
  v_item public.mascot_library_items%rowtype;
  v_name text := btrim(p_display_name);
  v_replay boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user_id is null then
    raise exception 'POST_BIRTH_PROFILE_BACKEND_ONLY' using errcode = '42501';
  end if;

  select * into v_profile
  from public.mascot_post_birth_profiles
  where user_id = p_user_id and attempt_id = p_attempt_id
  for update;

  if not found then
    raise exception 'POST_BIRTH_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_attempt
  from public.mascot_attempts
  where user_id = p_user_id and attempt_id = p_attempt_id
  for update;

  if not found
     or v_attempt.workflow_mode <> 'async_incubator_v1'
     or v_attempt.hatched_at is null
     or v_attempt.modal_job_id is distinct from p_modal_job_id then
    raise exception 'POST_BIRTH_PROFILE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if v_profile.state = 'ACTIVE' and v_profile.library_item_id is not null then
    select * into v_item
    from public.mascot_library_items
    where id = v_profile.library_item_id and user_id = p_user_id;

    if not found then
      raise exception 'POST_BIRTH_PROFILE_COMPLETE_FAILED' using errcode = 'P0001';
    end if;

    v_replay := true;
  else
    if v_profile.state = 'DRAFT' and v_profile.configuration_revision <> p_expected_revision then
      raise exception 'POST_BIRTH_PROFILE_CONFLICT' using errcode = 'P0001';
    end if;

    if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 32
       or coalesce(p_modal_job_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(p_master_id, '') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(p_mascot_code, '') !~ '^GRU-[A-Z0-9]{4}-[A-Z0-9]{4}$'
       or p_master_id is null
       or coalesce(jsonb_typeof(p_journal_config), '') <> 'object'
       or coalesce(p_journal_config ->> 'version', '') <> '1'
       or coalesce(p_journal_config - 'version', '{}'::jsonb) <> '{}'::jsonb
       or coalesce(jsonb_typeof(p_pose_snapshot), '') <> 'array'
       or jsonb_array_length(case when jsonb_typeof(p_pose_snapshot) = 'array' then p_pose_snapshot else '[]'::jsonb end) <> 3
       or (select count(*) from jsonb_array_elements(case when jsonb_typeof(p_pose_snapshot) = 'array' then p_pose_snapshot else '[]'::jsonb end) pose where jsonb_typeof(pose) <> 'object' or coalesce(pose ->> 'role', '') not in ('normal', 'listening', 'transcribing')) > 0
       or (select count(distinct pose ->> 'role') from jsonb_array_elements(case when jsonb_typeof(p_pose_snapshot) = 'array' then p_pose_snapshot else '[]'::jsonb end) pose) <> 3 then
      raise exception 'POST_BIRTH_PROFILE_COMPLETE_FAILED' using errcode = 'P0001';
    end if;

    select * into v_item
    from public.mascot_library_items
    where user_id = p_user_id and modal_job_id = p_modal_job_id
    for update;

    if not found then
      insert into public.mascot_library_items (
        user_id, attempt_id, modal_job_id, master_id, mascot_code,
        display_name, pose_snapshot
      ) values (
        p_user_id, p_attempt_id, p_modal_job_id, p_master_id, p_mascot_code,
        v_name, p_pose_snapshot
      )
      returning * into v_item;
    else
      if v_item.attempt_id is distinct from p_attempt_id
         or v_item.master_id is distinct from p_master_id then
        raise exception 'POST_BIRTH_PROFILE_COMPLETE_FAILED' using errcode = 'P0001';
      end if;
      update public.mascot_library_items
      set display_name = v_name
      where id = v_item.id and user_id = p_user_id
      returning * into v_item;
    end if;

    update public.mascot_post_birth_profiles
    set state = 'ACTIVE',
        display_name = v_name,
        journal_config = p_journal_config,
        configuration_revision = configuration_revision + 1,
        activated_at = coalesce(activated_at, now()),
        library_item_id = v_item.id
    where id = v_profile.id
    returning * into v_profile;

    update public.mascot_attempts
    set status = 'ready',
        current_stage = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where user_id = p_user_id and attempt_id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'library_item', to_jsonb(v_item),
    'idempotent_replay', v_replay
  );
end;
$$;

revoke all on function public.complete_post_birth_profile(uuid, text, integer, text, jsonb, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_post_birth_profile(uuid, text, integer, text, jsonb, text, text, text, jsonb) to service_role;
