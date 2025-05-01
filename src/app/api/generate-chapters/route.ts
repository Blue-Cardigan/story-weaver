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
    numChapters?: number; // Make optional, only required for initial generation
    targetBookLength?: number | null;
    generationNotes?: string; // For initial generation
    modificationInstructions?: string; // For modifications
    existingChapters?: ChapterOutline[]; // For modifications
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
        modificationInstructions,
        existingChapters,
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
    // Validation depends on whether it's generation or modification
    const isModification = existingChapters && existingChapters.length > 0;

    if (!isModification && (!numChapters || numChapters <= 0 || numChapters > 150)) { // Required only for initial generation
      return NextResponse.json({ error: 'Invalid number of chapters for initial generation (must be 1-150)' }, { status: 400 });
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
    let prompt = '';
    const chapterStructureDescription = `Each chapter object must have the following keys:\n- \"title\": A compelling title for the chapter (string).\n- \"synopsis\": A detailed summary, describing the key events, focus, character development, and thematic elements (string).\n- \"style_notes\": (Optional) Specific style notes for this chapter (string).\n- \"additional_notes\": (Optional) Further relevant notes for this chapter (string).`;

    let globalContext = '\n\n--- Overall Story Context ---\n';
    globalContext += `Overall Story Synopsis:\n${globalSynopsis || "Not provided."}\n\n`;
    globalContext += `Overall Story Style Note:\n${globalStyleNote || "Not specified."}\n`;
    if (globalAdditionalNotes) {
        globalContext += `\nAdditional Notes:\n${globalAdditionalNotes}\n`;
    }
    globalContext += '--- End Overall Story Context ---\n';

    if (isModification) {
        // --- Modification Prompt ---
        console.log("Constructing modification prompt...");
        prompt = 'You are an expert story planner tasked with modifying an existing chapter plan based on specific instructions.\n';
        prompt += globalContext;

        prompt += '\n--- Current Chapter Plan ---\n';
        prompt += `The current plan has ${existingChapters.length} chapters:\n`;
        prompt += existingChapters.map((ch, index) => 
            `\nChapter ${index + 1}:\n` +
            `  Title: ${ch.title || 'Untitled'}\n` +
            `  Synopsis: ${ch.synopsis || 'No synopsis.'}\n` +
            `  Style Notes: ${ch.style_notes || 'None'}\n` +
            `  Additional Notes: ${ch.additional_notes || 'None'}\n`
        ).join('\n');
        prompt += '\n--- End Current Chapter Plan ---\n';

        prompt += '\n--- Modification Instructions ---\n';
        prompt += modificationInstructions || "No specific instructions provided, but please review and refine the plan based on the overall context.";
        prompt += '\n--- End Modification Instructions ---\n';

        if (numChapters) {
            prompt += `\nThe user suggested a target of around ${numChapters} chapters for the final plan. Use this as a guideline when applying the modifications.\n`;
        }

        prompt += '\nYour task is to apply the modification instructions to the current chapter plan. You might need to merge chapters, split chapters, add new ones, delete existing ones, rewrite synopses, adjust titles, or reorder chapters based on the instructions.\n';
        prompt += '\nPlease provide the *complete, modified* chapter plan as your output. The output MUST be STRICTLY a JSON array where each object represents a chapter.\n';
        prompt += chapterStructureDescription;
        prompt += '\n\nExample format for the output (ensure your entire response is just the JSON array):\n';
        prompt += '[\n';
        prompt += '  {\n';
        prompt += '    "title": "Modified Chapter 1 Title",\n';
        prompt += '    "synopsis": "Updated synopsis for the first chapter incorporating requested changes...",\n';
        prompt += '    "style_notes": "Any specific style notes...",\n';
        prompt += '    "additional_notes": "Any additional notes..."\n';
        prompt += '  },\n';
        prompt += '  { ... more modified chapters ... }\n';
        prompt += ']';

    } else {
        // --- Initial Generation Prompt ---
        console.log("Constructing initial generation prompt...");
        prompt = `You are an expert story planner. Based on the following overall story details, generate approximately ${numChapters} chapter outlines.`;

        if (targetBookLength && targetBookLength > 0) {
            prompt += ` The entire book is intended to be approximately ${targetBookLength.toLocaleString()} words long.`;
        }

        prompt += globalContext; // Re-use the built globalContext string

        if (generationNotes) {
            prompt += "\n\n--- Specific Instructions for Chapter Planning ---\n" + generationNotes + "\n--- End Specific Instructions ---";
        }

        prompt += `\n\nPlease provide the output STRICTLY as a JSON array where each object represents a chapter.\n`;
        prompt += chapterStructureDescription;
        prompt += `\n\nExample format (ensure your entire response is just the JSON array):\n`; // Still use template literal here where it's simpler
        prompt += '[\n';
        prompt += '  {\n';
        prompt += '    "title": "Whispers in the Dust",\n';
        prompt += '    "synopsis": "The chapter opens establishing the harsh, arid environment... Key events: ... Character development: ... Thematic elements: ...",\n';
        prompt += '    "style_notes": "Emphasize desolate atmosphere... Use internal monologue...",\n';
        prompt += '    "additional_notes": "Ensure data cylinder feels ancient... Foreshadow factions..."\n';
        prompt += '  },\n';
        prompt += '  {\n';
        prompt += '    "title": "Shadows in the Market",\n';
        prompt += '    "synopsis": "Elara travels to the nearest settlement... Key events: ... Character development: ... Thematic elements: ...",\n';
        prompt += '    "style_notes": "Create unease... Use dialogue...",\n';
        prompt += '    "additional_notes": "Establish specific dangers... Kael\'s reluctance..."\n'; // Escaped Kael's
        prompt += '  }\n';
        prompt += '  // { ... more chapters following this detailed format ... }\n';
        prompt += ']';
    }

    // --- Call Gemini API using Streaming ---
    console.log(`Sending prompt to Gemini for chapter ${isModification ? 'modification' : 'generation'} (streaming)...`);

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

    // --- Return Generated/Modified Chapters ---
     if (parsedChapters === null || parsedChapters === undefined) { // Check if parsing failed completely
       console.error("Error: parsedChapters is unexpectedly null or undefined before returning.");
       return NextResponse.json({ error: "Failed to process chapter data internally after AI response." }, { status: 500 });
     }

     // If parsedChapters is an empty array (potentially valid), return it as such.
     // Add chapter_number to the response payload for frontend display
     const chaptersWithNumbers = parsedChapters.map((chapter, index) => ({
        ...chapter,
        chapter_number: index + 1, // Ensure chapter number is added/updated
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