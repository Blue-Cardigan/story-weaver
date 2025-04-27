import { supabase } from "@/lib/supabaseClient";
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { generationId } = await request.json();

    if (!generationId) {
      return NextResponse.json({ error: 'Missing generationId' }, { status: 400 });
    }

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