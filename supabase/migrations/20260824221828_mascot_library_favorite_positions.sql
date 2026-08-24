alter table public.mascot_library_items
add column if not exists favorite_rank integer;

alter table public.mascot_library_items
drop constraint if exists mascot_library_items_favorite_rank_positive;

alter table public.mascot_library_items
add constraint mascot_library_items_favorite_rank_positive
check (favorite_rank is null or favorite_rank > 0);

with ranked_favorites as (
  select id, row_number() over (partition by user_id order by created_at desc, id) as rank
  from public.mascot_library_items
  where is_favorite = true
)
update public.mascot_library_items as item
set favorite_rank = ranked_favorites.rank
from ranked_favorites
where item.id = ranked_favorites.id;

update public.mascot_library_items
set favorite_rank = null
where is_favorite = false;

create index if not exists mascot_library_items_user_favorite_rank_idx
on public.mascot_library_items(user_id, favorite_rank)
where is_favorite = true;

create or replace function public.set_mascot_library_item_favorite(
  p_item_id uuid,
  p_is_favorite boolean
)
returns public.mascot_library_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.mascot_library_items%rowtype;
  v_current_rank integer;
  v_favorite_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform id
  from public.mascot_library_items
  where user_id = v_user_id
  order by id
  for update;

  select *
  into v_item
  from public.mascot_library_items
  where id = p_item_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Mascot not found' using errcode = 'P0002';
  end if;

  if v_item.is_favorite = p_is_favorite then
    return v_item;
  end if;

  if p_is_favorite then
    select count(*)
    into v_favorite_count
    from public.mascot_library_items
    where user_id = v_user_id
      and is_favorite = true;

    update public.mascot_library_items
    set is_favorite = true,
        favorite_rank = v_favorite_count + 1
    where id = p_item_id
      and user_id = v_user_id
    returning * into v_item;

    return v_item;
  end if;

  v_current_rank := coalesce(v_item.favorite_rank, 1);

  update public.mascot_library_items
  set favorite_rank = favorite_rank - 1
  where user_id = v_user_id
    and is_favorite = true
    and favorite_rank > v_current_rank;

  update public.mascot_library_items
  set is_favorite = false,
      favorite_rank = null
  where id = p_item_id
    and user_id = v_user_id
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.set_mascot_library_item_favorite_rank(
  p_item_id uuid,
  p_favorite_rank integer
)
returns public.mascot_library_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.mascot_library_items%rowtype;
  v_current_rank integer;
  v_target_rank integer;
  v_favorite_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_favorite_rank < 1 then
    raise exception 'Favorite rank must be positive' using errcode = '22023';
  end if;

  perform id
  from public.mascot_library_items
  where user_id = v_user_id
    and is_favorite = true
  order by id
  for update;

  select *
  into v_item
  from public.mascot_library_items
  where id = p_item_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Mascot not found' using errcode = 'P0002';
  end if;

  if v_item.is_favorite = false then
    raise exception 'Mascot is not a favorite' using errcode = '22023';
  end if;

  select count(*)
  into v_favorite_count
  from public.mascot_library_items
  where user_id = v_user_id
    and is_favorite = true;

  v_current_rank := coalesce(v_item.favorite_rank, v_favorite_count);
  v_target_rank := least(greatest(p_favorite_rank, 1), v_favorite_count);

  if v_target_rank < v_current_rank then
    update public.mascot_library_items
    set favorite_rank = favorite_rank + 1
    where user_id = v_user_id
      and is_favorite = true
      and favorite_rank >= v_target_rank
      and favorite_rank < v_current_rank;
  elsif v_target_rank > v_current_rank then
    update public.mascot_library_items
    set favorite_rank = favorite_rank - 1
    where user_id = v_user_id
      and is_favorite = true
      and favorite_rank > v_current_rank
      and favorite_rank <= v_target_rank;
  end if;

  update public.mascot_library_items
  set favorite_rank = v_target_rank
  where id = p_item_id
    and user_id = v_user_id
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.set_mascot_library_item_favorite(uuid, boolean) from public;
revoke all on function public.set_mascot_library_item_favorite_rank(uuid, integer) from public;
grant execute on function public.set_mascot_library_item_favorite(uuid, boolean) to authenticated;
grant execute on function public.set_mascot_library_item_favorite_rank(uuid, integer) to authenticated;
