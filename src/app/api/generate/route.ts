import { GoogleGenAI, Content, Tool, GenerationConfig } from "@google/genai";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Database } from "@/types/supabase"; // Import Database type
import { NextResponse } from 'next/server';
import { cookies } from "next/headers"; // Import cookies

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}
// Corrected instantiation
const genAI = new GoogleGenAI({ apiKey: apiKey });

// Corrected grounding tool definition based on documentation
const groundingTool: Tool = {
  googleSearch: {},
};

// Define the type for generationConfig explicitly
interface CustomGenerationConfig extends GenerationConfig {
    tools?: Tool[];
}

const baseGenerationConfig: CustomGenerationConfig = {
  temperature: 0.9,
  topP: 0.95,
  topK: 40,
  responseMimeType: "text/plain",
};

// Define the type for generation data more accurately based on schema
type GenerationRecord = Database['public']['Tables']['story_generations']['Row'];
type NewGenerationPayload = Database['public']['Tables']['story_generations']['Insert'];

// Helper type for Supabase fetch
interface FetchedGeneration {
    id: string;
    prompt: string | null;
    generated_story: string | null;
    parent_generation_id: string | null;
    iteration_feedback: string | null; // Needed to reconstruct user prompts
}

// Fetches the direct parent for simple refinement context (not full chain needed here)
async function fetchParentGeneration(id: string, supabase: ReturnType<typeof createSupabaseServerClient>): Promise<FetchedGeneration | null> {
    const { data, error } = await supabase
      .from('story_generations')
      .select('id, prompt, generated_story, parent_generation_id, iteration_feedback')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error(`Error fetching parent generation ${id}:`, error);
      return null;
    }
    return data as FetchedGeneration;
}

