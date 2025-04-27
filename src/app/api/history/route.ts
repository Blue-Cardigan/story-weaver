import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Extract user_identifier from query parameters
    const { searchParams } = new URL(request.url);
    const userIdentifier = searchParams.get('user_identifier');

    // If no userIdentifier is provided, return an empty array (or handle as needed)
    if (!userIdentifier) {
      console.log("No user_identifier provided for history request.");
      return NextResponse.json([]); 
    }

    // Build the query dynamically
    let query = supabase
      .from('story_generations')
      .select('id, created_at, synopsis, style_note, requested_length, use_web_search, generated_story, parent_generation_id, iteration_feedback, is_accepted, user_identifier') // Added user_identifier to select
      .eq('user_identifier', userIdentifier) // Filter by user identifier
      .order('created_at', { ascending: false })
      .limit(50); // Maybe increase limit slightly for user-specific history

    const { data, error } = await query;

    if (error) {
      console.error('Supabase history fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    return NextResponse.json(data || []); // Return data or empty array

  } catch (error: any) {
    console.error("Error in /api/history:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error fetching history' }, { status: 500 });
  }
}

// Optional: Add revalidation if needed
// export const revalidate = 0; // Force dynamic behavior if necessary 