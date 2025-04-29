// src/app/api/stories/[storyId]/route.ts
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase";
import { NextRequest, NextResponse } from "next/server";

type DbStory = Database['public']['Tables']['stories']['Row'];
type StoryUpdatePayload = Partial<Database['public']['Tables']['stories']['Update']>;

export async function GET(
    request: NextRequest,
    context: any // Escaping the type check for the second argument
) {
  const supabase = createSupabaseServerClient();
  // Access storyId through the context object now
  const { storyId } = context.params;

  if (!storyId) {
    return NextResponse.json({ error: "Missing story ID" }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const anonUserIdentifier = request.headers.get('X-User-Identifier');

  try {
    const query = supabase
      .from('stories')
      .select('*')
      .eq('id', storyId);

    // RLS policies should handle the user_id/user_identifier check based on session/header.
    // No explicit filtering needed here if RLS is set up correctly.
    if (user) {
        console.log(`Fetching story details for story ${storyId}, user ${user.id}`);
    } else if (anonUserIdentifier) {
        console.log(`Fetching story details for story ${storyId}, anon identifier ${anonUserIdentifier}`);
        // Ensure header is passed correctly for RLS policy to work
    } else {
        console.warn(`Attempting to fetch story ${storyId} without user or anonymous identifier.`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error, status } = await query.single(); // Expecting only one story

    if (error) {
        console.error(`Error fetching story ${storyId}:`, error);
        if (status === 406 || error.code === 'PGRST116') { // Not found or RLS prevents access
             return NextResponse.json({ error: "Story not found or access denied" }, { status: 404 });
        }
        throw new Error(error.message);
    }

    if (!data) {
        // Should be caught by single() error handling, but double-check
         return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    console.log(`Successfully fetched story details for story ${storyId}.`);
    return NextResponse.json(data as DbStory);

  } catch (error) {
    console.error(`API GET /api/stories/${storyId} error:`, error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: `Failed to fetch story details: ${message}` }, { status: 500 });
  }
}

export async function PATCH(
    request: NextRequest,
    context: any // Using 'any' to bypass type check
) {
    const supabase = createSupabaseServerClient();
    const { storyId } = context.params;

    if (!storyId) {
        return NextResponse.json({ error: "Missing story ID" }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    const anonUserIdentifier = request.headers.get('X-User-Identifier');

    try {
        const payload = await request.json() as StoryUpdatePayload; // Type the incoming payload

        // --- Validate Payload (basic) ---
        const updateData: StoryUpdatePayload = {};
        if (payload.title !== undefined) {
            if (typeof payload.title !== 'string' || payload.title.trim() === '') {
                return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
            }
            updateData.title = payload.title.trim();
        }
        if (payload.structure_type !== undefined) updateData.structure_type = payload.structure_type;
        if (payload.global_synopsis !== undefined) updateData.global_synopsis = payload.global_synopsis; // Allow null/empty
        if (payload.global_style_note !== undefined) updateData.global_style_note = payload.global_style_note; // Allow null/empty
        if (payload.global_additional_notes !== undefined) updateData.global_additional_notes = payload.global_additional_notes; // Allow null/empty
        if (payload.target_length !== undefined) {
             if (payload.target_length === null || (typeof payload.target_length === 'number' && payload.target_length > 0)) {
                 updateData.target_length = payload.target_length === null ? null : Math.floor(payload.target_length);
             } else {
                  return NextResponse.json({ error: "Invalid target length." }, { status: 400 });
             }
        }

        if (Object.keys(updateData).length === 0) {
             return NextResponse.json({ error: "No valid fields provided for update." }, { status: 400 });
        }
        // Add updated_at timestamp manually if not handled by trigger
        // updateData.updated_at = new Date().toISOString();

        // --- Authorization Check ---
        // RLS policy on 'stories' table should handle this check implicitly
        // based on user_id or user_identifier matching.

        // --- Perform Update ---
        const { error: updateError } = await supabase
            .from('stories')
            .update(updateData)
            .eq('id', storyId); // RLS checks ownership here

        if (updateError) {
            console.error(`PATCH /stories: Supabase update error for ${storyId}:`, updateError);
             if (updateError.code === '42501') { // RLS permission denied
                 return NextResponse.json({ error: "Authorization failed to update story." }, { status: 403 });
             }
             // Check if the update affected 0 rows potentially? (Requires .select() after update)
            return NextResponse.json({ error: `Failed to update story: ${updateError.message}` }, { status: 500 });
        }

        // --- Fetch and Return Updated Story (optional but good) ---
         const { data: updatedStory, error: fetchUpdatedError } = await supabase
            .from('stories')
            .select('*')
            .eq('id', storyId)
            .single();

         if (fetchUpdatedError || !updatedStory) {
             console.error(`PATCH /stories: Error fetching updated story ${storyId} after update:`, fetchUpdatedError);
             return NextResponse.json({ success: true, message: "Story updated, but failed to fetch updated data." });
         }

        console.log(`PATCH /stories: Successfully updated story ${storyId}.`);
        return NextResponse.json(updatedStory as DbStory); // Return the updated story

    } catch (error) {
        console.error(`API PATCH /stories/${storyId} error:`, error);
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: `Failed to update story details: ${message}` }, { status: 500 });
    }
}