export async function POST(request: Request) {
  // const cookieStore = cookies(); // No longer need to get it here
  const supabase = createSupabaseServerClient(); // Call without arguments

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  try {
    const {
        // Standalone generation fields
        synopsis,
        styleNote, // Keep styleNote for both modes

        // Story-centric generation fields
        storyId,
        partInstructions,
        globalSynopsis, // Read-only context, may not be needed directly in prompt if history is good
        globalStyleNote, // Use this if available, otherwise use styleNote
        previousPartContent, // Direct context from the last part

        // Common fields
        length,
        useWebSearch,
        parentId,
        refinementFeedback,
        userIdentifier, // For anonymous users
    } = await request.json();

    // Validation: Check for user OR identifier
    if (!user && !userIdentifier) {
      return NextResponse.json({ error: 'Missing user identifier or authentication' }, { status: 401 });
    }

    if (!length || length <= 0) {
        return NextResponse.json({ error: 'Valid length is required' }, { status: 400 });
    }

    // Mode-specific validation
    if (storyId) {
        // Story mode: partInstructions are key, styleNote can be fallback
        if (!partInstructions && !refinementFeedback) { // Need instructions unless refining
             return NextResponse.json({ error: 'Missing partInstructions for new story part' }, { status: 400 });
        }
        if (!styleNote && !globalStyleNote) {
            return NextResponse.json({ error: 'Missing styleNote or globalStyleNote for story part' }, { status: 400 });
        }
    } else if (!parentId) {
        // Standalone initial generation: synopsis and styleNote needed
        if (!synopsis || !styleNote) {
            return NextResponse.json({ error: 'Missing synopsis or styleNote for standalone generation' }, { status: 400 });
        }
    } else {
         // Standalone refinement: refinementFeedback needed
         if (!refinementFeedback || !styleNote) {
             return NextResponse.json({ error: 'Missing refinementFeedback or styleNote for standalone refinement' }, { status: 400 });
         }
    }

    // Determine effective style
    const effectiveStyleNote = globalStyleNote || styleNote; // Prefer global if available

    // Create a local config for this request based on the base config
    const requestConfig: CustomGenerationConfig = { ...baseGenerationConfig };

    if (useWebSearch) {
        requestConfig.tools = [groundingTool]; // Add tools only if needed
    }      

    const historyContents: Content[] = [];
    let currentPromptText = '';
    let basePromptForDb = ''; // Store the core instruction

    if (parentId) {
        // Refinement Logic (applies to both story and standalone)
        if (!refinementFeedback) {
            return NextResponse.json({ error: 'Missing refinementFeedback for refinement request' }, { status: 400 });
        }

        const parentGen = await fetchParentGeneration(parentId, supabase);
        if (parentGen?.generated_story) {
            historyContents.push({ role: "model", parts: [{ text: parentGen.generated_story }] });
        } else {
             console.warn(`Could not fetch parent ${parentId} or it lacked content for refinement history.`);
        }

        basePromptForDb = refinementFeedback; // The feedback is the core instruction
        currentPromptText = `Refine the previous story segment based on the following feedback. Maintain the established style (Style Note: ${effectiveStyleNote}) and aim for a length of approximately ${length} words. Incorporate web search results if relevant and helpful.\n\nFeedback:\n${refinementFeedback}\n\nRefined Story Segment:`;

    } else if (storyId) {
        // Story Part Generation Logic
        if (!partInstructions) {
             return NextResponse.json({ error: 'Missing partInstructions for new story part' }, { status: 400 });
        }

        if (previousPartContent) {
            // Add the previous part as model context if it exists
            historyContents.push({ role: "model", parts: [{ text: previousPartContent }] });
        } else {
            // This is the first part of the story. Use global synopsis/style as initial context if available.
             if (globalSynopsis) {
                // Maybe add a system message or user message with the global context?
                // Let's add it to the main prompt for simplicity now.
             }
        }

        basePromptForDb = partInstructions; // The instructions are the core prompt
        let initialContext = '';
        if (!previousPartContent && globalSynopsis) {
            initialContext = `You are writing a story. You should output only the story text for this part, without any other text or commentary. Here is the overall synopsis:\n${globalSynopsis}\n\n`;
        }
        currentPromptText = `${initialContext}Continue the story based on the previous part (if provided). Write the next part according to these instructions, keeping the style consistent and aiming for a length of approximately ${length} words. Style Note: ${effectiveStyleNote}\n Incorporate web search results if relevant and helpful.\n\nInstructions for this part:\n${partInstructions}\n\nNext Story Part:`;

    } else {
      // Standalone Initial Generation Logic
       if (!synopsis) {
         return NextResponse.json({ error: 'Missing synopsis for initial generation' }, { status: 400 });
      }
       basePromptForDb = synopsis; // The synopsis is the core prompt
       currentPromptText = `Flesh out the following synopsis into a story segment of approximately ${length} words. Adhere to the specified style. Incorporate web search results if relevant and helpful.\n\nStyle Note: ${effectiveStyleNote}\n\nSynopsis:\n${synopsis}\n\nStory Segment:`;
    }

    const contents: Content[] = [
        ...historyContents,
        { role: "user", parts: [{ text: currentPromptText }] }
    ];

    // Define the request object (type inferred)
    const generateRequest = {
        contents: contents,
        config: requestConfig, // Use the request-specific config
    };

    const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        ...generateRequest
    });

    if (
        !result ||
        !result.candidates ||
        result.candidates.length === 0 ||
        !result.candidates[0].content ||
        !result.candidates[0].content.parts ||
        result.candidates[0].content.parts.length === 0
    ) {
        console.error("Invalid response structure from Gemini API:", JSON.stringify(result, null, 2));
        throw new Error("Failed to parse response from AI model.");
    }
    // Concatenate text from all parts
    const generatedText = result.candidates[0].content.parts
        .map(part => part.text)
        .join("") || "";

    // Extract grounding metadata if available
    let groundingMetadata = null;
    if (result.candidates[0].groundingMetadata && result.candidates[0].groundingMetadata.searchEntryPoint) {
      console.log("Used web search");
      groundingMetadata = {
        // Only include searchEntryPoint if it exists
        searchEntryPoint: result.candidates[0].groundingMetadata.searchEntryPoint,
        // Extract grounding chunks and supports if they exist
        groundingChunks: result.candidates[0].groundingMetadata.groundingChunks || [],
        groundingSupports: result.candidates[0].groundingMetadata.groundingSupports || [],
        webSearchQueries: result.candidates[0].groundingMetadata.webSearchQueries || [],
      };
    } else {
        console.log("No grounding metadata or searchEntryPoint found.");
    }

    // --- Prepare data for Supabase insert ---
    const generationData: Partial<NewGenerationPayload> = {
      story_id: storyId || null, // Include storyId if provided
      synopsis: parentId ? null : (storyId ? null : synopsis), // Store synopsis only for standalone initial
      part_instructions: storyId && !parentId ? partInstructions : null, // Store instructions for new story parts
      global_context_synopsis: storyId ? globalSynopsis : null, // Store context used
      global_context_style: storyId ? globalStyleNote : null, // Store context used
      style_note: styleNote, // Always store the specific style note used for this generation
      requested_length: parseInt(length, 10),
      use_web_search: !!useWebSearch,
      prompt: basePromptForDb, // Store the core user instruction (synopsis/instructions/feedback)
      generated_story: generatedText,
      parent_generation_id: parentId,
      iteration_feedback: refinementFeedback, // Store refinement feedback if provided
      // is_accepted will be set by the /api/accept endpoint
    };

    // Add user_id if logged in, otherwise add user_identifier
    if (user) {
      generationData.user_id = user.id;
    } else {
      generationData.user_identifier = userIdentifier;
    }

    // --- Save to Supabase ---
    const { data: insertData, error: supabaseError } = await supabase
      .from('story_generations')
      .insert(generationData as NewGenerationPayload) // Use correct type
      .select('id')
      .single();

    if (supabaseError || !insertData) {
      // Enhanced Supabase error logging
      console.error('Supabase insert error object:', supabaseError);
      console.error('Supabase insert error details:', JSON.stringify(supabaseError, null, 2)); 
      return NextResponse.json({ error: `Failed to save generation record. ${supabaseError?.message || 'Unknown Supabase error'}` }, { status: 500 });
    }

    // Return story, ID, and grounding metadata
    return NextResponse.json({ 
        story: generatedText, 
        generationId: insertData.id,
        groundingMetadata: groundingMetadata // Include metadata in response
    });

  } catch (error: any) {
    // Enhanced general error logging
    console.error("Error details in /api/generate catch block:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    if (error.message && error.message.includes('SAFETY')) {
        return NextResponse.json({ error: 'Content generation blocked due to safety settings.' }, { status: 400 });
    }
    // Check for function calling errors if you add function calling later
    // if (error.message && error.message.includes('FUNCTION_CALL')) { ... }
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
