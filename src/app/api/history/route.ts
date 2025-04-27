import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from "next/headers"; // Import cookies
import { Database } from "@/types/supabase"; // Import Database types

// Define the type for the expected history items
type HistoryItem = Database['public']['Tables']['story_generations']['Row'];

export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createSupabaseServerClient(); // Corrected: No argument needed

  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Extract storyId from query parameters
    const url = new URL(request.url);
    const storyId = url.searchParams.get('storyId');

    // Define base query fields
    const baseSelect = 'id, created_at, synopsis, style_note, requested_length, use_web_search, generated_story, parent_generation_id, iteration_feedback, is_accepted, story_id, user_id, user_identifier, part_instructions, global_context_synopsis, global_context_style, prompt'; // Add new fields + prompt

    let query = supabase
        .from('story_generations')
        .select(baseSelect);

    // Determine filtering logic
    if (user) {
      // Authenticated user: RLS handles filtering by user_id implicitly
      console.log(`Fetching history for authenticated user: ${user.id}${storyId ? ` for story ${storyId}` : ''}`);
      // If storyId is provided, add an explicit filter
      if (storyId) {
          query = query.eq('story_id', storyId);
      } else {
          // If no storyId, maybe filter out items *belonging* to stories?
          // Or show all? Let's show all for now, UI can filter later if needed.
          // query = query.is('story_id', null); // Example: show only standalone history
      }
    } else {
      // Anonymous user: Filter by user_identifier from header
      const userIdentifier = request.headers.get('X-User-Identifier');
      if (!userIdentifier) {
        console.log("No user_identifier provided for anonymous history request.");
        return NextResponse.json([] as HistoryItem[]);
      }
      console.log(`Fetching history for anonymous user: ${userIdentifier}${storyId ? ` for story ${storyId}` : ''}`);
      // RLS policy should handle identifier check, but add explicit filter for safety
      query = query.eq('user_identifier', userIdentifier);
       // Add storyId filter if provided
      if (storyId) {
          query = query.eq('story_id', storyId);
      } else {
          // query = query.is('story_id', null); // Filter out story parts if desired
      }
    }

    // Apply sorting: Chronological for story parts, reverse-chrono otherwise?
    // UI needs ASC for story parts. Let's default to ASC if storyId is present.
    const orderByCreatedAt = storyId ? 'created_at' : 'created_at'; // Could change default later
    const ascending = storyId ? true : false; // ASC for story parts, DESC for general history

    query = query.order(orderByCreatedAt, { ascending: ascending }).limit(storyId ? 100 : 50); // Allow more parts for a story


    // Execute query
    const { data, error } = await query;

    if (error) {
      console.error('Supabase history fetch error:', error);
      const userContext = user ? `user ${user.id}` : `identifier ${request.headers.get('X-User-Identifier')}`;
      return NextResponse.json({ error: `Failed to fetch history for ${userContext}` }, { status: 500 });
    }

    return NextResponse.json((data || []) as HistoryItem[]);

  } catch (error: any) {
    console.error("Error in /api/history:", error);
    const userContext = user ? `user ${user.id}` : `identifier ${request.headers.get('X-User-Identifier')}`;
    return NextResponse.json({ error: `Internal Server Error fetching history for ${userContext}` }, { status: 500 });
  }
}

// Optional: Add revalidation if needed
// export const revalidate = 0; // Force dynamic behavior if necessary 