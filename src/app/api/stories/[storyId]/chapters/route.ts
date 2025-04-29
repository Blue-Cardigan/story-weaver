    // src/app/api/stories/[storyId]/chapters/route.ts
    import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
    import { Database } from '@/types/supabase';
    import { NextRequest, NextResponse } from 'next/server';

    type ChapterOutline = Database['public']['Tables']['chapters']['Insert'];
    type DbChapter = Database['public']['Tables']['chapters']['Row'];

    export async function POST(
        req: NextRequest,
        { params }: { params: { storyId: string } }
    ) {
        const supabaseServer = createSupabaseServerClient();
        const { storyId } = params;

        if (!storyId) {
            return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });
        }

        let userId: string | null = null;
        let userIdentifier: string | null = null;

        // Check for logged-in user session
        const { data: { session } } = await supabaseServer.auth.getSession();

        if (session?.user?.id) {
            userId = session.user.id;
        } else {
            // Check for anonymous user identifier header
            userIdentifier = req.headers.get('X-User-Identifier');
            if (!userIdentifier) {
                return NextResponse.json({ error: 'Unauthorized: User session or identifier required' }, { status: 401 });
            }
            // Optional: Validate if a story with this user_identifier exists for this storyId?
            // This might be redundant if the delete operation below correctly targets the identifier.
        }

        let chaptersToInsert: Omit<ChapterOutline, 'id' | 'created_at' | 'updated_at'>[] = [];

        try {
            const body = await req.json();
            if (!Array.isArray(body.chapters)) {
                throw new Error('Invalid input: chapters must be an array.');
            }

            chaptersToInsert = body.chapters.map((chapter: any, index: number) => ({
                story_id: storyId,
                chapter_number: index + 1, // Assign chapter number based on array order
                title: chapter.title?.trim() || null,
                synopsis: chapter.synopsis?.trim() || null,
                style_notes: chapter.style_notes?.trim() || null,
                additional_notes: chapter.additional_notes?.trim() || null,
                user_id: userId, // Set user_id if logged in
                user_identifier: userId ? null : userIdentifier, // Set user_identifier if anonymous
            }));

            if (chaptersToInsert.length === 0) {
                // If the array is empty, just delete existing chapters
                 console.log(`No chapters provided for story ${storyId}. Deleting existing chapters.`);
            }

        } catch (error) {
            console.error('Error parsing request body or mapping chapters:', error);
            return NextResponse.json({ error: 'Invalid request body. Expecting { chapters: [...] }' }, { status: 400 });
        }

        try {
            // Use a transaction to ensure atomicity: delete old, insert new
            const { error: transactionError } = await supabaseServer.rpc('save_chapters' as any, {
                _story_id: storyId,
                _user_id: userId,
                _user_identifier: userIdentifier,
                _chapters: chaptersToInsert
            });

            if (transactionError) {
                throw transactionError;
            }

            console.log(`Successfully saved ${chaptersToInsert.length} chapters for story ${storyId}`);
            return NextResponse.json({ message: 'Chapter plan saved successfully', count: chaptersToInsert.length }, { status: 200 });

        } catch (error: any) {
            console.error(`Error saving chapters for story ${storyId}:`, error);
            return NextResponse.json({ error: `Database error: ${error.message || 'Failed to save chapter plan'}` }, { status: 500 });
        }
    }

    export async function GET(
        request: NextRequest,
        context: any
    ) {
        const supabase = createSupabaseServerClient();
        const { storyId } = await context.params;

        if (!storyId) {
            return NextResponse.json({ error: "Missing story ID" }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        const anonUserIdentifier = request.headers.get('X-User-Identifier');

         // Authorization check: RLS on chapters table should handle this based on story_id linkage and user/identifier
         if (!user && !anonUserIdentifier) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
         }

        try {
            const query = supabase
                .from('chapters')
                .select('*')
                .eq('story_id', storyId)
                .order('chapter_number', { ascending: true }); // Order chapters correctly

            const { data, error } = await query;

            if (error) {
                console.error(`Error fetching chapters for story ${storyId}:`, error);
                throw new Error(error.message);
            }

            console.log(`Successfully fetched ${data?.length ?? 0} chapters for story ${storyId}.`);
            return NextResponse.json(data as DbChapter[]);

        } catch (error) {
            console.error(`API GET /stories/${storyId}/chapters error:`, error);
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            return NextResponse.json({ error: `Failed to fetch chapters: ${message}` }, { status: 500 });
        }
    }