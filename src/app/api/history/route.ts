import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Fetch all generations, ordered by creation date descending
    // You might want to add pagination or filtering later (e.g., only show top-level accepted ones)
    const { data, error } = await supabase
      .from('story_generations')
      .select('id, created_at, synopsis, style_note, requested_length, generated_story, parent_generation_id, iteration_feedback, is_accepted') // Select relevant columns
      .order('created_at', { ascending: false })
      .limit(20); // Limit for initial display

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