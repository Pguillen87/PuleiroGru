-- Reserved cost comes from the worker at dispatch time. Actual cost is filled
-- only during a billing reconciliation; null explicitly means "not yet known".
alter table public.mascot_generation_events
  add column if not exists actual_cost_usd numeric(12, 6)
  check (actual_cost_usd is null or actual_cost_usd >= 0);

drop function public.generation_metrics_snapshot();

create or replace function public.generation_metrics_snapshot()
returns table(
  sample_size bigint,
  avg_total_ms numeric,
  p50_total_ms numeric,
  p95_total_ms numeric,
  avg_master_ms numeric,
  p50_master_ms numeric,
  p95_master_ms numeric,
  failed_jobs_30d bigint,
  retried_jobs_30d bigint,
  monthly_reserved_cost_usd numeric,
  monthly_actual_cost_usd numeric
)
language sql
security invoker
set search_path = public
as $$
  with recent_completed as (
    select duration_ms
    from public.mascot_generation_events
    where event_name = 'generation_completed'
      and outcome = 'succeeded'
      and duration_ms is not null
    order by occurred_at desc
    limit 30
  ), recent_master as (
    select duration_ms
    from public.mascot_generation_events
    where event_name = 'master_worker_completed'
      and outcome = 'succeeded'
      and duration_ms is not null
    order by occurred_at desc
    limit 30
  ), recent_events as (
    select event_name, outcome, modal_job_id, reserved_cost_usd, actual_cost_usd
    from public.mascot_generation_events
    where occurred_at >= date_trunc('month', now())
  )
  select
    (select count(*) from recent_completed),
    (select avg(duration_ms) from recent_completed),
    (select percentile_cont(0.5) within group (order by duration_ms) from recent_completed),
    (select percentile_cont(0.95) within group (order by duration_ms) from recent_completed),
    (select avg(duration_ms) from recent_master),
    (select percentile_cont(0.5) within group (order by duration_ms) from recent_master),
    (select percentile_cont(0.95) within group (order by duration_ms) from recent_master),
    (select count(distinct modal_job_id) from recent_events where outcome = 'failed'),
    (select count(distinct modal_job_id) from recent_events where event_name = 'generation_retry_requested'),
    coalesce((select sum(reserved_cost_usd) from recent_events where event_name = 'generation_reserved'), 0),
    (select sum(actual_cost_usd) from recent_events where actual_cost_usd is not null);
$$;

;
