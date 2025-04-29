create table public.chapters (
  id uuid not null default gen_random_uuid (),
  story_id uuid not null,
  chapter_number integer not null,
  title text null,
  synopsis text null,
  style_notes text null,
  additional_notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  user_id uuid null,
  user_identifier text null,
  constraint chapters_pkey primary key (id),
  constraint chapters_story_id_chapter_number_key unique (story_id, chapter_number),
  constraint chapters_story_id_fkey foreign KEY (story_id) references stories (id) on delete CASCADE,
  constraint chapters_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_chapters_story_id on public.chapters using btree (story_id) TABLESPACE pg_default;

create index IF not exists idx_chapters_user_id on public.chapters using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_chapters_user_identifier on public.chapters using btree (user_identifier) TABLESPACE pg_default;

create trigger on_chapters_updated BEFORE
update on chapters for EACH row
execute FUNCTION handle_updated_at ();