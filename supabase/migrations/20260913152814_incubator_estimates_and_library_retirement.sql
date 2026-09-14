-- Keep referenced assets and completed copies when an owner removes an item.
set lock_timeout = '2s';
alter table public.mascot_library_items add column if not exists deleted_at timestamptz;
alter table public.mascot_public_mascots add column if not exists retired_at timestamptz;
alter table public.mascot_approved_pose_sets add column if not exists generation_provider text;

revoke update on public.mascot_post_birth_profiles from authenticated;
grant update (display_name, journal_config, configuration_revision) on public.mascot_post_birth_profiles to authenticated;
drop policy if exists "Users create their own post-birth profiles" on public.mascot_post_birth_profiles;
create policy "Users create their own post-birth profiles" on public.mascot_post_birth_profiles
  for insert to authenticated with check (user_id = (select auth.uid()) and state = 'DRAFT'
    and activated_at is null and library_item_id is null);

create or replace function public.retire_mascot_library_item(p_item_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.mascot_library_items%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_item from public.mascot_library_items
    where id = p_item_id and user_id = auth.uid() for update;
  if not found then return false; end if;
  if v_item.deleted_at is not null then return true; end if;
  update public.mascot_library_items set deleted_at = now() where id = v_item.id;
  update public.mascot_public_mascots set retired_at = now() where source_item_id = v_item.id;
  update public.mascot_import_codes set revoked_at = coalesce(revoked_at, now())
    where package_id in (select id from public.mascot_packages where library_item_id = v_item.id);
  return true;
end;
$$;
revoke all on function public.retire_mascot_library_item(uuid) from public, anon;
grant execute on function public.retire_mascot_library_item(uuid) to authenticated;

-- Only presentation fields are editable directly. Completion and retirement use RPCs.
revoke update on public.mascot_library_items from authenticated;
grant update (display_name, is_favorite, favorite_rank) on public.mascot_library_items to authenticated;
drop policy if exists "Users update their own mascot library items" on public.mascot_library_items;
create policy "Users update their own mascot library items" on public.mascot_library_items
  for update to authenticated using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()) and deleted_at is null);

-- A retired source cannot produce new copies, even through a direct RPC call.
create or replace function public.check_mascot_copy_source_available()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.origin = 'public_copy' then
    perform 1 from public.mascot_public_mascots
      where id = new.source_public_mascot_id and retired_at is null for share;
    if not found then raise exception 'PUBLIC_MASCOT_NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
create trigger mascot_copy_source_available before insert on public.mascot_library_items
  for each row execute function public.check_mascot_copy_source_available();

-- Aggregate only real, complete, current-contract generations; never expose user rows.
create or replace function public.mascot_incubation_timing()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('sampleCount', count(*), 'averageMs', round(avg(duration_ms)))
  from (
    select extract(epoch from (a.generation_ready_at - a.created_at)) * 1000 as duration_ms
    from public.mascot_approved_pose_sets s
    join public.mascot_attempts a on a.attempt_id = s.attempt_id and a.user_id = s.user_id
    where s.status = 'READY' and s.generation_provider = 'modal'
      and s.pose_set_qc ->> 'version' = 'pose-set-visual-v3'
      and a.workflow_mode = 'async_incubator_v1' and a.generation_ready_at > a.created_at
      and (select count(*) from public.mascot_approved_pose_assets x where x.pose_set_id = s.id) = 3
    order by a.generation_ready_at desc limit 20
  ) samples;
$$;
revoke all on function public.mascot_incubation_timing() from public, anon, authenticated;
grant execute on function public.mascot_incubation_timing() to service_role;

create or replace function public.list_pending_incubation_attempts(p_limit integer default 50)
returns setof public.mascot_attempts language sql stable security invoker set search_path = public, pg_temp as $$
  select a.* from public.mascot_attempts a
  where a.user_id = auth.uid() and a.workflow_mode = 'async_incubator_v1'
    and a.status <> 'ready'
    and not exists (select 1 from public.mascot_post_birth_profiles p
      where p.user_id = a.user_id and p.attempt_id = a.attempt_id
        and p.state = 'ACTIVE' and p.library_item_id is not null)
  order by a.created_at desc limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function public.list_pending_incubation_attempts(integer) from public, anon;
grant execute on function public.list_pending_incubation_attempts(integer) to authenticated;
