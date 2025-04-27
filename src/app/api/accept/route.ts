import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { NextResponse } from 'next/server';
import { Database } from "@/types/supabase"; // Import Database type

type StoryGenerationUpdate = Partial<Database['public']['Tables']['story_generations']['Update']>;

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  try {
    // Expect generationId AND editedContent from the body
    const { generationId, editedContent } = await request.json();
    const userIdentifierHeader = request.headers.get('X-User-Identifier');

    if (!generationId) {
      return NextResponse.json({ error: 'Missing generationId' }, { status: 400 });
    }
    // Validate editedContent - it should exist even if empty
    if (typeof editedContent !== 'string') {
       return NextResponse.json({ error: 'Missing or invalid editedContent field' }, { status: 400 });
    }

    // --- Fetch Generation for Authorization & Story ID ---
    const { data: generation, error: fetchError } = await supabase
      .from('story_generations')
      .select('user_id, user_identifier, story_id')
      .eq('id', generationId)
      .single();

    if (fetchError || !generation) {
      console.error('Supabase fetch error for auth check:', fetchError);
      return NextResponse.json({ error: 'Generation not found or fetch error' }, { status: 404 });
    }

    // --- Authorization Check ---
    let isAuthorized = false;
    if (user) {
      isAuthorized = generation.user_id === user.id;
    } else if (userIdentifierHeader) {
      isAuthorized = generation.user_identifier === userIdentifierHeader;
    }

    if (!isAuthorized) {
      console.warn(`Authorization failed for accept generation ${generationId}.`);
      return NextResponse.json({ error: 'Unauthorized to accept this generation' }, { status: 403 });
    }
    // --- End Authorization Check ---

    const storyId = generation.story_id;

    // --- Database Updates ---
    // Step 1: Un-accept other parts if part of a story
    // if (storyId) {
    //   const { error: updateOthersError } = await supabase
    //     .from('story_generations')
    //     .update({ is_accepted: false })
    //     .eq('story_id', storyId)
    //     .neq('id', generationId);

    //   if (updateOthersError) {
    //       console.error(`Supabase error un-accepting other parts for story ${storyId}:`, updateOthersError);
    //   } else {
    //       console.log(`Un-accepted other parts for story ${storyId}`);
    //   }
    // }

    // Step 2: Accept the target generation AND update its content
    const updateData: StoryGenerationUpdate = {
        is_accepted: true,
        generated_story: editedContent // Save the edited content
    };

    const { error: updateError } = await supabase
      .from('story_generations')
      .update(updateData)
      .eq('id', generationId);

    if (updateError) {
      console.error('Supabase update error accepting target generation:', updateError);
      return NextResponse.json({ error: 'Failed to update generation status and content' }, { status: 500 });
    }

    // --- Success ---
    console.log(`Successfully accepted generation ${generationId}${storyId ? ` for story ${storyId}` : ''} with updated content.`);
    return NextResponse.json({ success: true, message: `Generation ${generationId} marked as accepted.` });

  } catch (error: any) {
    console.error("Error in /api/accept:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
} 