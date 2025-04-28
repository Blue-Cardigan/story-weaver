import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import { Database } from '@/types/supabase';
import { NextResponse } from 'next/server';

type Chapter = Database['public']['Tables']['chapters']['Row'];

export async function PATCH(
  request: Request,
  { params }: { params: { storyId: string, chapterId: string } }
) {
  const supabase = createSupabaseServerClient();
  const { storyId, chapterId } = params;

  if (!storyId || !chapterId) {
    return NextResponse.json({ error: 'Story ID and Chapter ID are required' }, { status: 400 });
  }

  let userId: string | null = null;
  let isAnon = false;

  // 1. Check for logged-in user session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    userId = session.user.id;
  } else {
    // 2. Check for anonymous user identifier header
    const anonUserId = request.headers.get('X-User-Identifier');
    if (anonUserId) {
      userId = anonUserId;
      isAnon = true;
    } else {
      return NextResponse.json({ error: 'User session or identifier not found' }, { status: 401 });
    }
  }

  try {
    // Parse the request body for update fields
    const body = await request.json();
    const { chapter_number, title, synopsis } = body;

    // Construct update object, only including defined fields
    const updateData: Partial<Pick<Chapter, 'chapter_number' | 'title' | 'synopsis' | 'updated_at'>> = {};
    if (chapter_number !== undefined) updateData.chapter_number = chapter_number;
    if (title !== undefined) updateData.title = title;
    if (synopsis !== undefined) updateData.synopsis = synopsis;

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No update fields provided' }, { status: 400 });
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString();

    // Build the query - RLS policies will handle user check implicitly
    const { data: updatedChapter, error } = await supabase
      .from('chapters')
      .update(updateData)
      .eq('id', chapterId)
      .eq('story_id', storyId) // Keep story_id check
      // Removed explicit user/anon identifier checks
      .select() // Select the updated record(s)
      .single(); // Expecting only one record

    if (error) {
      console.error('Supabase chapter update error:', error);
      // Check for specific errors like RLS violation or not found
      if (error.code === 'PGRST116') { // Resource not found or RLS violation
          return NextResponse.json({ error: 'Chapter not found or access denied.' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message || 'Failed to update chapter' }, { status: 500 });
    }

    if (!updatedChapter) {
      return NextResponse.json({ error: 'Chapter not found after update attempt.' }, { status: 404 });
    }

    // Return the updated chapter data
    return NextResponse.json(updatedChapter);

  } catch (err) {
    console.error('Chapter update request processing error:', err);
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
} 