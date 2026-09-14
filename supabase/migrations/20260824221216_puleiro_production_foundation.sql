-- Production foundation for the Puleiro BFF. All objects are server-owned.
SET lock_timeout = '2s';

create table if not exists public.generation_entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null check (char_length(owner_subject) between 1 and 128),
  status text not null default 'available' check (status in ('available', 'reserved', 'consumed', 'revoked')),
  reserved_order_id uuid,
  source text not null default 'pilot' check (source in ('pilot', 'payment', 'support', 'retry')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_orders (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null check (char_length(owner_subject) between 1 and 128),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_-]{1,160}$'),
  trace_id uuid not null default gen_random_uuid(),
  entitlement_id uuid references public.generation_entitlements(id),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'awaiting_modal' check (state in ('awaiting_modal', 'queued', 'generating_master', 'awaiting_master_approval', 'completed', 'failed', 'canceled')),
  modal_job_id text unique,
  failure_code text check (failure_code is null or char_length(failure_code) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_subject, idempotency_key)
);

alter table public.generation_entitlements
  add constraint generation_entitlements_reserved_order_fkey
  foreign key (reserved_order_id) references public.generation_orders(id) not valid;
alter table public.generation_entitlements validate constraint generation_entitlements_reserved_order_fkey;

create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  owner_subject text not null check (char_length(owner_subject) between 1 and 128),
  order_id uuid not null references public.generation_orders(id),
  acceptance_type text not null check (acceptance_type in ('image_rights', 'publication_rights')),
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  accepted_at timestamptz not null default now(),
  unique (order_id, acceptance_type, policy_version)
);

create table if not exists public.publication_consents (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null check (char_length(owner_subject) between 1 and 128),
  order_id uuid not null unique references public.generation_orders(id),
  policy_version text not null check (char_length(policy_version) between 1 and 64),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  moderation_status text not null default 'pending_review' check (moderation_status in ('pending_review', 'approved', 'rejected', 'removed'))
);

create table if not exists public.platform_heartbeats (
  week_started_on date primary key,
  deployment_id text check (deployment_id is null or char_length(deployment_id) <= 128),
  supabase_status text not null check (supabase_status in ('healthy', 'unhealthy')),
  modal_status text not null check (modal_status in ('healthy', 'degraded', 'unavailable', 'not_checked')),
  duration_ms integer not null check (duration_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 64),
  checked_at timestamptz not null default now()
);

create index if not exists generation_orders_owner_created_idx on public.generation_orders (owner_subject, created_at desc);
create index if not exists generation_orders_state_created_idx on public.generation_orders (state, created_at desc);
create index if not exists generation_entitlements_owner_status_idx on public.generation_entitlements (owner_subject, status, created_at desc);
create index if not exists legal_acceptances_order_idx on public.legal_acceptances (order_id, accepted_at desc);

alter table public.generation_entitlements enable row level security;
alter table public.generation_orders enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.publication_consents enable row level security;
alter table public.platform_heartbeats enable row level security;

-- The BFF uses service_role. No browser role may call these product-control tables directly.
revoke all on public.generation_entitlements, public.generation_orders, public.legal_acceptances, public.publication_consents, public.platform_heartbeats from anon, authenticated;
grant select, insert, update, delete on public.generation_entitlements, public.generation_orders, public.legal_acceptances, public.publication_consents, public.platform_heartbeats to service_role;
grant usage, select on sequence public.legal_acceptances_id_seq to service_role;

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

  select * into v_existing from public.generation_orders
  where owner_subject = p_owner_subject and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.source_sha256 <> p_source_sha256 then
      raise exception 'Idempotency key was already used with different input';
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'created', false, 'state', v_existing.state, 'trace_id', v_existing.trace_id);
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

revoke all on function public.reserve_generation_order(text, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_generation_order(text, text, text, text) to service_role;

;
