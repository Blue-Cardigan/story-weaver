import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    let query;

    if (user) {
      // Authenticated user: RLS should handle filtering by user_id
      console.log(`Fetching history for authenticated user: ${user.id}`);
      query = supabase
        .from('story_generations')
        .select('id, created_at, synopsis, style_note, requested_length, use_web_search, generated_story, parent_generation_id, iteration_feedback, is_accepted, user_id') // Select user_id for logged-in users
        // No explicit .eq('user_id', user.id) needed if RLS is correctly configured for SELECT
        .order('created_at', { ascending: false })
        .limit(50);
    } else {
      // Anonymous user: Filter by user_identifier from header (preferred) or query param
      const userIdentifierHeader = request.headers.get('X-User-Identifier');
      const { searchParams } = new URL(request.url);
      const userIdentifierQuery = searchParams.get('user_identifier');
      const userIdentifier = userIdentifierHeader || userIdentifierQuery;

      if (!userIdentifier) {
        console.log("No user_identifier provided for anonymous history request.");
        return NextResponse.json([]); // Return empty for anonymous without identifier
      }

      console.log(`Fetching history for anonymous user: ${userIdentifier}`);
      query = supabase
        .from('story_generations')
        .select('id, created_at, synopsis, style_note, requested_length, use_web_search, generated_story, parent_generation_id, iteration_feedback, is_accepted, user_identifier') // Select user_identifier for anonymous
        .eq('user_identifier', userIdentifier) // Explicit filter for anonymous
        .order('created_at', { ascending: false })
        .limit(50);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase history fetch error:', error);
      // Log the specific user context for easier debugging
      const userContext = user ? `user ${user.id}` : `identifier ${request.headers.get('X-User-Identifier') || new URL(request.url).searchParams.get('user_identifier')}`;
      console.error(`Error context: Failed for ${userContext}`);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    return NextResponse.json(data || []); // Return data or empty array

  } catch (error: any) {
    console.error("Error in /api/history:", error);
    const userContext = user ? `user ${user.id}` : `identifier ${request.headers.get('X-User-Identifier') || new URL(request.url).searchParams.get('user_identifier')}`;
    return NextResponse.json({ error: `Internal Server Error fetching history for ${userContext}` }, { status: 500 });
  }
}

// Optional: Add revalidation if needed
// export const revalidate = 0; // Force dynamic behavior if necessary 