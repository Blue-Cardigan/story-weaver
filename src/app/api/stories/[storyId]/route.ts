// src/app/api/stories/[storyId]/route.ts
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase";
import { NextRequest, NextResponse } from "next/server";

type DbStory = Database['public']['Tables']['stories']['Row'];

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
