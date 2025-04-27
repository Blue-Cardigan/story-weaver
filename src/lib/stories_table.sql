-- Define the structure type enum
CREATE TYPE story_structure_type AS ENUM (
    'book',       -- Represents a longer work with chapters/parts
    'short_story' -- Represents a single, continuous narrative
);

-- Table to store overall story metadata
create table public.stories (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  title text not null check (char_length(title) > 0),
  structure_type story_structure_type not null default 'short_story',
  global_synopsis text null,
  global_style_note text null,
  user_id uuid null,
  user_identifier text null, -- For anonymous users

  constraint stories_pkey primary key (id),
  constraint stories_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete cascade,
  constraint stories_user_link_check check (
    (user_id is not null and user_identifier is null) or 
    (user_id is null and user_identifier is not null)
  ) -- Ensure either user_id OR user_identifier is set, but not both
) tablespace pg_default;

-- Trigger to update updated_at timestamp
create trigger handle_stories_updated_at before update
  on public.stories
  for each row
  execute procedure moddatetime (updated_at);

-- Enable Row Level Security
alter table public.stories enable row level security;

-- Policies for logged-in users
create policy "Allow ALL access for authenticated users" on public.stories
  for all
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

-- Policies for anonymous users (using user_identifier)
create policy "Allow SELECT for anonymous users based on identifier" on public.stories
  for select
  using (user_id is null and current_setting('request.headers', true)::jsonb ->> 'X-User-Identifier' = user_identifier);

create policy "Allow INSERT for anonymous users based on identifier" on public.stories
  for insert
  with check (user_id is null and current_setting('request.headers', true)::jsonb ->> 'X-User-Identifier' = user_identifier);

create policy "Allow UPDATE for anonymous users based on identifier" on public.stories
  for update
  using (user_id is null and current_setting('request.headers', true)::jsonb ->> 'X-User-Identifier' = user_identifier)
  with check (user_id is null and current_setting('request.headers', true)::jsonb ->> 'X-User-Identifier' = user_identifier);

create policy "Allow DELETE for anonymous users based on identifier" on public.stories
  for delete
  using (user_id is null and current_setting('request.headers', true)::jsonb ->> 'X-User-Identifier' = user_identifier);

-- Indexes
create index if not exists idx_stories_user_id on public.stories (user_id);
create index if not exists idx_stories_user_identifier on public.stories (user_identifier) where user_id is null; 