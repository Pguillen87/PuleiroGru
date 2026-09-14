set lock_timeout = '2s';

alter table public.mascot_generation_events
  add column if not exists event_id uuid not null default gen_random_uuid(),
  add column if not exists delivery_attempt integer not null default 1 check (delivery_attempt between 1 and 10),
  add column if not exists estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  add column if not exists received_at timestamptz not null default now();
create unique index if not exists mascot_generation_events_event_id_uidx on public.mascot_generation_events (event_id);

alter table public.generation_orders drop constraint if exists generation_orders_state_check;
alter table public.generation_orders add constraint generation_orders_state_check
check (state in ('awaiting_modal', 'queued', 'generating_master', 'awaiting_master_approval', 'completed', 'failed', 'recovery_required', 'canceled')) not valid;
alter table public.generation_orders validate constraint generation_orders_state_check;

alter table public.platform_heartbeats
  add column if not exists stale_jobs integer not null default 0 check (stale_jobs >= 0),
  add column if not exists telemetry_outbox_pending integer not null default 0 check (telemetry_outbox_pending >= 0),
  add column if not exists actual_cost_coverage_pct numeric(5, 2) check (actual_cost_coverage_pct is null or actual_cost_coverage_pct between 0 and 100);

create table if not exists public.mascot_deletion_receipts (
  event_id uuid primary key, trace_id uuid not null,
  modal_job_id text not null check (modal_job_id ~ '^job_[A-Za-z0-9]{16,96}$'),
  asset_groups_deleted integer not null default 0 check (asset_groups_deleted >= 0),
  deleted_at timestamptz not null,
  expires_at timestamptz not null default (now() + interval '12 months')
);
alter table public.mascot_deletion_receipts enable row level security;
revoke all on table public.mascot_deletion_receipts from public, anon, authenticated;
grant select, insert, delete on table public.mascot_deletion_receipts to service_role;

drop function if exists public.generation_metrics_snapshot();
create function public.generation_metrics_snapshot()
returns table(sample_size bigint, avg_total_ms numeric, p50_total_ms numeric, p95_total_ms numeric,
avg_master_ms numeric, p50_master_ms numeric, p95_master_ms numeric, failed_jobs_30d bigint,
recovered_jobs_30d bigint, monthly_reserved_cost_usd numeric, monthly_estimated_cost_usd numeric,
monthly_actual_cost_usd numeric, actual_cost_coverage_pct numeric)
language sql security invoker set search_path = public as $$
with recent_completed as (
 select duration_ms from public.mascot_generation_events
 where event_name='generation_completed' and outcome='succeeded' and duration_ms is not null
 order by occurred_at desc limit 30
), recent_master as (
 select duration_ms from public.mascot_generation_events
 where event_name='master_worker_completed' and outcome='succeeded' and duration_ms is not null
 order by occurred_at desc limit 30
), month_events as (
 select event_name,outcome,modal_job_id,reserved_cost_usd,estimated_cost_usd,actual_cost_usd,gpu_elapsed_ms
 from public.mascot_generation_events where occurred_at >= date_trunc('month',now())
)
select
 (select count(*) from recent_completed),
 (select avg(duration_ms) from recent_completed),
 (select percentile_cont(0.5) within group(order by duration_ms) from recent_completed),
 (select percentile_cont(0.95) within group(order by duration_ms) from recent_completed),
 (select avg(duration_ms) from recent_master),
 (select percentile_cont(0.5) within group(order by duration_ms) from recent_master),
 (select percentile_cont(0.95) within group(order by duration_ms) from recent_master),
 (select count(distinct modal_job_id) from month_events where outcome='failed'),
 (select count(distinct modal_job_id) from month_events where event_name='worker_lease_expired'),
 coalesce((select sum(reserved_cost_usd) from month_events where event_name='generation_reserved'),0),
 coalesce((select sum(estimated_cost_usd) from month_events where estimated_cost_usd is not null),0),
 (select sum(actual_cost_usd) from month_events where actual_cost_usd is not null),
 coalesce((select round(100.0*count(*) filter(where actual_cost_usd is not null)/nullif(count(*) filter(where gpu_elapsed_ms is not null),0),2) from month_events),0);
$$;
revoke all on function public.generation_metrics_snapshot() from public, anon, authenticated;
grant execute on function public.generation_metrics_snapshot() to service_role;

create or replace function public.prune_generation_observability() returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_events bigint; v_receipts bigint; v_heartbeats bigint;
begin
 delete from public.mascot_generation_events
 where (event_name <> 'job_deletion_completed' and occurred_at < now()-interval '30 days')
 or (event_name='job_deletion_completed' and occurred_at < now()-interval '12 months');
 get diagnostics v_events=row_count;
 delete from public.mascot_deletion_receipts where expires_at <= now();
 get diagnostics v_receipts=row_count;
 delete from public.platform_heartbeats where week_started_on not in
 (select week_started_on from public.platform_heartbeats order by week_started_on desc limit 12);
 get diagnostics v_heartbeats=row_count;
 return jsonb_build_object('events',v_events,'receipts',v_receipts,'heartbeats',v_heartbeats);
end; $$;
revoke all on function public.prune_generation_observability() from public, anon, authenticated;
grant execute on function public.prune_generation_observability() to service_role;

create or replace function public.delete_generation_order(p_owner_subject text,p_order_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_found boolean;
begin
 select true into v_found from public.generation_orders where id=p_order_id and owner_subject=p_owner_subject for update;
 if not found then return false; end if;
 delete from public.publication_consents where order_id=p_order_id;
 delete from public.legal_acceptances where order_id=p_order_id;
 update public.generation_entitlements set reserved_order_id=null,
 status=case when status='reserved' then 'available' else status end,updated_at=now()
 where reserved_order_id=p_order_id;
 delete from public.generation_orders where id=p_order_id;
 return true;
end; $$;
revoke all on function public.delete_generation_order(text,uuid) from public, anon, authenticated;
grant execute on function public.delete_generation_order(text,uuid) to service_role;;
