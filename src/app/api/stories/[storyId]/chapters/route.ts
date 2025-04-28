    // src/app/api/stories/[storyId]/chapters/route.ts
    import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
    import { Database } from "@/types/supabase";
    import { NextRequest, NextResponse } from "next/server";

    type NewChapterPayload = Database['public']['Tables']['chapters']['Insert'];
    type DbChapter = Database['public']['Tables']['chapters']['Row'];
    type ChapterUpdatePayload = Partial<Database['public']['Tables']['chapters']['Update']>;

    export async function POST(
        request: NextRequest,
        { params }: { params: { storyId: string } }
    ) {
        const supabase = createSupabaseServerClient();
        const { storyId } = params;

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
        { params }: { params: { storyId: string } }
    ) {
        const supabase = createSupabaseServerClient();
        const { storyId } = params;

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
    
    export async function PATCH(
        request: NextRequest,
        context: any // Using 'any' to bypass type check
    ) {
        const supabase = createSupabaseServerClient();
        const { chapterId } = context.params;

        if (!chapterId) {
            return NextResponse.json({ error: "Missing chapter ID" }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        const anonUserIdentifier = request.headers.get('X-User-Identifier');

        try {
            const payload = await request.json();

            // Allow updating title and/or synopsis
            const updateData: ChapterUpdatePayload = {};
            if (payload.title !== undefined) updateData.title = payload.title;
            if (payload.synopsis !== undefined) updateData.synopsis = payload.synopsis;

            if (Object.keys(updateData).length === 0) {
                 return NextResponse.json({ error: "No fields provided for update." }, { status: 400 });
            }

            // Authorization: RLS policy on chapters table should handle this.
            // Fetching first to check ownership might be slightly more secure if RLS is complex.

            const { error: updateError } = await supabase
                .from('chapters')
                .update(updateData)
                .eq('id', chapterId); // RLS implicitly checks ownership

            if (updateError) {
                console.error(`Error updating chapter ${chapterId}:`, updateError);
                // Handle specific errors like RLS violation (42501) or not found
                if (updateError.code === '42501') {
                     return NextResponse.json({ error: "Authorization failed to update chapter." }, { status: 403 });
                }
                // Check if the update affected 0 rows (might indicate not found or RLS failure)
                // This requires checking the `count` property if using `.select().single()` after update.
                // For simplicity, rely on RLS error code for now.
                return NextResponse.json({ error: `Failed to update chapter: ${updateError.message}` }, { status: 500 });
            }

             // Fetch the updated chapter to return it (optional, but good practice)
             const { data: updatedChapter, error: fetchUpdatedError } = await supabase
                .from('chapters')
                .select('*')
                .eq('id', chapterId)
                .single();

             if (fetchUpdatedError || !updatedChapter) {
                 console.error(`Error fetching updated chapter ${chapterId}:`, fetchUpdatedError);
                 // If update succeeded but fetch failed, return success but no data?
                 return NextResponse.json({ success: true, message: "Chapter updated, but failed to fetch updated data." });
             }

            console.log(`Successfully updated chapter ${chapterId}.`);
            return NextResponse.json(updatedChapter);


        } catch (error) {
            console.error(`API PATCH /chapters/${chapterId} error:`, error);
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            return NextResponse.json({ error: `Failed to update chapter: ${message}` }, { status: 500 });
        }
    }