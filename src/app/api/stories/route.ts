import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Define the expected shape of Story data from the database
type DbStory = Database['public']['Tables']['stories']['Row'];
// Define the expected shape for creating a new story
type NewStoryPayload = Database['public']['Tables']['stories']['Insert'];

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  const anonUserIdentifier = request.headers.get('X-User-Identifier');

  try {
    const query = supabase.from('stories').select('*').order('created_at', { ascending: false });

    if (user) {
      // RLS handles filtering by user_id
      console.log(`Fetching stories for user: ${user.id}`);
    } else if (anonUserIdentifier) {
      // RLS for anonymous users relies on the header being passed correctly
      console.log(`Fetching stories for anonymous identifier: ${anonUserIdentifier}`);
      // Note: The policy `Allow SELECT for anonymous users based on identifier` uses the header.
    } else {
      console.warn('Attempting to fetch stories without user or anonymous identifier.');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching stories:", error);
      throw new Error(error.message);
    }

    console.log(`Successfully fetched ${data?.length ?? 0} stories.`);
    return NextResponse.json(data as DbStory[]);

  } catch (error) {
    console.error('API GET /api/stories error:', error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: `Failed to fetch stories: ${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  const anonUserIdentifier = request.headers.get('X-User-Identifier');

  try {
    const payload = await request.json();

    // Basic validation
    if (!payload.title || typeof payload.title !== 'string' || payload.title.trim() === '') {
      return NextResponse.json({ error: "Story title is required." }, { status: 400 });
    }

    const newStoryData: Partial<NewStoryPayload> = {
      title: payload.title.trim(),
      structure_type: payload.structure_type === 'book' ? 'book' : 'short_story', // Default to short_story if invalid
      global_synopsis: payload.global_synopsis || null,
      global_style_note: payload.global_style_note || null,
    };

    if (user) {
      newStoryData.user_id = user.id;
      console.log(`Creating story for user: ${user.id}`);
    } else if (anonUserIdentifier) {
      newStoryData.user_identifier = anonUserIdentifier;
      console.log(`Creating story for anonymous identifier: ${anonUserIdentifier}`);
      // Note: The policy `Allow INSERT for anonymous users based on identifier` uses the header.
    } else {
      console.warn('Attempting to create story without user or anonymous identifier.');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('stories')
      .insert(newStoryData as NewStoryPayload) // Cast needed as we build partially
      .select()
      .single();

    if (error) {
      console.error("Error creating story:", error);
      // Check for specific errors, e.g., RLS violation, constraint violation
      if (error.code === '23505') { // unique_violation (though unlikely here unless custom constraints added)
        return NextResponse.json({ error: "Failed to create story due to conflict." }, { status: 409 });
      }
      if (error.code === '42501') { // insufficient_privilege (RLS)
        return NextResponse.json({ error: "Authorization failed." }, { status: 403 });
      }
      throw new Error(error.message);
    }

    console.log(`Successfully created story with ID: ${data.id}`);
    return NextResponse.json(data as DbStory, { status: 201 }); // Return created story

  } catch (error) {
    console.error('API POST /api/stories error:', error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: `Failed to create story: ${message}` }, { status: 500 });
  }
} 