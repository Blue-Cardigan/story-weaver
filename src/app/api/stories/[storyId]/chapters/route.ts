    // src/app/api/stories/[storyId]/chapters/route.ts
    import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
    import { Database } from "@/types/supabase";
    import { NextRequest, NextResponse } from "next/server";

    type NewChapterPayload = Database['public']['Tables']['chapters']['Insert'];
    type DbChapter = Database['public']['Tables']['chapters']['Row'];

    export async function POST(
        request: NextRequest,
        context: any
    ) {
        const supabase = createSupabaseServerClient();
        const { storyId } = context.params;

        if (!storyId) {
            return NextResponse.json({ error: "Missing story ID" }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        const anonUserIdentifier = request.headers.get('X-User-Identifier');

        try {
            const payload = await request.json();

            // Validation
            if (!payload.chapter_number || typeof payload.chapter_number !== 'number' || payload.chapter_number <= 0) {
                 return NextResponse.json({ error: "Valid chapter number is required." }, { status: 400 });
            }
            // Synopsis is optional for creation, can be added later

            const newChapterData: Partial<NewChapterPayload> = {
                story_id: storyId,
                chapter_number: Math.floor(payload.chapter_number),
                title: payload.title || null,
                synopsis: payload.synopsis || null,
            };

            if (user) {
                newChapterData.user_id = user.id;
            } else if (anonUserIdentifier) {
                newChapterData.user_identifier = anonUserIdentifier;
            } else {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            // Verify user owns the parent story (RLS on chapters should implicitly handle this if linked correctly, but explicit check is safer)
            // You might add a check here to see if the user/identifier owns the story `storyId` before inserting.

            const { data, error } = await supabase
                .from('chapters')
                .insert(newChapterData as NewChapterPayload)
                .select()
                .single();

            if (error) {
                console.error("Error creating chapter:", error);
                 if (error.code === '23505') { // unique_violation (story_id, chapter_number)
                    return NextResponse.json({ error: `Chapter number ${newChapterData.chapter_number} already exists for this story.` }, { status: 409 });
                 }
                if (error.code === '42501') { // RLS
                    return NextResponse.json({ error: "Authorization failed to create chapter." }, { status: 403 });
                }
                throw new Error(error.message);
            }

            console.log(`Successfully created chapter ${data.chapter_number} for story ${storyId}`);
            return NextResponse.json(data as DbChapter, { status: 201 });

        } catch (error) {
            console.error(`API POST /stories/${storyId}/chapters error:`, error);
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            return NextResponse.json({ error: `Failed to create chapter: ${message}` }, { status: 500 });
        }
    }

    export async function GET(
        request: NextRequest,
        context: any
    ) {
        const supabase = createSupabaseServerClient();
        const { storyId } = context.params;

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