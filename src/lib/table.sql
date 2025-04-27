create table public.story_generations (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  story_id uuid null,
  chapter_number integer null,
  part_number integer null,
  synopsis text null,
  style_note text null,
  requested_length integer null,
  use_web_search boolean null default false,
  prompt text null,
  generated_story text null,
  parent_generation_id uuid null,
  iteration_feedback text null,
  is_accepted boolean null default false,
  user_identifier text null,
  user_id uuid null,
  constraint story_generations_pkey primary key (id),
  constraint story_generations_story_id_fkey foreign key (story_id) references public.stories (id) on delete cascade,
  constraint story_generations_parent_generation_id_fkey foreign KEY (parent_generation_id) references story_generations (id) on delete set null,
  constraint story_generations_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

alter table public.story_generations enable row level security;

create index IF not exists idx_story_generations_story_id on public.story_generations(story_id);
create index IF not exists idx_story_generations_user_identifier on public.story_generations using btree (user_identifier) TABLESPACE pg_default
where
  (user_id is null);