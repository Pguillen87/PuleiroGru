grant delete on public.mascot_attempts to authenticated;

drop policy if exists "Users delete their own mascot attempts" on public.mascot_attempts;
create policy "Users delete their own mascot attempts"
on public.mascot_attempts for delete
to authenticated
using ((select auth.uid()) = user_id);
