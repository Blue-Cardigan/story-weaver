import { GoogleGenAI, Content, GenerationConfig, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase";
import { NextResponse } from 'next/server';

// Define Chapter Outline type based on expected AI output and DB schema
type ChapterOutline = {
  title: string;
  synopsis: string;
  style_notes?: string;
  additional_notes?: string;
};

// Define the type for the request body more precisely
interface GenerateChaptersRequest {
    storyId: string;
    numChapters: number;
    targetBookLength?: number | null;
    generationNotes?: string;
    globalSynopsis?: string | null;
    globalStyleNote?: string | null;
    globalAdditionalNotes?: string | null;
    userIdentifier?: string; // For anonymous users
}

// Define the type for Chapter insert data
type NewChapterPayload = Database['public']['Tables']['chapters']['Insert'];

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}
const genAI = new GoogleGenAI({ apiKey: apiKey });

// Basic generation config (adjust as needed for planning)
const generationConfig: GenerationConfig = {
    temperature: 0.7, // Slightly lower temp for more structured output
    topP: 0.9,
    topK: 30,
    responseMimeType: "application/json", // Request JSON output
};


export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userIdentifier = ''; // Initialize userIdentifier

  try {
    const {
        storyId,
        numChapters,
        targetBookLength,
        generationNotes,
        globalSynopsis,
        globalStyleNote,
        globalAdditionalNotes,
        userIdentifier: requestUserIdentifier // Identifier from request for anonymous users
    }: GenerateChaptersRequest = await request.json();

     // Determine the identifier (might still be useful for logging/debugging)
     const identifier = user?.id || requestUserIdentifier || request.headers.get('x-forwarded-for') || 'unknown';
     if (!user && requestUserIdentifier) {
        userIdentifier = requestUserIdentifier; // Store for DB insert if no user
     }

    // --- Input Validation ---
    if (!storyId) {
      return NextResponse.json({ error: 'Missing storyId' }, { status: 400 });
    }
    if (!numChapters || numChapters <= 0 || numChapters > 150) { // Add upper limit
      return NextResponse.json({ error: 'Invalid number of chapters (must be 1-150)' }, { status: 400 });
    }
    // Story ID validation requires checking ownership or identifier match
    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .select('id, user_id, user_identifier, structure_type') // Select necessary fields
      .eq('id', storyId)
      .single();

    if (storyError || !storyData) {
      console.error("Error fetching story or story not found:", storyError);
      return NextResponse.json({ error: 'Story not found or access denied' }, { status: 404 });
    }

    // Authorization check: Ensure the story belongs to the user or matches the identifier
    if (user && storyData.user_id !== user.id) {
       return NextResponse.json({ error: 'Unauthorized access to story' }, { status: 403 });
    }
     if (!user && userIdentifier && storyData.user_identifier !== userIdentifier) {
       return NextResponse.json({ error: 'Unauthorized access to story (identifier mismatch)' }, { status: 403 });
     }
     if (!user && !userIdentifier) { // Should ideally not happen if identifier is passed correctly
        return NextResponse.json({ error: 'Missing user identifier or authentication' }, { status: 401 });
     }

    if (storyData.structure_type !== 'book') {
        return NextResponse.json({ error: 'Chapter generation is only applicable to stories with structure type "book"' }, { status: 400 });
    }


    // --- Construct Prompt for AI ---
    let prompt = `You are an expert story planner. Based on the following overall story details, generate around ${numChapters} chapter outlines.`;

    if (targetBookLength && targetBookLength > 0) {
        prompt += ` The entire book is intended to be approximately ${targetBookLength.toLocaleString()} words long.`;
    }

    prompt += "\\n\\nOverall Story Synopsis:\\n" + (globalSynopsis || "Not provided.") + "\\n";
    prompt += "\\nOverall Story Style Note:\\n" + (globalStyleNote || "Not specified.") + "\\n";
    if (globalAdditionalNotes) {
        prompt += "\\nAdditional Notes:\\n" + globalAdditionalNotes + "\\n";
    }
    if (generationNotes) {
        prompt += "\\nSpecific Instructions for Chapter Planning:\\n" + generationNotes + "\\n";
    }

    prompt += `\\n\\nPlease provide the output STRICTLY as a JSON array where each object represents a chapter and has the following keys:
- "title": A compelling title for the chapter. (string).
- "synopsis": A detailed summary, outlining the key events, focus of the chapter, and any other relevant details including thematic elements, character development, and any other relevant details (string).
- "style_notes": (Optional) Specific style notes for this chapter, if any (string or null).
- "additional_notes": (Optional) Any other relevant notes for this chapter (string or null).

Example format:
[
  {
    "title": "The Unexpected Visitor",
    "synopsis": "Introduce the main character and their ordinary life. An unexpected event disrupts the status quo.",
    "style_notes": "Establish a calm tone initially, shifting to intrigue.",
    "additional_notes": "Hint at the larger conflict to come."
  },
  { ... more chapters ... }
]

Generate exactly ${numChapters} chapter objects in the array.`;

    // --- Call Gemini API using Streaming ---
    console.log("Sending prompt to Gemini for chapter generation (streaming)...");

    const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];

    // Use generateContentStream
    const stream = await genAI.models.generateContentStream({
        model: "gemini-2.0-flash",
        contents: contents,
        config: generationConfig, // Include config directly in the object
    });

    // Aggregate the streamed response text
    let fullResponseText = '';
    console.log("Receiving stream from Gemini...");
    for await (const chunk of stream) {
        // Access chunk.text as a property, not a method
        const chunkText = chunk.text; // Use chunk.text directly
        if (chunkText) {
           fullResponseText += chunkText;
        } else {
             // Handle cases where a chunk might not have text (e.g., only feedback)
             console.warn("Received chunk without text property or empty text");
        }
    }
    console.log("Stream finished. Full text length:", fullResponseText.length);

    // --- Post-Stream Processing ---
    // Check for potential errors indicated after streaming (e.g., safety blocks)
    // This part is tricky as the final aggregated 'result' structure isn't directly available
    // from the stream loop itself. We have to rely on parsing the text or potential errors during the stream.
    // If the fullResponseText is empty, it might indicate an issue.
    if (!fullResponseText.trim()) {
        console.error("Full response text after streaming is empty. Potential generation block or error.");
        // Attempt to get feedback from the last chunk if possible, or return generic error
        // This depends heavily on SDK specifics - for now, use a generic error.
        return NextResponse.json({ error: "Content generation failed or was blocked. The streamed response was empty." }, { status: 500 });
    }

    // --- Parse AI Response (using the aggregated text) ---
    let parsedChapters: ChapterOutline[] = [];
    try {
        // Attempt to parse the JSON response directly from the aggregated text
        parsedChapters = JSON.parse(fullResponseText);
        if (!Array.isArray(parsedChapters)) {
             throw new Error("AI did not return a valid JSON array.");
        }
        // Basic validation of the first element structure (optional but helpful)
        if (parsedChapters.length > 0) {
             const firstChapter = parsedChapters[0];
             if (typeof firstChapter.title !== 'string' || typeof firstChapter.synopsis !== 'string') {
                  console.warn("Parsed chapter structure might be incorrect:", firstChapter);
                 // Don't throw error here, maybe log warning and proceed
             }
        }
        console.log(`Successfully parsed ${parsedChapters.length} chapters from aggregated stream response.`);
    } catch (parseError: any) {
        console.error("Failed to parse JSON response from aggregated stream:", parseError);
        console.error("Aggregated AI Response Text:", fullResponseText); // Log the raw text on parse failure
        // Correct the regex for markdown block extraction
        const jsonMatch = fullResponseText.match(/```json\\n([\s\S]*?)\\n```/); // Fixed Regex
        if (jsonMatch && jsonMatch[1]) {
            console.log("Attempting to parse JSON from markdown block (streamed)...");
            try {
                parsedChapters = JSON.parse(jsonMatch[1]);
                 if (!Array.isArray(parsedChapters)) {
                     throw new Error("AI did not return a valid JSON array within the markdown block.");
                 }
                 console.log(`Successfully parsed ${parsedChapters.length} chapters from markdown block (streamed).`);
            } catch (retryParseError: any) {
                 console.error("Failed to parse JSON even from markdown block (streamed):", retryParseError);
                 return NextResponse.json({ error: "Failed to parse chapter data from AI response (streamed). The format might be invalid." }, { status: 500 });
            }
        } else {
             return NextResponse.json({ error: "Failed to parse chapter data from AI response (streamed). Invalid format received." }, { status: 500 });
        }
    }


    // --- Save Chapters to Database ---
    if (parsedChapters.length > 0) {
        const chaptersToInsert: NewChapterPayload[] = parsedChapters.map((chapter, index) => ({
            story_id: storyId,
            chapter_number: index + 1,
            title: chapter.title || `Chapter ${index + 1}`, // Provide default title
            synopsis: chapter.synopsis || '', // Provide default synopsis
            style_notes: chapter.style_notes || null,
            additional_notes: chapter.additional_notes || null,
            user_id: user ? user.id : null, // Assign user_id if available
            user_identifier: !user ? userIdentifier : null, // Assign identifier if no user
        }));

        console.log(`Attempting to save ${chaptersToInsert.length} chapters to database for story ${storyId} (will replace existing)...`);

        // Use the same save_chapters function as the dedicated chapter save endpoint
        const { error: saveError } = await supabase.rpc('save_chapters' as any, {
            _story_id: storyId,
            _user_id: user ? user.id : null,
            _user_identifier: !user ? userIdentifier : null,
            _chapters: chaptersToInsert
        });

        if (saveError) {
            console.error('Supabase save_chapters RPC error:', saveError);
            return NextResponse.json({ error: `Failed to save generated chapters to database. ${saveError.message}` }, { status: 500 });
        }
        console.log("Successfully saved chapters to database using save_chapters RPC.");
    } else {
        console.warn("No chapters were parsed from the AI response to save.");
        // Might indicate an issue with the AI's generation or the parsing logic.
        return NextResponse.json({ error: "AI did not generate any valid chapter outlines." }, { status: 500 });
    }


    // --- Return Generated Chapters ---
     // Add chapter_number to the response payload for frontend display
     const chaptersWithNumbers = parsedChapters.map((chapter, index) => ({
        ...chapter,
        chapter_number: index + 1,
     }));

    return NextResponse.json({ chapters: chaptersWithNumbers });

  } catch (error: any) {
    console.error("Error in /api/generate-chapters:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    // Distinguish between API errors and internal errors
    if (error.message && (error.message.includes('API key not valid') || error.message.includes('Authentication failed'))) {
         return NextResponse.json({ error: 'AI API authentication failed. Check server configuration.' }, { status: 500 });
    }
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}