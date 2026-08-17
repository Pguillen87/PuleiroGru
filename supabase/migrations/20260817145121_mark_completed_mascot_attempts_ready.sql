update public.mascot_attempts as attempt
set status = 'ready',
    updated_at = now()
where attempt.status <> 'ready'
  and exists (
    select 1
    from public.mascot_library_items as library_item
    where library_item.user_id = attempt.user_id
      and library_item.attempt_id = attempt.attempt_id
  );

create index if not exists mascot_attempts_user_resumable_idx
on public.mascot_attempts(user_id, updated_at desc)
where status not in ('ready', 'canceled');
