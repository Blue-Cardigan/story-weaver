-- Function to atomically save (delete existing, then insert new) chapters for a story
-- Requires admin privileges (bypasses RLS) as it modifies based on provided IDs
CREATE OR REPLACE FUNCTION save_chapters(
    _story_id uuid,
    _user_id uuid,
    _user_identifier text,
    _chapters jsonb -- Expecting an array of chapter objects
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Important: Allows the function to operate with definer's privileges (admin)
AS $$
DECLARE
    chapter_data jsonb;
BEGIN
    -- Validate that either user_id or user_identifier is provided
    IF _user_id IS NULL AND _user_identifier IS NULL THEN
        RAISE EXCEPTION 'Either user_id or user_identifier must be provided';
    END IF;

    -- Start transaction (implicitly handled by plpgsql block, but good practice to think atomically)

    -- Delete existing chapters for the story, matching the user criteria
    DELETE FROM public.chapters c
    WHERE c.story_id = _story_id
      AND (
          (_user_id IS NOT NULL AND c.user_id = _user_id)
          OR
          (_user_identifier IS NOT NULL AND c.user_id IS NULL AND c.user_identifier = _user_identifier)
      );

    -- Check if there are chapters to insert
    IF jsonb_array_length(_chapters) > 0 THEN
        -- Insert the new chapters from the JSON array
        FOR chapter_data IN SELECT * FROM jsonb_array_elements(_chapters)
        LOOP
            INSERT INTO public.chapters (
                story_id,
                chapter_number,
                title,
                synopsis,
                style_notes,
                additional_notes,
                user_id,
                user_identifier
            )
            VALUES (
                _story_id,
                (chapter_data->>'chapter_number')::integer,
                chapter_data->>'title',
                chapter_data->>'synopsis',
                chapter_data->>'style_notes',
                chapter_data->>'additional_notes',
                _user_id, -- Assign the provided user_id
                _user_identifier -- Assign the provided user_identifier
                -- Note: The API route ensures only one of these (user_id or user_identifier) is non-null
            );
        END LOOP;
    END IF;

    -- Commit transaction (implicitly handled by plpgsql block)
END;
$$; 