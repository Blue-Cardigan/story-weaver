import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const { generationId } = await request.json();
    const userIdentifierHeader = request.headers.get('X-User-Identifier'); // Get anonymous ID from header

    if (!generationId) {
      return NextResponse.json({ error: 'Missing generationId' }, { status: 400 });
    }

    // --- Authorization Check ---
    // Fetch the generation to check ownership
    const { data: generation, error: fetchError } = await supabase
      .from('story_generations')
      .select('user_id, user_identifier')
      .eq('id', generationId)
      .single();

    if (fetchError || !generation) {
      console.error('Supabase fetch error for auth check:', fetchError);
      return NextResponse.json({ error: 'Generation not found or fetch error' }, { status: 404 });
    }

    let isAuthorized = false;
    if (user) {
      // Logged-in user: Check if user_id matches
      isAuthorized = generation.user_id === user.id;
    } else if (userIdentifierHeader) {
      // Anonymous user: Check if user_identifier matches header
      isAuthorized = generation.user_identifier === userIdentifierHeader;
    }

    if (!isAuthorized) {
      console.warn(`Authorization failed for accept generation ${generationId}. Auth user: ${user?.id}, Header ID: ${userIdentifierHeader}, Record user_id: ${generation.user_id}, Record user_identifier: ${generation.user_identifier}`);
      return NextResponse.json({ error: 'Unauthorized to accept this generation' }, { status: 403 });
    }
    // --- End Authorization Check ---


    // Update the specific generation record
    const { error: updateError } = await supabase
      .from('story_generations')
      .update({ is_accepted: true })
      .eq('id', generationId);
    
    // Optional: You could also mark other related generations (e.g., siblings in an iteration chain) as not accepted.
    // const { error: updateSiblingsError } = await supabase
    //   .from('story_generations')
    //   .update({ is_accepted: false })
    //   .eq('parent_generation_id', parentId) // Need parentId for this
    //   .neq('id', generationId); // Don't un-accept the one we just accepted

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return NextResponse.json({ error: 'Failed to update generation status' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Generation ${generationId} marked as accepted.` });

  } catch (error: any) {
    console.error("Error in /api/accept:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
} 