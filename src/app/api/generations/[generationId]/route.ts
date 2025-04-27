// src/app/api/generations/[generationId]/route.ts
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase";
import { NextRequest, NextResponse } from "next/server";

type StoryGenerationUpdate = Partial<Database['public']['Tables']['story_generations']['Update']>;

export async function PATCH(
    request: NextRequest,
    context: any // Escaping the type check for the second argument
) {
  const supabase = createSupabaseServerClient();
  // Access generationId through the context object now
  const { generationId } = context.params;

  if (!generationId) {
    return NextResponse.json({ error: "Missing generation ID" }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  const anonUserIdentifier = request.headers.get('X-User-Identifier');

  try {
    const payload = await request.json();
    const newContent = payload.generated_story; // Expecting the updated content in this field

    if (typeof newContent !== 'string') {
         return NextResponse.json({ error: "Missing or invalid 'generated_story' field in request body" }, { status: 400 });
    }

    // --- Authorization Check ---
    // Fetch the generation to verify ownership before updating
    const { data: generation, error: fetchError } = await supabase
      .from('story_generations')
      .select('user_id, user_identifier')
      .eq('id', generationId)
      .single();

    if (fetchError || !generation) {
      console.error(`PATCH /generations: Supabase fetch error for auth check on ${generationId}:`, fetchError);
      return NextResponse.json({ error: 'Generation not found or fetch error' }, { status: 404 });
    }

    let isAuthorized = false;
    if (user) {
      isAuthorized = generation.user_id === user.id;
    } else if (anonUserIdentifier) {
      isAuthorized = generation.user_identifier === anonUserIdentifier;
    }

    if (!isAuthorized) {
      console.warn(`PATCH /generations: Authorization failed for generation ${generationId}.`);
      return NextResponse.json({ error: 'Unauthorized to update this generation' }, { status: 403 });
    }
    // --- End Authorization Check ---

    // --- Perform Update ---
    const updateData: StoryGenerationUpdate = {
        generated_story: newContent,
        // We might want to update an `updated_at` timestamp if the table has one
    };

    const { error: updateError } = await supabase
        .from('story_generations')
        .update(updateData)
        .eq('id', generationId);

    if (updateError) {
        console.error(`PATCH /generations: Supabase update error for ${generationId}:`, updateError);
        return NextResponse.json({ error: `Failed to update generation: ${updateError.message}` }, { status: 500 });
    }

    console.log(`PATCH /generations: Successfully updated generation ${generationId}.`);
    return NextResponse.json({ success: true, message: "Generation updated successfully." });

  } catch (error) {
    console.error(`PATCH /generations: Error processing request for ${generationId}:`, error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: `Internal Server Error: ${message}` }, { status: 500 });
  }
}