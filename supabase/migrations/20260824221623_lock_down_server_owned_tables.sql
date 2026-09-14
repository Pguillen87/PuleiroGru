SET lock_timeout = '2s';

-- Explicit deny policies document that the BFF/service_role is the only caller.
create policy "server only generation entitlements" on public.generation_entitlements for all to anon, authenticated using (false) with check (false);
create policy "server only generation orders" on public.generation_orders for all to anon, authenticated using (false) with check (false);
create policy "server only legal acceptances" on public.legal_acceptances for all to anon, authenticated using (false) with check (false);
create policy "server only publication consents" on public.publication_consents for all to anon, authenticated using (false) with check (false);
create policy "server only platform heartbeats" on public.platform_heartbeats for all to anon, authenticated using (false) with check (false);

-- The catalog remains private until moderation/listing endpoints are implemented in the BFF.
create policy "catalog unavailable until moderated bff release" on public.mascot_public_mascots for all to anon, authenticated using (false) with check (false);

-- Legacy client-writable telemetry is retired in favor of mascot_generation_events.
revoke all on public.mascot_generation_telemetry from anon, authenticated;
drop policy if exists "Users read their own mascot telemetry" on public.mascot_generation_telemetry;
drop policy if exists "Users update their own mascot telemetry" on public.mascot_generation_telemetry;
drop policy if exists "Users write their own mascot telemetry" on public.mascot_generation_telemetry;
create policy "legacy telemetry denied" on public.mascot_generation_telemetry for all to anon, authenticated using (false) with check (false);

;
