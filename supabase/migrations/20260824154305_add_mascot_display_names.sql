alter table public.mascot_library_items
  add column if not exists display_name text;

update public.mascot_library_items
set display_name = left('Mascote ' || mascot_code, 32)
where display_name is null or btrim(display_name) = '';

alter table public.mascot_library_items
  alter column display_name set not null;

alter table public.mascot_library_items
  drop constraint if exists mascot_library_items_display_name_length;

alter table public.mascot_library_items
  add constraint mascot_library_items_display_name_length
  check (char_length(display_name) between 2 and 32);
