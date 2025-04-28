    // src/app/api/chapters/[chapterId]/route.ts (add GET handler)
    // ... (keep PATCH handler from above) ...
    import { Database } from "@/types/supabase"; // Ensure Database type is imported
    import { NextRequest, NextResponse } from "next/server"; // Ensure imports
    import { createSupabaseServerClient } from "@/lib/supabaseServerClient"; // Ensure import

    type DbChapter = Database['public']['Tables']['chapters']['Row'];

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