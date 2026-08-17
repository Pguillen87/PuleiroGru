alter table public.mascot_library_items
add column if not exists is_favorite boolean not null default false;

create index if not exists mascot_library_items_user_favorite_created_idx
on public.mascot_library_items(user_id, is_favorite desc, created_at desc);
