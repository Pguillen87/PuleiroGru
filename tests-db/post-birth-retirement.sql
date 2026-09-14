-- LOCAL PostgreSQL only. Every fixture is rolled back; never run against Production.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values
 ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into public.mascot_attempts (user_id,attempt_id,modal_job_id,workflow_mode,hatched_at)
values ('00000000-0000-4000-8000-000000000001','local-audit-attempt-1','local-job-1','async_incubator_v1',now());
insert into public.mascot_post_birth_profiles (user_id,attempt_id,modal_job_id)
values ('00000000-0000-4000-8000-000000000001','local-audit-attempt-1','local-job-1');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$
declare result jsonb; replay jsonb;
begin
  begin
    perform public.complete_post_birth_profile('00000000-0000-4000-8000-000000000001',
      'local-audit-attempt-1',9,'Pipoca','{"version":1}','local-job-1','master-1','GRU-TEST-0001',
      '[{"role":"normal"},{"role":"listening"},{"role":"transcribing"}]');
    raise exception 'TEST: stale revision was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'POST_BIRTH_PROFILE_CONFLICT' then raise; end if;
  end;
  if exists(select 1 from public.mascot_library_items where modal_job_id='local-job-1')
     or exists(select 1 from public.mascot_post_birth_profiles where attempt_id='local-audit-attempt-1' and state<>'DRAFT') then
    raise exception 'TEST: failed transaction left partial completion';
  end if;
  result := public.complete_post_birth_profile('00000000-0000-4000-8000-000000000001',
    'local-audit-attempt-1',0,'Pipoca','{"version":1}','local-job-1','master-1','GRU-TEST-0001',
    '[{"role":"normal"},{"role":"listening"},{"role":"transcribing"}]');
  replay := public.complete_post_birth_profile('00000000-0000-4000-8000-000000000001',
    'local-audit-attempt-1',0,'Outro','{"version":1}','local-job-1','master-1','GRU-TEST-0001',
    '[{"role":"normal"},{"role":"listening"},{"role":"transcribing"}]');
  if result#>>'{library_item,id}' is distinct from replay#>>'{library_item,id}'
     or replay->>'idempotent_replay'<>'true' then raise exception 'TEST: replay duplicated completion'; end if;
end $$;
reset role;
insert into public.mascot_public_mascots (id,source_item_id,published_by,mascot_code,pose_snapshot)
select '00000000-0000-4000-8000-000000000003',id,user_id,mascot_code,pose_snapshot
from public.mascot_library_items where modal_job_id='local-job-1';
insert into public.mascot_library_items (id,user_id,display_name,mascot_code,pose_snapshot,origin,source_public_mascot_id)
values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002',
 'Copia','GRU-COPY-0001','[{"role":"normal"},{"role":"listening"},{"role":"transcribing"}]',
 'public_copy','00000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare item_id uuid;
begin
  if exists(select 1 from public.mascot_library_items where user_id='00000000-0000-4000-8000-000000000002') then
    raise exception 'TEST: another owner is visible'; end if;
  if public.retire_mascot_library_item('00000000-0000-4000-8000-000000000004') then
    raise exception 'TEST: another owner was deleted'; end if;
  select id into strict item_id from public.mascot_library_items where modal_job_id='local-job-1';
  if not public.retire_mascot_library_item(item_id) or not public.retire_mascot_library_item(item_id) then
    raise exception 'TEST: retirement/replay failed'; end if;
  begin
    update public.mascot_post_birth_profiles set state='ACTIVE' where attempt_id='local-audit-attempt-1';
    raise exception 'TEST: direct state update bypassed backend';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.list_pending_incubation_attempts(50)) then
    raise exception 'TEST: completed birth returned to incubator'; end if;
end $$;
reset role;
do $$
begin
  if not exists(select 1 from public.mascot_library_items where id='00000000-0000-4000-8000-000000000004' and deleted_at is null)
     or not exists(select 1 from public.mascot_public_mascots where id='00000000-0000-4000-8000-000000000003' and retired_at is not null) then
    raise exception 'TEST: copy lost or publication still available'; end if;
  begin
    insert into public.mascot_library_items (user_id,display_name,mascot_code,pose_snapshot,origin,source_public_mascot_id)
    values ('00000000-0000-4000-8000-000000000001','Copia','GRU-COPY-0002','[]','public_copy','00000000-0000-4000-8000-000000000003');
    raise exception 'TEST: retired publication accepted a new copy';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PUBLIC_MASCOT_NOT_FOUND' then raise; end if;
  end;
end $$;
rollback;
\echo 'PASS: transaction rollback, replay, ownership, retirement, copy preservation, publication gate, state privileges, incubator projection'
