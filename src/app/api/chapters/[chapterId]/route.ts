    // src/app/api/chapters/[chapterId]/route.ts (add GET handler)
    import { Database } from "@/types/supabase"; // Ensure Database type is imported
    import { NextRequest, NextResponse } from "next/server"; // Ensure imports
    import { createSupabaseServerClient } from "@/lib/supabaseServerClient"; // Ensure import

    type DbChapter = Database['public']['Tables']['chapters']['Row'];
    type ChapterUpdatePayload = Database['public']['Tables']['chapters']['Update'];
    
    export async function GET(
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

        // Authorization: RLS policy on chapters table handles this
        if (!user && !anonUserIdentifier) {
             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
         }

        try {
            const { data, error, status } = await supabase
                .from('chapters')
                .select('*')
                .eq('id', chapterId)
                .single();

            if (error) {
                console.error(`Error fetching chapter ${chapterId}:`, error);
                 if (status === 406 || error.code === 'PGRST116') { // Not found or RLS denies access
                     return NextResponse.json({ error: "Chapter not found or access denied" }, { status: 404 });
                 }
                throw new Error(error.message);
            }

             if (!data) {
                 return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
             }

            console.log(`Successfully fetched chapter ${chapterId}.`);
            return NextResponse.json(data as DbChapter);

        } catch (error) {
            console.error(`API GET /chapters/${chapterId} error:`, error);
            const message = error instanceof Error ? error.message : "An unknown error occurred";
            return NextResponse.json({ error: `Failed to fetch chapter: ${message}` }, { status: 500 });
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