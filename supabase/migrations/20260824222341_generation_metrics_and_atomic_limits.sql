-- Metrics are server-only. The final package-complete event is intentionally
-- distinct from master generation, so pricing never relies on partial output.
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
  monthly_reserved_cost_usd numeric
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
    select event_name, outcome, modal_job_id, reserved_cost_usd
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
    coalesce((select sum(reserved_cost_usd) from recent_events where event_name = 'generation_reserved'), 0);
$$;

revoke all on function public.generation_metrics_snapshot() from public, anon, authenticated;
grant execute on function public.generation_metrics_snapshot() to service_role;

-- The BFF's early check gives a friendly response. These transaction-scoped
-- locks make the same limits authoritative when requests arrive concurrently.
create or replace function public.reserve_generation_order(
  p_owner_subject text,
  p_idempotency_key text,
  p_source_sha256 text,
  p_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.generation_orders;
  v_entitlement public.generation_entitlements;
  v_order public.generation_orders;
  v_user_count bigint;
  v_global_count bigint;
begin
  if p_owner_subject !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'Invalid owner subject';
  end if;
  if p_idempotency_key !~ '^[A-Za-z0-9:_-]{1,160}$' then
    raise exception 'Invalid idempotency key';
  end if;
  if p_source_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid source hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('generation-reservation-global', 0));
  perform pg_advisory_xact_lock(hashtextextended('generation-reservation-user:' || p_owner_subject, 0));

  select * into v_existing from public.generation_orders
  where owner_subject = p_owner_subject and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source_sha256 <> p_source_sha256 then
      raise exception 'Idempotency key was already used with different content';
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'created', false, 'state', v_existing.state, 'trace_id', v_existing.trace_id);
  end if;

  select count(*) into v_user_count from public.generation_orders
  where owner_subject = p_owner_subject and created_at >= now() - interval '24 hours';
  select count(*) into v_global_count from public.generation_orders
  where created_at >= now() - interval '24 hours';
  if v_user_count >= 3 or v_global_count >= 100 then
    raise exception 'Generation rate limit reached';
  end if;

  select * into v_entitlement from public.generation_entitlements
  where owner_subject = p_owner_subject and status = 'available' and (expires_at is null or expires_at > now())
  order by created_at for update skip locked limit 1;
  if not found then
    raise exception 'No generation entitlement is available';
  end if;

  insert into public.generation_orders (owner_subject, idempotency_key, entitlement_id, source_sha256)
  values (p_owner_subject, p_idempotency_key, v_entitlement.id, p_source_sha256)
  returning * into v_order;
  update public.generation_entitlements set status = 'reserved', reserved_order_id = v_order.id, updated_at = now() where id = v_entitlement.id;
  insert into public.legal_acceptances (owner_subject, order_id, acceptance_type, policy_version)
  values (p_owner_subject, v_order.id, 'image_rights', p_policy_version);
  return jsonb_build_object('order_id', v_order.id, 'created', true, 'state', v_order.state, 'trace_id', v_order.trace_id);
end;
$$;

;
